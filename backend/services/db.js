const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'voice_agent.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database.');
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS calls (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          lead_name TEXT,
          lead_phone TEXT,
          duration_seconds INTEGER,
          outcome TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    });
  }
});

/**
 * Save a message to the database
 */
function saveMessage(sessionId, role, content) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)',
      [sessionId, role, content],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

/**
 * Get recent messages for a session (e.g. last 10)
 */
function getRecentMessages(sessionId, limit = 10) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT role, content FROM messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?',
      [sessionId, limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows.reverse());
      }
    );
  });
}

/**
 * Get full session messages in chronological order
 */
function getSessionMessages(sessionId) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT role, content FROM messages WHERE session_id = ? ORDER BY timestamp ASC, id ASC',
      [sessionId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

/**
 * Clear a session
 */
function clearSessionDb(sessionId) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('DELETE FROM messages WHERE session_id = ?', [sessionId]);
      db.run('DELETE FROM calls WHERE session_id = ?', [sessionId]);
      resolve(true);
    });
  });
}

/**
 * Log a call
 */
function logCall(sessionId, leadName, leadPhone, durationSeconds, outcome) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO calls (session_id, lead_name, lead_phone, duration_seconds, outcome) VALUES (?, ?, ?, ?, ?)',
      [sessionId, leadName || null, leadPhone || null, durationSeconds || 0, outcome || 'unknown'],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

/**
 * Get call analytics
 */
function getAnalytics() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      const analytics = {
        totalCalls: 0,
        interestedCalls: 0,
        callsByDate: [],
        outcomes: []
      };

      let pending = 3;
      const checkDone = () => {
        pending--;
        if (pending === 0) resolve(analytics);
      };

      // 1. Total and Interested counts
      db.get('SELECT COUNT(*) as total, SUM(CASE WHEN outcome = "interested" THEN 1 ELSE 0 END) as interested FROM calls', (err, row) => {
        if (!err && row) {
          analytics.totalCalls = row.total || 0;
          analytics.interestedCalls = row.interested || 0;
        }
        checkDone();
      });

      // 2. Calls over the last 7 days
      db.all(`
        SELECT date(timestamp, 'localtime') as date, COUNT(*) as count 
        FROM calls 
        WHERE timestamp >= date('now', '-7 days') 
        GROUP BY date 
        ORDER BY date ASC
      `, (err, rows) => {
        if (!err && rows) {
          analytics.callsByDate = rows;
        }
        checkDone();
      });

      // 3. Outcome distribution
      db.all(`
        SELECT outcome as name, COUNT(*) as value 
        FROM calls 
        GROUP BY outcome
      `, (err, rows) => {
        if (!err && rows) {
          analytics.outcomes = rows.map(r => ({
            name: (r.name || 'unknown').replace('_', ' '),
            value: r.value
          }));
        }
        checkDone();
      });
    });
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
