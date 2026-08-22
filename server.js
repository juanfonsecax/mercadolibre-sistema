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

// ── SPA Fallback ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ══════════════════════════════════════════
// ── Polling Cron ──
// ══════════════════════════════════════════

const pollingInterval = parseInt(process.env.POLLING_INTERVAL_MINUTES || '2');

function startPolling() {
  const cronExpr = `*/${pollingInterval} * * * *`;
  cron.schedule(cronExpr, async () => {
    await processor.pollAll();
  });
  console.log(`[Cron] Polling active accounts every ${pollingInterval} minutes`);
}

// ══════════════════════════════════════════
// ── Start Server ──
// ══════════════════════════════════════════

async function startServer() {
  await db.initDb();
  console.log('[DB] Database initialized');

  kb.seedDefaults();
  gemini.initGemini();

  app.listen(PORT, () => {
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
}

startServer().catch(err => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
