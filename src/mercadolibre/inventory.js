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
        // Persist the seller_id we just discovered
        db.updateAccountSellerInfo(targetAccountId, String(sellerId), String(sellerId));
      }
    }

    if (!sellerId) {
      console.warn(`[ML Inventory] Could not determine seller_id for account ${targetAccountId}`);
      return [];
    }

    const url = `https://api.mercadolibre.com/users/${sellerId}/items/search?limit=100`;
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

    // Multiget items details (up to 20 at a time per ML API limits)
    const allItems = [];
    for (let i = 0; i < itemIds.length; i += 20) {
      const chunk = itemIds.slice(i, i + 20);
      const itemsUrl = `https://api.mercadolibre.com/items?ids=${chunk.join(',')}`;
      const itemsRes = await fetch(itemsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!itemsRes.ok) continue;
      const itemsData = await itemsRes.json();
      allItems.push(...itemsData.map(res => res.body).filter(Boolean));
    }
    return allItems;
  } catch (error) {
    console.error('[ML Inventory] Error fetching seller items:', error.message);
    return [];
  }
}

/**
 * Fetch real 30-day sales map from ML Orders API.
 * Uses DATE-RANGE CHUNKING (weekly windows) so it works even if you have
 * thousands of orders — the ML API blocks offset > 1000, but chunking by
 * date sidesteps that limit completely.
 */
async function fetchRecentOrdersSalesMap(accountId, sellerId) {
  try {
    const targetAccountId = accountId || 1;
    const accessToken = await auth.getValidToken(targetAccountId);
    if (!accessToken) {
      console.warn(`[ML Orders] No valid token for account ${targetAccountId}`);
      return {};
    }

    let sId = sellerId;
    if (!sId) {
      const tokenObj = db.getToken(targetAccountId);
      sId = tokenObj && (tokenObj.user_id || tokenObj.seller_id);
    }
    if (!sId) {
      const meRes = await fetch('https://api.mercadolibre.com/users/me', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (meRes.ok) {
        const me = await meRes.json();
        sId = me.id;
      }
    }

    if (!sId) {
      console.warn(`[ML Orders] Could not determine seller_id`);
      return {};
    }

    // Build weekly date windows for the last 30 days
    // This avoids the ML API offset=1000 hard limit by splitting into small time ranges
    const now = Date.now();
    const MS_DAY = 24 * 60 * 60 * 1000;
    const CHUNK_DAYS = 5; // 5-day windows → 6 chunks for 30 days
    const chunks = [];
    for (let i = 30; i > 0; i -= CHUNK_DAYS) {
      const from = new Date(now - i * MS_DAY).toISOString();
      const to   = new Date(now - Math.max(0, i - CHUNK_DAYS) * MS_DAY).toISOString();
      chunks.push({ from, to });
    }

    const salesMap = {};
    let totalOrdersRead = 0;
    const limit = 50;

    for (const chunk of chunks) {
      let offset = 0;
      let chunkTotal = Infinity;

      // Paginate within each date-range window (max ~300 orders per 5-day window is safe)
      while (offset < chunkTotal) {
        const url = `https://api.mercadolibre.com/orders/search?seller=${sId}&order.date_created.from=${chunk.from}&order.date_created.to=${chunk.to}&sort=date_asc&limit=${limit}&offset=${offset}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

        if (!res.ok) {
          const errText = await res.text();
          console.warn(`[ML Orders] Chunk failed (${res.status}): ${errText}`);
          break;
        }

        const data = await res.json();
        chunkTotal = (data.paging && data.paging.total) || 0;
        const orders = data.results || [];
        totalOrdersRead += orders.length;

        orders.forEach(ord => {
          if (ord.status !== 'cancelled' && ord.order_items) {
            ord.order_items.forEach(oi => {
              const itemId = oi.item && oi.item.id;
              if (!itemId) return;
              const qty = oi.quantity || 1;
              salesMap[itemId] = (salesMap[itemId] || 0) + qty;
            });
          }
        });

        offset += orders.length;
        if (orders.length < limit) break;
      }
    }

    console.log(`[ML Orders] Read ${totalOrdersRead} orders across ${chunks.length} date windows for seller ${sId}. Products: ${Object.keys(salesMap).length}`);
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
    let errors = [];

    for (const acc of accounts) {
      const token = db.getToken(acc.id);
      if (!token || !token.access_token) {
        console.log(`[ML Sync] Account ${acc.name} has no token - skipping`);
        continue;
      }

      const items = await getSellerItems(acc.id);
      if (!items.length) {
        console.log(`[ML Sync] No items found for account ${acc.name}`);
        continue;
      }

      // Fetch real 30-day sales from ML Orders API
      const realSalesMap = await fetchRecentOrdersSalesMap(acc.id, acc.seller_id);
      const hasSalesData = Object.keys(realSalesMap).length > 0;
      console.log(`[ML Sync] Account ${acc.name}: ${items.length} items, sales data: ${hasSalesData ? 'YES (' + Object.keys(realSalesMap).length + ' products)' : 'NO (using existing)'}`);

      for (const item of items) {
        const availableQuantity = item.available_quantity || 0;
        const sku = item.seller_custom_field
          || (item.attributes && item.attributes.find(a => a.id === 'SELLER_SKU')?.value_name)
          || item.id;

        // Use real API sales if available; otherwise keep existing DB value
        const real30d = realSalesMap[item.id];
        const existing = db.queryOne('SELECT sales_last_30d FROM ml_full_inventory WHERE ml_item_id = ?', [item.id]);
        const currentSales30d = existing ? (existing.sales_last_30d || 0) : 0;

        const sales30d = (real30d !== undefined) ? real30d : currentSales30d;
        const sales7d = Math.round(sales30d * (7/30));

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

      // Save updated sales to JSON for persistence across restarts
      if (hasSalesData) {
        db.saveMlSalesToJsonFile();
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
  fetchRecentOrdersSalesMap,
  syncMlFullInventory,
};
