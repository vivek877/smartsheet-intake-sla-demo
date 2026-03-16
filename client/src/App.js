import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Smartsheet Intake & SLA Demo - Frontend Application
 * 
 * Provides a React-based interface for managing Smartsheet project data.
 * Features:
 * - Real-time task synchronization
 * - Dynamic Gantt-style table view
 * - Inline and modal-based editing
 * - Role-based contact multi-selection
 */

import {
  getMeta,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  getContacts
} from './api.real';

import ContactMultiSelect from './components/ContactMultiSelect';

/* -------------------- State Management Hooks -------------------- */

/**
 * Custom hook for theme management (Light/Dark mode)
 */
function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');
  const resolved =
    theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.dataset.theme = resolved;
  }, [theme, resolved]);

  return { theme, setTheme, resolved, toggle: () => setTheme(resolved === 'dark' ? 'light' : 'dark') };
}

/* -------------------- UI Utility Functions -------------------- */

/**
 * Returns CSS class based on task status strings.
 */
const statusClass = (s) => {
  const v = (String(s || '').toLowerCase());
  if (v.includes('progress')) return 'status-progress';
  if (v.includes('complete')) return 'status-complete';
  if (v.includes('hold')) return 'status-hold';
  return 'status-queue';
};

/**
 * Returns CSS class based on health marker strings.
 */
const healthClass = (h) => {
  const v = (String(h || '').toLowerCase());
  if (v.includes('green')) return 'health-green';
  if (v.includes('yellow')) return 'health-yellow';
  if (v.includes('red')) return 'health-red';
  return 'health-blue';
};

/**
 * Calculates remaining business days (Mon-Fri) from current date to target end date.
 */
function bizDaysFromToday(endValue) {
  if (!endValue) return '';
  const d = new Date(endValue);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const dir = d >= today ? 1 : -1;
  let count = 0; let cur = new Date(today);
  while ((dir > 0 && cur <= d) || (dir < 0 && cur >= d)) {
    const day = cur.getDay(); 
    if (day !== 0 && day !== 6) count += dir;
    cur.setDate(cur.getDate() + dir);
  }
  return dir > 0 ? count : -count;
}

const cellVal = (row, title) => (row?.cells?.[title]?.value ?? '');

/* -------------------- Component Wrappers -------------------- */

function Field({ label, children, style }) {
  return (
    <div style={{ margin: '10px 0', ...style }}>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

/* -------------------- Modal Components -------------------- */

/**
 * Presentation component for adding a new task into a specific phase.
 */
function AddModal({ phases, contacts, onClose, onCreate }) {
  const [form, setForm] = useState({
    taskName: '',
    phaseRowId: '',
    assignedTo: [],
    start: '',
    end: '',
    percent: 0
  });

  return (
    <div className="modal-backdrop" onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999
    }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{
        width: 520, maxWidth: '92vw',
        background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)'
      }}>
        <h3 style={{ marginTop: 0 }}>Add New Task</h3>

        <Field label="Task Name">
          <input
            value={form.taskName}
            onChange={(e) => setForm({ ...form, taskName: e.target.value })}
          />
        </Field>

        <Field label="Parent Phase">
          <select
            value={form.phaseRowId}
            onChange={(e) => setForm({ ...form, phaseRowId: e.target.value })}
          >
            <option value="">Select phase…</option>
            {phases.map((p) => (
              <option key={String(p.id)} value={String(p.id)}>{p.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Assigned Team Members">
          <ContactMultiSelect
            contacts={contacts}
            value={form.assignedTo}
            onChange={(updated) => setForm({ ...form, assignedTo: updated })}
          />
        </Field>

        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="Scheduled Start" style={{ flex: 1 }}>
            <input
              type="date"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
          </Field>
          <Field label="Scheduled End" style={{ flex: 1 }}>
            <input
              type="date"
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Completion Percentage">
          <input
            type="number"
            min={0}
            max={100}
            value={form.percent}
            onChange={(e) => setForm({ ...form, percent: Number(e.target.value) })}
          />
        </Field>

        <div style={{ marginTop: 12, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!form.phaseRowId) { alert('Please select a phase'); return; }
              if (!form.taskName.trim()) { alert('Task name is required'); return; }
              onCreate(form);
            }}
          >
            Create Task
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Generic confirmation dialog for critical operations.
 */
function ConfirmDialog({ open, title, message, confirmText = 'Confirm', onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{
        width: 440, maxWidth: '92vw',
        background: 'var(--panel)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 16, boxShadow: 'var(--shadow)'
      }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <div style={{ color: 'var(--text)' }}>{message}</div>
        <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Main Application -------------------- */

export default function App() {
  const { toggle } = useTheme();

  const [meta, setMeta] = useState(null);            
  const [rows, setRows] = useState([]);              
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAdd, setShowAdd] = useState(false);     
  const [editRow, setEditRow] = useState(null);      
  const [editForm, setEditForm] = useState({});      
  const [selected, setSelected] = useState(null);    
  const [q, setQ] = useState('');                    

  const [confirmState, setConfirmState] = useState({ open: false, row: null }); 

  const searchRef = useRef(null);

  // Keyboard shortcut management
  useEffect(() => {
    const handler = (e) => {
      const tag = (e.target && e.target.tagName) || '';
      const inField = tag === 'INPUT' || tag === 'TEXTAREA';

      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (searchRef.current) searchRef.current.focus();
        return;
      }
      if (inField) return;

      if (e.key === 'd') toggle();
      if (e.key === 'n') setShowAdd(true);

      if (e.key === 'e' && selected) {
        const r = rows.find((r) => String(r.id) === String(selected));
        if (r && !r.isPhase) {
          setEditRow(r);
          seedEditForm(r);
        }
      }
      if (e.key === 'Delete' && selected) requestDelete(selected);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        if (editRow) onSaveEdit();
        e.preventDefault();
      }
      if (e.key === 'Escape') {
        setShowAdd(false);
        setEditRow(null);
        setConfirmState({ open: false, row: null });
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected, editRow, rows, toggle]);

  /**
   * Initializes application data from backend services.
   */
  async function load() {
    setLoading(true);
    try {
      const [m, t, ppl] = await Promise.all([getMeta(), getTasks(), getContacts()]);
      setMeta(m);
      setRows(t.rows || []);
      setContacts(ppl || []);
    } catch (e) {
      console.error('Data loading failed:', e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const columns = (meta && meta.columns) || [];
  const phases = (meta && meta.phases) || [];

  function cellValue(row, title) {
    return (row?.cells?.[title]?.value ?? '');
  }

  /**
   * Hydrates the edit form with current row data.
   */
  function seedEditForm(row) {
    setEditForm({
      primary: cellValue(row, 'Primary'),
      status: cellValue(row, 'Status'),
      assignedTo: Array.isArray(cellValue(row, 'Assigned To')) ? cellValue(row, 'Assigned To') : (
        cellValue(row, 'Assigned To') ? [cellValue(row, 'Assigned To')] : []
      ),
      start: (cellValue(row, 'Start Date') || ''),
      end: (cellValue(row, 'End Date') || ''),
      percent: Number(cellValue(row, '% Complete') || 0)
    });
  }

  const childrenCount = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (r.parentId) {
        const key = String(r.parentId);
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
    return map;
  }, [rows]);

  const displayRows = useMemo(() => {
    if (!q.trim()) return rows;
    const term = q.trim().toLowerCase();
    const contains = (x) => String(x || '').toLowerCase().includes(term);
    return rows.filter(r => {
      const name = cellValue(r, 'Primary');
      const status = cellValue(r, 'Status');
      const health = cellValue(r, 'Health');
      const assigned = cellValue(r, 'Assigned To');
      const assignedStr = Array.isArray(assigned) ? assigned.join(',') : assigned;
      return contains(name) || contains(status) || contains(health) || contains(assignedStr);
    });
  }, [rows, q]);

  /* -------------------- Action Handlers -------------------- */
  
  async function onCreate(form) {
    await createTask({
      parentId: String(form.phaseRowId),
      cells: {
        'Primary': form.taskName || 'New Task',
        'Assigned To': form.assignedTo || [],
        'Start Date': form.start || '',
        'End Date': form.end || '',
        '% Complete': Number(form.percent || 0),
        'Status': 'In Queue'
      }
    });
    setShowAdd(false);
    await load();
  }

  async function onQuickUpdate(rowId, title, value) {
    await updateTask(String(rowId), { [title]: value });
    const t = await getTasks();
    setRows(t.rows || []);
  }

  function requestDelete(rowId) {
    const row = rows.find((x) => String(x.id) === String(rowId));
    if (!row || row.isPhase) return;
    setConfirmState({
      open: true,
      row: { id: rowId, name: cellValue(row, 'Primary') || 'this task' }
    });
  }

  async function confirmDelete() {
    if (!confirmState.row) return;
    await deleteTask(String(confirmState.row.id));
    setConfirmState({ open: false, row: null });
    await load();
  }

  async function onSaveEdit() {
    if (!editRow) return;
    await updateTask(String(editRow.id), {
      'Primary': editForm.primary || cellValue(editRow, 'Primary'),
      'Assigned To': editForm.assignedTo || [],
      'Start Date': editForm.start || '',
      'End Date': editForm.end || '',
      '% Complete': Number(editForm.percent || 0)
    });
    setEditRow(null);
    await load();
  }

  if (loading) return <div className="container loading-state">Initializing Dashboard…</div>;

  return (
    <div className="container">

      <header className="app-header">
        <div className="brand">PR‑123456 — Example Project Dashboard</div>
        <div className="header-actions">
          <button className="btn btn-ghost" title="Theme (D)" onClick={toggle}>☾/☀︎</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Task</button>
        </div>
      </header>

      <section className="toolbar">
        <div className="search-field">
          <span className="icon">🔎</span>
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search team members, task names, or status… (/)"
          />
          {q && <span className="results-badge">{displayRows.length} results</span>}
        </div>
      </section>

      <main className="table-container">
        <table className="project-table">
          <thead>
            <tr>
              <th className="cell-indicator"></th>
              {columns.map((c) => (
                <th key={String(c.id)}>{c.title}</th>
              ))}
              <th className="cell-actions">Operations</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => (
              <tr
                key={String(row.id)}
                className={`${row.isPhase ? 'row-phase' : 'row-task'} ${selected === String(row.id) ? 'row-selected' : ''}`}
                onClick={() => setSelected(String(row.id))}
              >
                <td className="cell-indent">{row.indent ? '↳' : ''}</td>

                {columns.map((col) => {
                  const cell = (row.cells?.[col.title]) || { value: '', editable: false };

                  if (col.title === 'Health') {
                    return (
                      <td key={String(col.id)} className="cell-center">
                        <span className={`health-marker ${healthClass(cell.value)}`}></span>
                      </td>
                    );
                  }

                  if (col.title === 'Status') {
                    return (
                      <td key={String(col.id)}>
                        <span className={`status-badge ${statusClass(cell.value)}`}>{cell.value || 'Planned'}</span>
                      </td>
                    );
                  }

                  if (col.title === 'Children') {
                    const count = row.isPhase ? (childrenCount.get(String(row.id)) || 0) : 0;
                    return <td key={String(col.id)} className="cell-numeric">{count}</td>;
                  }

                  if (col.title === 'Assigned To') {
                    const emails = Array.isArray(cell.value) ? cell.value : (cell.value ? [cell.value] : []);
                    return (
                      <td key={String(col.id)} className="cell-contacts">
                        <ContactMultiSelect
                          contacts={contacts}
                          value={emails}
                          onChange={(updated) => onQuickUpdate(row.id, 'Assigned To', updated)}
                        />
                      </td>
                    );
                  }

                  if (col.title === 'Primary') {
                    return (
                      <td key={String(col.id)} className="cell-primary">
                        {row.isPhase ? (
                          <strong>{cell.value}</strong>
                        ) : (
                          <input 
                            className="input-inline" 
                            value={cell.value} 
                            onChange={(e) => onQuickUpdate(row.id, 'Primary', e.target.value)} 
                          />
                        )}
                      </td>
                    );
                  }

                  return (
                    <td key={String(col.id)}>
                      {cell.editable ? (
                        <input 
                          className="input-inline"
                          value={String(cell.value ?? '')} 
                          onChange={(e) => onQuickUpdate(row.id, col.title, e.target.value)} 
                        />
                      ) : (
                        <span className={!cell.value ? 'text-muted' : ''}>{String(cell.value || '—')}</span>
                      )}
                    </td>
                  );
                })}

                <td className="cell-actions-list">
                  {!row.isPhase ? (
                    <div className="btn-group">
                      <button className="btn btn-sm" onClick={() => { setEditRow(row); seedEditForm(row); }}>Modify</button>
                      <button className="btn btn-sm btn-danger" onClick={() => requestDelete(row.id)}>Remove</button>
                    </div>
                  ) : <span className="text-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>

      {/* Task Creation Modal */}
      {showAdd && (
        <AddModal
          phases={phases}
          contacts={contacts}
          onClose={() => setShowAdd(false)}
          onCreate={onCreate}
        />
      )}

      {/* Task Modification Side-panel */}
      {editRow && (
        <aside className="side-drawer">
          <div className="drawer-header">
            <h3>Modify Task</h3>
            <button className="btn-close" onClick={() => setEditRow(null)}>×</button>
          </div>
          <div className="drawer-body">
            <Field label="Task Designation">
              <input value={editForm.primary || ''} onChange={(e) => setEditForm({ ...editForm, primary: e.target.value })} />
            </Field>
            <Field label="Assignees">
              <ContactMultiSelect
                contacts={contacts}
                value={editForm.assignedTo || []}
                onChange={(updated) => setEditForm({ ...editForm, assignedTo: updated })}
              />
            </Field>
            <Field label="Completion (%)">
              <input type="number" min={0} max={100} value={editForm.percent || 0} onChange={(e) => setEditForm({ ...editForm, percent: Number(e.target.value) })} />
            </Field>
            <div className="horizontal-fields">
              <Field label="Start" style={{ flex: 1 }}>
                <input type="date" value={(editForm.start || '').split('T')[0]} onChange={(e) => setEditForm({ ...editForm, start: e.target.value })} />
              </Field>
              <Field label="End" style={{ flex: 1 }}>
                <input type="date" value={(editForm.end || '').split('T')[0]} onChange={(e) => setEditForm({ ...editForm, end: e.target.value })} />
              </Field>
            </div>
          </div>
          <div className="drawer-footer">
            <button className="btn" onClick={() => setEditRow(null)}>Dismiss</button>
            <button className="btn btn-primary" onClick={onSaveEdit}>Perspective Changes</button>
          </div>
        </aside>
      )}

      {/* Persistence Confirmation */}
      <ConfirmDialog
        open={confirmState.open}
        title="Confirm Task Removal"
        message={`Are you sure you wish to permanently remove "${confirmState.row?.name}"? This action synchronizes directly with Smartsheet and remains final.`}
        confirmText="Remove Task"
        onCancel={() => setConfirmState({ open: false, row: null })}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
