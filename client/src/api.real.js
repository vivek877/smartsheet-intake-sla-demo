const BASE = process.env.REACT_APP_API_BASE || ''; // Standard for Create React App

async function http(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...(init || {})
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const getMeta   = () => http('/api/meta');
export const getTasks  = () => http('/api/tasks');
export const createTask = (body) => http('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
export const updateTask = (rowId, cells) => http(`/api/tasks/${rowId}`, { method: 'PATCH', body: JSON.stringify({ cells }) });
export const deleteTask = (rowId) => http(`/api/tasks/${rowId}`, { method: 'DELETE' });
export const getContacts = () => http('/api/contacts');