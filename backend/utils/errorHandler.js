const { sendError } = require('./response');
const { logger } = require('./logger');

function notFoundHandler(req, res) {
  return sendError(res, 404, 'Not found');
}

/**
 * Express error middleware — never leaks raw Error.message for 5xx.
 */
function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  const status = Number(err.status || err.statusCode) || 500;
  if (status >= 500) {
    logger.error('unhandled_error', {
      message: err.message,
      stack: err.stack,
      requestId: req.id,
    });
    return sendError(res, 500, 'Internal server error');
  }
  const message = err.publicMessage || err.message || 'Request failed';
  return sendError(res, status, message);
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
