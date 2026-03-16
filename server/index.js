/**
 * Smartsheet Intake & SLA Demo - Backend API
 * 
 * This server provides a high-level API for interacting with Smartsheet project plans.
 * Implementation features:
 * - Robust sheet ID resolution (Environment vs. Name lookup)
 * - Intelligent in-memory caching for optimized frontend performance
 * - Standardized JSON-REST endpoints for task CRUD operations
 * - Native Smartsheet REST API integration for maximum stability
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const createSmartsheet = require('./smartsheet');

const app = express();

/* -------------------- Middleware & CORS -------------------- */
const ORIGINS_ENV = process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '*';
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

// Standardize response headers for cross-platform compatibility
app.use((_req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

app.use(morgan('dev'));

/* -------------------- Configuration & Client Initialization -------------------- */
const TOKEN = process.env.SMARTSHEET_TOKEN;
if (!TOKEN) throw new Error('SMARTSHEET_TOKEN is required for operation');

const sdk = createSmartsheet(TOKEN);

const SHEET_NAME = (process.env.SHEET_NAME || '').trim();
const PORT = Number(process.env.PORT || 4000);

/* -------------------- State Management (Caching) -------------------- */
let SHEET_ID;   // Resolved numeric ID of the active sheet
let SHEET_DATA = null; // Full cached sheet object (metadata + rows)
let COLUMNS = [];      // Normalized column definitions
let COLUMN_BY_TITLE = new Map(); // Fast lookup by column title

/**
 * Normalizes and validates raw sheet IDs into numeric format.
 */
function sanitizeSheetId(raw) {
  if (!raw) return null;
  const digits = (String(raw).match(/\d+/g) || []).join('');
  if (!digits) return null;
  const idNum = Number(digits);
  return Number.isFinite(idNum) ? idNum : null;
}

/**
 * Fetches sheet structure and populates the in-memory column maps.
 */
async function loadColumns(id) {
  // Use direct REST call for maximum reliability and control
  const sheet = await sdk.sheets.getSheet(id);

  SHEET_DATA = sheet; 
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

/**
 * Resolves the target Sheet ID using environment variables or name-based lookup.
 */
async function resolveSheetIdSmart() {
  if (SHEET_ID) return SHEET_ID;

  // 1) Explicit ID from Environment
  const envId = sanitizeSheetId(process.env.SHEET_ID);
  if (envId) {
    try {
      await sdk.sheets.getSheet(envId);
      SHEET_ID = envId;
      return SHEET_ID;
    } catch (e) {
      console.error(`Sheet ID resolution failed for ${envId}: ${e.message}`);
    }
  }

  // 2) Name-based fallback lookup
  if (SHEET_NAME) {
    let found = null;
    try {
      const listResponse = await sdk.sheets.listSheets();
      found = (listResponse.data || []).find(
        (s) => (s.name || '').trim() === SHEET_NAME
      );
    } catch (e) {
      console.error('Sheet list retrieval failed:', e.message);
    }

    if (!found) {
      throw new Error(`Target sheet "${SHEET_NAME}" not found in account.`);
    }

    try {
      await sdk.sheets.getSheet(found.id);
      SHEET_ID = found.id;
      return SHEET_ID;
    } catch (e) {
      throw new Error(`Authentication succeeded but access was denied for sheet ${found.id}`);
    }
  }

  throw new Error('No valid SHEET_ID or SHEET_NAME provided in configuration.');
}

/**
 * Ensures the sheet state is initialized and up-to-date before operation.
 */
async function ensureSheetBoot(forceRefresh = false) {
  await resolveSheetIdSmart();
  if (!SHEET_DATA || forceRefresh) {
    await loadColumns(SHEET_ID);
  }
}

/* -------------------- Utility Functions -------------------- */
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

function isContactLike(col) {
  if (!col) return false;
  return col.type === 'CONTACT_LIST' || (Array.isArray(col.contactOptions) && col.contactOptions.length > 0);
}

function isEditableCell(column, cell) {
  if (!column || column.systemColumnType) return false;
  if (cell && cell.formula) return false;
  return true;
}

/* -------------------- Payload Preparation -------------------- */
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

function buildCellsPayload(cellsByTitle) {
  const items = [];
  for (const [title, val] of Object.entries(cellsByTitle || {})) {
    const col = colByTitleInsensitive(title) || COLUMNS.find((c) => (c.title || '') === title);
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
}

/**
 * Flattens Smartsheet row structure for frontend consumption.
 */
function flattenRow(row) {
  const flat = {
    id: row.id,
    rowNumber: row.rowNumber,
    parentId: row.parentId || null,
    indent: row.parentId ? 1 : 0,
    isPhase: !row.parentId,
    cells: {},
  };

  for (const cell of row.cells) {
    const col = COLUMNS.find((c) => c.id === cell.columnId);
    if (!col) continue;

    let display = cell.displayValue ?? cell.value ?? '';
    if (cell.objectValue && cell.objectValue.objectType === 'MULTI_CONTACT') {
      display = (cell.objectValue.values || []).map((v) => v.email).filter(Boolean);
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

/* -------------------- API Endpoints -------------------- */

// System Health Checks
app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// Diagnostics & Validation
app.get(['/__diag', '/api/__diag'], async (_req, res) => {
  try {
    const liveId = await resolveSheetIdSmart();
    const sheet = await sdk.sheets.getSheet(liveId);
    return res.json({
      activeSheet: sheet.name,
      sheetId: liveId,
      accessConfirmed: true,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    return res.status(503).json({ error: e.message });
  }
});

// Sheet Metadata & Phasing
app.get('/api/meta', async (_req, res) => {
  try {
    await ensureSheetBoot();
    const nameColId = findNameColumn()?.id;
    const phases = (SHEET_DATA.rows || [])
      .filter((r) => !r.parentId)
      .map((r) => {
        const cell = r.cells.find((c) => c.columnId === nameColId);
        return { id: r.id, name: cell?.displayValue ?? cell?.value ?? 'Unnamed Phase' };
      });

    return res.json({
      sheetId: SHEET_ID,
      columns: COLUMNS,
      phases,
      sheetData: SHEET_DATA
    });
  } catch (e) {
    return res.status(500).json({ error: 'Metadata retrieval failed', details: e.message });
  }
});

// Task List Retrieval
app.get('/api/tasks', async (_req, res) => {
  try {
    await ensureSheetBoot(true); // Force refresh for real-time task views
    const rows = (SHEET_DATA.rows || []).map(flattenRow);
    return res.json({ rows, columns: COLUMNS });
  } catch (e) {
    return res.status(500).json({ error: 'Task list retrieval failed' });
  }
});

// Contact/Teammate Lookup
app.get('/api/contacts', async (req, res) => {
  try {
    await ensureSheetBoot();
    const contactCol = COLUMNS.find(c => c.type === 'CONTACT_LIST' || c.contactOptions);
    let contacts = (contactCol?.contactOptions || []).map(c => ({
      id: c.email,
      name: c.name || c.email,
      email: c.email
    }));
    
    // Default fallback team if no sheet contacts are defined
    if (!contacts.length) {
      contacts = [
        { id: 'allen.mitchell@example.com', name: 'Allen Mitchell', email: 'allen.mitchell@example.com' },
        { id: 'beth.richardson@example.com', name: 'Beth Richardson', email: 'beth.richardson@example.com' },
        { id: 'charlie.adams@example.com', name: 'Charlie Adams', email: 'charlie.adams@example.com' }
      ];
    }
    return res.json(contacts);
  } catch (e) {
    return res.json([]);
  }
});

// Task Creation
app.post('/api/tasks', async (req, res) => {
  try {
    await ensureSheetBoot();
    const { parentId, cells } = req.body;
    if (!parentId) return res.status(400).json({ error: 'Parent phase ID is required' });

    const normalizedCells = { ...cells };
    const nameCol = findNameColumn();
    if (nameCol && normalizedCells['Task Name']) {
      normalizedCells[nameCol.title] = normalizedCells['Task Name'];
    }

    const result = await sdk.sheets.addRows({
      sheetId: SHEET_ID,
      body: [{ parentId, cells: buildCellsPayload(normalizedCells) }],
    });

    const created = result.result?.[0] || result?.[0];
    return res.status(201).json(created ? { id: created.id } : { ok: true });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// Task Updates
app.patch('/api/tasks/:rowId', async (req, res) => {
  try {
    await ensureSheetBoot();
    const rowId = Number(req.params.rowId);
    const { cells } = req.body;
    if (!rowId || !cells) return res.status(400).json({ error: 'Task ID and cell data required' });

    const normalizedCells = { ...cells };
    const nameCol = findNameColumn();
    if (nameCol && normalizedCells['Task Name']) {
      normalizedCells[nameCol.title] = normalizedCells['Task Name'];
    }

    const result = await sdk.sheets.updateRows({
      sheetId: SHEET_ID,
      body: [{ id: rowId, cells: buildCellsPayload(normalizedCells) }],
    });

    return res.json({ ok: true, updated: result.result?.length || 0 });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// Task Deletion
app.delete('/api/tasks/:rowId', async (req, res) => {
  try {
    await ensureSheetBoot();
    const rowId = Number(req.params.rowId);
    const row = await sdk.sheets.getRow(SHEET_ID, rowId);

    if (!row.parentId) {
      return res.status(400).json({ error: 'Top-level phases cannot be deleted via this API.' });
    }

    await sdk.sheets.deleteRows({ sheetId: SHEET_ID, rowIds: String(rowId) });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

/* -------------------- Server Lifecycle -------------------- */
app.listen(PORT, () => {
  console.log(`[🚀] Smartsheet BFF service active on port ${PORT}`);
});
