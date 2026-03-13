require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const createSmartsheet = require('./smartsheet');

const app = express();

const ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (ORIGINS.includes('*') || !origin || ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'), false);
  }
}));
app.use(express.json());
app.use(morgan('dev'));

const TOKEN = process.env.SMARTSHEET_TOKEN;
if (!TOKEN) throw new Error('SMARTSHEET_TOKEN is required');

const sdk = createSmartsheet(TOKEN);

const SHEET_ID_ENV = process.env.SHEET_ID && String(process.env.SHEET_ID).trim();
const SHEET_NAME = (process.env.SHEET_NAME || '').trim();
const PORT = Number(process.env.PORT || 4000);

// cached
let SHEET_ID;
let COLUMNS = [];                 // { id, title, type, options?, systemColumnType? }
let COLUMN_BY_TITLE = new Map();  // title -> column

// --------------------------------------------------------
// Utilities
// --------------------------------------------------------
async function resolveSheetId() {
  if (SHEET_ID_ENV) return Number(SHEET_ID_ENV);
  if (!SHEET_NAME) throw new Error('Set SHEET_ID or SHEET_NAME');
  const list = await sdk.sheets.listSheets({ queryParameters: { includeAll: true } });
  const found = list.data?.find(s => s.name.trim() === SHEET_NAME);
  if (!found) throw new Error(`Sheet named "${SHEET_NAME}" not found`);
  return found.id;
}

async function loadColumns(id) {
  const sheet = await sdk.sheets.getSheet({ id });
  COLUMNS = (sheet.columns || []).map(c => ({
    id: c.id,
    title: c.title,
    type: c.type,
    options: c.options || null,
    systemColumnType: c.systemColumnType || null
  }));
  COLUMN_BY_TITLE = new Map(COLUMNS.map(c => [c.title, c]));
  return sheet;
}

function colByTitle(title) {
  return COLUMN_BY_TITLE.get(title);
}

function getCell(row, colTitle) {
  const col = colByTitle(colTitle);
  if (!col) return null;
  const cell = row.cells.find(c => c.columnId === col.id);
  return cell || null;
}

function isEditableCell(column, cell) {
  if (!column) return false;
  if (column.systemColumnType) return false;  // createdBy, modifiedDate, etc.
  if (cell && cell.formula) return false;     // formula cells read-only
  return true;
}

function flattenRow(row) {
  const flat = {
    id: row.id,
    rowNumber: row.rowNumber,
    parentId: row.parentId || null,
    indent: row.parentId ? 1 : 0,         // basic; deeper indents show >1 in bigger sheets
    isPhase: row.parentId ? false : true, // top-level = phase
    cells: {}
  };

  for (const cell of row.cells) {
    const col = COLUMNS.find(c => c.id === cell.columnId);
    if (!col) continue;

    // Prefer displayValue for user‑friendly rendering
    let display = cell.displayValue ?? cell.value ?? '';

    // CONTACT_LIST & MULTI_CONTACT often need array to render multi‑chips in UI
    if (cell.objectValue && cell.objectValue.objectType === 'MULTI_CONTACT') {
      const emails = (cell.objectValue.values || []).map(v => v.email).filter(Boolean);
      display = emails;
    } else if (cell.objectValue && cell.objectValue.objectType === 'CONTACT') {
      display = cell.objectValue.email || display;
    }

    flat.cells[col.title] = {
      value: display,
      raw: cell.value ?? null,
      editable: isEditableCell(col, cell)
    };
  }
  return flat;
}

// CONTACT_LIST builder for Update/Add:
// if array -> MULTI_CONTACT objectValue
// if string -> CONTACT or keep as MULTI_CONTACT [1]
function contactObjectValue(value) {
  if (Array.isArray(value)) {
    const vals = value.filter(Boolean).map(email => ({ objectType: 'CONTACT', email }));
    return { objectValue: { objectType: 'MULTI_CONTACT', values: vals } };
  }
  if (typeof value === 'string' && value.trim()) {
    return { objectValue: { objectType: 'CONTACT', email: value.trim() } };
  }
  return { value: null };
}

// General cell payload mapping from { title: newValue }
function buildCellsPayload(cellsByTitle) {
  const items = [];
  for (const [title, val] of Object.entries(cellsByTitle || {})) {
    const col = colByTitle(title);
    if (!col) continue;

    // Value mapping by type (CONTACT_LIST uses objectValue)
    if (col.type === 'CONTACT_LIST') {
      const contactPayload = contactObjectValue(val);
      items.push({ columnId: col.id, ...contactPayload });
      continue;
    }

    // Dates: allow plain 'YYYY-MM-DD' as value (Smartsheet accepts ISO)
    items.push({ columnId: col.id, value: val });
  }
  return items;
}

// --------------------------------------------------------
// Bootstrap middleware: resolve sheet & columns once
// --------------------------------------------------------
app.use(async (req, res, next) => {
  try {
    if (!SHEET_ID) {
      SHEET_ID = await resolveSheetId();
      await loadColumns(SHEET_ID);
    }
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
});

// --------------------------------------------------------
// Health
// --------------------------------------------------------
app.get('/health', (_req, res) => res.json({ ok: true, version: 1, uptime: process.uptime() }));
app.get('/__routes', (req, res) => {
  // This won’t enumerate all middleware, but confirms our file is running
  res.json({ ok: true, routes: ['/health', '/__routes', '/api/meta', '/api/tasks'] });
});
// --------------------------------------------------------
// Meta: columns + phases
// --------------------------------------------------------
app.get('/api/meta', async (_req, res) => {
  try {
    const sheet = await sdk.sheets.getSheet({ id: SHEET_ID });
    const taskNameCol = COLUMNS.find(c => c.title.toLowerCase() === 'task name');
    const phases = (sheet.rows || [])
      .filter(r => !r.parentId)
      .map(r => {
        const nameCell = taskNameCol ? r.cells.find(c => c.columnId === taskNameCol.id) : null;
        return {
          id: r.id,
          name: (nameCell?.displayValue ?? nameCell?.value ?? 'Phase')
        };
      });
    // res.json({ sheetId: SHEET_ID, columns: COLUMNS, phases });
    res.json({ ok: true, route: '/api/meta_is_registered' });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// --------------------------------------------------------
// List tasks: flattened with editable flags & hierarchy
// --------------------------------------------------------
app.get('/api/tasks', async (_req, res) => {
  try {
    const sheet = await sdk.sheets.getSheet({ id: SHEET_ID });
    const rows = (sheet.rows || []).map(flattenRow);
    res.json({ rows, columns: COLUMNS });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// --------------------------------------------------------
// Create task under phase (parentId)
// body: { parentId, cells: { 'Task Name': 'X', ... } }
// --------------------------------------------------------
app.post('/api/tasks', async (req, res) => {
  try {
    const { parentId, cells } = req.body;
    if (!parentId) return res.status(400).json({ message: 'parentId (phase row id) is required' });

    const payload = {
      parentId,
      cells: buildCellsPayload(cells)
    };

    const result = await sdk.sheets.addRows({ id: SHEET_ID, body: [payload] });
    const created = Array.isArray(result) ? result[0] : null;
    res.status(201).json(created ? { id: created.id } : { ok: true });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// --------------------------------------------------------
// Update cells on a row
// body: { cells: { 'Status': 'In Progress', 'Assigned To': ['a@x', 'b@y'] } }
// --------------------------------------------------------
app.patch('/api/tasks/:rowId', async (req, res) => {
  try {
    const rowId = Number(req.params.rowId);
    const { cells } = req.body;
    if (!rowId || !cells || typeof cells !== 'object') {
      return res.status(400).json({ message: 'rowId and cells are required' });
    }

    const body = [{
      id: rowId,
      cells: buildCellsPayload(cells)
    }];

    const result = await sdk.sheets.updateRows({ id: SHEET_ID, body });
    res.json({ ok: true, updated: Array.isArray(result) ? result.length : 0 });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

// --------------------------------------------------------
// Delete task (block phase delete)
// --------------------------------------------------------
app.delete('/api/tasks/:rowId', async (req, res) => {
  try {
    const rowId = Number(req.params.rowId);
    const row = await sdk.sheets.getRow({ id: SHEET_ID, rowId });
    if (!row.parentId) {
      return res.status(400).json({ message: 'Cannot delete a phase (top-level row)' });
    }
    await sdk.sheets.deleteRows({ id: SHEET_ID, rowIds: String(rowId) });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: e.message });
  }
});

app.listen(PORT, () => console.log(`API listening on :${PORT}`));