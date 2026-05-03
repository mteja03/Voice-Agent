const { randomUUID } = require('crypto');

function requestIdMiddleware(req, res, next) {
  const id = randomUUID();
  req.id = id;
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  res.locals.requestMeta = { requestId: id };
  next();
}

module.exports = { requestIdMiddleware };
