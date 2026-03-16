/**
 * Smartsheet Service Client (Production)
 * 
 * Provides authenticated HTTP communication with the Smartsheet BFF service.
 * Handles request normalization and standardized error reporting.
 */

const BASE_URL = process.env.REACT_APP_API_BASE || '';

/**
 * Generic HTTP wrapper for service requests.
 * @param {string} path - The API endpoint path.
 * @param {Object} init - Fetch options (method, body, headers).
 * @returns {Promise<Object>} The parsed JSON response.
 */
async function request(path, init) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Service Error: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetches sheet metadata including column definitions and project phases.
 */
export const getMeta = () => request('/api/meta');

/**
 * Retrieves the full list of project tasks.
 */
export const getTasks = () => request('/api/tasks');

/**
 * Persists a new task into the Smartsheet project plan.
 */
export const createTask = (body) => request('/api/tasks', { 
  method: 'POST', 
  body: JSON.stringify(body) 
});

/**
 * Updates an existing task with partial cell data.
 */
export const updateTask = (rowId, cells) => request(`/api/tasks/${rowId}`, { 
  method: 'PATCH', 
  body: JSON.stringify({ cells }) 
});

/**
 * Removes a task from the project plan.
 */
export const deleteTask = (rowId) => request(`/api/tasks/${rowId}`, { 
  method: 'DELETE' 
});

/**
 * Fetches the list of valid team members for task assignment.
 */
export const getContacts = () => request('/api/contacts');