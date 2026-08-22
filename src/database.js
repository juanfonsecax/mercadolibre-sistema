const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'bot.db');

let db = null;
let SQL = null;

async function initDb() {
  if (db) return db;
  SQL = await initSqlJs();

  // Load existing database if exists
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');
  initSchema();
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

function saveDbToFile() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Auto-save every 10 seconds
setInterval(() => {
  if (db) saveDbToFile();
}, 10000);

function initSchema() {
  // Accounts table
  db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      app_id TEXT NOT NULL,
      secret_key TEXT NOT NULL,
      redirect_uri TEXT DEFAULT 'http://localhost:3000/auth/callback',
      seller_id TEXT,
      user_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migrations for existing DB files
  try { db.run('ALTER TABLE tokens ADD COLUMN account_id INTEGER'); } catch {}
  try { db.run('ALTER TABLE questions ADD COLUMN account_id INTEGER'); } catch {}
  try { db.run('ALTER TABLE claims ADD COLUMN account_id INTEGER'); } catch {}
  try { db.run('ALTER TABLE activity_log ADD COLUMN account_id INTEGER'); } catch {}
  try { db.run('ALTER TABLE daily_stats ADD COLUMN account_id INTEGER'); } catch {}


  // Seed default stores if accounts table is empty
  const countObj = queryOne('SELECT COUNT(*) as count FROM accounts');
  if (!countObj || countObj.count === 0) {
    db.run(
      'INSERT INTO accounts (name, app_id, secret_key, redirect_uri) VALUES (?, ?, ?, ?)',
      ['Tienda Juan', 'COMPLETAR_APP_ID', 'COMPLETAR_SECRET_KEY', 'http://localhost:3000/auth/callback']
    );
    db.run(
      'INSERT INTO accounts (name, app_id, secret_key, redirect_uri) VALUES (?, ?, ?, ?)',
      ['Tienda Carlos', 'COMPLETAR_APP_ID', 'COMPLETAR_SECRET_KEY', 'http://localhost:3000/auth/callback']
    );
  }


  // Tokens table linked to account_id
  db.run(`
    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      user_id TEXT,
      seller_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    )
  `);

  // Questions table
  db.run(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      ml_question_id TEXT UNIQUE NOT NULL,
      ml_item_id TEXT,
      item_title TEXT,
      buyer_nickname TEXT,
      question_text TEXT NOT NULL,
      generated_answer TEXT,
      final_answer TEXT,
      status TEXT DEFAULT 'pending',
      answered_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Claims table
  db.run(`
    CREATE TABLE IF NOT EXISTS claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      ml_claim_id TEXT UNIQUE NOT NULL,
      ml_order_id TEXT,
      claim_type TEXT,
      claim_reason TEXT,
      claim_status TEXT,
      buyer_nickname TEXT,
      item_title TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Claim Messages table
  db.run(`
    CREATE TABLE IF NOT EXISTS claim_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      claim_id INTEGER NOT NULL,
      ml_claim_id TEXT,
      sender TEXT,
      message_text TEXT NOT NULL,
      is_auto INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE
    )
  `);

  // Post-Purchase Direct Messages table
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      pack_id TEXT NOT NULL,
      order_id TEXT,
      buyer_nickname TEXT,
      item_title TEXT,
      last_message TEXT NOT NULL,
      generated_answer TEXT,
      final_answer TEXT,
      status TEXT DEFAULT 'pending',
      answered_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS message_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      pack_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      message_text TEXT NOT NULL,
      is_auto INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    )
  `);

  // Knowledge Base table (Shared across accounts or per account)
  db.run(`
    CREATE TABLE IF NOT EXISTS knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      ml_item_id TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Activity Log
  db.run(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Daily Stats
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_stats (
      date TEXT PRIMARY KEY,
      account_id INTEGER,
      questions_received INTEGER DEFAULT 0,
      questions_answered INTEGER DEFAULT 0,
      claims_received INTEGER DEFAULT 0,
      claims_responded INTEGER DEFAULT 0,
      messages_received INTEGER DEFAULT 0,
      messages_responded INTEGER DEFAULT 0,
      avg_response_time_seconds REAL DEFAULT 0
    )
  `);

  saveDbToFile();
}

// ── Helper functions ──
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results[0] || null;
}

function runSql(sql, params = []) {
  db.run(sql, params);
  saveDbToFile();
}

// ── Account Operations ──

function saveAccount(account) {
  if (account.id) {
    runSql(
      'UPDATE accounts SET name = ?, app_id = ?, secret_key = ?, redirect_uri = ? WHERE id = ?',
      [account.name, account.app_id, account.secret_key, account.redirect_uri || 'http://localhost:3000/auth/callback', account.id]
    );
    return account.id;
  } else {
    runSql(
      'INSERT INTO accounts (name, app_id, secret_key, redirect_uri) VALUES (?, ?, ?, ?)',
      [account.name, account.app_id, account.secret_key, account.redirect_uri || 'http://localhost:3000/auth/callback']
    );
    const created = queryOne('SELECT id FROM accounts WHERE name = ?', [account.name]);
    return created ? created.id : null;
  }
}

function getAccounts() {
  return queryAll('SELECT * FROM accounts ORDER BY id ASC');
}

function getAccountById(id) {
  return queryOne('SELECT * FROM accounts WHERE id = ?', [id]);
}

function getAccountByName(name) {
  return queryOne('SELECT * FROM accounts WHERE name = ?', [name]);
}

function updateAccountSellerInfo(id, sellerId, userId) {
  runSql('UPDATE accounts SET seller_id = ?, user_id = ? WHERE id = ?', [sellerId, userId, id]);
}

function deleteAccount(id) {
  runSql('DELETE FROM accounts WHERE id = ?', [id]);
}

// ── Token Operations ──

function saveToken(accountId, tokenData) {
  runSql('DELETE FROM tokens WHERE account_id = ?', [accountId]);
  runSql(
    'INSERT INTO tokens (account_id, access_token, refresh_token, expires_at, user_id, seller_id) VALUES (?, ?, ?, ?, ?, ?)',
    [accountId, tokenData.access_token, tokenData.refresh_token, tokenData.expires_at, tokenData.user_id || null, tokenData.seller_id || null]
  );
}

function getToken(accountId) {
  if (!accountId) {
    return queryOne('SELECT * FROM tokens ORDER BY id DESC LIMIT 1');
  }
  return queryOne('SELECT * FROM tokens WHERE account_id = ? ORDER BY id DESC LIMIT 1', [accountId]);
}

// ── Question Operations ──

function saveQuestion(data) {
  try {
    runSql(
      'INSERT OR IGNORE INTO questions (account_id, ml_question_id, ml_item_id, item_title, buyer_nickname, question_text, generated_answer, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [data.account_id || null, data.ml_question_id, data.ml_item_id || null, data.item_title || null, data.buyer_nickname || null, data.question_text, data.generated_answer || null, data.status || 'pending']
    );
  } catch (e) {
    console.error('Error saving question:', e.message);
  }
}

function getQuestions(accountId = null, status = null, limit = 50, offset = 0) {
  let sql = 'SELECT q.*, a.name as account_name FROM questions q LEFT JOIN accounts a ON q.account_id = a.id WHERE 1=1';
  const params = [];

  if (accountId) {
    sql += ' AND q.account_id = ?';
    params.push(accountId);
  }
  if (status) {
    sql += ' AND q.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY q.created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return queryAll(sql, params);
}

function getQuestionById(id) {
  return queryOne('SELECT * FROM questions WHERE id = ?', [id]);
}

function getQuestionByMlId(mlQuestionId) {
  return queryOne('SELECT * FROM questions WHERE ml_question_id = ?', [mlQuestionId]);
}

function updateQuestionStatus(id, status, finalAnswer = null) {
  const answeredAt = (status === 'answered') ? new Date().toISOString() : null;
  if (finalAnswer && answeredAt) {
    runSql('UPDATE questions SET status = ?, final_answer = ?, answered_at = ? WHERE id = ?', [status, finalAnswer, answeredAt, id]);
  } else if (finalAnswer) {
    runSql('UPDATE questions SET status = ?, final_answer = ? WHERE id = ?', [status, finalAnswer, id]);
  } else {
    runSql('UPDATE questions SET status = ? WHERE id = ?', [status, id]);
  }
}

function getQuestionStats(accountId = null) {
  let where = 'WHERE 1=1';
  const params = [];
  if (accountId) {
    where += ' AND account_id = ?';
    params.push(accountId);
  }

  return {
    total: (queryOne(`SELECT COUNT(*) as count FROM questions ${where}`, params) || {}).count || 0,
    pending: (queryOne(`SELECT COUNT(*) as count FROM questions ${where} AND status = 'pending'`, params) || {}).count || 0,
    answered: (queryOne(`SELECT COUNT(*) as count FROM questions ${where} AND status = 'answered'`, params) || {}).count || 0,
    rejected: (queryOne(`SELECT COUNT(*) as count FROM questions ${where} AND status = 'rejected'`, params) || {}).count || 0,
    today: (queryOne(`SELECT COUNT(*) as count FROM questions ${where} AND date(created_at) = date('now')`, params) || {}).count || 0,
  };
}

// ── Claim Operations ──

function saveClaim(data) {
  try {
    runSql(
      'INSERT OR IGNORE INTO claims (account_id, ml_claim_id, ml_order_id, claim_type, claim_reason, claim_status, buyer_nickname, item_title, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [data.account_id || null, data.ml_claim_id, data.ml_order_id || null, data.claim_type || null, data.claim_reason || null, data.claim_status || null, data.buyer_nickname || null, data.item_title || null, data.status || 'active']
    );
  } catch (e) {
    console.error('Error saving claim:', e.message);
  }
}

function getClaims(accountId = null, status = null, limit = 50) {
  let sql = 'SELECT c.*, a.name as account_name FROM claims c LEFT JOIN accounts a ON c.account_id = a.id WHERE 1=1';
  const params = [];

  if (accountId) {
    sql += ' AND c.account_id = ?';
    params.push(accountId);
  }
  if (status) {
    sql += ' AND c.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY c.created_at DESC LIMIT ?';
  params.push(limit);

  return queryAll(sql, params);
}

function getClaimById(id) {
  return queryOne('SELECT * FROM claims WHERE id = ?', [id]);
}

function getClaimByMlId(mlClaimId) {
  return queryOne('SELECT * FROM claims WHERE ml_claim_id = ?', [mlClaimId]);
}

function updateClaimStatus(id, status) {
  runSql('UPDATE claims SET status = ?, updated_at = datetime("now") WHERE id = ?', [status, id]);
}

function getClaimStats(accountId = null) {
  let where = 'WHERE 1=1';
  const params = [];
  if (accountId) {
    where += ' AND account_id = ?';
    params.push(accountId);
  }

  return {
    total: (queryOne(`SELECT COUNT(*) as count FROM claims ${where}`, params) || {}).count || 0,
    active: (queryOne(`SELECT COUNT(*) as count FROM claims ${where} AND status = 'active'`, params) || {}).count || 0,
    responded: (queryOne(`SELECT COUNT(*) as count FROM claims ${where} AND status = 'responded'`, params) || {}).count || 0,
    resolved: (queryOne(`SELECT COUNT(*) as count FROM claims ${where} AND status = 'resolved'`, params) || {}).count || 0,
  };
}

function saveClaimMessage(data) {
  runSql(
    'INSERT INTO claim_messages (claim_id, ml_claim_id, sender, message_text, is_auto) VALUES (?, ?, ?, ?, ?)',
    [data.claim_id, data.ml_claim_id || null, data.sender, data.message_text, data.is_auto ? 1 : 0]
  );
}

function getClaimMessages(claimId) {
  return queryAll('SELECT * FROM claim_messages WHERE claim_id = ? ORDER BY created_at ASC', [claimId]);
}

// ── Direct Messages Operations (Post-Purchase) ──

function saveMessage(data) {
  const existing = queryOne('SELECT * FROM messages WHERE pack_id = ?', [data.pack_id]);
  if (existing) {
    runSql(
      'UPDATE messages SET last_message = ?, generated_answer = COALESCE(?, generated_answer), status = COALESCE(?, status) WHERE id = ?',
      [data.last_message, data.generated_answer || null, data.status || existing.status, existing.id]
    );
    return existing.id;
  } else {
    runSql(
      'INSERT INTO messages (account_id, pack_id, order_id, buyer_nickname, item_title, last_message, generated_answer, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [data.account_id || null, data.pack_id, data.order_id || null, data.buyer_nickname || null, data.item_title || null, data.last_message, data.generated_answer || null, data.status || 'pending']
    );
    const created = queryOne('SELECT id FROM messages WHERE pack_id = ?', [data.pack_id]);
    return created ? created.id : null;
  }
}

function getMessages(accountId = null, status = null, limit = 50) {
  let sql = 'SELECT m.*, a.name as account_name FROM messages m LEFT JOIN accounts a ON m.account_id = a.id WHERE 1=1';
  const params = [];

  if (accountId) {
    sql += ' AND m.account_id = ?';
    params.push(accountId);
  }
  if (status) {
    sql += ' AND m.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(limit);

  return queryAll(sql, params);
}

function getMessageById(id) {
  return queryOne('SELECT * FROM messages WHERE id = ?', [id]);
}

function getMessageByPackId(packId) {
  return queryOne('SELECT * FROM messages WHERE pack_id = ?', [packId]);
}

function updateMessageStatus(id, status, finalAnswer = null) {
  const answeredAt = (status === 'answered') ? new Date().toISOString() : null;
  if (finalAnswer && answeredAt) {
    runSql('UPDATE messages SET status = ?, final_answer = ?, answered_at = ? WHERE id = ?', [status, finalAnswer, answeredAt, id]);
  } else if (finalAnswer) {
    runSql('UPDATE messages SET status = ?, final_answer = ? WHERE id = ?', [status, finalAnswer, id]);
  } else {
    runSql('UPDATE messages SET status = ? WHERE id = ?', [status, id]);
  }
}

function saveMessageHistory(data) {
  runSql(
    'INSERT INTO message_history (message_id, pack_id, sender, message_text, is_auto) VALUES (?, ?, ?, ?, ?)',
    [data.message_id, data.pack_id, data.sender, data.message_text, data.is_auto ? 1 : 0]
  );
}

function getMessageHistory(messageId) {
  return queryAll('SELECT * FROM message_history WHERE message_id = ? ORDER BY created_at ASC', [messageId]);
}

function getMessageStats(accountId = null) {
  let where = 'WHERE 1=1';
  const params = [];
  if (accountId) {
    where += ' AND account_id = ?';
    params.push(accountId);
  }

  return {
    total: (queryOne(`SELECT COUNT(*) as count FROM messages ${where}`, params) || {}).count || 0,
    pending: (queryOne(`SELECT COUNT(*) as count FROM messages ${where} AND status = 'pending'`, params) || {}).count || 0,
    answered: (queryOne(`SELECT COUNT(*) as count FROM messages ${where} AND status = 'answered'`, params) || {}).count || 0,
  };
}

// ── Knowledge Base ──

function saveKnowledge(data) {
  runSql(
    'INSERT INTO knowledge (category, title, content, ml_item_id) VALUES (?, ?, ?, ?)',
    [data.category, data.title, data.content, data.ml_item_id || null]
  );
}

function getKnowledge(category = null) {
  if (category) {
    return queryAll('SELECT * FROM knowledge WHERE category = ? ORDER BY updated_at DESC', [category]);
  }
  return queryAll('SELECT * FROM knowledge ORDER BY category, updated_at DESC');
}

function getKnowledgeById(id) {
  return queryOne('SELECT * FROM knowledge WHERE id = ?', [id]);
}

function updateKnowledge(id, data) {
  runSql(
    "UPDATE knowledge SET title = ?, content = ?, ml_item_id = ?, updated_at = datetime('now') WHERE id = ?",
    [data.title, data.content, data.ml_item_id || null, id]
  );
}

function deleteKnowledge(id) {
  runSql('DELETE FROM knowledge WHERE id = ?', [id]);
}

// ── Activity Log ──

function logActivity(type, description, details = null, accountId = null) {
  runSql(
    'INSERT INTO activity_log (account_id, type, description, details_json) VALUES (?, ?, ?, ?)',
    [accountId || null, type, description, details ? JSON.stringify(details) : null]
  );
}

function getActivityLog(limit = 50, accountId = null) {
  if (accountId) {
    return queryAll('SELECT * FROM activity_log WHERE account_id = ? ORDER BY created_at DESC LIMIT ?', [accountId, limit]);
  }
  return queryAll('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT ?', [limit]);
}

// ── Daily Stats ──

function updateDailyStats(field, accountId = null) {
  const today = new Date().toISOString().split('T')[0];
  const existing = queryOne('SELECT * FROM daily_stats WHERE date = ? AND (account_id = ? OR (? IS NULL AND account_id IS NULL))', [today, accountId, accountId]);
  if (existing) {
    runSql(`UPDATE daily_stats SET ${field} = ${field} + 1 WHERE date = ? AND (account_id = ? OR (? IS NULL AND account_id IS NULL))`, [today, accountId, accountId]);
  } else {
    const fields = { questions_received: 0, questions_answered: 0, claims_received: 0, claims_responded: 0, messages_received: 0, messages_responded: 0, avg_response_time_seconds: 0 };
    fields[field] = 1;
    runSql(
      'INSERT INTO daily_stats (date, account_id, questions_received, questions_answered, claims_received, claims_responded, messages_received, messages_responded, avg_response_time_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [today, accountId || null, fields.questions_received, fields.questions_answered, fields.claims_received, fields.claims_responded, fields.messages_received, fields.messages_responded, fields.avg_response_time_seconds]
    );
  }
}

function getDailyStats(days = 7, accountId = null) {
  if (accountId) {
    return queryAll("SELECT * FROM daily_stats WHERE date >= date('now', '-' || ? || ' days') AND account_id = ? ORDER BY date ASC", [days, accountId]);
  }
  return queryAll("SELECT * FROM daily_stats WHERE date >= date('now', '-' || ? || ' days') ORDER BY date ASC", [days]);
}

function getOverviewStats(accountId = null) {
  const questionStats = getQuestionStats(accountId);
  const claimStats = getClaimStats(accountId);
  const messageStats = getMessageStats(accountId);
  const recentActivity = getActivityLog(10, accountId);
  const weeklyStats = getDailyStats(7, accountId);

  // Financial calculations
  let totalRevenue = 0;
  let totalCommissions = 0;
  let estimatedProfit = 0;

  weeklyStats.forEach(s => {
    totalRevenue += s.total_revenue || (s.questions_answered * 45000); // sample / real metrics
    totalCommissions += s.total_commission || (totalRevenue * 0.13);
  });
  estimatedProfit = totalRevenue - totalCommissions;

  return {
    questions: questionStats,
    claims: claimStats,
    messages: messageStats,
    financials: {
      totalRevenue,
      totalCommissions,
      estimatedProfit,
    },
    recentActivity,
    weeklyStats,
  };
}

module.exports = {
  initDb, getDb, saveDbToFile,
  // Accounts
  saveAccount, getAccounts, getAccountById, getAccountByName, updateAccountSellerInfo, deleteAccount,
  // Tokens
  saveToken, getToken,
  // Questions
  saveQuestion, getQuestions, getQuestionById, getQuestionByMlId,
  updateQuestionStatus, getQuestionStats,
  // Claims
  saveClaim, getClaims, getClaimById, getClaimByMlId,
  updateClaimStatus, getClaimStats, saveClaimMessage, getClaimMessages,
  // Messages (Direct post-purchase)
  saveMessage, getMessages, getMessageById, getMessageByPackId,
  updateMessageStatus, saveMessageHistory, getMessageHistory, getMessageStats,
  // Knowledge
  saveKnowledge, getKnowledge, getKnowledgeById, updateKnowledge, deleteKnowledge,
  // Activity
  logActivity, getActivityLog,
  // Stats
  updateDailyStats, getDailyStats, getOverviewStats,
};
