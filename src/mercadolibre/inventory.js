const auth = require('./auth');
const db = require('../database');

/**
 * Fetch items published by seller for account
 */
async function getSellerItems(accountId = null) {
  try {
    const targetAccountId = accountId || 1;
    const accessToken = await auth.getValidToken(targetAccountId);
    if (!accessToken) return [];

    let tokenObj = db.getToken(targetAccountId);
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

    if (!sellerId) {
      console.warn(`[ML Inventory] Could not determine seller_id for account ${targetAccountId}`);
      return [];
    }

    const url = `https://api.mercadolibre.com/users/${sellerId}/items/search?limit=50`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[ML Inventory] Search items failed (${response.status}): ${errText}`);
      return [];
    }

    const data = await response.json();
    const itemIds = data.results || [];
    if (itemIds.length === 0) {
      console.log(`[ML Inventory] No items found for seller ${sellerId}`);
      return [];
    }

    // Multiget items details
    const itemsUrl = `https://api.mercadolibre.com/items?ids=${itemIds.slice(0, 50).join(',')}`;
    const itemsRes = await fetch(itemsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!itemsRes.ok) return [];
    const itemsData = await itemsRes.json();
    return itemsData.map(res => res.body).filter(Boolean);
  } catch (error) {
    console.error('[ML Inventory] Error fetching seller items:', error.message);
    return [];
  }
}

async function fetchRecentOrdersSalesMap(accountId, sellerId) {
  try {
    const targetAccountId = accountId || 1;
    const accessToken = await auth.getValidToken(targetAccountId);
    if (!accessToken) return {};

    let sId = sellerId;
    if (!sId) {
      const meRes = await fetch('https://api.mercadolibre.com/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (meRes.ok) {
        const me = await meRes.json();
        sId = me.id;
      }
    }

    if (!sId) return {};

    const date30Ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const url = `https://api.mercadolibre.com/orders/search?seller=${sId}&order.date_created.from=${date30Ago}&limit=50`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) {
      console.warn(`[ML Orders] Order search failed (${res.status}) for seller ${sId}`);
      return {};
    }

    const data = await res.json();
    const orders = data.results || [];
    const salesMap = {};

    orders.forEach(ord => {
      if (ord.status !== 'cancelled' && ord.order_items) {
        ord.order_items.forEach(oi => {
          const itemId = oi.item.id;
          const qty = oi.quantity || 1;
          salesMap[itemId] = (salesMap[itemId] || 0) + qty;
        });
      }
    });

    console.log(`[ML Orders] Calculated 30d sales map for seller ${sId}:`, salesMap);
    return salesMap;
  } catch (err) {
    console.error('[ML Orders] Error fetching order sales:', err.message);
    return {};
  }
}

/**
 * Sync Full Inventory from Mercado Libre API into local DB
 */
async function syncMlFullInventory(accountId = null) {
  try {
    const accounts = db.getAccounts();
    let syncedCount = 0;

    for (const acc of accounts) {
      const token = db.getToken(acc.id);
      if (!token || !token.access_token) continue;

      const items = await getSellerItems(acc.id);
      const realSalesMap = await fetchRecentOrdersSalesMap(acc.id, acc.seller_id);

      for (const item of items) {
        const availableQuantity = item.available_quantity || 0;
        const sku = item.seller_custom_field || (item.attributes && item.attributes.find(a => a.id === 'SELLER_SKU')?.value_name) || item.id;
        
        const real30d = realSalesMap[item.id];
        const existingItem = db.queryOne('SELECT sales_last_30d FROM ml_full_inventory WHERE ml_item_id = ?', [item.id]);
        const currentSales30d = existingItem ? existingItem.sales_last_30d : 0;
        
        const sales30d = real30d !== undefined ? real30d : (currentSales30d || 0);
        const sales7d = Math.round(sales30d * 0.25);

        db.saveMlFullInventoryItem({
          account_id: acc.id,
          ml_item_id: item.id,
          sku: sku,
          title: item.title,
          units_full: availableQuantity,
          sales_last_7d: sales7d,
          sales_last_30d: sales30d
        });
        syncedCount++;
      }
    }

    db.logActivity('sync_full', `Sincronizados ${syncedCount} items de Mercado Libre Full`, null, accountId);
    return { success: true, syncedCount };
  } catch (error) {
    console.error('[ML Inventory] Sync error:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  getSellerItems,
  syncMlFullInventory,
};
