require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const createSmartsheet = require('./smartsheet'); // -> returns client.createClient({ accessToken })

const app = express();

/* -------------------- CORS -------------------- */
const ORIGINS_ENV =
  process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '*';
const ORIGINS = ORIGINS_ENV.split(',').map((s) => s.trim());

app.use(
  cors({
    origin: (origin, cb) => {
      if (ORIGINS.includes('*') || !origin || ORIGINS.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error('CORS blocked'), false);
    },
  })
);

app.use(express.json());

// Ensure JSON responses (some proxies/clients are picky)
app.use((_req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

app.use(morgan('dev'));

/* -------------------- ENV + SDK -------------------- */
const TOKEN = process.env.SMARTSHEET_TOKEN;
if (!TOKEN) throw new Error('SMARTSHEET_TOKEN is required');

const sdk = createSmartsheet(TOKEN);

const SHEET_NAME = (process.env.SHEET_NAME || '').trim();
const PORT = Number(process.env.PORT || 4000);

/* -------------------- In‑memory cache -------------------- */
let SHEET_ID; // resolved numeric id (valid after ensureSheetBoot)
let SHEET_DATA = null; // Full Smartsheet data (columns + rows) - Cached for performance
let COLUMNS = []; // [{id,title,type,options?,systemColumnType?,primary?,contactOptions?}]
let COLUMN_BY_TITLE = new Map(); // normalized title -> column

/* -------------------- Helper: numeric id sanitize -------------------- */
function sanitizeSheetId(raw) {
  if (!raw) return null;
  const digits = (String(raw).match(/\d+/g) || []).join('');
  if (!digits) return null;
  const idNum = Number(digits);
  return Number.isFinite(idNum) ? idNum : null;
}

/* -------------------- Load columns & build map -------------------- */
async function loadColumns(id) {
  // Correct method for: https://api.smartsheet.com/2.0/sheets/{sheetId}
  const response = await sdk.sheets.getSheet({
    sheetId: Number(id),
    queryParameters: {
      include: 'objectValue,attachments,discussions'
    }
  });
  const sheet = response.data || response.sheet || response; 
  
  SHEET_DATA = sheet; // Cache the full sheet for performance
  // so other APIs don't have to fetch it again

  console.log('sheet columns:', sheet.columns ? sheet.columns.length : 'none');
  COLUMNS = (sheet.columns || []).map((c) => ({
    id: c.id,
    title: c.title,
    type: c.type,
    options: c.options || null,
    systemColumnType: c.systemColumnType || null,
    primary: !!c.primary,
    contactOptions: c.contactOptions || null,
  }));

  COLUMN_BY_TITLE = new Map();
  for (const col of COLUMNS) {
    const key = (col.title || '').trim().toLowerCase();
    if (key) COLUMN_BY_TITLE.set(key, col);
  }
  return sheet;
}

/* -------------------- Resolve sheet id robustly -------------------- */
async function resolveSheetIdSmart() {
  if (SHEET_ID) return SHEET_ID;

  // 1) Try explicit SHEET_ID from env
  const envId = sanitizeSheetId(process.env.SHEET_ID);
  let getEnvErr = null;
  if (envId) {
    try {
      await sdk.sheets.getSheet({ sheetId: envId }); // verify id works with token
      SHEET_ID = envId;
      console.log('Using explicit numeric SHEET_ID:', SHEET_ID);
      return SHEET_ID;
    } catch (e) {
      getEnvErr = e?.message || 'Unknown SDK error';
      console.error(
        `resolveSheetIdSmart: getSheet for envId ${envId} failed: ${getEnvErr}. Falling back to name lookup...`
      );
    }
  }

  // 2) Fallback by name (if provided)
  if (SHEET_NAME) {
    console.log(`Looking up sheet by name: "${SHEET_NAME}"`);
    let found = null;
    let listErr = null;
    try {
      // Fetch all sheets for the user
      const list = await sdk.sheets.listSheets({
        queryParameters: { includeAll: true },
      });
      found = (list.data || []).find(
        (s) => (s.name || '').trim() === SHEET_NAME
      );
    } catch (e) {
      listErr = e?.message || 'Unknown SDK error listSheets';
      console.error('resolveSheetIdSmart: listSheets failed:', listErr);
    }

    if (!found) {
      // Give the user a hint of what sheets were actually found
      console.error(`Sheet named "${SHEET_NAME}" not found. Ensure exact name exists or use valid numeric SHEET_ID.`);
      throw new Error(`Sheet named "${SHEET_NAME}" not found for this token. Primary error when trying SHEET_ID ${envId}: [ ${getEnvErr || 'No ID provided'} ]. ListSheets Error: [ ${listErr || 'Sheet name not found in list'} ]`);
    }

    try {
      // verified that sheetId is the correct key for this token in diag
      await sdk.sheets.getSheet({ sheetId: found.id });
      SHEET_ID = found.id;
      console.log('Resolved SHEET_ID from name ->', SHEET_ID);
      return SHEET_ID;
    } catch (e) {
      console.error(`resolveSheetIdSmart: getSheet for found id ${found.id} failed:`, e?.message);
      throw new Error(`Found sheet "${SHEET_NAME}" but failed to access it. Verify token permissions. Error: ${e?.message}`);
    }
  }

  throw new Error(
    'No valid SHEET_ID / SHEET_NAME. Set SHEET_ID to the numeric id that works.'
  );
}

/* -------------------- Ensure boot (id + columns) -------------------- */
async function ensureSheetBoot(forceRefresh = false) {
  await resolveSheetIdSmart();
  // If we don't have the sheet data yet, or if a refresh is requested, load it
  if (!SHEET_DATA || forceRefresh) {
    await loadColumns(SHEET_ID);
  }
}

/* -------------------- Column utilities -------------------- */
function colByTitleInsensitive(title) {
  if (!title) return null;
  return COLUMN_BY_TITLE.get(title.trim().toLowerCase()) || null;
}

function findNameColumn() {
  const primary = COLUMNS.find((c) => c.primary === true);
  if (primary) return primary;
  const candidates = ['Task Name', 'Primary', 'Name', 'Title', 'Task'];
  for (const cand of candidates) {
    const col = colByTitleInsensitive(cand);
    if (col) return col;
  }
  return COLUMNS.find((c) => c.type === 'TEXT_NUMBER') || COLUMNS[0] || null;
}

function findStartColumn() {
  const candidates = ['Start', 'Start Date', 'StartDate'];
  for (const cand of candidates) {
    const col = colByTitleInsensitive(cand);
    if (col) return col;
  }
  return null;
}

function findEndColumn() {
  const candidates = ['End', 'End Date', 'EndDate', 'Finish'];
  for (const cand of candidates) {
    const col = colByTitleInsensitive(cand);
    if (col) return col;
  }
  return null;
}

function findPercentColumn() {
  const candidates = ['% Complete', 'Percent Complete', 'Complete %'];
  for (const cand of candidates) {
    const col = colByTitleInsensitive(cand);
    if (col) return col;
  }
  return null;
}

function findStatusColumn() {
  const candidates = ['Status'];
  for (const cand of candidates) {
    const col = colByTitleInsensitive(cand);
    if (col) return col;
  }
  return null;
}

function findAssignedToColumn() {
  let col = colByTitleInsensitive('Assigned To');
  if (col) return col;
  const candidates = ['Assignee', 'Owner', 'Assigned', 'AssignedTo'];
  for (const cand of candidates) {
    col = colByTitleInsensitive(cand);
    if (col) return col;
  }
  return null;
}

function isContactLike(col) {
  if (!col) return false;
  if (col.type === 'CONTACT_LIST') return true;
  if (Array.isArray(col.contactOptions) && col.contactOptions.length > 0)
    return true; // treat as contact list even if type shows TEXT_NUMBER
  return false;
}

function isEditableCell(column, cell) {
  if (!column) return false;
  if (column.systemColumnType) return false; // system fields
  if (cell && cell.formula) return false; // formula-backed cells are read-only
  return true;
}

/* -------------------- Value builders -------------------- */
function contactObjectValue(value) {
  if (Array.isArray(value)) {
    const vals = value
      .filter(Boolean)
      .map((email) => ({ objectType: 'CONTACT', email }));
    return { objectValue: { objectType: 'MULTI_CONTACT', values: vals } };
  }
  if (typeof value === 'string' && value.trim()) {
    return { objectValue: { objectType: 'CONTACT', email: value.trim() } };
  }
  return { value: null };
}

function buildCellsPayload(cellsByTitle) {
  const items = [];
  for (const [title, val] of Object.entries(cellsByTitle || {})) {
    const col =
      colByTitleInsensitive(title) ||
      COLUMNS.find((c) => (c.title || '') === title);
    if (!col) continue;

    // Skip system / complex read-only / formulas
    if (col.systemColumnType) continue;
    if (col.formula) continue;
    if (['PREDECESSOR', 'DURATION'].includes(col.type)) continue;

    // Contacts
    if (isContactLike(col)) {
      items.push({ columnId: col.id, ...contactObjectValue(val) });
      continue;
    }

    // Date-like (includes ABSTRACT_DATETIME in your sheet)
    if (['DATE', 'DATETIME', 'ABSTRACT_DATETIME'].includes(col.type)) {
      // Smartsheet often rejects these if they are auto-calculated start/end dates for dependencies
      if (col.tags && (col.tags.includes('GANTT_START_DATE') || col.tags.includes('GANTT_END_DATE'))) {
        // If dependencies/gantt are enabled, start/end dates are often read-only or calculated from duration
        // Let's pass them only if project settings allow, but typically it's safer to skip unless explicitly needed.
        // For now, we will allow them but wrap in try-catch in the caller.
        items.push({ columnId: col.id, value: val || null });
        continue;
      }
      items.push({ columnId: col.id, value: val || null });
      continue;
    }

    // Default
    // Do not send empty string for TEXT_NUMBER, send null
    const safeVal = (val === '' && col.type === 'TEXT_NUMBER') ? null : val;
    items.push({ columnId: col.id, value: safeVal });
  }
  return items;
}

/* -------------------- Flatten row for UI -------------------- */
function flattenRow(row) {
  const flat = {
    id: row.id,
    rowNumber: row.rowNumber,
    parentId: row.parentId || null,
    indent: row.parentId ? 1 : 0,
    isPhase: row.parentId ? false : true,
    cells: {},
  };

  for (const cell of row.cells) {
    const col = COLUMNS.find((c) => c.id === cell.columnId);
    if (!col) continue;

    let display = cell.displayValue ?? cell.value ?? '';

    if (cell.objectValue && cell.objectValue.objectType === 'MULTI_CONTACT') {
      const emails = (cell.objectValue.values || [])
        .map((v) => v.email)
        .filter(Boolean);
      display = emails;
    } else if (cell.objectValue && cell.objectValue.objectType === 'CONTACT') {
      display = cell.objectValue.email || display;
    }

    flat.cells[col.title] = {
      value: display,
      raw: cell.value ?? null,
      editable: isEditableCell(col, cell),
    };
  }
  return flat;
}

/* -------------------- Diagnostics -------------------- */
console.log('*** Server starting at', new Date().toISOString());

app.get('/health', (_req, res) =>
  res.json({ ok: true, version: 1, uptime: process.uptime() })
);

app.get('/__routes', (_req, res) =>
  res.json({
    ok: true,
    routes: ['/health', '/__routes', '/__diag', '/api/meta', '/api/tasks (CRUD)'],
  })
);

app.get(['/__diag', '/api/__diag'], async (_req, res) => {
  let directTestMsg = 'Not tested';
  let listSheetsTest = 'Not tested';
  let sheetResponse = null; // Declare outside try for catch access
  try {
    const envRaw = process.env.SHEET_ID || null;
    const parsedEnv = sanitizeSheetId(envRaw);

    // Provide a direct test capability specifically for the diag endpoint 
    // to bypass resolveSheetIdSmart's fallback and strictly test the token/ID directly.
    if (parsedEnv) {
      try {
        await sdk.sheets.getSheet({ sheetId: parsedEnv });
        directTestMsg = 'Success! { sheetId: parsedEnv } worked with this Token.';
      } catch (err1) {
        directTestMsg = `Failed with { sheetId: ${parsedEnv} } -> ${err1.message}`;
        // Test an alternate payload just in case SDK docs are misleading
        try {
          await sdk.sheets.getSheet({ id: parsedEnv });
          directTestMsg += ` | However, it DID succeed with { id: ${parsedEnv} }. Modify code if this is the case.`;
        } catch (err2) {
          directTestMsg += ` | Failed with { id: ${parsedEnv} } -> ${err2.message}`;
        }
      }
    } else {
      directTestMsg = 'No numeric SHEET_ID parsed from environment to test directly.';
    }

    try {
      const list = await sdk.sheets.listSheets({ queryParameters: { includeAll: true } });
      listSheetsTest = `Success: Token can access listSheets. Found ${(list.data || []).length} sheets.`;
    } catch (errList) {
      listSheetsTest = `Failed to listSheets: ${errList.message}`;
    }

    const liveId = await resolveSheetIdSmart(); 
    sheetResponse = await sdk.sheets.getSheet({ sheetId: Number(liveId) });
    const sheet = sheetResponse.data || sheetResponse.sheet || sheetResponse;

    return res.json({
      sheetResponse: sheetResponse,
      envSheetId: envRaw,
      parsedEnvSheetId: parsedEnv || null,
      resolvedSheetId: liveId,
      sheetName: sheet.name,
      accessCheck: true,
      directTestMsg,
      listSheetsTest
    });
  } catch (e) {
    return res.status(500).json({
      sheetResponse: sheetResponse,
      message: e?.message || 'Diag failed',
      envSheetId: process.env.SHEET_ID || null,
      parsedEnvSheetId: sanitizeSheetId(process.env.SHEET_ID) || null,
      resolvedSheetId: SHEET_ID || null,
      errorDetails: e?.message,
      directTestMsg,
      listSheetsTest
    });
  }
});

/* -------------------- API: META -------------------- */
app.get('/api/meta', async (_req, res) => {
  try {
    await ensureSheetBoot();
    const sheet = SHEET_DATA; // Use the cached data from the guide-aligned getSheet call

    const nameCol = findNameColumn();
    const nameColId = nameCol?.id;

    const phases = (sheet.rows || [])
      .filter((r) => !r.parentId)
      .map((r) => {
        let label = 'Phase';
        if (nameColId) {
          const cell = r.cells.find((c) => c.columnId === nameColId);
          label = cell?.displayValue ?? cell?.value ?? label;
        }
        return { id: r.id, name: label };
      });

    return res.json({
      sheetId: SHEET_ID,
      columns: COLUMNS,
      phases,
      sheetData: SHEET_DATA // Returns the full data from the Smartsheet Guide!
    });
  } catch (e) {
    console.error('META ERROR:', e?.message);
    return res.status(500).json({
      message: e?.message || 'Internal Error (meta)',
      error: e?.name || 'Error'
    });
  }
});

/* -------------------- API: LIST -------------------- */
app.get('/api/tasks', async (_req, res) => {
  try {
    await ensureSheetBoot(true); // Force refresh to get latest rows for the task list
    const sheet = SHEET_DATA;
    const rows = (sheet.rows || []).map(flattenRow);
    return res.json({ rows, columns: COLUMNS });
  } catch (e) {
    console.error('LIST ERROR:', e?.message);
    return res.status(500).json({ message: e?.message || 'Internal Error' });
  }
});

/* -------------------- API: CREATE -------------------- */
app.post('/api/tasks', async (req, res) => {
  try {
    await ensureSheetBoot();
    const { parentId, cells } = req.body;
    if (!parentId) {
      return res
        .status(400)
        .json({ message: 'parentId (phase row id) is required' });
    }

    // Normalize "Task Name" -> actual name column (Primary) if needed
    const normalizedCells = { ...cells };
    const nameCol = findNameColumn();
    if (nameCol && normalizedCells['Task Name'] && !normalizedCells[nameCol.title]) {
      normalizedCells[nameCol.title] = normalizedCells['Task Name'];
      delete normalizedCells['Task Name'];
    }

    const payload = {
      parentId,
      cells: buildCellsPayload(normalizedCells),
    };

    const result = await sdk.sheets.addRows({
      sheetId: SHEET_ID,
      body: [payload],
    });

    const rows = result.result || result; // Smartsheet SDK returns { message, result: [...] }
    const created =
      (Array.isArray(rows) && rows[0]) || rows?.[0] || null;
    return res.status(201).json(created ? { id: created.id } : { ok: true });
  } catch (e) {
    console.error('CREATE ERROR:', e?.message);
    return res.status(400).json({ message: e?.message || 'Create failed' });
  }
});

/* -------------------- API: UPDATE -------------------- */
app.patch('/api/tasks/:rowId', async (req, res) => {
  try {
    await ensureSheetBoot();
    const rowId = Number(req.params.rowId);
    const { cells } = req.body;
    if (!rowId || !cells || typeof cells !== 'object') {
      return res.status(400).json({ message: 'rowId and cells are required' });
    }

    const normalizedCells = { ...cells };
    const nameCol = findNameColumn();
    if (nameCol && normalizedCells['Task Name'] && !normalizedCells[nameCol.title]) {
      normalizedCells[nameCol.title] = normalizedCells['Task Name'];
      delete normalizedCells['Task Name'];
    }

    const body = [
      {
        id: rowId,
        cells: buildCellsPayload(normalizedCells),
      },
    ];

    const result = await sdk.sheets.updateRows({
      sheetId: SHEET_ID,
      body,
    });

    const rows = result.result || result;
    const updated = Array.isArray(rows) ? rows.length : 0;
    return res.json({ ok: true, updated });
  } catch (e) {
    console.error('UPDATE ERROR:', e?.message);
    return res.status(400).json({ message: e?.message || 'Update failed' });
  }
});

/* -------------------- API: DELETE -------------------- */
app.delete('/api/tasks/:rowId', async (req, res) => {
  try {
    await ensureSheetBoot();
    const rowId = Number(req.params.rowId);
    const row = await sdk.sheets.getRow({ sheetId: SHEET_ID, rowId });

    if (!row.parentId) {
      return res
        .status(400)
        .json({ message: 'Cannot delete a phase (top-level row)' });
    }

    await sdk.sheets.deleteRows({ sheetId: SHEET_ID, rowIds: String(rowId) });
    return res.json({ ok: true });
  } catch (e) {
    console.error('DELETE ERROR:', e?.message);
    return res.status(400).json({ message: e?.message || 'Delete failed' });
  }
});

/* -------------------- Start -------------------- */
app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
});

