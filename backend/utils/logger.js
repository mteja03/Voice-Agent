function write(level, event, meta = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...meta,
  };
  const line = JSON.stringify(payload);
  if (level === 'error') {
    console.error(line);
    return;
  }
  if (level === 'warn') {
    console.warn(line);
    return;
  }
  console.log(line);
}

/**
 * Logger bound to an Express request (requestId + authenticated user context).
 */
function forReq(req) {
  const base = {
    requestId: req?.id ?? req?.requestId,
    userId: req?.user?.userId,
    companyId: req?.user?.companyId,
  };
  return {
    info(event, meta = {}) {
      write('info', event, { ...base, ...meta });
    },
    warn(event, meta = {}) {
      write('warn', event, { ...base, ...meta });
    },
    error(event, meta = {}) {
      write('error', event, { ...base, ...meta });
    },
  };
}

const logger = {
  info(event, meta) {
    write('info', event, meta);
  },
  warn(event, meta) {
    write('warn', event, meta);
  },
  error(event, meta) {
    write('error', event, meta);
  },
  forReq,
};

module.exports = { logger };
