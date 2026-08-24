const { mlFetch } = require('./auth');
const db = require('../database');

/**
 * Get promotions/campaigns available for a specific seller item
 * Mercado Libre API: GET /seller-promotions/items/{ITEM_ID}?user_id={USER_ID}
 */
async function getItemPromotions(mlItemId, accountId) {
  try {
    const data = await mlFetch(`/seller-promotions/items/${mlItemId}`, accountId);
    return data || [];
  } catch (error) {
    console.warn(`[Promotions] Warning fetching promotions for ${mlItemId}:`, error.message);
    return [];
  }
}

/**
 * Opt an item into a promotion (Oferta Relámpago, Oferta del Día, Campaña ML)
 * Mercado Libre API: POST /seller-promotions/items/{ITEM_ID}
 * Body: { promotion_id, promotion_type, deal_price }
 */
async function joinPromotion(mlItemId, promotionId, promotionType, dealPrice, accountId) {
  try {
    const payload = {
      promotion_id: promotionId,
      promotion_type: promotionType,
      deal_price: parseFloat(dealPrice),
    };
    const response = await mlFetch(`/seller-promotions/items/${mlItemId}`, accountId, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    db.logActivity('promotion_join', `Producto ${mlItemId} ingresado a oferta ${promotionType}`, payload, accountId);
    return response;
  } catch (error) {
    console.error(`[Promotions] Error joining promotion for ${mlItemId}:`, error.message);
    throw error;
  }
}

/**
 * Remove an item from a promotion
 * Mercado Libre API: DELETE /seller-promotions/items/{ITEM_ID}?promotion_type={TYPE}&promotion_id={ID}
 */
async function leavePromotion(mlItemId, promotionId, promotionType, accountId) {
  try {
    const query = `promotion_type=${promotionType}&promotion_id=${promotionId}`;
    const response = await mlFetch(`/seller-promotions/items/${mlItemId}?${query}`, accountId, {
      method: 'DELETE',
    });
    db.logActivity('promotion_leave', `Producto ${mlItemId} retirado de oferta ${promotionType}`, { promotionId, promotionType }, accountId);
    return response;
  } catch (error) {
    console.error(`[Promotions] Error leaving promotion for ${mlItemId}:`, error.message);
    throw error;
  }
}

/**
 * Scan account publications and find eligible Ofertas Relámpago (LIGHTNING deals)
 */
async function scanEligibleLightningDeals(accountId) {
  try {
    // 1. Get active inventory listings for account
    const listings = db.getMlFullInventory(accountId);
    const eligibleDeals = [];

    for (const item of listings.slice(0, 15)) {
      if (!item.ml_item_id) continue;
      const promos = await getItemPromotions(item.ml_item_id, accountId);
      
      if (Array.isArray(promos)) {
        const lightning = promos.find(p => p.type === 'LIGHTNING' || p.promotion_type === 'LIGHTNING' || p.name?.toLowerCase().includes('relámpago') || p.name?.toLowerCase().includes('relampago'));
        if (lightning) {
          eligibleDeals.push({
            ml_item_id: item.ml_item_id,
            title: item.title,
            current_price: item.price || 0,
            units_full: item.units_full || 0,
            promotion_id: lightning.id || lightning.promotion_id,
            promotion_type: 'LIGHTNING',
            suggested_price: lightning.suggested_price || lightning.deal_price || Math.round((item.price || 80000) * 0.85),
            min_discount_percent: lightning.min_discount_percent || 15,
            start_date: lightning.start_date || null,
            finish_date: lightning.finish_date || null,
            status: lightning.status || 'eligible',
          });
        }
      }
    }
    return eligibleDeals;
  } catch (error) {
    console.error(`[Promotions] Error scanning lightning deals for account ${accountId}:`, error.message);
    return [];
  }
}

module.exports = {
  getItemPromotions,
  joinPromotion,
  leavePromotion,
  scanEligibleLightningDeals,
};
