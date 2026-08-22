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


  // Default redirect URI for Render or local
  const defaultRedirectUri = process.env.RENDER_EXTERNAL_URL
    ? `${process.env.RENDER_EXTERNAL_URL}/auth/callback`
    : 'https://mercadolibre-sistema.onrender.com/auth/callback';

  // Seed / Sync default stores from Env Vars or defaults
  const countObj = queryOne('SELECT COUNT(*) as count FROM accounts');
  if (!countObj || countObj.count === 0) {
    db.run(
      'INSERT INTO accounts (name, app_id, secret_key, redirect_uri) VALUES (?, ?, ?, ?)',
      ['Tienda Juan', process.env.ACCOUNT1_APP_ID || 'COMPLETAR_APP_ID', process.env.ACCOUNT1_SECRET_KEY || 'COMPLETAR_SECRET_KEY', defaultRedirectUri]
    );
    db.run(
      'INSERT INTO accounts (name, app_id, secret_key, redirect_uri) VALUES (?, ?, ?, ?)',
      ['Tienda Carlos', process.env.ACCOUNT2_APP_ID || 'COMPLETAR_APP_ID', process.env.ACCOUNT2_SECRET_KEY || 'COMPLETAR_SECRET_KEY', defaultRedirectUri]
    );
  } else {
    // If Env Vars are present, update account credentials automatically
    if (process.env.ACCOUNT1_APP_ID && process.env.ACCOUNT1_SECRET_KEY) {
      runSql('UPDATE accounts SET app_id = ?, secret_key = ?, redirect_uri = ? WHERE name = ? OR id = 1',
        [process.env.ACCOUNT1_APP_ID, process.env.ACCOUNT1_SECRET_KEY, defaultRedirectUri, 'Tienda Juan']);
    }
    if (process.env.ACCOUNT2_APP_ID && process.env.ACCOUNT2_SECRET_KEY) {
      runSql('UPDATE accounts SET app_id = ?, secret_key = ?, redirect_uri = ? WHERE name = ? OR id = 2',
        [process.env.ACCOUNT2_APP_ID, process.env.ACCOUNT2_SECRET_KEY, defaultRedirectUri, 'Tienda Carlos']);
    }
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

  // ── Fase 1: Importaciones China ──
  db.run(`
    CREATE TABLE IF NOT EXISTS china_shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tracking_number TEXT,
      supplier_name TEXT NOT NULL,
      status TEXT DEFAULT 'produccion', -- produccion, transito_maritimo, transito_aereo, aduana, recibido
      shipment_type TEXT DEFAULT 'maritimo', -- maritimo, aereo
      etd_date TEXT, -- Estimated Time of Departure
      eta_date TEXT, -- Estimated Time of Arrival
      trm_cop REAL DEFAULT 4000.0, -- Tasa de Cambio USD a COP
      total_cost_usd REAL DEFAULT 0,
      total_units INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS china_shipment_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER NOT NULL,
      sku TEXT NOT NULL,
      title TEXT NOT NULL,
      account_id INTEGER, -- Tienda asignada
      units INTEGER DEFAULT 0,
      unit_cost_usd REAL DEFAULT 0,
      FOREIGN KEY (shipment_id) REFERENCES china_shipments(id) ON DELETE CASCADE
    )
  `);

  // ── Fase 2: Stock Casa / Bodega Local ──
  db.run(`
    CREATE TABLE IF NOT EXISTS local_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      sku TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      category TEXT,
      units_house INTEGER DEFAULT 0,
      unit_cost_cop REAL DEFAULT 0,
      min_stock_alert INTEGER DEFAULT 10,
      location TEXT DEFAULT 'Bodega Principal',
      image_url TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER,
      sku TEXT NOT NULL,
      movement_type TEXT NOT NULL, -- entrada_importacion, ajuste_manual, transferencia_full, venta_local
      units INTEGER NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // ── Fase 3: Stock Full Mercado Libre ──
  db.run(`
    CREATE TABLE IF NOT EXISTS ml_full_inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      ml_item_id TEXT NOT NULL,
      sku TEXT,
      title TEXT NOT NULL,
      units_full INTEGER DEFAULT 0,
      sales_last_7d INTEGER DEFAULT 0,
      sales_last_30d INTEGER DEFAULT 0,
      coverage_days REAL DEFAULT 0, -- Calculado: units_full / (sales_last_30d / 30)
      last_sync_at TEXT DEFAULT (datetime('now')),
      UNIQUE(account_id, ml_item_id)
    )
  `);

  // ── Modulo de Ofertas & Margen ──
  db.run(`
    CREATE TABLE IF NOT EXISTS product_promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      ml_item_id TEXT NOT NULL,
      title TEXT NOT NULL,
      original_price REAL NOT NULL,
      promo_price REAL NOT NULL,
      discount_percent REAL DEFAULT 0,
      ml_commission_percent REAL DEFAULT 13.0,
      shipping_cost_cop REAL DEFAULT 0,
      product_cost_cop REAL DEFAULT 0,
      net_margin_cop REAL DEFAULT 0,
      net_margin_percent REAL DEFAULT 0,
      status TEXT DEFAULT 'activa', -- activa, pausada, programada
      ai_evaluation TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Seed default demo inventory if empty
  const localCount = queryOne('SELECT COUNT(*) as count FROM local_inventory');
  if (!localCount || localCount.count === 0) {
    db.run(`
      INSERT INTO local_inventory (account_id, sku, title, category, units_house, unit_cost_cop, min_stock_alert, location)
      VALUES 
      (1, 'VIT-D3K2-60', 'Vitamina D3 5000 IU + K2 MK7 60 Cápsulas Softgel', 'Suplementos', 120, 24000, 30, 'Bodega Casa - Estante A1'),
      (1, 'COL-PEP-300', 'Péptidos de Colágeno Hidrolizado Multi 300g', 'Nutrición', 85, 38000, 20, 'Bodega Casa - Estante B2'),
      (2, 'MAG-GLY-120', 'Glicinato de Magnesio Alta Absorción 120 Cápsulas', 'Suplementos', 45, 29000, 15, 'Bodega Casa - Estante A3'),
      (2, 'HAIR-GRO-60', 'Fórmula Crecimiento Capilar Avanzado 60 Caps', 'Belleza', 60, 31000, 20, 'Bodega Casa - Estante C1')
    `);
  }

  const shipmentCount = queryOne('SELECT COUNT(*) as count FROM china_shipments');
  if (!shipmentCount || shipmentCount.count === 0) {
    db.run(`
      INSERT INTO china_shipments (tracking_number, supplier_name, status, shipment_type, etd_date, eta_date, trm_cop, total_cost_usd, total_units, notes)
      VALUES 
      ('CN-HK-2026-9812', 'Shenzhen Health Biotech Ltd', 'transito_maritimo', 'maritimo', '2026-08-01', '2026-09-10', 4050.0, 3800.0, 1000, 'Contenedor compartido 20ft - Suplementos D3K2 y Magnesio'),
      ('AIR-CZ-77291', 'Guangzhou BioCare Corp', 'produccion', 'aereo', '2026-08-25', '2026-09-02', 4050.0, 1450.0, 300, 'Envío express por avión para reposición rápida de Colágeno')
    `);
    db.run(`
      INSERT INTO china_shipment_items (shipment_id, sku, title, account_id, units, unit_cost_usd)
      VALUES 
      (1, 'VIT-D3K2-60', 'Vitamina D3 5000 IU + K2 MK7 60 Caps', 1, 600, 3.50),
      (1, 'MAG-GLY-120', 'Glicinato de Magnesio Alta Absorción', 2, 400, 4.25),
      (2, 'COL-PEP-300', 'Péptidos de Colágeno Hidrolizado', 1, 300, 4.83)
    `);
  }

  const mlFullCount = queryOne('SELECT COUNT(*) as count FROM ml_full_inventory');
  if (!mlFullCount || mlFullCount.count === 0) {
    db.run(`
      INSERT INTO ml_full_inventory (account_id, ml_item_id, sku, title, units_full, sales_last_7d, sales_last_30d, coverage_days)
      VALUES 
      (1, 'MCO14892019', 'VIT-D3K2-60', 'Vitamina D3 5000 IU + K2 MK7 60 Cápsulas Softgel', 18, 14, 48, 11.25),
      (1, 'MCO14892020', 'COL-PEP-300', 'Péptidos de Colágeno Hidrolizado Multi 300g', 6, 9, 32, 5.62),
      (2, 'MCO29401928', 'MAG-GLY-120', 'Glicinato de Magnesio Alta Absorción 120 Caps', 40, 11, 39, 30.76),
      (2, 'MCO29401929', 'HAIR-GRO-60', 'Fórmula Crecimiento Capilar Avanzado 60 Caps', 4, 8, 28, 4.28)
    `);
  }

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

// ── Fase 1: Importaciones China Operations ──

function getChinaShipments() {
  const shipments = queryAll('SELECT * FROM china_shipments ORDER BY created_at DESC');
  return shipments.map(s => {
    const items = queryAll('SELECT i.*, a.name as account_name FROM china_shipment_items i LEFT JOIN accounts a ON i.account_id = a.id WHERE i.shipment_id = ?', [s.id]);
    return { ...s, items };
  });
}

function saveChinaShipment(shipment, items = []) {
  if (shipment.id) {
    runSql(
      'UPDATE china_shipments SET tracking_number = ?, supplier_name = ?, status = ?, shipment_type = ?, etd_date = ?, eta_date = ?, trm_cop = ?, total_cost_usd = ?, total_units = ?, notes = ?, updated_at = datetime("now") WHERE id = ?',
      [shipment.tracking_number, shipment.supplier_name, shipment.status, shipment.shipment_type, shipment.etd_date, shipment.eta_date, shipment.trm_cop || 4000, shipment.total_cost_usd || 0, shipment.total_units || 0, shipment.notes || '', shipment.id]
    );
    if (items.length > 0) {
      runSql('DELETE FROM china_shipment_items WHERE shipment_id = ?', [shipment.id]);
      items.forEach(item => {
        runSql(
          'INSERT INTO china_shipment_items (shipment_id, sku, title, account_id, units, unit_cost_usd) VALUES (?, ?, ?, ?, ?, ?)',
          [shipment.id, item.sku, item.title, item.account_id || null, item.units || 0, item.unit_cost_usd || 0]
        );
      });
    }
    return shipment.id;
  } else {
    runSql(
      'INSERT INTO china_shipments (tracking_number, supplier_name, status, shipment_type, etd_date, eta_date, trm_cop, total_cost_usd, total_units, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [shipment.tracking_number, shipment.supplier_name, shipment.status || 'produccion', shipment.shipment_type || 'maritimo', shipment.etd_date, shipment.eta_date, shipment.trm_cop || 4000, shipment.total_cost_usd || 0, shipment.total_units || 0, shipment.notes || '']
    );
    const created = queryOne('SELECT id FROM china_shipments ORDER BY id DESC LIMIT 1');
    if (created && items.length > 0) {
      items.forEach(item => {
        runSql(
          'INSERT INTO china_shipment_items (shipment_id, sku, title, account_id, units, unit_cost_usd) VALUES (?, ?, ?, ?, ?, ?)',
          [created.id, item.sku, item.title, item.account_id || null, item.units || 0, item.unit_cost_usd || 0]
        );
      });
    }
    return created ? created.id : null;
  }
}

function deleteChinaShipment(id) {
  runSql('DELETE FROM china_shipments WHERE id = ?', [id]);
}

// ── Fase 2: Stock Casa / Bodega Local Operations ──

function getLocalInventory(accountId = null) {
  let sql = 'SELECT i.*, a.name as account_name FROM local_inventory i LEFT JOIN accounts a ON i.account_id = a.id WHERE 1=1';
  const params = [];
  if (accountId) {
    sql += ' AND i.account_id = ?';
    params.push(accountId);
  }
  sql += ' ORDER BY i.sku ASC';
  return queryAll(sql, params);
}

function saveLocalInventoryItem(item) {
  if (item.id) {
    runSql(
      'UPDATE local_inventory SET account_id = ?, sku = ?, title = ?, category = ?, units_house = ?, unit_cost_cop = ?, min_stock_alert = ?, location = ?, updated_at = datetime("now") WHERE id = ?',
      [item.account_id || null, item.sku, item.title, item.category || 'General', item.units_house || 0, item.unit_cost_cop || 0, item.min_stock_alert || 10, item.location || 'Bodega Principal', item.id]
    );
    return item.id;
  } else {
    runSql(
      'INSERT INTO local_inventory (account_id, sku, title, category, units_house, unit_cost_cop, min_stock_alert, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [item.account_id || null, item.sku, item.title, item.category || 'General', item.units_house || 0, item.unit_cost_cop || 0, item.min_stock_alert || 10, item.location || 'Bodega Principal']
    );
    const created = queryOne('SELECT id FROM local_inventory WHERE sku = ?', [item.sku]);
    return created ? created.id : null;
  }
}

function deleteLocalInventoryItem(id) {
  runSql('DELETE FROM local_inventory WHERE id = ?', [id]);
}

function recordInventoryMovement(movement) {
  runSql(
    'INSERT INTO inventory_movements (account_id, sku, movement_type, units, description) VALUES (?, ?, ?, ?, ?)',
    [movement.account_id || null, movement.sku, movement.movement_type, movement.units, movement.description || '']
  );

  // Update local inventory house stock if applicable
  if (movement.movement_type === 'entrada_importacion' || movement.movement_type === 'ajuste_manual_suma') {
    runSql('UPDATE local_inventory SET units_house = units_house + ? WHERE sku = ?', [Math.abs(movement.units), movement.sku]);
  } else if (movement.movement_type === 'transferencia_full' || movement.movement_type === 'ajuste_manual_resta') {
    runSql('UPDATE local_inventory SET units_house = MAX(0, units_house - ?) WHERE sku = ?', [Math.abs(movement.units), movement.sku]);
  }
}

function getInventoryMovements(sku = null, limit = 50) {
  let sql = 'SELECT m.*, a.name as account_name FROM inventory_movements m LEFT JOIN accounts a ON m.account_id = a.id WHERE 1=1';
  const params = [];
  if (sku) {
    sql += ' AND m.sku = ?';
    params.push(sku);
  }
  sql += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(limit);
  return queryAll(sql, params);
}

// ── Fase 3: Stock Full ML Operations ──

function getMlFullInventory(accountId = null) {
  let sql = 'SELECT f.*, a.name as account_name, l.units_house as stock_casa, l.unit_cost_cop FROM ml_full_inventory f LEFT JOIN accounts a ON f.account_id = a.id LEFT JOIN local_inventory l ON f.sku = l.sku WHERE 1=1';
  const params = [];
  if (accountId) {
    sql += ' AND f.account_id = ?';
    params.push(accountId);
  }
  sql += ' ORDER BY f.units_full ASC';
  return queryAll(sql, params);
}

function saveMlFullInventoryItem(item) {
  const dailySales = (item.sales_last_30d || 0) / 30;
  const coverageDays = dailySales > 0 ? (item.units_full / dailySales) : 999;
  
  runSql(
    `INSERT INTO ml_full_inventory (account_id, ml_item_id, sku, title, units_full, sales_last_7d, sales_last_30d, coverage_days, last_sync_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(account_id, ml_item_id) DO UPDATE SET
       sku = excluded.sku,
       title = excluded.title,
       units_full = excluded.units_full,
       sales_last_7d = excluded.sales_last_7d,
       sales_last_30d = excluded.sales_last_30d,
       coverage_days = excluded.coverage_days,
       last_sync_at = datetime('now')`,
    [item.account_id, item.ml_item_id, item.sku || null, item.title, item.units_full || 0, item.sales_last_7d || 0, item.sales_last_30d || 0, coverageDays]
  );
}

function getReorderAlerts(accountId = null) {
  // Reorder alerts for Local House Stock (under min_stock_alert)
  const localAlerts = getLocalInventory(accountId).filter(i => i.units_house <= i.min_stock_alert).map(i => ({
    type: 'reorder_china',
    severity: i.units_house === 0 ? 'critical' : 'warning',
    sku: i.sku,
    title: i.title,
    account_name: i.account_name,
    message: `Stock Casa crítico (${i.units_house} unds, Mín: ${i.min_stock_alert}). Realizar pedido a China.`
  }));

  // Reorder alerts for Mercado Libre Full Stock (coverage < 10 days)
  const fullAlerts = getMlFullInventory(accountId).filter(f => f.coverage_days < 10).map(f => ({
    type: 'transfer_to_full',
    severity: f.coverage_days < 5 ? 'critical' : 'warning',
    sku: f.sku,
    title: f.title,
    account_name: f.account_name,
    message: `Stock Full ML bajo (${f.units_full} unds, ${f.coverage_days.toFixed(1)} días cobertura). Transferir desde Casa.`
  }));

  return [...localAlerts, ...fullAlerts];
}

// ── Modulo Ofertas & Margen Operations ──

function getProductPromotions(accountId = null) {
  let sql = 'SELECT p.*, a.name as account_name FROM product_promotions p LEFT JOIN accounts a ON p.account_id = a.id WHERE 1=1';
  const params = [];
  if (accountId) {
    sql += ' AND p.account_id = ?';
    params.push(accountId);
  }
  sql += ' ORDER BY p.created_at DESC';
  return queryAll(sql, params);
}

function saveProductPromotion(promo) {
  // Calculate net margin
  const original = parseFloat(promo.original_price || 0);
  const promoPrice = parseFloat(promo.promo_price || 0);
  const discountPercent = original > 0 ? ((original - promoPrice) / original) * 100 : 0;
  const commissionCop = promoPrice * ((parseFloat(promo.ml_commission_percent || 13)) / 100);
  const shippingCop = parseFloat(promo.shipping_cost_cop || 0);
  const productCostCop = parseFloat(promo.product_cost_cop || 0);

  const netMarginCop = promoPrice - commissionCop - shippingCop - productCostCop;
  const netMarginPercent = promoPrice > 0 ? (netMarginCop / promoPrice) * 100 : 0;

  if (promo.id) {
    runSql(
      'UPDATE product_promotions SET account_id = ?, ml_item_id = ?, title = ?, original_price = ?, promo_price = ?, discount_percent = ?, ml_commission_percent = ?, shipping_cost_cop = ?, product_cost_cop = ?, net_margin_cop = ?, net_margin_percent = ?, status = ?, ai_evaluation = ? WHERE id = ?',
      [promo.account_id, promo.ml_item_id, promo.title, original, promoPrice, discountPercent, promo.ml_commission_percent || 13, shippingCop, productCostCop, netMarginCop, netMarginPercent, promo.status || 'activa', promo.ai_evaluation || '', promo.id]
    );
    return promo.id;
  } else {
    runSql(
      'INSERT INTO product_promotions (account_id, ml_item_id, title, original_price, promo_price, discount_percent, ml_commission_percent, shipping_cost_cop, product_cost_cop, net_margin_cop, net_margin_percent, status, ai_evaluation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [promo.account_id, promo.ml_item_id, promo.title, original, promoPrice, discountPercent, promo.ml_commission_percent || 13, shippingCop, productCostCop, netMarginCop, netMarginPercent, promo.status || 'activa', promo.ai_evaluation || '']
    );
    const created = queryOne('SELECT id FROM product_promotions WHERE ml_item_id = ? ORDER BY id DESC LIMIT 1', [promo.ml_item_id]);
    return created ? created.id : null;
  }
}

function deleteProductPromotion(id) {
  runSql('DELETE FROM product_promotions WHERE id = ?', [id]);
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
  // China Shipments (Fase 1)
  getChinaShipments, saveChinaShipment, deleteChinaShipment,
  // Local Inventory (Fase 2)
  getLocalInventory, saveLocalInventoryItem, deleteLocalInventoryItem, recordInventoryMovement, getInventoryMovements,
  // Stock Full ML (Fase 3)
  getMlFullInventory, saveMlFullInventoryItem, getReorderAlerts,
  // Product Promotions & Margin Calculator
  getProductPromotions, saveProductPromotion, deleteProductPromotion,
};

