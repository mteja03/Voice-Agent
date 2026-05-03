function baseMeta(res) {
  return { ...(res.locals?.requestMeta || {}) };
}

/**
 * @param {import('express').Response} res
 * @param {object} data - Response payload (becomes JSON `data`).
 * @param {object} [meta] - Extra meta merged after request meta (e.g. requestId).
 * @param {number} [statusCode=200]
 */
function sendSuccess(res, data = {}, meta = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data,
    meta: { ...baseMeta(res), ...meta },
  });
}

/**
 * @param {import('express').Response} res
 * @param {number} statusCode
 * @param {string} message
 * @param {object} [meta] - Extra meta (merged with requestId from res.locals).
 */
function sendError(res, statusCode, message, meta = {}) {
  return res.status(statusCode).json({
    success: false,
    error: message || 'Request failed',
    meta: { ...baseMeta(res), ...meta },
  });
}

module.exports = { sendSuccess, sendError };
