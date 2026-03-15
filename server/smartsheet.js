const client = require('smartsheet');

/**
 * Initializes the Smartsheet SDK Client.
 * @param {string} accessToken - Your Smartsheet API developer token.
 * @returns {Object} sdk - The Smartsheet client instance.
 */
module.exports = function createSmartsheet(accessToken) {
  return client.createClient({
    accessToken,
    logLevel: 'info' // Enables helpful console logging for API requests
  });
};