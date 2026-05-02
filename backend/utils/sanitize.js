function redactSecrets(message = '') {
  return String(message)
    .replace(/\bsk-[A-Za-z0-9_*-]{12,}\b/g, '[REDACTED]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED]')
    .replace(/\bsk_mdq[a-zA-Z0-9_-]{8,}\b/g, '[REDACTED]');
}

function safeClientMessage(err) {
  const raw = err?.message || String(err || 'Unknown error');
  return redactSecrets(raw);
}

module.exports = { redactSecrets, safeClientMessage };
