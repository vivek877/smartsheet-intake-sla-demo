/**
 * Smartsheet REST API Client
 * 
 * A simplified, high-performance wrapper around the Smartsheet REST API.
 * Designed to provide direct, transparent access to sheet and row operations
 * without the overhead of external SDK dependencies.
 */

const BASE_URL = 'https://api.smartsheet.com/2.0';

module.exports = function createSmartsheet(token) {
  /**
   * Internal helper for executing authenticated FETCH requests.
   */
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
      const error = await response.json().catch(() => ({ message: 'API Request Failed' }));
      throw new Error(error.message || `Smartsheet API returned status ${response.status}`);
    }

    return await response.json();
  };

  return {
    sheets: {
      /**
       * Retrieves full sheet data including complex object values and attachments.
       */
      getSheet: (sheetId) => call(`/sheets/${sheetId}?include=objectValue,attachments,discussions`),
      
      /**
       * Lists all sheets accessible to the current token.
       */
      listSheets: () => call('/sheets?includeAll=true'),
      
      /**
       * Retrieves metadata for a single specific row.
       */
      getRow: (sheetId, rowId) => call(`/sheets/${sheetId}/rows/${rowId}`),

      /**
       * appends new rows to a target sheet.
       */
      addRows: ({ sheetId, body }) => call(`/sheets/${sheetId}/rows`, {
        method: 'POST',
        body: JSON.stringify(body)
      }),

      /**
       * Updates existing rows in a target sheet.
       */
      updateRows: ({ sheetId, body }) => call(`/sheets/${sheetId}/rows`, {
        method: 'PUT',
        body: JSON.stringify(body)
      }),

      /**
       * Removes rows from a target sheet by ID.
       */
      deleteRows: ({ sheetId, rowIds }) => call(`/sheets/${sheetId}/rows?ids=${rowIds}`, {
        method: 'DELETE'
      })
    }
  };
};