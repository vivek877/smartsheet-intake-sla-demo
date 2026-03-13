require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const createSmartsheet = require('./smartsheet'); // returns client.createClient({ accessToken })

const app = express();

/* -------------------- CORS -------------------- */
const ORIGINS_ENV =
  process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '*';
const ORIGINS = ORIGINS_ENV.split(',').map(s => s.trim());

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
app.use(morgan('dev'));

/* -------------------- ENV + SDK -------------------- */
const TOKEN = process.env.SMARTSHEET_TOKEN;
if (!TOKEN) throw new Error('SMARTSHEET_TOKEN is required');

const sdk = createSmartsheet(TOKEN);

const SHEET_ID_ENV =
  (process.env.SHEET_ID && String(process.env.SHEET_ID).trim()) || '';

const SHEET_NAME = (process.env.SHEET_NAME || '').trim();
const PORT = Number(process.env.PORT || 4000);

/* -------------------- In‑memory cache -------------------- */
let SHEET_ID; // resolved numeric id
let COLUMNS = []; // [{id,title,type,options?,systemColumnType?}]
let COLUMN_BY_TITLE = new Map();

/* -------------------- Helpers -------------------- */
async function resolveSheetId() {
  // Prefer numeric SHEET_ID from env for reliability
  if (SHEET_ID_ENV) return Number(SHEET_ID_ENV);
  if (!SHEET_NAME) {
    throw new Error('Set SHEET_ID or SHEET_NAME in environment.');
  }

  // Fallback: resolve by name
  const list = await sdk.sheets.listSheets({
    queryParameters: { includeAll: true },
  });
  const found = list.data?.find(
    (s) => s.name && s.name.trim() === SHEET_NAME
  );
  if (!found) {
    throw new Error(
      `Sheet named "${SHEET_NAME}" not found. Set SHEET_ID instead.`
    );
  }
  return found.id;
}

async function loadColumns(id) {
  const sheet = await sdk.sheets.getSheet({ id });
  COLUMNS = (sheet.columns || []).map((c) => ({
    id: c.id,
    title: c.title,
    type: c.type,
    options: c.options || null,
    systemColumnType: c.systemColumnType || null,
  }));
  COLUMN_BY_TITLE = new Map(COLUMNS.map((c) => [c.title, c]));
  return sheet;
}

// Ensure we have a numeric SHEET_ID and loaded columns for every request.
async function ensureSheetBoot() {
  if (!SHEET_ID) {
    SHEET_ID = await resolveSheetId();
    console.log('Using SHEET_ID:', SHEET_ID);
  }
  if (!COLUMNS || !COLUMNS.length) {
    await loadColumns(SHEET_ID);
  }
}

function colByTitle(title) {
  return COLUMN_BY_TITLE.get(title);
}

function isEditableCell(column, cell) {
  if (!column) return false;
  if (column.systemColumnType) return false; // createdBy, modifiedDate, etc.
  if (cell && cell.formula) return false; // formula cells read‑only
  return true;
}

function flattenRow(row) {
  const flat = {
    id: row.id,
    rowNumber: row.rowNumber,
    parentId: row.parentId || null,
    indent: row.parentId ? 1 : 0, // (basic indentation indicator)
    isPhase: row.parentId ? false : true,
    cells: {},
  };

  for (const cell of row.cells) {
    const col = COLUMNS.find((c) => c.id === cell.columnId);
    if (!col) continue;

    // Prefer displayValue for user-facing rendering
    let display = cell.displayValue ?? cell.value ?? '';

    // Handle CONTACT_LIST & MULTI_CONTACT to support multi-select in UI
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

// CONTACT_LIST builder: array -> MULTI_CONTACT, string -> CONTACT
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

// Convert {'Task Name': 'X', 'Status': 'In Progress', ...} -> [{ columnId, value|objectValue }]
function buildCellsPayload(cellsByTitle) {
  const items = [];
  for (const [title, val] of Object.entries(cellsByTitle || {})) {
    const col = colByTitle(title);
    if (!col) continue;

    // CONTACT_LIST uses objectValue
    if (col.type === 'CONTACT_LIST') {
      const contactPayload = contactObjectValue(val);
      items.push({ columnId: col.id, ...contactPayload });
      continue;
    }

    // Dates can be plain 'YYYY-MM-DD' (API accepts ISO); other types pass through.
    items.push({ columnId: col.id, value: val });
  }
  return items;
}

/* -------------------- Diagnostics -------------------- */
console.log('*** Server starting at', new Date().toISOString());

/* -------------------- Routes -------------------- */
app.get('/health', (_req, res) =>
  res.json({ ok: true, version: 1, uptime: process.uptime() })
);

// Optional probe you can remove after the demo
app.get('/__routes', (_req, res) =>
  res.json({
    ok: true,
    routes: ['/health', '/__routes', '/api/meta', '/api/tasks (CRUD)'],
  })
);


// New: quick diagnostics to prove the live config
app.get('/__diag', async (_req, res) => {
  try {
    await ensureSheetBoot();
    const sheet = await sdk.sheets.getSheet({ id: SHEET_ID });
    return res.json({
      envSheetId: process.env.SHEET_ID,
      parsedSheetId: SHEET_ID,
      sheetName: sheet.name,
      accessCheck: true
    });
  } catch (e) {
    return res.status(500).json({
      message: e?.message || 'Diag failed',
      envSheetId: process.env.SHEET_ID,
      envSheetName: process.env.SHEET_NAME,
      parsedSheetId: SHEET_ID
    });
  }
});


// META: sheetId + columns + phases (top-level rows)
app.get('/api/meta', async (_req, res) => {
  try {
    await ensureSheetBoot();
    const sheet = await sdk.sheets.getSheet({ id: SHEET_ID });
    const taskNameCol = COLUMNS.find(
      (c) => (c.title || '').toLowerCase() === 'task name'
    );

    const phases = (sheet.rows || [])
      .filter((r) => !r.parentId)
      .map((r) => {
        const nameCell = taskNameCol
          ? r.cells.find((c) => c.columnId === taskNameCol.id)
          : null;
        return {
          id: r.id,
          name: nameCell?.displayValue ?? nameCell?.value ?? 'Phase',
        };
      });

    return res.json({ sheetId: SHEET_ID, columns: COLUMNS, phases });
  } catch (e) {
    console.error('META ERROR:', e?.message);
    return res.status(500).json({
      message: e?.message || 'Internal Error',
      hint:
        'Verify SHEET_ID and SMARTSHEET_TOKEN; this route calls getSheet(id).',
    });
  }
});

// LIST tasks
app.get('/api/tasks', async (_req, res) => {
  try {
    await ensureSheetBoot();
    const sheet = await sdk.sheets.getSheet({ id: SHEET_ID });
    const rows = (sheet.rows || []).map(flattenRow);
    return res.json({ rows, columns: COLUMNS });
  } catch (e) {
    console.error('LIST ERROR:', e?.message);
    return res.status(500).json({ message: e?.message || 'Internal Error' });
  }
});

// CREATE task under a phase (parentId)
app.post('/api/tasks', async (req, res) => {
  try {
    await ensureSheetBoot();
    const { parentId, cells } = req.body;
    if (!parentId) {
      return res
        .status(400)
        .json({ message: 'parentId (phase row id) is required' });
    }

    const payload = {
      parentId,
      cells: buildCellsPayload(cells),
    };

    const result = await sdk.sheets.addRows({
      id: SHEET_ID,
      body: [payload],
    });

    const created = Array.isArray(result) ? result[0] : result?.[0];
    return res.status(201).json(created ? { id: created.id } : { ok: true });
  } catch (e) {
    console.error('CREATE ERROR:', e?.message);
    return res.status(400).json({ message: e?.message || 'Create failed' });
  }
});

// UPDATE task cells
app.patch('/api/tasks/:rowId', async (req, res) => {
  try {
    await ensureSheetBoot();
    const rowId = Number(req.params.rowId);
    const { cells } = req.body;
    if (!rowId || !cells || typeof cells !== 'object') {
      return res.status(400).json({ message: 'rowId and cells are required' });
    }

    const body = [
      {
        id: rowId,
        cells: buildCellsPayload(cells),
      },
    ];

    const result = await sdk.sheets.updateRows({
      id: SHEET_ID,
      body,
    });

    const updated = Array.isArray(result) ? result.length : 0;
    return res.json({ ok: true, updated });
  } catch (e) {
    console.error('UPDATE ERROR:', e?.message);
    return res.status(400).json({ message: e?.message || 'Update failed' });
  }
});

// DELETE task (block phase delete)
app.delete('/api/tasks/:rowId', async (req, res) => {
  try {
    await ensureSheetBoot();
    const rowId = Number(req.params.rowId);
    const row = await sdk.sheets.getRow({ id: SHEET_ID, rowId });

    if (!row.parentId) {
      return res
        .status(400)
        .json({ message: 'Cannot delete a phase (top-level row)' });
    }

    await sdk.sheets.deleteRows({ id: SHEET_ID, rowIds: String(rowId) });
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