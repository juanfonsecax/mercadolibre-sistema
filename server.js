require('dotenv').config();

const express = require('express');
const path = require('path');
const cron = require('node-cron');

const db = require('./src/database');
const auth = require('./src/mercadolibre/auth');
const questionsApi = require('./src/mercadolibre/questions');
const claimsApi = require('./src/mercadolibre/claims');
const messagesApi = require('./src/mercadolibre/messages');
const { createWebhookHandler } = require('./src/mercadolibre/webhooks');
const inventoryApi = require('./src/mercadolibre/inventory');
const processor = require('./src/processor');
const gemini = require('./src/ai/gemini');
const kb = require('./src/ai/knowledge-base');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ══════════════════════════════════════════
// ── OAuth Routes ──
// ══════════════════════════════════════════

app.get('/auth/login/:accountId', (req, res) => {
  try {
    const account = db.getAccountById(parseInt(req.params.accountId));
    if (!account) return res.status(404).send('Cuenta no encontrada');
    const url = auth.getAuthUrl(account);
    res.redirect(url);
  } catch (error) {
    res.status(400).send(`Error generando URL de login: ${error.message}`);
  }
});

app.get('/auth/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    if (!code) return res.status(400).json({ error: 'Missing authorization code' });

    let accountId = parseInt(state);
    if (!accountId || isNaN(accountId)) {
      const accounts = db.getAccounts();
      if (accounts[0]) accountId = accounts[0].id;
    }

    if (!accountId) return res.status(400).json({ error: 'No se identificó la cuenta para la autorización' });

    await auth.exchangeCodeForToken(code, accountId);
    res.redirect('/?auth=success');
  } catch (error) {
    console.error('[Auth] Callback error:', error.message);
    res.redirect(`/?auth=error&message=${encodeURIComponent(error.message)}`);
  }
});

app.get('/auth/status', (req, res) => {
  const { accountId } = req.query;
  res.json(auth.getConnectionStatus(accountId ? parseInt(accountId) : null));
});

// ══════════════════════════════════════════
// ── Webhook Route ──
// ══════════════════════════════════════════

app.post('/webhooks', createWebhookHandler(processor));

// ══════════════════════════════════════════
// ── API Routes ──
// ══════════════════════════════════════════

// --- Accounts Management ---
app.get('/api/accounts', (req, res) => {
  try {
    const accounts = db.getAccounts();
    const statuses = auth.getConnectionStatus();
    const result = accounts.map(acc => {
      const st = statuses.find(s => s.account_id === acc.id) || {};
      return { ...acc, connected: st.connected || false, is_expired: st.is_expired || false };
    });
    res.json({ accounts: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/accounts', (req, res) => {
  try {
    const { id, name, app_id, secret_key, redirect_uri } = req.body;
    if (!name || !app_id || !secret_key) {
      return res.status(400).json({ error: 'Nombre, App ID y Secret Key son requeridos' });
    }
    const savedId = db.saveAccount({ id: id ? parseInt(id) : null, name, app_id, secret_key, redirect_uri });
    db.logActivity('account', `Cuenta "${name}" guardada/actualizada`, null, savedId);
    res.json({ success: true, id: savedId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/accounts/:id', (req, res) => {
  try {
    db.deleteAccount(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Overview ---
app.get('/api/overview', (req, res) => {
  try {
    const { accountId } = req.query;
    const accId = accountId ? parseInt(accountId) : null;
    const stats = db.getOverviewStats(accId);
    const connectionStatus = auth.getConnectionStatus(accId);
    const mode = process.env.AUTO_REPLY_MODE || 'supervised';
    res.json({ ...stats, connection: connectionStatus, mode });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Questions ---
app.get('/api/questions', (req, res) => {
  try {
    const { accountId, status, limit = 50, offset = 0 } = req.query;
    const accId = accountId ? parseInt(accountId) : null;
    const data = db.getQuestions(accId, status || null, parseInt(limit), parseInt(offset));
    const stats = db.getQuestionStats(accId);
    res.json({ questions: data, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/questions/:id/approve', async (req, res) => {
  try {
    const { editedAnswer } = req.body;
    const result = await processor.approveQuestion(parseInt(req.params.id), editedAnswer || null);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/questions/:id/reject', (req, res) => {
  try {
    const result = processor.rejectQuestion(parseInt(req.params.id));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/questions/poll', async (req, res) => {
  try {
    const { accountId } = req.body;
    const processed = accountId
      ? await processor.pollQuestionsForAccount(parseInt(accountId))
      : await processor.pollAll();
    res.json({ processed: processed || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Direct Post-Purchase Messages ---
app.get('/api/messages', (req, res) => {
  try {
    const { accountId, status, limit = 50 } = req.query;
    const accId = accountId ? parseInt(accountId) : null;
    const data = db.getMessages(accId, status || null, parseInt(limit));
    const stats = db.getMessageStats(accId);
    res.json({ messages: data, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/messages/:id/history', (req, res) => {
  try {
    const history = db.getMessageHistory(parseInt(req.params.id));
    res.json({ history });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/messages/:id/approve', async (req, res) => {
  try {
    const { editedAnswer } = req.body;
    const result = await processor.approveMessage(parseInt(req.params.id), editedAnswer || null);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/messages/:id/reject', (req, res) => {
  try {
    const result = processor.rejectMessage(parseInt(req.params.id));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/messages/poll', async (req, res) => {
  try {
    const { accountId } = req.body;
    const processed = accountId
      ? await processor.pollMessagesForAccount(parseInt(accountId))
      : await processor.pollAll();
    res.json({ processed: processed || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Claims ---
app.get('/api/claims', (req, res) => {
  try {
    const { accountId, status } = req.query;
    const accId = accountId ? parseInt(accountId) : null;
    const data = db.getClaims(accId, status || null);
    const stats = db.getClaimStats(accId);
    res.json({ claims: data, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/claims/:id/messages', (req, res) => {
  try {
    const messagesList = db.getClaimMessages(parseInt(req.params.id));
    res.json({ messages: messagesList });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/claims/:id/approve', async (req, res) => {
  try {
    const { editedResponse } = req.body;
    const result = await processor.approveClaimResponse(parseInt(req.params.id), editedResponse || null);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/claims/poll', async (req, res) => {
  try {
    const { accountId } = req.body;
    const processed = accountId
      ? await processor.pollClaimsForAccount(parseInt(accountId))
      : await processor.pollAll();
    res.json({ processed: processed || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Knowledge Base ---
app.get('/api/knowledge', (req, res) => {
  try {
    const { category } = req.query;
    const data = db.getKnowledge(category || null);
    res.json({ knowledge: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/knowledge', (req, res) => {
  try {
    const { category, title, content, ml_item_id } = req.body;
    if (!category || !title || !content) {
      return res.status(400).json({ error: 'category, title y content son requeridos' });
    }
    db.saveKnowledge({ category, title, content, ml_item_id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/knowledge/:id', (req, res) => {
  try {
    const { title, content, ml_item_id } = req.body;
    db.updateKnowledge(parseInt(req.params.id), { title, content, ml_item_id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/knowledge/:id', (req, res) => {
  try {
    db.deleteKnowledge(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/knowledge/import-from-ml', async (req, res) => {
  try {
    const { accountId } = req.body;
    const accId = accountId ? parseInt(accountId) : null;
    const items = await questionsApi.getSellerItems(accId);
    let imported = 0;
    items.forEach(item => {
      kb.importProductToKnowledge(item);
      imported++;
    });
    db.logActivity('import', `${imported} productos importados desde Mercado Libre`, null, accId);
    res.json({ success: true, imported });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Activity Log & Stats ---
app.get('/api/activity', (req, res) => {
  try {
    const { limit = 50, accountId } = req.query;
    const data = db.getActivityLog(parseInt(limit), accountId ? parseInt(accountId) : null);
    res.json({ activity: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const { days = 7, accountId } = req.query;
    const data = db.getDailyStats(parseInt(days), accountId ? parseInt(accountId) : null);
    res.json({ stats: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Settings ---
app.get('/api/settings', (req, res) => {
  res.json({
    mode: process.env.AUTO_REPLY_MODE || 'supervised',
    polling_interval: process.env.POLLING_INTERVAL_MINUTES || '2',
    gemini_configured: !!(process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes('TU_GEMINI')),
  });
});

app.post('/api/settings/mode', (req, res) => {
  const { mode } = req.body;
  if (!['supervised', 'automatic'].includes(mode)) {
    return res.status(400).json({ error: 'Mode must be "supervised" or "automatic"' });
  }
  process.env.AUTO_REPLY_MODE = mode;
  db.logActivity('settings', `Modo cambiado a: ${mode}`);
  res.json({ success: true, mode });
});

app.post('/api/test-ai', async (req, res) => {
  try {
    const result = await gemini.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════
// ── Módulo de Inventario en 3 Fases API ──
// ══════════════════════════════════════════

// --- Fase 1: Importaciones China ---
app.get('/api/inventory/china', (req, res) => {
  try {
    const shipments = db.getChinaShipments();
    res.json({ shipments });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/inventory/china', (req, res) => {
  try {
    const shipmentData = req.body;
    const prodName = shipmentData.product_name || shipmentData.supplier_name || 'Producto Importación';
    if (!prodName) return res.status(400).json({ error: 'Nombre del producto es requerido' });

    const shipmentId = db.saveChinaShipment({
      ...shipmentData,
      id: shipmentData.id ? parseInt(shipmentData.id) : null
    }, shipmentData.items || []);

    db.logActivity('china_shipment', `Embarque China "${prodName}" guardado`, null);
    res.json({ success: true, id: shipmentId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/inventory/china/:id', (req, res) => {
  try {
    db.deleteChinaShipment(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Fase 2: Stock Casa / Bodega Local ---
app.get('/api/inventory/local', (req, res) => {
  try {
    const { accountId } = req.query;
    const accId = accountId ? parseInt(accountId) : null;
    const inventory = db.getLocalInventory(accId);
    res.json({ inventory });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/inventory/import-csv', (req, res) => {
  try {
    const { execSync } = require('child_process');
    const outputStock = execSync('node scripts/import-stock-csv.js', { encoding: 'utf-8' });
    const outputChina = execSync('node scripts/import-china-csv.js', { encoding: 'utf-8' });
    if (typeof db.reloadDbFromFile === 'function') db.reloadDbFromFile();
    db.logActivity('import_csv', 'Importación masiva de Stock Casa e Importaciones China realizada', null);
    res.json({ success: true, message: `${outputStock}\n${outputChina}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/inventory/local', (req, res) => {
  try {
    const { id, account_id, sku, title, category, units_house, unit_cost_cop, min_stock_alert, location } = req.body;
    if (!sku || !title) return res.status(400).json({ error: 'SKU y Título son requeridos' });

    const itemId = db.saveLocalInventoryItem({
      id: id ? parseInt(id) : null,
      account_id: account_id ? parseInt(account_id) : null,
      sku, title, category,
      units_house: parseInt(units_house || 0),
      unit_cost_cop: parseFloat(unit_cost_cop || 0),
      min_stock_alert: parseInt(min_stock_alert || 10),
      location
    });

    db.logActivity('inventory_local', `Producto "${sku} - ${title}" en Bodega Casa actualizado`, null, account_id);
    res.json({ success: true, id: itemId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/inventory/local/:id', (req, res) => {
  try {
    db.deleteLocalInventoryItem(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/inventory/movement', (req, res) => {
  try {
    const { account_id, sku, movement_type, units, description } = req.body;
    if (!sku || !movement_type || !units) {
      return res.status(400).json({ error: 'SKU, tipo de movimiento y unidades son requeridos' });
    }

    db.recordInventoryMovement({
      account_id: account_id ? parseInt(account_id) : null,
      sku, movement_type,
      units: parseInt(units),
      description
    });

    db.logActivity('inventory_movement', `Movimiento (${movement_type}): ${units} unds de ${sku}`, null, account_id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/inventory/movements', (req, res) => {
  try {
    const { sku, limit = 50 } = req.query;
    const movements = db.getInventoryMovements(sku || null, parseInt(limit));
    res.json({ movements });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Product Mappings (Multi-Publicación <-> Producto Físico) ---
app.get('/api/inventory/mappings', (req, res) => {
  try {
    const mappings = db.getProductMappings();
    res.json({ mappings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/inventory/mappings', (req, res) => {
  try {
    const { ml_item_id, master_product_title } = req.body;
    if (!ml_item_id || !master_product_title) {
      return res.status(400).json({ error: 'ml_item_id y master_product_title son requeridos' });
    }
    db.saveProductMapping(ml_item_id, master_product_title.trim());
    db.logActivity('inventory_mapping', `Publicación ${ml_item_id} vinculada a "${master_product_title.trim()}"`, null, null);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/inventory/mappings/:ml_item_id', (req, res) => {
  try {
    db.deleteProductMapping(req.params.ml_item_id);
    db.logActivity('inventory_mapping', `Vinculación eliminada para ${req.params.ml_item_id}`, null, null);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- Fase 3: Stock Full Mercado Libre & Alertas ---
app.get('/api/inventory/full', (req, res) => {
  try {
    const { accountId } = req.query;
    const accId = accountId ? parseInt(accountId) : null;
    const fullInventory = db.getMlFullInventory(accId);
    res.json({ fullInventory });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/inventory/planning', (req, res) => {
  try {
    const { accountId } = req.query;
    const accId = accountId ? parseInt(accountId) : null;
    const planning = db.getInventoryPlanningIntelligence(accId);
    res.json({ planning });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/inventory/full/sync', async (req, res) => {
  try {
    const { accountId } = req.body;
    const accId = accountId ? parseInt(accountId) : null;
    const result = await inventoryApi.syncMlFullInventory(accId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint: shows raw orders from ML API for diagnosis (PAGINATED - all orders)
app.get('/api/inventory/debug/orders30d', async (req, res) => {
  try {
    const { accountId } = req.query;
    const accId = accountId ? parseInt(accountId) : 1;
    const accessToken = await auth.getValidToken(accId);

    const tokenObj = db.getToken(accId);
    let sellerId = tokenObj && (tokenObj.user_id || tokenObj.seller_id);

    if (!sellerId) {
      const meRes = await fetch('https://api.mercadolibre.com/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (meRes.ok) {
        const me = await meRes.json();
        sellerId = me.id;
      }
    }

    const date30Ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const salesMap = {};
    let offset = 0;
    const limit = 50;
    let totalOrders = Infinity;
    let pagesRead = 0;

    // Paginate ALL orders
    while (offset < totalOrders) {
      const url = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.date_created.from=${date30Ago}&sort=date_asc&limit=${limit}&offset=${offset}`;
      const ordersRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!ordersRes.ok) break;
      const ordersData = await ordersRes.json();
      totalOrders = (ordersData.paging && ordersData.paging.total) || 0;
      const orders = ordersData.results || [];
      pagesRead++;

      orders.forEach(ord => {
        if (ord.status !== 'cancelled' && ord.order_items) {
          ord.order_items.forEach(oi => {
            const itemId = oi.item && oi.item.id;
            if (!itemId) return;
            if (!salesMap[itemId]) salesMap[itemId] = { title: oi.item.title || '', qty: 0 };
            salesMap[itemId].qty += (oi.quantity || 1);
          });
        }
      });

      offset += orders.length;
      if (orders.length < limit) break;
    }

    // Find items that appear in orders but NOT tracked in DB
    const knownItems = db.getMlFullInventory();
    const knownIds = new Set(knownItems.map(i => i.ml_item_id));
    const newDiscoveredItems = Object.entries(salesMap)
      .filter(([id]) => !knownIds.has(id))
      .map(([id, s]) => ({ ml_item_id: id, title: s.title, sales_30d: s.qty }));

    res.json({
      seller_id: sellerId,
      date_from: date30Ago,
      total_orders: totalOrders,
      pages_read: pagesRead,
      total_products_with_sales: Object.keys(salesMap).length,
      sales_per_item: Object.entries(salesMap)
        .sort((a, b) => b[1].qty - a[1].qty)
        .reduce((acc, [k, v]) => { acc[k] = v; return acc; }, {}),
      new_publications_not_in_db: newDiscoveredItems
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.post('/api/inventory/full/sales30d', (req, res) => {
  try {
    const { ml_item_id, sales_last_30d } = req.body;
    if (!ml_item_id) return res.status(400).json({ error: 'ml_item_id es requerido' });
    db.updateMlItemSales30d(ml_item_id, sales_last_30d);
    db.logActivity('update_sales30d', `Ventas 30d actualizadas a ${sales_last_30d} para ${ml_item_id}`, null, null);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/inventory/alerts', (req, res) => {
  try {
    const { accountId } = req.query;
    const accId = accountId ? parseInt(accountId) : null;
    const alerts = db.getReorderAlerts(accId);
    res.json({ alerts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════
// ── Modulo de Ofertas & Margen API ──
// ══════════════════════════════════════════
app.get('/api/promotions', (req, res) => {
  try {
    const { accountId } = req.query;
    const accId = accountId ? parseInt(accountId) : null;
    const promotions = db.getProductPromotions(accId);
    res.json({ promotions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/promotions', (req, res) => {
  try {
    const promo = req.body;
    if (!promo.account_id || !promo.ml_item_id || !promo.title || !promo.promo_price) {
      return res.status(400).json({ error: 'Cuenta, Item ID, Título y Precio Oferta son requeridos' });
    }

    const promoId = db.saveProductPromotion({
      ...promo,
      account_id: parseInt(promo.account_id)
    });

    db.logActivity('promotion', `Oferta creada/actualizada para "${promo.title}" ($${parseFloat(promo.promo_price).toLocaleString('es-CO')} COP)`, null, promo.account_id);
    res.json({ success: true, id: promoId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/promotions/:id', (req, res) => {
  try {
    db.deleteProductPromotion(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/promotions/ai-evaluate', async (req, res) => {
  try {
    const { productData, targetMarginPercent } = req.body;
    const evaluation = await gemini.evaluatePromotionStrategy(productData || {}, parseFloat(targetMarginPercent || 20));
    res.json({ evaluation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ── SPA Fallback ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ══════════════════════════════════════════
// ── Polling Cron ──
// ══════════════════════════════════════════

const pollingInterval = parseInt(process.env.POLLING_INTERVAL_MINUTES || '2');

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err.message || err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Rejection:', reason);
});

function startPolling() {
  const cronExpr = `*/${pollingInterval} * * * *`;
  cron.schedule(cronExpr, async () => {
    try {
      await processor.pollAll();
    } catch (err) {
      console.error('[Cron] Polling error:', err.message || err);
    }
  });
  console.log(`[Cron] Polling active accounts every ${pollingInterval} minutes`);
}

// ══════════════════════════════════════════
// ── Start Server ──
// ══════════════════════════════════════════

async function startServer() {
  await db.initDb();
  console.log('[DB] Database initialized');

  try {
    const fullRows = db.getMlFullInventory();
    if (!fullRows || fullRows.length === 0) {
      console.log('[DB Seed] Initializing active Mercado Libre listings in Full inventory...');
      db.seedActiveMlListings();
    }
  } catch (e) {
    console.error('[DB Seed] Error seeding database:', e.message);
  }

  kb.seedDefaults();
  gemini.initGemini();

  const server = app.listen(PORT, () => {
    console.log('');
    console.log('  ╔═══════════════════════════════════════════════╗');
    console.log('  ║   🤖 Mercado Libre Bot — Sistema Multi-Cuenta║');
    console.log(`  ║   🌐 Dashboard: http://localhost:${PORT}         ║`);
    console.log(`  ║   📡 Webhook:   http://localhost:${PORT}/webhooks ║`);
    console.log('  ║   📋 Modo: ' + (process.env.AUTO_REPLY_MODE || 'supervised').padEnd(35) + '║');
    console.log('  ╚═══════════════════════════════════════════════╝');
    console.log('');

    startPolling();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Server] Puerto ${PORT} ocupado, reintentando en 1.5s...`);
      setTimeout(() => {
        server.close();
        server.listen(PORT);
      }, 1500);
    } else {
      console.error('[Server] Server error:', err);
    }
  });
}

startServer().catch(err => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
