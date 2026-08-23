const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'bot.db');
const MAPPINGS_JSON_PATH = path.join(__dirname, '..', 'data', 'product_mappings.json');
const CHINA_JSON_PATH = path.join(__dirname, '..', 'data', 'china_shipments.json');
const LOCAL_JSON_PATH = path.join(__dirname, '..', 'data', 'local_inventory.json');

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

function reloadDbFromFile() {
  if (fs.existsSync(DB_PATH) && SQL) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    db.run('PRAGMA foreign_keys = ON');
    initSchema();
    console.log('[DB] Reloaded database from disk file bot.db');
  }
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
      product_name TEXT NOT NULL,
      notion_link TEXT,
      quantity INTEGER DEFAULT 0,
      chinese_winery_date TEXT,
      agency TEXT DEFAULT 'William',
      supply TEXT DEFAULT 'Alibaba',
      status TEXT DEFAULT 'In progress',
      total_price_cop REAL DEFAULT 0,
      boxes INTEGER DEFAULT 0,
      length_m REAL DEFAULT 0,
      height_m REAL DEFAULT 0,
      width_m REAL DEFAULT 0,
      cubic_meter REAL DEFAULT 0,
      container_m3_cost REAL DEFAULT 0,
      import_cost_cop REAL DEFAULT 0,
      national_freight_cop REAL DEFAULT 0,
      full_cost_cop REAL DEFAULT 0,
      extra_expenses_cop REAL DEFAULT 0,
      unit_cost_cop REAL DEFAULT 0,
      total_cost_cop REAL DEFAULT 0,
      price_ml_cop REAL DEFAULT 0,
      commission_ml_cop REAL DEFAULT 0,
      income_cop REAL DEFAULT 0,
      margin_percent REAL DEFAULT 0,
      total_profit_cop REAL DEFAULT 0,
      total_money_cop REAL DEFAULT 0,
      payment_card TEXT,
      eta_date TEXT,
      days_to_arrive INTEGER DEFAULT 0,
      active_transit_units INTEGER DEFAULT 0,
      delivery_status TEXT DEFAULT 'EN CAMINO',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Migrations if china_shipments was created with old schema
  try { db.run('ALTER TABLE china_shipments ADD COLUMN product_name TEXT'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN notion_link TEXT'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN quantity INTEGER'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN chinese_winery_date TEXT'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN agency TEXT'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN supply TEXT'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN total_price_cop REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN boxes INTEGER'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN length_m REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN height_m REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN width_m REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN cubic_meter REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN container_m3_cost REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN import_cost_cop REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN national_freight_cop REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN full_cost_cop REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN extra_expenses_cop REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN unit_cost_cop REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN total_cost_cop REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN price_ml_cop REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN commission_ml_cop REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN income_cop REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN margin_percent REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN total_profit_cop REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN total_money_cop REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN payment_card TEXT'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN days_to_arrive INTEGER'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN active_transit_units INTEGER'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN delivery_status TEXT'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN tracking_number TEXT'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN supplier_name TEXT'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN shipment_type TEXT'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN etd_date TEXT'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN trm_cop REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN total_cost_usd REAL'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN total_units INTEGER'); } catch {}
  try { db.run('ALTER TABLE china_shipments ADD COLUMN notes TEXT'); } catch {}


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

  // ── Modulo de Vinculación Multi-Publicaciones <-> Producto Físico Padre ──
  db.run(`
    CREATE TABLE IF NOT EXISTS product_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ml_item_id TEXT UNIQUE NOT NULL,
      master_product_title TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  restoreChinaShipmentsFromJsonFile();
  restoreLocalInventoryFromJsonFile();
  restoreProductMappingsFromJsonFile();

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

function computeShipmentFormulas(s) {
  const qty = parseInt(s.quantity || s.total_units || 0);
  const boxes = parseInt(s.boxes || 0);
  const lengthM = parseFloat(s.length_m || 0);
  const heightM = parseFloat(s.height_m || 0);
  const widthM = parseFloat(s.width_m || 0);
  
  const calcM3 = boxes * lengthM * heightM * widthM;
  const cubicMeter = calcM3 > 0 ? calcM3 : parseFloat(s.cubic_meter || 0);
  const containerM3Cost = parseFloat(s.container_m3_cost || 3000000);
  const importCostCop = cubicMeter > 0 ? (cubicMeter * containerM3Cost) : parseFloat(s.import_cost_cop || 0);
  
  const totalPriceCop = parseFloat(s.total_price_cop || 0);
  const nationalFreightCop = s.national_freight_cop !== undefined && s.national_freight_cop !== null ? parseFloat(s.national_freight_cop) : (boxes * 30000);
  const fullCostCop = s.full_cost_cop !== undefined && s.full_cost_cop !== null ? parseFloat(s.full_cost_cop) : (qty * 500);
  const extraExpensesCop = parseFloat(s.extra_expenses_cop || 0);

  const totalLandedCop = totalPriceCop + importCostCop + nationalFreightCop + fullCostCop + extraExpensesCop;
  const unitCostCop = qty > 0 && totalLandedCop > 0 ? (totalLandedCop / qty) : parseFloat(s.unit_cost_cop || 0);
  const totalCostCop = unitCostCop * qty;

  const priceMlCop = parseFloat(s.price_ml_cop || 0);
  const commissionMlCop = parseFloat(s.commission_ml_cop || 0);
  const incomeCop = priceMlCop - commissionMlCop - unitCostCop;
  const marginPercent = unitCostCop > 0 ? (incomeCop / unitCostCop * 100) : 0;
  const totalProfitCop = incomeCop * qty;
  const totalMoneyCop = priceMlCop * qty;

  let delStatus = s.delivery_status || '';
  if (!delStatus) {
    if (s.status === 'House') delStatus = 'RECIBIDO EN CASA';
    else if (s.status === 'In China') delStatus = 'EN CHINA';
    else delStatus = 'EN CAMINO';
  }

  let prodName = s.product_name || '';
  if (!prodName || prodName === 'William' || prodName === 'David' || prodName === 'Carlos' || prodName === 'Juan') {
    if (s.supplier_name && !['William', 'David', 'Carlos', 'Juan'].includes(s.supplier_name)) {
      prodName = s.supplier_name;
    } else {
      prodName = 'Producto Importación';
    }
  }

  return {
    ...s,
    delivery_status: delStatus,
    product_name: prodName,
    quantity: qty,
    boxes,
    length_m: lengthM,
    height_m: heightM,
    width_m: widthM,
    cubic_meter: cubicMeter,
    container_m3_cost: containerM3Cost,
    import_cost_cop: importCostCop,
    total_price_cop: totalPriceCop,
    national_freight_cop: nationalFreightCop,
    full_cost_cop: fullCostCop,
    extra_expenses_cop: extraExpensesCop,
    unit_cost_cop: unitCostCop,
    total_cost_cop: totalCostCop,
    price_ml_cop: priceMlCop,
    commission_ml_cop: commissionMlCop,
    income_cop: incomeCop,
    margin_percent: marginPercent,
    total_profit_cop: totalProfitCop,
    total_money_cop: totalMoneyCop
  };
}

function getChinaShipments() {
  const shipments = queryAll('SELECT * FROM china_shipments ORDER BY created_at DESC');
  return shipments.map(s => {
    let items = [];
    try {
      items = queryAll('SELECT i.*, a.name as account_name FROM china_shipment_items i LEFT JOIN accounts a ON i.account_id = a.id WHERE i.shipment_id = ?', [s.id]);
    } catch (e) {
      items = [];
    }
    return { ...computeShipmentFormulas(s), items };
  });
}

function saveChinaShipment(shipment, items = []) {
  const f = computeShipmentFormulas(shipment);
  if (f.id) {
    runSql(
      `UPDATE china_shipments SET 
        product_name = ?, notion_link = ?, quantity = ?, chinese_winery_date = ?, agency = ?, supply = ?, status = ?,
        total_price_cop = ?, boxes = ?, length_m = ?, height_m = ?, width_m = ?, cubic_meter = ?, container_m3_cost = ?,
        import_cost_cop = ?, national_freight_cop = ?, full_cost_cop = ?, extra_expenses_cop = ?, unit_cost_cop = ?,
        total_cost_cop = ?, price_ml_cop = ?, commission_ml_cop = ?, income_cop = ?, margin_percent = ?, total_profit_cop = ?,
        total_money_cop = ?, payment_card = ?, eta_date = ?, days_to_arrive = ?, active_transit_units = ?, delivery_status = ?,
        updated_at = datetime("now") WHERE id = ?`,
      [
        f.product_name, f.notion_link || '', f.quantity, f.chinese_winery_date || '', f.agency || 'William', f.supply || 'Alibaba', f.status || 'In progress',
        f.total_price_cop, f.boxes, f.length_m, f.height_m, f.width_m, f.cubic_meter, f.container_m3_cost,
        f.import_cost_cop, f.national_freight_cop, f.full_cost_cop, f.extra_expenses_cop, f.unit_cost_cop,
        f.total_cost_cop, f.price_ml_cop, f.commission_ml_cop, f.income_cop, f.margin_percent, f.total_profit_cop,
        f.total_money_cop, f.payment_card || '', f.eta_date || '', f.days_to_arrive || 0, f.active_transit_units || 0, f.delivery_status,
        f.id
      ]
    );
    return f.id;
  } else {
    runSql(
      `INSERT INTO china_shipments (
        product_name, supplier_name, notion_link, quantity, chinese_winery_date, agency, supply, status,
        total_price_cop, boxes, length_m, height_m, width_m, cubic_meter, container_m3_cost,
        import_cost_cop, national_freight_cop, full_cost_cop, extra_expenses_cop, unit_cost_cop,
        total_cost_cop, price_ml_cop, commission_ml_cop, income_cop, margin_percent, total_profit_cop,
        total_money_cop, payment_card, eta_date, days_to_arrive, active_transit_units, delivery_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        f.product_name, f.agency || 'Proveedor China', f.notion_link || '', f.quantity, f.chinese_winery_date || '', f.agency || 'William', f.supply || 'Alibaba', f.status || 'In progress',
        f.total_price_cop, f.boxes, f.length_m, f.height_m, f.width_m, f.cubic_meter, f.container_m3_cost,
        f.import_cost_cop, f.national_freight_cop, f.full_cost_cop, f.extra_expenses_cop, f.unit_cost_cop,
        f.total_cost_cop, f.price_ml_cop, f.commission_ml_cop, f.income_cop, f.margin_percent, f.total_profit_cop,
        f.total_money_cop, f.payment_card || '', f.eta_date || '', f.days_to_arrive || 0, f.active_transit_units || 0, f.delivery_status
      ]
    );
    const created = queryOne('SELECT id FROM china_shipments ORDER BY id DESC LIMIT 1');
    saveChinaShipmentsToJsonFile();
    return created ? created.id : null;
  }
}

function deleteChinaShipment(id) {
  runSql('DELETE FROM china_shipments WHERE id = ?', [id]);
  saveChinaShipmentsToJsonFile();
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
  const items = queryAll(sql, params);
  return items.filter(i => !isProductDiscontinued(i.title));
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
      `INSERT INTO local_inventory (account_id, sku, title, category, units_house, unit_cost_cop, min_stock_alert, location) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sku) DO UPDATE SET
         account_id = excluded.account_id,
         title = excluded.title,
         category = excluded.category,
         units_house = excluded.units_house,
         unit_cost_cop = excluded.unit_cost_cop,
         min_stock_alert = excluded.min_stock_alert,
         location = excluded.location,
         updated_at = datetime('now')`,
      [item.account_id || null, item.sku, item.title, item.category || 'General', item.units_house || 0, item.unit_cost_cop || 0, item.min_stock_alert || 10, item.location || 'Bodega Principal']
    );
    const created = queryOne('SELECT id FROM local_inventory WHERE sku = ?', [item.sku]);
    saveLocalInventoryToJsonFile();
    return created ? created.id : null;
  }
}

function deleteLocalInventoryItem(id) {
  runSql('DELETE FROM local_inventory WHERE id = ?', [id]);
  saveLocalInventoryToJsonFile();
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
  saveLocalInventoryToJsonFile();
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
  let sql = `
    SELECT f.*, 
           a.name as account_name, 
           l.units_house as stock_casa, 
           l.unit_cost_cop,
           m.master_product_title,
           lm.units_house as master_stock_casa
    FROM ml_full_inventory f 
    LEFT JOIN accounts a ON f.account_id = a.id 
    LEFT JOIN local_inventory l ON f.sku = l.sku 
    LEFT JOIN product_mappings m ON f.ml_item_id = m.ml_item_id
    LEFT JOIN local_inventory lm ON m.master_product_title = lm.title
    WHERE 1=1
  `;
  const params = [];
  if (accountId) {
    sql += ' AND f.account_id = ?';
    params.push(accountId);
  }
  sql += ' ORDER BY f.units_full ASC';
  const items = queryAll(sql, params);
  return items.filter(f => !isProductDiscontinued(f.title));
}

function saveProductMapping(mlItemId, masterProductTitle) {
  runSql(
    `INSERT INTO product_mappings (ml_item_id, master_product_title)
     VALUES (?, ?)
     ON CONFLICT(ml_item_id) DO UPDATE SET
       master_product_title = excluded.master_product_title,
       created_at = datetime('now')`,
    [mlItemId, masterProductTitle]
  );
  saveProductMappingsToJsonFile();
}

function deleteProductMapping(mlItemId) {
  runSql('DELETE FROM product_mappings WHERE ml_item_id = ?', [mlItemId]);
  saveProductMappingsToJsonFile();
}

function getProductMappings() {
  return queryAll('SELECT * FROM product_mappings');
}

function saveProductMappingsToJsonFile() {
  try {
    const dir = path.dirname(MAPPINGS_JSON_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const mappings = queryAll('SELECT ml_item_id, master_product_title FROM product_mappings');
    const mappingMap = {};
    mappings.forEach(m => { mappingMap[m.ml_item_id] = m.master_product_title; });
    fs.writeFileSync(MAPPINGS_JSON_PATH, JSON.stringify(mappingMap, null, 2), 'utf-8');
  } catch (e) {
    console.error('[DB] Error writing product_mappings.json:', e.message);
  }
}

function restoreProductMappingsFromJsonFile() {
  try {
    if (fs.existsSync(MAPPINGS_JSON_PATH)) {
      const raw = fs.readFileSync(MAPPINGS_JSON_PATH, 'utf-8');
      const mappingMap = JSON.parse(raw);
      for (const [mlItemId, masterProductTitle] of Object.entries(mappingMap)) {
        runSql(
          `INSERT INTO product_mappings (ml_item_id, master_product_title)
           VALUES (?, ?)
           ON CONFLICT(ml_item_id) DO UPDATE SET
             master_product_title = excluded.master_product_title,
             created_at = datetime('now')`,
          [mlItemId, masterProductTitle]
        );
      }
      console.log(`[DB] Restored ${Object.keys(mappingMap).length} product mappings from product_mappings.json`);
    }
  } catch (e) {
    console.error('[DB] Error restoring product_mappings.json:', e.message);
  }
}

function saveChinaShipmentsToJsonFile() {
  try {
    const dir = path.dirname(CHINA_JSON_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const shipments = queryAll('SELECT * FROM china_shipments ORDER BY id ASC');
    fs.writeFileSync(CHINA_JSON_PATH, JSON.stringify(shipments, null, 2), 'utf-8');
  } catch (e) {
    console.error('[DB] Error saving china_shipments.json:', e.message);
  }
}

function restoreChinaShipmentsFromJsonFile() {
  try {
    if (fs.existsSync(CHINA_JSON_PATH)) {
      const raw = fs.readFileSync(CHINA_JSON_PATH, 'utf-8');
      const shipments = JSON.parse(raw);
      if (Array.isArray(shipments) && shipments.length > 0) {
        shipments.forEach(s => {
          runSql(
            `INSERT INTO china_shipments (id, product_name, notion_link, quantity, chinese_winery_date, agency, box_quantity, volume_m3, weight_kg, invoice_cop, freight_fee_usd, freight_fee_cop, tax_customs_cop, local_transport_cop, total_cost_cop, price_ml_cop, commission_ml_cop, income_cop, margin_percent, total_profit_cop, total_money_cop, payment_card, eta_date, days_to_arrive, active_transit_units, delivery_status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               product_name = excluded.product_name,
               notion_link = excluded.notion_link,
               quantity = excluded.quantity,
               chinese_winery_date = excluded.chinese_winery_date,
               agency = excluded.agency,
               box_quantity = excluded.box_quantity,
               volume_m3 = excluded.volume_m3,
               weight_kg = excluded.weight_kg,
               invoice_cop = excluded.invoice_cop,
               freight_fee_usd = excluded.freight_fee_usd,
               freight_fee_cop = excluded.freight_fee_cop,
               tax_customs_cop = excluded.tax_customs_cop,
               local_transport_cop = excluded.local_transport_cop,
               total_cost_cop = excluded.total_cost_cop,
               price_ml_cop = excluded.price_ml_cop,
               commission_ml_cop = excluded.commission_ml_cop,
               income_cop = excluded.income_cop,
               margin_percent = excluded.margin_percent,
               total_profit_cop = excluded.total_profit_cop,
               total_money_cop = excluded.total_money_cop,
               payment_card = excluded.payment_card,
               eta_date = excluded.eta_date,
               days_to_arrive = excluded.days_to_arrive,
               active_transit_units = excluded.active_transit_units,
               delivery_status = excluded.delivery_status`,
            [
              s.id, s.product_name, s.notion_link || '', s.quantity || 0, s.chinese_winery_date || '', s.agency || 'William',
              s.box_quantity || 0, s.volume_m3 || 0, s.weight_kg || 0, s.invoice_cop || 0, s.freight_fee_usd || 0, s.freight_fee_cop || 0,
              s.tax_customs_cop || 0, s.local_transport_cop || 0, s.total_cost_cop || 0, s.price_ml_cop || 0, s.commission_ml_cop || 0,
              s.income_cop || 0, s.margin_percent || 0, s.total_profit_cop || 0, s.total_money_cop || 0, s.payment_card || '',
              s.eta_date || '', s.days_to_arrive || 0, s.active_transit_units || 0, s.delivery_status || 'En Tránsito'
            ]
          );
        });
        console.log(`[DB] Restored ${shipments.length} China shipments from china_shipments.json`);
      }
    }
  } catch (e) {
    console.error('[DB] Error restoring china_shipments.json:', e.message);
  }
}

function saveLocalInventoryToJsonFile() {
  try {
    const dir = path.dirname(LOCAL_JSON_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const items = queryAll('SELECT * FROM local_inventory ORDER BY id ASC');
    fs.writeFileSync(LOCAL_JSON_PATH, JSON.stringify(items, null, 2), 'utf-8');
  } catch (e) {
    console.error('[DB] Error saving local_inventory.json:', e.message);
  }
}

function restoreLocalInventoryFromJsonFile() {
  try {
    if (fs.existsSync(LOCAL_JSON_PATH)) {
      const raw = fs.readFileSync(LOCAL_JSON_PATH, 'utf-8');
      const items = JSON.parse(raw);
      if (Array.isArray(items) && items.length > 0) {
        items.forEach(i => {
          runSql(
            `INSERT INTO local_inventory (id, account_id, sku, title, category, units_house, unit_cost_cop, min_stock_alert, location)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(sku) DO UPDATE SET
               account_id = excluded.account_id,
               title = excluded.title,
               category = excluded.category,
               units_house = excluded.units_house,
               unit_cost_cop = excluded.unit_cost_cop,
               min_stock_alert = excluded.min_stock_alert,
               location = excluded.location,
               updated_at = datetime('now')`,
            [i.id, i.account_id || null, i.sku, i.title, i.category || 'General', i.units_house || 0, i.unit_cost_cop || 0, i.min_stock_alert || 10, i.location || 'Bodega Principal']
          );
        });
        console.log(`[DB] Restored ${items.length} local inventory items from local_inventory.json`);
      }
    }
  } catch (e) {
    console.error('[DB] Error restoring local_inventory.json:', e.message);
  }
}

const ACTIVE_ML_LISTINGS = [
  { ml_item_id: 'MCO5914426965804815', sku: 'ENCHUFE-WIFI-SMART', title: 'Enchufe Inteligente Toma Wifi Smart Echo Alexa Google Y Siri', units_full: 34, sales_last_30d: 5, sales_last_7d: 2, account_id: 2 },
  { ml_item_id: 'MCO1360887164', sku: 'INTERRUPTOR-SWITCH-10A-BLANCO', title: 'Interruptor Inteligente Switch Wifi Tuya *equivalente Sonoff 10 A 110v Blanco', units_full: 100, sales_last_30d: 2, sales_last_7d: 0, account_id: 2 },
  { ml_item_id: 'MCO2953532088', sku: 'TOMACORRIENTE-MEDIDOR-TUYA', title: 'Tomacorriente Inteligente Wifi Con Medidor De Energía - Tuya Blanco', units_full: 109, sales_last_30d: 13, sales_last_7d: 6, account_id: 2 },
  { ml_item_id: 'MCO1531049217', sku: 'VII-CAPACITOR-SIN-NEUTRO', title: 'Vii Capacitor Condensador Interruptor Inteligente Sin Neutro', units_full: 15, sales_last_30d: 1, sales_last_7d: 0, account_id: 2 },
  { ml_item_id: 'MCO1412283655', sku: 'BOMBILLO-GU10-RGB-VII', title: 'Bombillo Gu10 Inteligente Wifi Led Rgb Vii Alexa Siri Google 110v Rgb', units_full: 9, sales_last_30d: 4, sales_last_7d: 3, account_id: 2 },
  { ml_item_id: 'MCO1538098653', sku: 'SMART-SWITCH-10A-BLANCO-VII', title: 'Interruptor Inteligente Smart Switch Wifi Alexa Google Vii 10 A 110v Blanco', units_full: 12, sales_last_30d: 2, sales_last_7d: 0, account_id: 2 },
  { ml_item_id: 'MCO1538015011', sku: 'VII-SMART-SWITCH-10A-BLANCO', title: 'Vii Interruptor Inteligente Smart Switch Wifi Alexa Google.. 10 A 110v Blanco', units_full: 43, sales_last_30d: 1, sales_last_7d: 0, account_id: 2 },
  { ml_item_id: 'MCO2908323420', sku: '2-BOMBILLOS-WIFI-15W', title: '2 Bombillos Wifi Inteligente Rgb Google Home Siri Alexa 15w 110/220v Multicolor/rgb', units_full: 4, sales_last_30d: 5, sales_last_7d: 5, account_id: 2 },
  { ml_item_id: 'MCO2627945884', sku: 'VALVULA-CONTROLADOR-WIFI', title: 'Valvula Inteligente Controlador Wifi Alexa Google Agua Gas', units_full: 2, sales_last_30d: 2, sales_last_7d: 4, account_id: 2 },
  { ml_item_id: 'MCO2628604956', sku: '4-BOMBILLOS-WIFI-15W', title: '4 Bombillos Wifi Inteligentes Led Google Home Siri Alexa 15w 110/220v Multicolor/rgb', units_full: 1, sales_last_30d: 0, sales_last_7d: 0, account_id: 2 },
  { ml_item_id: 'MCO608309396', sku: 'JUEGO-CASHFLOW-COMPUTADOR', title: 'Juego Cashflow Para Computador E Imprimible Nueva Version 20', units_full: 147, sales_last_30d: 1, sales_last_7d: 1, account_id: 1 },
  { ml_item_id: 'MCO2875994304', sku: 'HOMEKIT-ENCHUFE-APPLE-SIRI', title: 'Homekit Casa Enchufe Toma Inteligente Siri Apple Alexa Wifi Blanco', units_full: 5, sales_last_30d: 1, sales_last_7d: 1, account_id: 2 },
  { ml_item_id: 'MCO2843711932', sku: 'MODULO-MATTER-HOMEKIT-VII', title: 'Modulo Interruptor Wifi Inteligente Matter Apple Homekit Vii 16 A 110v Blanco', units_full: 4, sales_last_30d: 0, sales_last_7d: 0, account_id: 2 },
  { ml_item_id: 'MCO2843698210', sku: 'LAMPARA-PANEL-LED-10W', title: 'Lampara Inteligente Panel Led Rgb Wifi Alexa Google Siri 10w 110v Blanco', units_full: 6, sales_last_30d: 0, sales_last_7d: 0, account_id: 2 }
];

function seedActiveMlListings() {
  const existing = queryOne('SELECT COUNT(*) as count FROM ml_full_inventory');
  if (existing && existing.count > 0) return;
  ACTIVE_ML_LISTINGS.forEach(item => {
    saveMlFullInventoryItem(item);
  });
  saveDbToFile();
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

const DISCONTINUED_KEYWORDS = [
  'colpept', 'peptido', 'péptido',
  'eucerin', 'control en original', 'fixodent',
  'forro azul', 'forros azul', 'forro blanco', 'forros blanco', 'forro rojo', 'forros rojo', 'forro verde', 'forros verde', 'roberto',
  'crecimiento capilar', 'formula de crecimiento', 'fórmula de crecimiento',
  'geruxtic', 'hair wax',
  'la roche', 'roche posay',
  'glicinato', 'magnesio',
  'miel', 'mielle',
  'neutrogena',
  'panoxyl', 'pan oxid',
  'roc express', 'roc ', 'roku',
  'toco', 'tocobo',
  'efe',
  'vichy',
  'vitamina d3', 'vitamina d-3',
  'bombillo 15w *2', 'bombillos 15w *2', 'bombilla 15w x2', 'bombilla 15w x4',
  'bombillo 9w', 'bombilla 9w', 'bombillo 19w', 'bombilla 19w',
  'laser', 'láser', 'regleta', 'modulo solar', 'módulo solar'
];

function isProductDiscontinued(nameOrTitle) {
  if (!nameOrTitle) return false;
  const str = String(nameOrTitle).toLowerCase();
  return DISCONTINUED_KEYWORDS.some(k => str.includes(k));
}

/**
 * Advanced Inventory & PO Reorder Intelligence for China Imports
 */
function getInventoryPlanningIntelligence(accountId = null) {
  const localItems = getLocalInventory(accountId).filter(i => !isProductDiscontinued(i.title));
  const fullItems = getMlFullInventory(accountId).filter(f => !isProductDiscontinued(f.title));
  const chinaShipments = getChinaShipments().filter(c => c.delivery_status !== 'RECIBIDO EN CASA' && c.delivery_status !== 'Entregado');

  const planningMap = {};

  // First, seed map with Local House Products
  localItems.forEach(item => {
    const key = item.title.trim();
    if (!planningMap[key]) {
      planningMap[key] = {
        master_title: key,
        sku: item.sku,
        house_stock: item.units_house || 0,
        full_stock: 0,
        transit_stock: 0,
        sales_30d: 0,
        linked_listings_count: 0,
        linked_listings: []
      };
    } else {
      planningMap[key].house_stock += (item.units_house || 0);
    }
  });

  // Next, map ML Full items
  fullItems.forEach(f => {
    const masterTitle = (f.master_product_title || f.title).trim();
    if (!planningMap[masterTitle]) {
      planningMap[masterTitle] = {
        master_title: masterTitle,
        sku: f.sku || f.ml_item_id,
        house_stock: f.master_stock_casa || f.stock_casa || 0,
        full_stock: 0,
        transit_stock: 0,
        sales_30d: 0,
        linked_listings_count: 0,
        linked_listings: []
      };
    }
    planningMap[masterTitle].full_stock += (f.units_full || 0);
    planningMap[masterTitle].sales_30d += (f.sales_last_30d || 0);
    planningMap[masterTitle].linked_listings_count += 1;
    planningMap[masterTitle].linked_listings.push({
      ml_item_id: f.ml_item_id,
      title: f.title,
      units_full: f.units_full,
      sales_30d: f.sales_last_30d
    });
  });

  // Next, add active China transit stock matching by title tokens
  chinaShipments.forEach(c => {
    const cName = (c.product_name || '').trim().toLowerCase();
    if (!cName) return;

    for (const key of Object.keys(planningMap)) {
      const kLower = key.toLowerCase();
      const cTokens = cName.split(/[\s\-_,]+/);
      const kTokens = kLower.split(/[\s\-_,]+/);
      const common = cTokens.filter(t => t.length > 2 && kTokens.includes(t));

      if (kLower.includes(cName) || cName.includes(kLower) || common.length >= 1) {
        planningMap[key].transit_stock += (c.quantity || c.active_transit_units || 0);
      }
    }
  });

  const LEAD_TIME_DAYS = 105; // 15d production + 90d transit China -> Colombia
  const COVERAGE_CYCLE_DAYS = 120; // 4-month inventory cycle target
  const SAFETY_STOCK_DAYS = 15; // 15d safety buffer

  const planningList = Object.values(planningMap)
    .filter(p => {
      const totalAvailable = p.house_stock + p.full_stock + p.transit_stock;
      return (totalAvailable > 0 || p.sales_30d > 0) && !isProductDiscontinued(p.master_title);
    })
    .map(p => {
      const totalCurrentStock = p.house_stock + p.full_stock;
      const totalAvailablePosition = totalCurrentStock + p.transit_stock;

      // Stockout-Adjusted Sales Velocity
      let adjustedVelocity = 0;
      if (p.sales_30d > 0) {
        let activeDays = 30;
        if (totalCurrentStock === 0) {
          activeDays = Math.max(7, Math.min(25, p.sales_30d));
        }
        adjustedVelocity = p.sales_30d / activeDays;
      }

      if (adjustedVelocity === 0) {
        return {
          ...p,
          total_current_stock: totalCurrentStock,
          total_available_position: totalAvailablePosition,
          adjusted_velocity_daily: 0,
          reorder_point_units: 0,
          target_inventory_level: 0,
          suggested_po_quantity: 0,
          days_coverage_remaining: totalAvailablePosition > 0 ? 999 : 0,
          days_until_po_trigger: 999,
          status: 'NO_DEMAND',
          status_label: '⚪ SIN VENTAS RECIENTES',
          badge_class: 'badge-secondary'
        };
      }

      // Reorder Point (ROP)
      const reorderPointUnits = Math.ceil((adjustedVelocity * LEAD_TIME_DAYS) + (adjustedVelocity * SAFETY_STOCK_DAYS));

      // Target Inventory Level
      const targetInventoryLevel = Math.ceil(adjustedVelocity * (LEAD_TIME_DAYS + COVERAGE_CYCLE_DAYS));

      // Suggested PO Quantity
      const suggestedPoQuantity = Math.max(0, Math.ceil(targetInventoryLevel - totalAvailablePosition));

      // Coverage Days Remaining
      const daysCoverageRemaining = adjustedVelocity > 0 ? (totalAvailablePosition / adjustedVelocity) : 999;

      // Days Until PO Trigger
      const daysUntilPoTrigger = Math.max(0, Math.round(daysCoverageRemaining - LEAD_TIME_DAYS));

      let status = 'OPTIMAL';
      let statusLabel = '🟢 STOCK SUFICIENTE';
      let badgeClass = 'badge-success';

      if (totalAvailablePosition < reorderPointUnits || daysCoverageRemaining <= LEAD_TIME_DAYS) {
        status = 'CRITICAL_ORDER_NOW';
        statusLabel = '🚨 PEDIR A CHINA HOY';
        badgeClass = 'badge-critical';
      } else if (daysUntilPoTrigger <= 30) {
        status = 'WARNING_ORDER_SOON';
        statusLabel = `🟡 PEDIR EN ${daysUntilPoTrigger} DÍAS`;
        badgeClass = 'badge-warning';
      }

      return {
        ...p,
        total_current_stock: totalCurrentStock,
        total_available_position: totalAvailablePosition,
        adjusted_velocity_daily: parseFloat(adjustedVelocity.toFixed(2)),
        reorder_point_units: reorderPointUnits,
        target_inventory_level: targetInventoryLevel,
        suggested_po_quantity: suggestedPoQuantity,
        days_coverage_remaining: parseFloat(daysCoverageRemaining.toFixed(1)),
        days_until_po_trigger: daysUntilPoTrigger,
        status,
        status_label: statusLabel,
        badge_class: badgeClass
      };
    });

  planningList.sort((a, b) => {
    if (a.status === 'CRITICAL_ORDER_NOW' && b.status !== 'CRITICAL_ORDER_NOW') return -1;
    if (a.status !== 'CRITICAL_ORDER_NOW' && b.status === 'CRITICAL_ORDER_NOW') return 1;
    return a.days_coverage_remaining - b.days_coverage_remaining;
  });

  return planningList;
}

function getReorderAlerts(accountId = null) {
  // Reorder alerts for Local House Stock (under min_stock_alert, excluding discontinued items)
  const localAlerts = getLocalInventory(accountId)
    .filter(i => i.units_house <= i.min_stock_alert && !isProductDiscontinued(i.title))
    .map(i => ({
      type: 'reorder_china',
      severity: i.units_house === 0 ? 'critical' : 'warning',
      sku: i.sku,
      title: i.title,
      account_name: i.account_name,
      message: `Stock Casa crítico (${i.units_house} unds, Mín: ${i.min_stock_alert}). Realizar pedido a China.`
    }));

  // Reorder alerts for Mercado Libre Full Stock (coverage < 10 days, excluding discontinued items)
  const fullAlerts = getMlFullInventory(accountId)
    .filter(f => f.coverage_days < 10 && !isProductDiscontinued(f.title))
    .map(f => ({
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
  initDb, getDb, saveDbToFile, reloadDbFromFile,
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
  // Stock Full ML (Fase 3) & Planning Intelligence
  getMlFullInventory, saveMlFullInventoryItem, getReorderAlerts, getInventoryPlanningIntelligence, isProductDiscontinued, seedActiveMlListings,
  saveProductMapping, deleteProductMapping, getProductMappings,
  // Product Promotions & Margin Calculator
  getProductPromotions, saveProductPromotion, deleteProductPromotion,
};

