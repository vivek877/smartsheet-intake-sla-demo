import React, { useState } from 'react';
import ContactMultiSelect from './ContactMultiSelect';

/**
 * Common layout wrapper for form fields.
 */
const Field = ({ label, children, style }) => (
  <div style={{ margin: '14px 0', ...style }}>
    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {label}
    </div>
    {children}
  </div>
);

/**
 * Modal for creating new tasks within a specific project phase.
 */
export function AddModal({ phases, contacts, onClose, onCreate }) {
  const [form, setForm] = useState({
    taskName: '',
    phaseRowId: '',
    assignedTo: [],
    start: '',
    end: '',
    percent: 0
  });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>Create New Task</h3>
          <button className="btn btn-ghost" onClick={onClose}>×</button>
        </div>

        <Field label="Task Designation">
          <input
            className="input-inline"
            style={{ border: '1px solid var(--border)', background: 'var(--bg)', padding: '10px' }}
            value={form.taskName}
            placeholder="e.g. Design System Implementation"
            onChange={(e) => setForm({ ...form, taskName: e.target.value })}
          />
        </Field>

        <Field label="Parent Phase">
          <select
            className="input-inline"
            style={{ border: '1px solid var(--border)', background: 'var(--bg)', padding: '10px', height: '42px' }}
            value={form.phaseRowId}
            onChange={(e) => setForm({ ...form, phaseRowId: e.target.value })}
          >
            <option value="">Select Target Phase…</option>
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

        <div style={{ display: 'flex', gap: 16 }}>
          <Field label="Scheduled Start" style={{ flex: 1 }}>
            <input
              type="date"
              className="input-inline"
              style={{ border: '1px solid var(--border)', background: 'var(--bg)', padding: '10px' }}
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
          </Field>
          <Field label="Scheduled End" style={{ flex: 1 }}>
            <input
              type="date"
              className="input-inline"
              style={{ border: '1px solid var(--border)', background: 'var(--bg)', padding: '10px' }}
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            />
          </Field>
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Dismiss</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              if (!form.phaseRowId) return alert('Target phase is required.');
              if (!form.taskName.trim()) return alert('Task designation is required.');
              onCreate(form);
            }}
          >
            Deploy Task
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Standard confirmation dialog for destructive or critical actions.
 */
export function ConfirmDialog({ open, title, message, confirmText = 'Confirm', onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <p style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{message}</p>
        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
