const db = require('../database');

/**
 * Handle incoming webhook notifications from Mercado Libre
 */
function createWebhookHandler(processor) {
  return async function handleWebhook(req, res) {
    // Always respond 200 quickly to ML
    res.status(200).json({ received: true });

    const notification = req.body;
    console.log('[Webhook] Received:', JSON.stringify(notification));

    try {
      const topic = notification.topic;
      const resource = notification.resource;
      const userId = String(notification.user_id || '');

      if (!topic || !resource) {
        console.log('[Webhook] Invalid notification — missing topic or resource');
        return;
      }

      // Find account matching user_id / seller_id if possible
      const accounts = db.getAccounts();
      const matchedAccount = accounts.find(a => String(a.user_id) === userId || String(a.seller_id) === userId);
      const accountId = matchedAccount ? matchedAccount.id : (accounts[0] ? accounts[0].id : null);

      switch (topic) {
        case 'questions':
          await handleQuestionNotification(resource, processor, accountId);
          break;

        case 'claims':
          await handleClaimNotification(resource, processor, accountId);
          break;

        case 'messages':
        case 'messaging':
          await handleMessageNotification(resource, notification, processor, accountId);
          break;

        case 'orders_v2':
          console.log('[Webhook] Order notification received:', resource);
          db.logActivity('webhook', `Orden actualizada: ${resource}`, null, accountId);
          // Check for messages in this order
          if (processor) {
            await processor.pollMessagesForAccount(accountId);
          }
          break;

        default:
          console.log(`[Webhook] Unhandled topic: ${topic}`);
          db.logActivity('webhook', `Topic no manejado: ${topic}`, notification, accountId);
      }
    } catch (error) {
      console.error('[Webhook] Processing error:', error.message);
      db.logActivity('webhook_error', `Error procesando webhook: ${error.message}`, { notification });
    }
  };
}

async function handleQuestionNotification(resource, processor, accountId) {
  const match = resource.match(/\/questions\/(\d+)/);
  if (!match) return;

  const questionId = match[1];
  console.log(`[Webhook] New question detected: ${questionId} (Account: ${accountId})`);
  db.logActivity('webhook', `Nueva pregunta detectada: ${questionId}`, null, accountId);

  if (processor) {
    await processor.processQuestion(questionId, accountId);
  }
}

async function handleClaimNotification(resource, processor, accountId) {
  const match = resource.match(/claims\/(\d+)/);
  if (!match) return;

  const claimId = match[1];
  console.log(`[Webhook] Claim notification: ${claimId} (Account: ${accountId})`);
  db.logActivity('webhook', `Notificación de reclamo: ${claimId}`, null, accountId);

  if (processor) {
    await processor.processClaim(claimId, accountId);
  }
}

async function handleMessageNotification(resource, notification, processor, accountId) {
  // resource can be /messages/packs/12345 or /messages/12345
  const match = resource.match(/packs\/(\d+)/);
  const packId = match ? match[1] : notification.pack_id;

  if (packId && processor) {
    console.log(`[Webhook] New direct message for pack: ${packId} (Account: ${accountId})`);
    db.logActivity('webhook', `Nuevo mensaje en paquete ${packId}`, null, accountId);
    await processor.processMessage(packId, accountId);
  } else if (processor) {
    // Poll recent messages for this account
    await processor.pollMessagesForAccount(accountId);
  }
}

module.exports = { createWebhookHandler };
