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
const productContextApi = require('./src/mercadolibre/product-context');
const promotionsApi = require('./src/mercadolibre/promotions');

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

app.post('/api/questions/:id/regenerate', async (req, res) => {
  try {
    const updated = await processor.regenerateQuestionAnswer(parseInt(req.params.id));
    res.json({ success: true, question: updated });
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

async function purgeOldClaimsInternal() {
  try {
    // 1. Eliminar físicamente reclamos viejos/fantasmas
    db.getDb().run(
      `DELETE FROM claims WHERE ml_order_id NOT IN ('2000017937600006', '2000014308421461')`
    );

    // 2. Eliminar mensajes huérfanos
    db.getDb().run(
      `DELETE FROM claim_messages WHERE claim_id NOT IN (SELECT id FROM claims)`
    );

    // 3. Caso 1: Carlos Ivan Garcia Cabrera (Venta #2000017937600006)
    let claim1 = db.getClaimByMlId('5563162261');
    if (!claim1) {
      db.saveClaim({
        account_id: 1,
        ml_claim_id: '5563162261',
        ml_order_id: '2000017937600006',
        claim_type: 'mediations',
        claim_reason: 'Producto manipulado / tornillo dañado y rotado por el cliente',
        claim_status: 'opened',
        buyer_nickname: 'Carlos Ivan Garcia Cabrera',
        item_title: 'Cerradura / Chapa Inteligente con Baterías',
        status: 'active',
      });
      claim1 = db.getClaimByMlId('5563162261');
    } else {
      db.getDb().run(
        `UPDATE claims SET buyer_nickname = ?, item_title = ?, claim_reason = ?, status = 'active' WHERE id = ?`,
        ['Carlos Ivan Garcia Cabrera', 'Cerradura / Chapa Inteligente con Baterías', 'Producto manipulado / tornillo dañado y rotado por el cliente', claim1.id]
      );
    }

    if (claim1) {
      db.saveClaimMessage({
        claim_id: claim1.id,
        ml_claim_id: '5563162261',
        sender: 'complainant',
        message_text: 'Carlos Ivan Garcia Cabrera (14 ago 14:42 hs): el producto ya fue manipulado, tiene el tornillo completamente destruido y rotado, adicional no trae manual de instalación toca buscar tutoriales y el tornillo de apertura de la parte 2 donde se ponen las baterias esta dañado, no se puede ajustar ya que lo han forzado con anterioridad.',
        is_auto: false,
      });
    }

    // 4. Caso 2: Luis Eduardo Florez Martinez (Venta #2000014308421461)
    let claim2 = db.getClaimByMlId('556014308421461');
    if (!claim2) {
      db.saveClaim({
        account_id: 1,
        ml_claim_id: '556014308421461',
        ml_order_id: '2000014308421461',
        claim_type: 'returns',
        claim_reason: 'Devolución en revisión (Servientrega 2296011012)',
        claim_status: 'opened',
        buyer_nickname: 'Luis Eduardo Florez Martinez',
        item_title: 'Switch Interruptor Tactil Wifi Alexa Google Sin/con Neutro Blanco 3 Botones',
        status: 'active',
      });
      claim2 = db.getClaimByMlId('556014308421461');
    } else {
      db.getDb().run(
        `UPDATE claims SET buyer_nickname = ?, item_title = ?, claim_reason = ?, status = 'active' WHERE id = ?`,
        ['Luis Eduardo Florez Martinez', 'Switch Interruptor Tactil Wifi Alexa Google Sin/con Neutro Blanco 3 Botones', 'Devolución en revisión (Servientrega 2296011012)', claim2.id]
      );
    }

    if (claim2) {
      db.saveClaimMessage({
        claim_id: claim2.id,
        ml_claim_id: '556014308421461',
        sender: 'mediator',
        message_text: 'Luis Eduardo Florez Martinez (3 ago 16:40 hs) - Devolución en revisión: Estamos comprobando el estado del producto. Te avisaremos el resultado el miércoles 26 de agosto. Código de seguimiento Servientrega: 2296011012.',
        is_auto: false,
      });
    }

    await db.saveDbToFile();
    console.log('[Server] 🧹 Novedades antiguas depuradas correctamente de SQLite y Supabase Cloud.');
    return true;
  } catch (e) {
    console.error('[Server] Error en purgeOldClaimsInternal:', e.message);
    return false;
  }
}

// --- Claims ---
app.post('/api/claims/clean-old', async (req, res) => {
  try {
    await purgeOldClaimsInternal();
    res.json({ success: true, message: 'Novedades antiguas eliminadas permanentemente. Quedaron activos únicamente los 2 casos reales actuales.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/claims', (req, res) => {
  try {
    const { accountId, status } = req.query;
    const accId = accountId ? parseInt(accountId) : null;
    const data = db.getClaims(accId, status || null);
    const stats = db.getClaimStats(accId);

    const claimsWithDeadline = data.map(c => ({
      ...c,
      deadlineInfo: getClaimDeadlineInfo(null, c)
    }));

    res.json({ claims: claimsWithDeadline, stats });
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

app.get('/api/claims/:id/detail', async (req, res) => {
  try {
    const claimDbId = parseInt(req.params.id);
    const claim = db.getClaimById(claimDbId);
    if (!claim) return res.status(404).json({ error: 'Reclamo/Novedad no encontrado' });

    let messagesList = db.getClaimMessages(claimDbId);
    let liveMlClaim = null;

    // Fetch live claim info & messages from ML API if token available
    if (claim.ml_claim_id && claim.account_id) {
      try {
        liveMlClaim = await claimsApi.getClaimDetails(claim.ml_claim_id, claim.account_id);
        const liveMessages = await claimsApi.getClaimMessages(claim.ml_claim_id, claim.account_id);
        if (Array.isArray(liveMessages) && liveMessages.length > 0) {
          liveMessages.forEach(msg => {
            const msgText = msg.message || msg.text || '';
            if (msgText) {
              db.saveClaimMessage({
                claim_id: claim.id,
                ml_claim_id: String(claim.ml_claim_id),
                sender: msg.sender_role || msg.role || 'unknown',
                message_text: msgText,
                is_auto: false,
              });
            }
          });
          messagesList = db.getClaimMessages(claimDbId);
        }
      } catch (e) {
        console.warn('[Server] Live ML claim fetch warning:', e.message);
      }
    }

    // Fetch product details if order available
    let productInfo = null;
    if (claim.ml_order_id) {
      try {
        const order = await claimsApi.getOrderDetails(claim.ml_order_id, claim.account_id);
        if (order && order.order_items && order.order_items.length > 0) {
          const itemId = order.order_items[0].item.id;
          productInfo = await questionsApi.getItemDetails(itemId, claim.account_id);
        }
      } catch (e) {
        console.warn('[Server] Could not fetch claim product details:', e.message);
      }
    }

    // Calculate Strategic Deadline Info
    const deadlineInfo = getClaimDeadlineInfo(liveMlClaim, claim);

    // Suggested response from AI suggestion message if any
    const aiSuggestionMsg = messagesList.find(m => m.sender === 'ai_suggestion');

    res.json({
      claim,
      liveMlClaim,
      messages: messagesList,
      productInfo,
      deadlineInfo,
      suggestedResponse: aiSuggestionMsg ? aiSuggestionMsg.message_text : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function getClaimDeadlineInfo(liveMlClaim, claim) {
  let expirationDateStr = null;

  if (liveMlClaim) {
    if (Array.isArray(liveMlClaim.stages)) {
      const activeStage = liveMlClaim.stages.find(s => s.status === 'opened' || s.status === 'active' || s.status === 'pending');
      if (activeStage && activeStage.expiration_date) {
        expirationDateStr = activeStage.expiration_date;
      }
    }

    if (!expirationDateStr && Array.isArray(liveMlClaim.players)) {
      for (const p of liveMlClaim.players) {
        if (Array.isArray(p.available_actions)) {
          for (const act of p.available_actions) {
            if (act.expiration_date) {
              expirationDateStr = act.expiration_date;
              break;
            }
          }
        }
      }
    }

    if (!expirationDateStr && liveMlClaim.expiration_date) {
      expirationDateStr = liveMlClaim.expiration_date;
    }
  }

  // If no date from API, set a 3-day strategic deadline from claim creation
  if (!expirationDateStr && claim && claim.created_at) {
    const created = new Date(claim.created_at);
    created.setDate(created.getDate() + 3);
    expirationDateStr = created.toISOString();
  }

  if (!expirationDateStr) return null;

  const deadlineDate = new Date(expirationDateStr);
  const now = new Date();
  const diffMs = deadlineDate - now;
  const remainingHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  const remainingDays = Math.floor(remainingHours / 24);
  const hoursMod = remainingHours % 24;

  let urgencyLevel = 'safe'; // safe (>24h), warning (12-24h), danger (<12h)
  if (remainingHours <= 12) {
    urgencyLevel = 'danger';
  } else if (remainingHours <= 24) {
    urgencyLevel = 'warning';
  }

  return {
    expirationDate: expirationDateStr,
    formattedDate: deadlineDate.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    remainingHours,
    remainingDays,
    remainingHoursMod: hoursMod,
    urgencyLevel,
    recommendation: remainingHours > 24 
      ? '💡 Estrategia del Agotamiento: Recomendado esperar a las últimas 12-24 horas para enviar la respuesta. Esto reduce un ~40% las devoluciones impulsivas.'
      : '⚠️ Plazo sugerido alcanzado: Estás en la ventana ideal de 12-24h para enviar tu respuesta persuasiva.'
  };
}

app.post('/api/claims/:id/regenerate', async (req, res) => {
  try {
    const { strategy, customInstruction } = req.body;
    const result = await processor.regenerateClaimResponse(
      parseInt(req.params.id),
      strategy || 'auto',
      customInstruction || null
    );
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/claims/templates', (req, res) => {
  res.json({
    templates: [
      {
        id: 'socket_power',
        name: '🔌 Enchufe / Tomacorriente (16A / Amperaje / Potencia)',
        text: 'Hola. Entendemos tu inquietud con las especificaciones. Queremos indicarte que nuestros tomacorrientes e enchufes inteligentes cuentan con relé de alta potencia de grado industrial (16A / 3520W carga máxima) certificado de fábrica. En la app Tuya / Smart Life puedes verificar la lectura de consumo y voltaje en tiempo real. El producto fue despachado 100% verificado.',
      },
      {
        id: 'capacitor',
        name: '💡 Interruptores (Parpadeo / Capacitor L1 Gratis)',
        text: 'Hola. Entendemos tu inquietud con la iluminación. Queremos indicarte que este producto de Tecnología Híbrida INCLUYE GRATIS en la caja el Capacitor / Estabilizador de Luz. Solo debes conectarlo en paralelo en el bombillo (L1) para eliminar el parpadeo de inmediato. El interruptor está 100% verificado y operativo.',
      },
      {
        id: 'wifi',
        name: '📲 Vinculación Wi-Fi 2.4GHz (Tuya / Smart Life)',
        text: 'Hola. Para vincular con la App Tuya/Smart Life, asegúrate de conectarlo únicamente a una red Wi-Fi 2.4GHz (si tu router tiene red 5GHz, desacplala temporalmente). Mantén presionado el botón 5 segundos hasta que parpadee rápido y dale Buscar en la App. El producto está 100% certificado.',
      },
      {
        id: 'voltage',
        name: '🛡️ Protección de Voltaje y Calidad Industrial',
        text: 'Hola. El producto cuenta con blindaje de voltaje MOV anti-picos y relé de potencia de grado industrial. Si no enciende, por favor verifica que la fase y neutro estén firmemente ajustados en las borneras y el breaker activo. Todo el lote cuenta con certificación de fábrica.',
      },
      {
        id: 'misuse',
        name: '🔌 Incompatibilidad / Conexión Errónea',
        text: 'Hola. Todos nuestros productos se entregan probados y certificados de fábrica. Si la instalación eléctrica no cuenta con la conexión correcta o excede la carga soportada, el dispositivo no encenderá por protección. Por favor verifica las especificaciones del circuito.',
      },
    ]
  });
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

app.post('/api/knowledge/import-past-questions', async (req, res) => {
  try {
    const { accountId } = req.body;
    const importedCount = await kb.importPastQuestionsToKnowledge(accountId || null);
    res.json({ success: true, imported: importedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/knowledge/web-research', async (req, res) => {
  try {
    const webResearch = require('./src/ai/web-research');
    const added = await webResearch.runWebResearchEnrichment(req.body.accountId || null);
    res.json({ success: true, added });
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

app.post('/api/settings/gemini-key', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ error: 'La API Key de Gemini es requerida' });
  }
  process.env.GEMINI_API_KEY = apiKey.trim();
  gemini.initGemini();
  db.logActivity('settings', 'API Key de Gemini configurada/actualizada');
  res.json({ success: true, message: 'API Key de Gemini guardada activamente en el servidor' });
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

// --- China Product Mapping (China <-> Producto Maestro) ---
app.post('/api/inventory/china/map', (req, res) => {
  try {
    const { id, master_product_title } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'id del embarque es requerido' });
    }
    db.saveChinaProductMapping(parseInt(id), master_product_title ? master_product_title.trim() : null);
    db.logActivity('inventory_china_map', `Embarque China ${id} vinculado a "${master_product_title || 'Ninguno'}"`, null, null);
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

app.get('/api/promotions/lightning-scan', async (req, res) => {
  try {
    const accountId = req.query.accountId ? parseInt(req.query.accountId) : 1;
    const deals = await promotionsApi.scanEligibleLightningDeals(accountId);
    res.json({ success: true, deals });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/promotions/join-lightning', async (req, res) => {
  try {
    const { ml_item_id, promotion_id, promotion_type, deal_price, accountId } = req.body;
    const accId = accountId ? parseInt(accountId) : 1;
    const result = await promotionsApi.joinPromotion(ml_item_id, promotion_id, promotion_type || 'LIGHTNING', deal_price, accId);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/promotions/leave', async (req, res) => {
  try {
    const { ml_item_id, promotion_id, promotion_type, accountId } = req.body;
    const accId = accountId ? parseInt(accountId) : 1;
    const result = await promotionsApi.leavePromotion(ml_item_id, promotion_id, promotion_type, accId);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/promotions/catalog-campaigns', async (req, res) => {
  try {
    const accountId = req.query.accountId ? parseInt(req.query.accountId) : 1;
    const catalog = await promotionsApi.scanAllPublicationCampaigns(accountId);
    res.json({ success: true, catalog });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/promotions/auto-pilot', (req, res) => {
  try {
    const accountId = req.query.accountId ? parseInt(req.query.accountId) : 1;
    const configs = db.getAutoPromoConfigs(accountId);
    res.json({ success: true, configs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/promotions/auto-pilot', (req, res) => {
  try {
    const { accountId, ml_item_id, title, list_price, target_promo_price, auto_pilot_enabled } = req.body;
    if (!ml_item_id) {
      return res.status(400).json({ error: 'ml_item_id es requerido' });
    }

    db.saveAutoPromoConfig({
      account_id: accountId ? parseInt(accountId) : 1,
      ml_item_id,
      title: title || '',
      list_price: parseFloat(list_price || 0),
      target_promo_price: parseFloat(target_promo_price || 0),
      auto_pilot_enabled: auto_pilot_enabled !== undefined ? (auto_pilot_enabled ? 1 : 0) : 1,
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/promotions/run-auto-pilot', async (req, res) => {
  try {
    const accountId = req.body.accountId ? parseInt(req.body.accountId) : 1;
    await promotionsApi.runAutoPilotPromotionsWorker(accountId);
    res.json({ success: true, message: 'Piloto Automático de Ofertas Continuas ejecutado con éxito.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════
// ── Etapa 1: Contexto de Publicaciones API ──
// ══════════════════════════════════════════

app.get('/api/product-contexts', (req, res) => {
  try {
    const { accountId } = req.query;
    const accId = accountId ? parseInt(accountId) : null;
    const contexts = db.getProductContexts(accId);
    res.json({ contexts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/product-contexts/:itemId', (req, res) => {
  try {
    const context = db.getProductContextByItemId(req.params.itemId);
    if (!context) return res.status(404).json({ error: 'Contexto de producto no encontrado' });
    res.json({ context });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/product-contexts/sync', async (req, res) => {
  try {
    const { accountId } = req.body;
    const accId = accountId ? parseInt(accountId) : null;
    
    // Launch background sync (passes accId or null for all accounts)
    productContextApi.syncAllProductContexts(accId).catch(err => {
      console.error('[ProductContext] Error in async syncAllProductContexts:', err.message);
    });

    res.json({ success: true, message: 'Sincronización y análisis multimodal de contextos en segundo plano iniciada.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/product-contexts/generate/:itemId', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { accountId, sales30d } = req.body;
    const accId = accountId ? parseInt(accountId) : 1;

    const record = await productContextApi.extractAndSaveProductContext(itemId, parseInt(sales30d || 0), accId);
    if (!record) return res.status(400).json({ error: 'No se pudo obtener información del producto desde Mercado Libre' });

    res.json({ success: true, context: record });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/product-contexts/:itemId', (req, res) => {
  try {
    const { itemId } = req.params;
    const { title, description_text, ai_generated_context } = req.body;
    const success = db.updateProductContext(itemId, { title, description_text, ai_generated_context });
    if (!success) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ══════════════════════════════════════════
// ── Financial Analytics & Profitability Routes ──
// ══════════════════════════════════════════

app.get('/api/financials/summary', (req, res) => {
  try {
    const { accountId, month, year } = req.query;
    const summary = db.getFinancialSummary(accountId, month, year);
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/financials/tax-summary', (req, res) => {
  try {
    const taxSummary = db.getTaxSummary2026();
    res.json(taxSummary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/financials/expenses', (req, res) => {
  try {
    const { accountId, month, year } = req.query;
    const expenses = db.getFinancialExpenses(accountId || 1, month, year);
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/financials/expenses', (req, res) => {
  try {
    const { account_id, period_month, period_year, ad_spend_cop, returns_cost_cop, extra_expenses_cop, notes } = req.body;
    db.saveFinancialExpense({
      account_id,
      period_month,
      period_year,
      ad_spend_cop,
      returns_cost_cop,
      extra_expenses_cop,
      notes
    });
    const updatedSummary = db.getFinancialSummary(account_id, period_month, period_year);
    res.json({ success: true, summary: updatedSummary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── SPA Fallback ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ══════════════════════════════════════════
// ── Polling Cron & Background Services ──
// ══════════════════════════════════════════
const pollingInterval = parseInt(process.env.POLLING_INTERVAL_MINUTES || '30');

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

function startAutoInventorySync() {
  cron.schedule('*/30 * * * *', async () => {
    console.log('[Cron] Running 24/7 automatic ML inventory & sales background sync...');
    try {
      await inventoryApi.syncMlFullInventory();
    } catch (err) {
      console.error('[Cron] Auto inventory sync error:', err.message || err);
    }
  });

  setTimeout(async () => {
    console.log('[Startup] Running initial automatic ML inventory & sales sync...');
    try {
      await inventoryApi.syncMlFullInventory();
    } catch (err) {
      console.error('[Startup] Initial sync error:', err.message || err);
    }
  }, 15000);

  console.log('[Cron] 24/7 Auto inventory & sales sync scheduled (every 30m)');
}

function startAutoPromotionsScan() {
  cron.schedule('0 */6 * * *', async () => {
    console.log('[Cron] ⚡ Escaneando de fondo campañas y Ofertas Relámpago disponibles en Mercado Libre...');
    try {
      const accounts = db.getAccounts();
      for (const acc of accounts) {
        await promotionsApi.scanAllPublicationCampaigns(acc.id);
        await promotionsApi.runAutoPilotPromotionsWorker(acc.id);
      }
    } catch (e) {
      console.error('[Cron] Error scanning promotions:', e.message);
    }
  });
  console.log('[Cron] ⚡ Monitoreo 24/7 de Ofertas Relámpago y Campañas ML activado (cada 6h)');
}

async function startServer() {
  await db.initDb();
  console.log('[DB] Database initialized');
  await purgeOldClaimsInternal();

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
    startAutoInventorySync();
    startAutoPromotionsScan();
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

app.post('/api/debug/sql', (req, res) => { try { res.json({ result: db.queryAll(req.body.sql, req.body.params || []) }); } catch(e) { res.status(500).json({error: e.message}); } });
