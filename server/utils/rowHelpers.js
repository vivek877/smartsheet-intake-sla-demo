/**
 * Smartsheet Row & Cell Processing Utilities
 */

/**
 * Normalizes contact values into Smartsheet object structures.
 */
function contactObjectValue(value) {
  if (Array.isArray(value)) {
    const vals = value.filter(Boolean).map((email) => ({ objectType: 'CONTACT', email }));
    return { objectValue: { objectType: 'MULTI_CONTACT', values: vals } };
  }
  if (typeof value === 'string' && value.trim()) {
    return { objectValue: { objectType: 'CONTACT', email: value.trim() } };
  }
  return { value: null };
}

/**
 * Builds a cell payload array for Smartsheet API requests.
 */
module.exports.buildCellsPayload = (cellsByTitle, columns, COLUMN_BY_TITLE) => {
  const items = [];
  
  const colByTitle = (title) => {
    if (!title) return null;
    return COLUMN_BY_TITLE.get(title.trim().toLowerCase()) || null;
  };

  const isContactLike = (col) => {
    if (!col) return false;
    return col.type === 'CONTACT_LIST' || (Array.isArray(col.contactOptions) && col.contactOptions.length > 0);
  };

  for (const [title, val] of Object.entries(cellsByTitle || {})) {
    const col = colByTitle(title) || columns.find((c) => (c.title || '') === title);
    if (!col || col.systemColumnType || col.formula) continue;
    if (['PREDECESSOR', 'DURATION'].includes(col.type)) continue;

    if (isContactLike(col)) {
      items.push({ columnId: col.id, ...contactObjectValue(val) });
    } else {
      const safeVal = (val === '' && col.type === 'TEXT_NUMBER') ? null : val;
      items.push({ columnId: col.id, value: safeVal });
    }
  }
  return items;
};

/**
 * Transforms a raw Smartsheet row into a flat, UI-ready JSON object.
 */
module.exports.flattenRow = (row, columns) => {
  const flat = {
    id: row.id,
    rowNumber: row.rowNumber,
    parentId: row.parentId || null,
    indent: row.parentId ? 1 : 0,
    isPhase: !row.parentId,
    cells: {},
  };

  for (const cell of row.cells) {
    const col = columns.find((c) => c.id === cell.columnId);
    if (!col) continue;

    let display = cell.displayValue ?? cell.value ?? '';
    if (cell.objectValue && cell.objectValue.objectType === 'MULTI_CONTACT') {
      display = (cell.objectValue.values || []).map((v) => v.email).filter(Boolean);
    } else if (cell.objectValue && cell.objectValue.objectType === 'CONTACT') {
      display = cell.objectValue.email || display;
    }

    const isEditable = !col.systemColumnType && (!cell || !cell.formula);

    flat.cells[col.title] = {
      value: display,
      raw: cell.value ?? null,
      editable: isEditable,
    };
  }
  return flat;
};

/**
 * Finds the primary "Name" or "Task" column for the sheet.
 */
module.exports.findNameColumn = (columns, COLUMN_BY_TITLE) => {
  const primary = columns.find((c) => c.primary === true);
  if (primary) return primary;
  
  const candidates = ['Task Name', 'Primary', 'Name', 'Title', 'Task'];
  for (const cand of candidates) {
    const col = COLUMN_BY_TITLE.get(cand.toLowerCase());
    if (col) return col;
  }
  return columns.find((c) => c.type === 'TEXT_NUMBER') || columns[0] || null;
};
