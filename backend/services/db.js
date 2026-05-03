// Thin re-export so existing imports like:
//   const { saveMessage } = require('./services/db')
// continue to work without change.
module.exports = require('./dbService');
