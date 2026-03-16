import React, { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Smartsheet Project Dashboard - Frontend Application
 * 
 * Provides a React-based interface for managing Smartsheet project data.
 * Features:
 * - Real-time task synchronization
 * - Dynamic Gantt-style table view
 * - Inline and modal-based editing
 * - Role-based contact multi-selection
 */

// Service API
import {
  getMeta,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  getContacts
} from './api.real';

// Components
import ContactMultiSelect from './components/ContactMultiSelect';
import { AddModal, ConfirmDialog } from './components/TaskModals';

// Utilities
import { 
  getStatusClass, 
  getHealthClass, 
  calculateBusinessDays, 
  getCellValue 
} from './utils/projectHelpers';

/* -------------------- Custom Hooks -------------------- */

/**
 * Orchestrates theme switching and persistence.
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

  return { 
    theme, 
    setTheme, 
    resolved, 
    toggle: () => setTheme(resolved === 'dark' ? 'light' : 'dark') 
  };
}

/* -------------------- Main Dashboard -------------------- */

export default function App() {
  const { toggle } = useTheme();

  // Data State
  const [meta, setMeta] = useState(null);            
  const [rows, setRows] = useState([]);              
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI / Interaction State
  const [showAdd, setShowAdd] = useState(false);     
  const [editRow, setEditRow] = useState(null);      
  const [editForm, setEditForm] = useState({});      
  const [selectedId, setSelectedId] = useState(null);    
  const [searchQuery, setSearchQuery] = useState('');                    
  const [confirmState, setConfirmState] = useState({ open: false, row: null }); 

  const searchRef = useRef(null);

  // Keyboard Navigation & Shortcuts
  useEffect(() => {
    const handleShortcuts = (e) => {
      const activeElement = document.activeElement.tagName;
      const isTyping = activeElement === 'INPUT' || activeElement === 'TEXTAREA';

      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (isTyping) return;

      if (e.key === 'd') toggle();
      if (e.key === 'n') setShowAdd(true);

      if (e.key === 'e' && selectedId) {
        const row = rows.find((r) => String(r.id) === String(selectedId));
        if (row && !row.isPhase) {
          setEditRow(row);
          seedEditForm(row);
        }
      }
      
      if (e.key === 'Delete' && selectedId) requestDelete(selectedId);
      
      if (e.key === 'Escape') {
        setShowAdd(false);
        setEditRow(null);
        setConfirmState({ open: false, row: null });
      }
    };

    window.addEventListener('keydown', handleShortcuts);
    return () => window.removeEventListener('keydown', handleShortcuts);
  }, [selectedId, rows, toggle]);

  /**
   * Refreshes dashboard data from the BFF service.
   */
  async function refreshData() {
    setLoading(true);
    try {
      const [m, t, ppl] = await Promise.all([getMeta(), getTasks(), getContacts()]);
      setMeta(m);
      setRows(t.rows || []);
      setContacts(ppl || []);
    } catch (e) {
      console.error('Data synchronization failed:', e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refreshData(); }, []);

  const columns = useMemo(() => meta?.columns || [], [meta]);
  const phases = useMemo(() => meta?.phases || [], [meta]);

  /**
   * Hydrates the modification form with existing task attributes.
   */
  function seedEditForm(row) {
    setEditForm({
      primary: getCellValue(row, 'Primary'),
      status: getCellValue(row, 'Status'),
      assignedTo: Array.isArray(getCellValue(row, 'Assigned To')) 
        ? getCellValue(row, 'Assigned To') 
        : (getCellValue(row, 'Assigned To') ? [getCellValue(row, 'Assigned To')] : []),
      start: (getCellValue(row, 'Start Date') || ''),
      end: (getCellValue(row, 'End Date') || ''),
      percent: Number(getCellValue(row, '% Complete') || 0)
    });
  }

  // Memoized hierarchy stats
  const phaseChildCount = useMemo(() => {
    const map = new Map();
    rows.forEach(r => {
      if (r.parentId) {
        const pid = String(r.parentId);
        map.set(pid, (map.get(pid) || 0) + 1);
      }
    });
    return map;
  }, [rows]);

  // Optimized search results
  const displayRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const term = searchQuery.trim().toLowerCase();
    
    return rows.filter(r => {
      const name = getCellValue(r, 'Primary');
      const status = getCellValue(r, 'Status');
      const health = getCellValue(r, 'Health');
      const team = getCellValue(r, 'Assigned To');
      const teamStr = Array.isArray(team) ? team.join(' ') : team;
      
      return [name, status, health, teamStr].some(v => 
        String(v || '').toLowerCase().includes(term)
      );
    });
  }, [rows, searchQuery]);

  /* -------------------- Action Handlers -------------------- */
  
  async function handleCreateTask(formData) {
    await createTask({
      parentId: String(formData.phaseRowId),
      cells: {
        'Primary': formData.taskName || 'Untitled Objective',
        'Assigned To': formData.assignedTo || [],
        'Start Date': formData.start || '',
        'End Date': formData.end || '',
        '% Complete': Number(formData.percent || 0),
        'Status': 'Not Started'
      }
    });
    setShowAdd(false);
    await refreshData();
  }

  async function handleQuickUpdate(rowId, fieldTitle, value) {
    try {
      await updateTask(String(rowId), { [fieldTitle]: value });
      const updatedTasks = await getTasks();
      setRows(updatedTasks.rows || []);
    } catch (e) {
      alert(`Update failed: ${e.message}`);
    }
  }

  function requestDelete(rowId) {
    const row = rows.find((x) => String(x.id) === String(rowId));
    if (!row || row.isPhase) return;
    setConfirmState({
      open: true,
      row: { id: rowId, name: getCellValue(row, 'Primary') || 'this objective' }
    });
  }

  async function handleConfirmDelete() {
    if (!confirmState.row) return;
    await deleteTask(String(confirmState.row.id));
    setConfirmState({ open: false, row: null });
    await refreshData();
  }

  async function handleSaveEdit() {
    if (!editRow) return;
    await updateTask(String(editRow.id), {
      'Primary': editForm.primary || getCellValue(editRow, 'Primary'),
      'Assigned To': editForm.assignedTo || [],
      'Start Date': editForm.start || '',
      'End Date': editForm.end || '',
      '% Complete': Number(editForm.percent || 0)
    });
    setEditRow(null);
    await refreshData();
  }

  if (loading) return (
    <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div className="loading-state">Synchronizing Smartsheet Ledger…</div>
    </div>
  );

  return (
    <div className="container">

      {/* Persistence Controls */}
      <header className="app-header">
        <div className="brand">Smartsheet Project Dashboard</div>
        <div className="header-actions">
          <button className="btn btn-ghost" title="Toggle Surface (D)" onClick={toggle}>☾/☀︎</button>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Initialize Task</button>
        </div>
      </header>

      {/* Discovery Toolbar */}
      <section className="toolbar">
        <div className="search-field">
          <span className="icon">🔎</span>
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Query team, objectives, or status… (/)"
          />
          {searchQuery && <span className="results-badge">{displayRows.length} found</span>}
        </div>
      </section>

      {/* Execution Matrix */}
      <main className="table-container">
        <table className="project-table">
          <thead>
            <tr>
              <th className="cell-indicator"></th>
              {columns.map((c) => (
                <th key={String(c.id)}>{c.title}</th>
              ))}
              <th className="cell-actions">Oversight</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => (
              <tr
                key={String(row.id)}
                className={`${row.isPhase ? 'row-phase' : 'row-task'} ${selectedId === String(row.id) ? 'row-selected' : ''}`}
                onClick={() => setSelectedId(String(row.id))}
              >
                <td className="cell-indent">{row.indent ? '↳' : ''}</td>

                {columns.map((col) => {
                  const cell = (row.cells?.[col.title]) || { value: '', editable: false };

                  if (col.title === 'Health') {
                    return (
                      <td key={String(col.id)} className="cell-center">
                        <span className={`health-marker ${getHealthClass(cell.value)}`}></span>
                      </td>
                    );
                  }

                  if (col.title === 'Status') {
                    return (
                      <td key={String(col.id)}>
                        <span className={`status-badge ${getStatusClass(cell.value)}`}>{cell.value || 'Scheduled'}</span>
                      </td>
                    );
                  }

                  if (col.title === 'Children') {
                    const count = row.isPhase ? (phaseChildCount.get(String(row.id)) || 0) : 0;
                    return <td key={String(col.id)} className="cell-numeric">{count}</td>;
                  }

                  if (col.title === 'Assigned To') {
                    const emails = Array.isArray(cell.value) ? cell.value : (cell.value ? [cell.value] : []);
                    return (
                      <td key={String(col.id)} className="cell-contacts">
                        <ContactMultiSelect
                          contacts={contacts}
                          value={emails}
                          onChange={(updated) => handleQuickUpdate(row.id, 'Assigned To', updated)}
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
                            onChange={(e) => handleQuickUpdate(row.id, 'Primary', e.target.value)} 
                          />
                        )}
                      </td>
                    );
                  }

                  // Contextual fallback for remaining time
                  if (col.title === 'Working Days Remaining' && !cell.value) {
                    const fallback = calculateBusinessDays(getCellValue(row, 'End Date'));
                    return <td key={String(col.id)} className="text-muted">{fallback || '—'}</td>;
                  }

                  return (
                    <td key={String(col.id)}>
                      {cell.editable ? (
                        <input 
                          className="input-inline"
                          value={String(cell.value ?? '')} 
                          onChange={(e) => handleQuickUpdate(row.id, col.title, e.target.value)} 
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
                      <button className="btn btn-sm" onClick={() => { setEditRow(row); seedEditForm(row); }}>Modifier</button>
                      <button className="btn btn-sm btn-danger" onClick={() => requestDelete(row.id)}>Remove</button>
                    </div>
                  ) : <span className="text-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>

      {/* Modal Orchestration */}
      {showAdd && (
        <AddModal
          phases={phases}
          contacts={contacts}
          onClose={() => setShowAdd(false)}
          onCreate={handleCreateTask}
        />
      )}

      {/* Objective Modification Drawer */}
      {editRow && (
        <aside className="side-drawer" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="drawer-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0 }}>Objective Modification</h3>
            <button className="btn btn-ghost" onClick={() => setEditRow(null)}>×</button>
          </div>
          
          <div className="drawer-body" style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>PRIMARY DESIGNATION</label>
              <input 
                className="input-inline" 
                style={{ border: '1px solid var(--border)', background: 'var(--bg)', padding: '10px' }}
                value={editForm.primary || ''} 
                onChange={(e) => setEditForm({ ...editForm, primary: e.target.value })} 
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>ASSIGNED TEAM</label>
              <ContactMultiSelect
                contacts={contacts}
                value={editForm.assignedTo || []}
                onChange={(updated) => setEditForm({ ...editForm, assignedTo: updated })}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>PROGRESS QUANTUM (%)</label>
              <input 
                type="number" 
                className="input-inline"
                style={{ border: '1px solid var(--border)', background: 'var(--bg)', padding: '10px' }}
                min={0} max={100} 
                value={editForm.percent || 0} 
                onChange={(e) => setEditForm({ ...editForm, percent: Number(e.target.value) })} 
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>START</label>
                <input 
                  type="date" 
                  className="input-inline"
                  style={{ border: '1px solid var(--border)', background: 'var(--bg)', padding: '10px' }}
                  value={(editForm.start || '').split('T')[0]} 
                  onChange={(e) => setEditForm({ ...editForm, start: e.target.value })} 
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>END</label>
                <input 
                  type="date" 
                  className="input-inline"
                  style={{ border: '1px solid var(--border)', background: 'var(--bg)', padding: '10px' }}
                  value={(editForm.end || '').split('T')[0]} 
                  onChange={(e) => setEditForm({ ...editForm, end: e.target.value })} 
                />
              </div>
            </div>
          </div>

          <div className="drawer-footer" style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', gap: 12 }}>
            <button className="btn" style={{ flex: 1 }} onClick={() => setEditRow(null)}>Discard</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveEdit}>Persist Changes</button>
          </div>
        </aside>
      )}

      {/* Destructive Action Guard */}
      <ConfirmDialog
        open={confirmState.open}
        title="Confirm Objective Removal"
        message={`Are you sure you wish to permanently remove "${confirmState.row?.name}"? This action is synchronized directly with the Smartsheet ledger and cannot be reversed.`}
        confirmText="Execute Removal"
        onCancel={() => setConfirmState({ open: false, row: null })}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
