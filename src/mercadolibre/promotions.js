const { mlFetch } = require('./auth');
const db = require('../database');

/**
 * Get promotions/campaigns available for a specific seller item
 * Mercado Libre API v2: GET /seller-promotions/items/{ITEM_ID}?app_version=v2
 */
async function getItemPromotions(mlItemId, accountId) {
  try {
    const data = await mlFetch(`/seller-promotions/items/${mlItemId}?app_version=v2`, accountId);
    return data || [];
  } catch (error) {
    console.warn(`[Promotions] Warning fetching promotions for ${mlItemId}:`, error.message);
    return [];
  }
}

/**
 * Opt an item into a promotion (Oferta Relámpago, Oferta del Día, Campaña ML)
 * Mercado Libre API v2: POST /seller-promotions/items/{ITEM_ID}?app_version=v2
 */
async function joinPromotion(mlItemId, promotionId, promotionType, dealPrice, accountId, extraPayload = {}) {
  try {
    let finalDealPrice = parseFloat(dealPrice);
    let candidateStock = extraPayload.stock;
    let refId = extraPayload.ref_id;

    // Fetch candidate promotions from ML API to resolve exact allowed price & stock bounds
    const candidates = await getItemPromotions(mlItemId, accountId);
    const candidateList = Array.isArray(candidates) ? candidates : (candidates?.results || candidates?.promotions || []);
    const match = candidateList.find(c => c.id === promotionId || c.type === promotionType);

    if (match) {
      if (match.price && match.price > 0 && !match.min_discounted_price) {
        // Offer is strictly fixed price, user cannot change it
        finalDealPrice = match.price;
      } else {
        // Offer price is editable. Respect user's dealPrice, but clamp it to allowed bounds
        if (match.min_discounted_price && finalDealPrice < match.min_discounted_price) {
          finalDealPrice = match.min_discounted_price;
        }
        if (match.max_discounted_price && finalDealPrice > match.max_discounted_price) {
          finalDealPrice = match.max_discounted_price;
        }
      }

      if (match.ref_id && !refId) {
        refId = match.ref_id;
      }

      if ((promotionType === 'LIGHTNING' || promotionId?.startsWith('LGH-'))) {
        const minStock = match.stock?.min || 5;
        const maxStock = match.stock?.max || 10;
        if (!candidateStock || candidateStock < minStock) {
          candidateStock = minStock;
        } else if (candidateStock > maxStock) {
          candidateStock = maxStock;
        }
      }
    }

    const payload = {
      promotion_type: promotionType,
      ...extraPayload
    };

    if (promotionType === 'PRICE_DISCOUNT') {
      payload.price = finalDealPrice;
    } else {
      payload.deal_price = finalDealPrice;
    }

    if (promotionId && !promotionId.startsWith('promo_')) {
      payload.promotion_id = promotionId;
    }

    if (promotionType === 'PRICE_DISCOUNT') {
      const formatLocal = d => d.toISOString().split('.')[0]; // YYYY-MM-DDTHH:mm:ss
      if (!payload.start_date) payload.start_date = formatLocal(new Date());
      if (!payload.finish_date) {
        const end = new Date();
        end.setDate(end.getDate() + 30);
        payload.finish_date = formatLocal(end);
      }
    }

    const resolvedOfferId = extraPayload.offer_id || (match ? (match.offer_id || match.ref_id || match.id) : null);
    if (resolvedOfferId) payload.offer_id = resolvedOfferId;
    if (refId || (match && match.ref_id)) payload.ref_id = refId || match.ref_id;
    if ((promotionType === 'LIGHTNING' || promotionId?.startsWith('LGH-'))) {
      payload.stock = candidateStock || 5;
    }

    const response = await mlFetch(`/seller-promotions/items/${mlItemId}?app_version=v2`, accountId, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    db.saveProductPromotion({
      account_id: accountId,
      ml_item_id: mlItemId,
      title: match?.name || extraPayload.title || mlItemId,
      original_price: match?.original_price || finalDealPrice,
      promo_price: finalDealPrice,
      discount_percent: match?.original_price > 0 ? Math.round(((match.original_price - finalDealPrice) / match.original_price) * 100) : 15,
      status: 'activa'
    });

    db.logActivity('promotion_join', `Producto ${mlItemId} ingresado a oferta ${promotionType}`, payload, accountId);
    return response;
  } catch (error) {
    console.error(`[Promotions] Error joining promotion for ${mlItemId}:`, error.message);
    if (error.message.includes('No candidates found') || error.message.includes('ERROR_CREDIBILITY_DISCOUNTED_PRICE')) {
      throw new Error(`Mercado Libre retiró o expiró la candidatura de Oferta Relámpago para esta publicación en este instante (${mlItemId}). Es necesario esperar a que el algoritmo de ML vuelva a habilitar el cupo flash.`);
    }
    throw error;
  }
}

/**
 * Remove an item from a promotion
 * Mercado Libre API v2: DELETE /seller-promotions/items/{ITEM_ID}?app_version=v2&promotion_type={TYPE}&promotion_id={ID}
 */
async function leavePromotion(mlItemId, promotionId, promotionType, accountId) {
  try {
    const query = `app_version=v2&promotion_type=${promotionType}&promotion_id=${promotionId}`;
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
        const lightning = promos.find(p => 
          (p.type === 'LIGHTNING' || p.promotion_type === 'LIGHTNING' || p.name?.toLowerCase().includes('relámpago') || p.name?.toLowerCase().includes('relampago')) &&
          (p.status === 'candidate' || p.status === 'active' || p.status === 'eligible' || !p.status)
        );
        if (lightning) {
          const liveStatus = await fetchItemLivePriceAndOfferStatus(item.ml_item_id, accountId);
          const currentPrice = lightning.original_price || liveStatus?.list_price || liveStatus?.current_ml_price || 50000;
          const finalOfferPrice = lightning.price && lightning.price > 0 
            ? lightning.price 
            : (lightning.suggested_discounted_price || lightning.max_discounted_price || Math.round(currentPrice * 0.85));
          const discountPct = currentPrice > 0 ? Math.round(((currentPrice - finalOfferPrice) / currentPrice) * 100) : 15;
          const stockCommitment = lightning.stock?.min || 5;

          const commission = finalOfferPrice * 0.13;
          const fixedFee = finalOfferPrice < 70000 ? 2500 : 0;
          const shipping = finalOfferPrice >= 70000 ? 9500 : 0;
          const cost = (item.unit_cost_cop && item.unit_cost_cop > 0) ? item.unit_cost_cop : 9829;
          const netCop = finalOfferPrice - commission - fixedFee - shipping - cost;
          const netPercent = finalOfferPrice > 0 ? Math.round((netCop / finalOfferPrice) * 100) : 0;

          const isPriceEditable = !(lightning.price && lightning.price > 0 && !lightning.min_discounted_price);

          const config = db.getAutoPromoConfig(item.ml_item_id);
          const targetPromoPrice = config ? config.target_promo_price : 0;

          eligibleDeals.push({
            ml_item_id: item.ml_item_id,
            sku: item.sku || '',
            target_promo_price: targetPromoPrice,
            title: item.title,
            current_price: Math.round(currentPrice),
            final_offer_price: Math.round(finalOfferPrice),
            min_price: lightning.min_discounted_price ? Math.round(lightning.min_discounted_price) : Math.round(currentPrice * 0.4),
            max_price: lightning.max_discounted_price ? Math.round(lightning.max_discounted_price) : Math.round(currentPrice),
            is_price_editable: isPriceEditable,
            unit_cost_cop: Math.round(cost),
            discount_percent: discountPct,
            stock_commitment: stockCommitment,
            units_full: item.units_full || 0,
            promotion_id: lightning.id || lightning.promotion_id,
            promotion_type: 'LIGHTNING',
            suggested_price: Math.round(finalOfferPrice),
            estimated_net_cop: Math.round(netCop),
            estimated_net_percent: netPercent,
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
    const concurrencyLimit = 10;
    
    for (let i = 0; i < listings.length; i += concurrencyLimit) {
      const batch = listings.slice(i, i + concurrencyLimit);
      
      const batchResults = await Promise.all(batch.map(async (item) => {
        try {
          const promos = await getItemPromotions(item.ml_item_id, accountId);
          const liveStatus = await fetchItemLivePriceAndOfferStatus(item.ml_item_id, accountId);
          const availableCampaigns = [];

          const origPrice = liveStatus?.list_price || liveStatus?.current_ml_price || 50000;

          if (Array.isArray(promos) && promos.length > 0) {
            promos.forEach(p => {
              const promoType = p.type || p.promotion_type || 'PRICE_DISCOUNT';
              const pOrigPrice = p.original_price || origPrice;
              const suggestedPrice = p.price && p.price > 0 
                ? p.price 
                : (p.suggested_discounted_price || p.max_discounted_price || p.suggested_price || Math.round(pOrigPrice * 0.85));
              const discountPct = pOrigPrice > 0 ? Math.round(((pOrigPrice - suggestedPrice) / pOrigPrice) * 100) : 0;

              const commission = suggestedPrice * 0.13;
              const fixedFee = suggestedPrice < 70000 ? 2500 : 0;
              const shipping = suggestedPrice >= 70000 ? 9500 : 0;
              const cost = (item.unit_cost_cop && item.unit_cost_cop > 0) ? item.unit_cost_cop : 9829;
              const netCop = suggestedPrice - commission - fixedFee - shipping - cost;
              const netPercent = suggestedPrice > 0 ? Math.round((netCop / suggestedPrice) * 100) : 0;

              const isPriceEditable = !(p.price && p.price > 0 && !p.min_discounted_price);

              availableCampaigns.push({
                promotion_id: p.id || p.promotion_id || `promo_${item.ml_item_id}`,
                promotion_type: promoType,
                name: p.name || (promoType === 'LIGHTNING' ? '⚡ Oferta Relámpago (6-8h)' : (promoType === 'DEAL' ? '☀️ Oferta del Día (24h)' : '🏷️ Campaña Mercado Libre')),
                current_price: Math.round(pOrigPrice),
                suggested_price: Math.round(suggestedPrice),
                min_price: p.min_discounted_price ? Math.round(p.min_discounted_price) : Math.round(pOrigPrice * 0.4),
                max_price: p.max_discounted_price ? Math.round(p.max_discounted_price) : Math.round(pOrigPrice),
                is_price_editable: isPriceEditable,
                unit_cost_cop: Math.round(cost),
                discount_percent: discountPct,
                stock_commitment: p.stock?.min || 5,
                estimated_net_cop: Math.round(netCop),
                estimated_net_percent: netPercent,
                start_date: p.start_date || null,
                finish_date: p.finish_date || null,
                status: p.status || 'eligible'
              });
            });
          }

          if (availableCampaigns.length > 0) {
            return {
              account_id: accountId,
              ml_item_id: item.ml_item_id,
              sku: item.sku || '',
              title: item.title,
              price: origPrice,
              units_full: item.units_full || 0,
              sales_30d: item.sales_last_30d || 0,
              campaigns: availableCampaigns
            };
          }
        } catch (err) {
          console.error(`[Promotions] Error loading campaigns for ${item.ml_item_id}:`, err.message);
        }
        return null;
      }));

      const validResults = batchResults.filter(Boolean);
      campaignsResult.push(...validResults);
    }

    return campaignsResult;
  } catch (error) {
    console.error(`[Promotions] Error scanning all publication campaigns for account ${accountId}:`, error.message);
    return [];
  }
}

/**
 * Get live item price and active promotion status directly from Mercado Libre API
 */
async function fetchItemLivePriceAndOfferStatus(mlItemId, accountId) {
  try {
    const itemData = await mlFetch(`/items/${mlItemId}`, accountId);
    if (!itemData) return null;

    const currentPrice = itemData.price || 0;
    const originalPrice = itemData.original_price || currentPrice;
    const hasActiveOffer = originalPrice > currentPrice;
    const discountPercent = hasActiveOffer ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100) : 0;

    return {
      ml_item_id: mlItemId,
      title: itemData.title,
      current_ml_price: currentPrice,
      list_price: originalPrice,
      has_active_offer: hasActiveOffer,
      discount_percent: discountPercent,
    };
  } catch (error) {
    console.warn(`[Promotions] Warning fetching live item prices for ${mlItemId}:`, error.message);
    return null;
  }
}

/**
 * 24/7 Auto-Pilot Promotions Worker: Checks all active products.
 * If an item's promotion expired or is inactive, it automatically re-enrolls at target_promo_price!
 */
async function runAutoPilotPromotionsWorker(accountId = 1) {
  try {
    const listings = db.getMlFullInventory(accountId)
      .filter(item => item.ml_item_id && !db.isProductDiscontinued(item.title))
      .filter(item => (item.units_full && item.units_full > 0));

    console.log(`[Auto-Pilot Promos] 🤖 Verificando ofertas continuas para ${listings.length} publicaciones activas...`);

    for (const item of listings) {
      const mlItemId = item.ml_item_id;
      const liveStatus = await fetchItemLivePriceAndOfferStatus(mlItemId, accountId);
      const savedConfig = db.getAutoPromoConfig(mlItemId) || {};

      const isEnabled = savedConfig.auto_pilot_enabled !== undefined ? Boolean(savedConfig.auto_pilot_enabled) : true;
      const targetPrice = savedConfig.target_promo_price || Math.round((item.price || 50000) * 0.85);
      const listPrice = liveStatus?.list_price || item.price || 50000;

      // Update config snapshot in DB
      db.saveAutoPromoConfig({
        account_id: accountId,
        ml_item_id: mlItemId,
        title: item.title,
        list_price: listPrice,
        target_promo_price: targetPrice,
        auto_pilot_enabled: isEnabled ? 1 : 0,
        current_ml_price: liveStatus?.current_ml_price || item.price || 0,
        current_ml_original_price: listPrice,
        has_active_offer: liveStatus?.has_active_offer || false,
        active_offer_type: liveStatus?.has_active_offer ? 'ACTIVE_OFFER' : 'NONE',
      });

      // If Auto-Pilot is enabled and item currently has NO active offer in ML (offer expired or price reset to full list_price)
      if (isEnabled && (!liveStatus?.has_active_offer || liveStatus?.current_ml_price >= listPrice)) {
        console.log(`[Auto-Pilot Promos] ⚡ La oferta de ${item.title} (${mlItemId}) venció. Re-activando oferta automática a $${targetPrice.toLocaleString('es-CO')} COP...`);
        try {
          const promos = await getItemPromotions(mlItemId, accountId);
          let targetPromo = Array.isArray(promos) && promos.length > 0 ? promos[0] : null;

          if (targetPromo) {
            const promoId = targetPromo.id || targetPromo.promotion_id;
            const promoType = targetPromo.type || targetPromo.promotion_type || 'PRICE_DISCOUNT';
            await joinPromotion(mlItemId, promoId, promoType, targetPrice, accountId);
            db.logActivity('auto_promo_renew', `🤖 Piloto Automático: Oferta re-activada para ${item.title} a $${targetPrice.toLocaleString('es-CO')} COP`, { promoId, promoType, targetPrice }, accountId);
          }
        } catch (e) {
          console.warn(`[Auto-Pilot Promos] No se pudo re-activar la oferta para ${mlItemId}:`, e.message);
        }
      }
    }
  } catch (error) {
    console.error(`[Auto-Pilot Promos] Error in worker execution for account ${accountId}:`, error.message);
  }
}

module.exports = {
  getItemPromotions,
  joinPromotion,
  leavePromotion,
  scanEligibleLightningDeals,
  scanAllPublicationCampaigns,
  fetchItemLivePriceAndOfferStatus,
  runAutoPilotPromotionsWorker,
};
