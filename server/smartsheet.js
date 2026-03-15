const client = require('smartsheet');

module.exports = function createSmartsheet(accessToken) {
  return client.createClient({
    accessToken
  });
};