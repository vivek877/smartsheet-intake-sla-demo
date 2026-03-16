const BASE_URL = 'https://api.smartsheet.com/2.0';

/**
 * Senior Developer REST Client for Smartsheet.
 * Replaces the inconsistent SDK with direct, transparent fetch calls.
 */
module.exports = function createSmartsheet(token) {
  const call = async (path, options = {}) => {
    const url = `${BASE_URL}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown Error' }));
      throw new Error(error.message || `Smartsheet API returned ${response.status}`);
    }

    return await response.json();
  };

  return {
    sheets: {
      // Direct Sheet Access
      getSheet: (sheetId) => call(`/sheets/${sheetId}?include=objectValue,attachments,discussions`),
      listSheets: () => call('/sheets?includeAll=true'),
      getRow: (sheetId, rowId) => call(`/sheets/${sheetId}/rows/${rowId}`),
      
      // Row Operations
      addRows: ({ sheetId, body }) => call(`/sheets/${sheetId}/rows`, { 
        method: 'POST', 
        body: JSON.stringify(body) 
      }),
      updateRows: ({ sheetId, body }) => call(`/sheets/${sheetId}/rows`, { 
        method: 'PUT', 
        body: JSON.stringify(body) 
      }),
      deleteRows: ({ sheetId, rowIds }) => call(`/sheets/${sheetId}/rows?ids=${rowIds}`, { 
        method: 'DELETE' 
      })
    }
  };
};