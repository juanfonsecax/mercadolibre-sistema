const { mlFetch } = require('./auth');
const db = require('../database');

/**
 * Get open claims for a seller account
 */
async function getOpenClaims(accountId) {
  try {
    const data = await mlFetch('/post-purchase/v1/claims/search?receiver_role=seller&status=opened&limit=50', accountId);
    return data.data || data.results || data || [];
  } catch (error) {
    try {
      const data = await mlFetch('/v1/claims/search?status=opened&role=defendant&limit=50', accountId);
      return data.data || data.results || [];
    } catch {
      console.error(`Error fetching claims for account ${accountId}:`, error.message);
      return [];
    }
  }
}

/**
 * Get claim details
 */
async function getClaimDetails(claimId, accountId) {
  try {
    return await mlFetch(`/post-purchase/v1/claims/${claimId}`, accountId);
  } catch {
    return await mlFetch(`/v1/claims/${claimId}`, accountId);
  }
}

/**
 * Get claim messages
 */
async function getClaimMessages(claimId, accountId) {
  try {
    const data = await mlFetch(`/post-purchase/v1/claims/${claimId}/messages`, accountId);
    return data.messages || data || [];
  } catch (error) {
    console.error(`Error fetching claim messages for ${claimId}:`, error.message);
    return [];
  }
}

/**
 * Send a message in a claim
 */
async function sendClaimMessage(claimId, text, accountId) {
  try {
    return await mlFetch(`/post-purchase/v1/claims/${claimId}/actions/send-message`, accountId, {
      method: 'POST',
      body: JSON.stringify({ message: text }),
    });
  } catch (error) {
    db.logActivity('claim_error', `No se pudo enviar mensaje en reclamo ${claimId}`, { error: error.message }, accountId);
    throw error;
  }
}

/**
 * Get expected resolutions for a claim
 */
async function getExpectedResolutions(claimId, accountId) {
  try {
    return await mlFetch(`/post-purchase/v1/claims/${claimId}/expected-resolutions`, accountId);
  } catch {
    return [];
  }
}

/**
 * Get order details
 */
async function getOrderDetails(orderId, accountId) {
  try {
    return await mlFetch(`/orders/${orderId}`, accountId);
  } catch {
    return null;
  }
}

module.exports = {
  getOpenClaims,
  getClaimDetails,
  getClaimMessages,
  sendClaimMessage,
  getExpectedResolutions,
  getOrderDetails,
};
