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
    // 1. Get active inventory listings for account (Strict filter: Published with stock > 0 and NOT discontinued)
    const listings = db.getMlFullInventory(accountId)
      .filter(item => item.ml_item_id && !db.isProductDiscontinued(item.title))
      .filter(item => (item.units_full && item.units_full > 0))
      .sort((a, b) => (b.units_full || 0) - (a.units_full || 0));

    const eligibleDeals = [];

    for (const item of listings) {
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

/**
 * Scan ALL active account publications and return available campaigns for each publication
 */
async function scanAllPublicationCampaigns(accountId) {
  try {
    // Strict filter: Only active published products currently in stock (>0) & not discontinued
    const listings = db.getMlFullInventory(accountId)
      .filter(item => item.ml_item_id && !db.isProductDiscontinued(item.title))
      .filter(item => (item.units_full && item.units_full > 0))
      .sort((a, b) => (b.units_full || 0) - (a.units_full || 0));

    const campaignsResult = [];

    for (const item of listings) {
      if (!item.ml_item_id) continue;
      const promos = await getItemPromotions(item.ml_item_id, accountId);
      const availableCampaigns = [];

      if (Array.isArray(promos) && promos.length > 0) {
        promos.forEach(p => {
          const promoType = p.type || p.promotion_type || 'PRICE_DISCOUNT';
          const suggestedPrice = p.suggested_price || p.deal_price || Math.round((item.price || 50000) * 0.85);
          const origPrice = item.price || 50000;
          const discountPct = Math.round(((origPrice - suggestedPrice) / origPrice) * 100);

          // Calculate estimated net margin
          const commission = origPrice * 0.13;
          const shipping = origPrice > 70000 ? 9500 : 0;
          const cost = item.unit_cost_cop || Math.round(origPrice * 0.4);
          const netCop = suggestedPrice - commission - shipping - cost;
          const netPercent = (netCop / suggestedPrice) * 100;

          availableCampaigns.push({
            promotion_id: p.id || p.promotion_id || `promo_${item.ml_item_id}`,
            promotion_type: promoType,
            name: p.name || (promoType === 'LIGHTNING' ? '⚡ Oferta Relámpago (6-8h)' : (promoType === 'DEAL' ? '☀️ Oferta del Día (24h)' : '🏷️ Campaña Mercado Libre')),
            suggested_price: suggestedPrice,
            discount_percent: discountPct,
            estimated_net_cop: netCop,
            estimated_net_percent: netPercent,
            start_date: p.start_date || null,
            finish_date: p.finish_date || null,
            status: p.status || 'eligible'
          });
        });
      }

      // If ML API has no active promo for this item yet, create baseline eligible promo options
      if (availableCampaigns.length === 0) {
        const origPrice = item.price || 50000;

        // Relampago (15% desc)
        const relampagoPrice = Math.round(origPrice * 0.85);
        const comm1 = relampagoPrice * 0.13;
        const ship1 = relampagoPrice > 70000 ? 9500 : 0;
        const cost1 = item.unit_cost_cop || Math.round(origPrice * 0.4);
        const netCop1 = relampagoPrice - comm1 - ship1 - cost1;
        const netPct1 = (netCop1 / relampagoPrice) * 100;

        availableCampaigns.push({
          promotion_id: `relampago_${item.ml_item_id}`,
          promotion_type: 'LIGHTNING',
          name: '⚡ Oferta Relámpago Flash (6 Horas)',
          suggested_price: relampagoPrice,
          discount_percent: 15,
          estimated_net_cop: netCop1,
          estimated_net_percent: netPct1,
          status: 'eligible'
        });

        // Oferta del Dia (10% desc)
        const diaPrice = Math.round(origPrice * 0.90);
        const comm2 = diaPrice * 0.13;
        const ship2 = diaPrice > 70000 ? 9500 : 0;
        const netCop2 = diaPrice - comm2 - ship2 - cost1;
        const netPct2 = (netCop2 / diaPrice) * 100;

        availableCampaigns.push({
          promotion_id: `dia_${item.ml_item_id}`,
          promotion_type: 'DEAL',
          name: '☀️ Oferta del Día (24 Horas)',
          suggested_price: diaPrice,
          discount_percent: 10,
          estimated_net_cop: netCop2,
          estimated_net_percent: netPct2,
          status: 'eligible'
        });
      }

      campaignsResult.push({
        ml_item_id: item.ml_item_id,
        sku: item.sku || '',
        title: item.title,
        price: item.price || 0,
        units_full: item.units_full || 0,
        sales_30d: item.sales_last_30d || 0,
        campaigns: availableCampaigns
      });
    }

    return campaignsResult;
  } catch (error) {
    console.error(`[Promotions] Error scanning all publication campaigns for account ${accountId}:`, error.message);
    return [];
  }
}

module.exports = {
  getItemPromotions,
  joinPromotion,
  leavePromotion,
  scanEligibleLightningDeals,
  scanAllPublicationCampaigns,
};
