/**
 * Smartsheet Project Dashboard - Backend API
 * 
 * This server provides a high-level API for interacting with Smartsheet project plans.
 * Implementation features:
 * - Robust sheet ID resolution (Environment vs. Name lookup)
 * - Intelligent in-memory caching for optimized frontend performance
 * - Native Smartsheet REST API integration for maximum stability
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const createSmartsheet = require('./smartsheet');
const { flattenRow, buildCellsPayload, findNameColumn } = require('./utils/rowHelpers');

const app = express();

/* -------------------- Middleware -------------------- */
const ORIGINS_ENV = process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '*';
const ORIGINS = ORIGINS_ENV.split(',').map((s) => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (ORIGINS.includes('*') || !origin || ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error('CORS blocked'), false);
  }
}));

app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});
app.use(morgan('dev'));

/* -------------------- Config & Client -------------------- */
const TOKEN = process.env.SMARTSHEET_TOKEN;
if (!TOKEN) throw new Error('SMARTSHEET_TOKEN is required');

const sdk = createSmartsheet(TOKEN);
const SHEET_NAME = (process.env.SHEET_NAME || '').trim();
const PORT = Number(process.env.PORT || 4000);

/* -------------------- State (Caching) -------------------- */
let SHEET_ID;   
let SHEET_DATA = null; 
let COLUMNS = [];      
let COLUMN_BY_TITLE = new Map();

/**
 * Normalizes and validates raw sheet IDs.
 */
function sanitizeSheetId(raw) {
  if (!raw) return null;
  const digits = (String(raw).match(/\d+/g) || []).join('');
  return (digits && Number.isFinite(Number(digits))) ? Number(digits) : null;
}

/**
 * Fetches sheet structure and populates cache.
 */
async function loadColumns(id) {
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
  COLUMNS.forEach(col => {
    if (col.title) COLUMN_BY_TITLE.set(col.title.trim().toLowerCase(), col);
  });
  return sheet;
}

/**
 * Smart Sheet ID Resolution
 */
async function resolveSheetIdSmart() {
  if (SHEET_ID) return SHEET_ID;

  // 1. Env ID
  const envId = sanitizeSheetId(process.env.SHEET_ID);
  if (envId) {
    try {
      await sdk.sheets.getSheet(envId);
      SHEET_ID = envId;
      return SHEET_ID;
    } catch (e) {
      console.error(`ID Resolution Error: ${e.message}`);
    }
  }

  // 2. Name Lookup
  if (SHEET_NAME) {
    try {
      const list = await sdk.sheets.listSheets();
      const found = (list.data || []).find(s => (s.name || '').trim() === SHEET_NAME);
      if (found) {
        await sdk.sheets.getSheet(found.id);
        SHEET_ID = found.id;
        return SHEET_ID;
      }
    } catch (e) {
      console.error(`Name Resolution Error: ${e.message}`);
    }
  }

  throw new Error('Could not resolve active SHEET_ID. Check configuration.');
}

async function ensureSheetBoot(forceRefresh = false) {
  await resolveSheetIdSmart();
  if (!SHEET_DATA || forceRefresh) await loadColumns(SHEET_ID);
}

/* -------------------- API Endpoints -------------------- */

app.get('/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.get(['/__diag', '/api/__diag'], async (_req, res) => {
  try {
    const liveId = await resolveSheetIdSmart();
    const sheet = await sdk.sheets.getSheet(liveId);
    return res.json({ activeSheet: sheet.name, sheetId: liveId, status: 'Connected' });
  } catch (e) {
    return res.status(503).json({ error: e.message });
  }
});

app.get('/api/meta', async (_req, res) => {
  try {
    await ensureSheetBoot();
    const nameColId = findNameColumn(COLUMNS, COLUMN_BY_TITLE)?.id;
    const phases = (SHEET_DATA.rows || [])
      .filter((r) => !r.parentId)
      .map((r) => {
        const cell = r.cells.find((c) => c.columnId === nameColId);
        return { id: r.id, name: cell?.displayValue ?? cell?.value ?? 'Phase' };
      });

    return res.json({ sheetId: SHEET_ID, columns: COLUMNS, phases, sheetData: SHEET_DATA });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/tasks', async (_req, res) => {
  try {
    await ensureSheetBoot(true); 
    const rows = (SHEET_DATA.rows || []).map(r => flattenRow(r, COLUMNS));
    return res.json({ rows, columns: COLUMNS });
  } catch (e) {
    return res.status(500).json({ error: 'Retrieval failed' });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    await ensureSheetBoot();
    const { parentId, cells } = req.body;
    if (!parentId) return res.status(400).json({ error: 'Parent ID required' });

    const result = await sdk.sheets.addRows({
      sheetId: SHEET_ID,
      body: [{ parentId, cells: buildCellsPayload(cells, COLUMNS, COLUMN_BY_TITLE) }],
    });

    const created = result.result?.[0] || result?.[0];
    return res.status(201).json(created ? { id: created.id } : { ok: true });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

app.patch('/api/tasks/:rowId', async (req, res) => {
  try {
    await ensureSheetBoot();
    const rowId = Number(req.params.rowId);
    const { cells } = req.body;

    const result = await sdk.sheets.updateRows({
      sheetId: SHEET_ID,
      body: [{ id: rowId, cells: buildCellsPayload(cells, COLUMNS, COLUMN_BY_TITLE) }],
    });

    return res.json({ ok: true, updated: result.result?.length || 0 });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

app.delete('/api/tasks/:rowId', async (req, res) => {
  try {
    await ensureSheetBoot();
    const rowId = Number(req.params.rowId);
    const row = await sdk.sheets.getRow(SHEET_ID, rowId);

    if (!row.parentId) return res.status(400).json({ error: 'Core phases are protected' });

    await sdk.sheets.deleteRows({ sheetId: SHEET_ID, rowIds: String(rowId) });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

app.get('/api/contacts', async (req, res) => {
  try {
    await ensureSheetBoot();
    const contactCol = COLUMNS.find(c => c.type === 'CONTACT_LIST' || c.contactOptions);
    let contacts = (contactCol?.contactOptions || []).map(c => ({
      id: c.email, name: c.name || c.email, email: c.email
    }));
    
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

app.listen(PORT, () => console.log(`[🚀] BFF Proxy active on :${PORT}`));
