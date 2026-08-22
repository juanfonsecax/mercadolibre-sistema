const { mlFetch } = require('./auth');
const db = require('../database');

/**
 * Get recent orders for seller account (to extract pack_ids and buyer info)
 */
async function getRecentOrders(accountId, limit = 50) {
  const account = db.getAccountById(accountId);
  const sellerId = account?.seller_id || (db.getToken(accountId) || {}).seller_id;
  if (!sellerId) throw new Error(`No seller_id for account ${accountId}`);

  try {
    const data = await mlFetch(`/orders/search/recent?seller=${sellerId}&sort=date_desc&limit=${limit}`, accountId);
    return data.results || [];
  } catch (error) {
    console.error(`Error fetching recent orders for account ${accountId}:`, error.message);
    return [];
  }
}

/**
 * Get conversation messages for a pack_id
 */
async function getPackMessages(packId, accountId) {
  const account = db.getAccountById(accountId);
  const sellerId = account?.seller_id || (db.getToken(accountId) || {}).seller_id;

  try {
    const endpoint = sellerId
      ? `/messages/packs/${packId}/sellers/${sellerId}?tag=post_sale`
      : `/messages/packs/${packId}/messages`;
    const data = await mlFetch(endpoint, accountId);
    return data.messages || data.results || data || [];
  } catch (error) {
    try {
      const fallbackData = await mlFetch(`/messages/packs/${packId}/messages`, accountId);
      return fallbackData.messages || fallbackData.results || fallbackData || [];
    } catch (err) {
      console.error(`Error fetching messages for pack ${packId}:`, err.message);
      return [];
    }
  }
}

/**
 * Send a post-purchase message for a pack_id
 */
async function sendPackMessage(packId, text, accountId) {
  const account = db.getAccountById(accountId);
  const sellerId = account?.seller_id || (db.getToken(accountId) || {}).seller_id;

  try {
    const endpoint = sellerId
      ? `/messages/packs/${packId}/sellers/${sellerId}?tag=post_sale`
      : `/messages/packs/${packId}/messages`;

    return await mlFetch(endpoint, accountId, {
      method: 'POST',
      body: JSON.stringify({
        text: text,
      }),
    });
  } catch (error) {
    // Try standard endpoint fallback
    try {
      return await mlFetch(`/messages/packs/${packId}/messages`, accountId, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
    } catch (fallbackErr) {
      db.logActivity('message_error', `Error al enviar mensaje post-compra paquete ${packId}`, { error: fallbackErr.message }, accountId);
      throw fallbackErr;
    }
  }
}

/**
 * Check if post-purchase messaging is allowed for a pack_id
 */
async function checkMessagingEligibility(packId, accountId) {
  try {
    return await mlFetch(`/messages/action_guide/packs/${packId}?tag=post_sale`, accountId);
  } catch {
    return { allowed: true };
  }
}

module.exports = {
  getRecentOrders,
  getPackMessages,
  sendPackMessage,
  checkMessagingEligibility,
};
