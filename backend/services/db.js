const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const messagesPath = path.join(dataDir, 'messages.json');
const callsPath = path.join(dataDir, 'calls.json');

let writeQueue = Promise.resolve();

function queueWrite(task) {
  writeQueue = writeQueue.then(task, task);
  return writeQueue;
}

async function ensureJsonFile(filePath, fallback) {
  try {
    await fsp.access(filePath);
  } catch {
    await fsp.writeFile(filePath, `${JSON.stringify(fallback, null, 2)}\n`, 'utf8');
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const db = null;

ensureJsonFile(messagesPath, []);
ensureJsonFile(callsPath, []);
console.log('Connected to file-backed JSON database.');

/**
 * Save a message to the database
 */
function saveMessage(sessionId, role, content) {
  return queueWrite(async () => {
    const messages = await readJson(messagesPath, []);
    const row = {
      id: (messages[messages.length - 1]?.id || 0) + 1,
      session_id: sessionId,
      role,
      content,
      timestamp: new Date().toISOString(),
    };
    messages.push(row);
    await writeJson(messagesPath, messages);
    return row.id;
  });
}

/**
 * Get recent messages for a session (e.g. last 10)
 */
function getRecentMessages(sessionId, limit = 10) {
  return readJson(messagesPath, []).then((messages) => {
    const rows = messages
      .filter((m) => m.session_id === sessionId)
      .slice(-limit)
      .map((m) => ({ role: m.role, content: m.content }));
    return rows;
  });
}

/**
 * Get full session messages in chronological order
 */
function getSessionMessages(sessionId) {
  return readJson(messagesPath, []).then((messages) =>
    messages
      .filter((m) => m.session_id === sessionId)
      .map((m) => ({ role: m.role, content: m.content }))
  );
}

/**
 * Clear a session
 */
function clearSessionDb(sessionId) {
  return queueWrite(async () => {
    const [messages, calls] = await Promise.all([
      readJson(messagesPath, []),
      readJson(callsPath, []),
    ]);
    await Promise.all([
      writeJson(messagesPath, messages.filter((m) => m.session_id !== sessionId)),
      writeJson(callsPath, calls.filter((c) => c.session_id !== sessionId)),
    ]);
    return true;
  });
}

/**
 * Log a call
 */
function logCall(sessionId, leadName, leadPhone, durationSeconds, outcome) {
  return queueWrite(async () => {
    const calls = await readJson(callsPath, []);
    const row = {
      id: (calls[calls.length - 1]?.id || 0) + 1,
      session_id: sessionId,
      lead_name: leadName || null,
      lead_phone: leadPhone || null,
      duration_seconds: durationSeconds || 0,
      outcome: outcome || 'unknown',
      timestamp: new Date().toISOString(),
    };
    calls.push(row);
    await writeJson(callsPath, calls);
    return row.id;
  });
}

/**
 * Get call analytics
 */
function getAnalytics() {
  return readJson(callsPath, []).then((calls) => {
    const analytics = {
      totalCalls: calls.length,
      interestedCalls: calls.filter((c) => c.outcome === 'interested').length,
      callsByDate: [],
      outcomes: [],
    };

    const since = new Date();
    since.setDate(since.getDate() - 7);
    const byDateMap = new Map();
    for (const call of calls) {
      const ts = new Date(call.timestamp);
      if (Number.isNaN(ts.getTime())) continue;
      if (ts >= since) {
        const dateKey = ts.toISOString().slice(0, 10);
        byDateMap.set(dateKey, (byDateMap.get(dateKey) || 0) + 1);
      }
    }
    analytics.callsByDate = [...byDateMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    const outcomeMap = new Map();
    for (const call of calls) {
      const key = (call.outcome || 'unknown').replace('_', ' ');
      outcomeMap.set(key, (outcomeMap.get(key) || 0) + 1);
    }
    analytics.outcomes = [...outcomeMap.entries()].map(([name, value]) => ({ name, value }));

    return analytics;
  });
}

module.exports = {
  db,
  saveMessage,
  getRecentMessages,
  getSessionMessages,
  clearSessionDb,
  logCall,
  getAnalytics
};
