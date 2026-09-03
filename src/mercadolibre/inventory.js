const auth = require('./auth');
const db = require('../database');

/**
 * Fetch ALL items published by seller for account (both ACTIVE and PAUSED/Sin stock)
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
        db.updateAccountSellerInfo(targetAccountId, String(sellerId), String(sellerId));
      }
    }

    if (!sellerId) {
      console.warn(`[ML Inventory] Could not determine seller_id for account ${targetAccountId}`);
      return [];
    }

    // Query active AND paused items so we don't miss out-of-stock items ("Sin stock")
    const allItemIds = new Set();
    const statuses = ['active', 'paused'];

    for (const status of statuses) {
      let offset = 0;
      const limit = 50;
      let total = Infinity;

      while (offset < total && offset < 1000) {
        const url = `https://api.mercadolibre.com/users/${sellerId}/items/search?status=${status}&limit=${limit}&offset=${offset}`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });

        if (!response.ok) break;
        const data = await response.json();
        const results = data.results || [];
        total = (data.paging && data.paging.total) || results.length;

        results.forEach(id => allItemIds.add(id));
        offset += results.length;
        if (results.length < limit) break;
      }
    }

    const itemIds = Array.from(allItemIds);
    if (itemIds.length === 0) {
      console.log(`[ML Inventory] No items found for seller ${sellerId}`);
      return [];
    }

    // Multiget item details in chunks of 20
    const allItems = [];
    for (let i = 0; i < itemIds.length; i += 20) {
      const chunk = itemIds.slice(i, i + 20);
      const itemsUrl = `https://api.mercadolibre.com/items?ids=${chunk.join(',')}`;
      const itemsRes = await fetch(itemsUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!itemsRes.ok) continue;
      const itemsData = await itemsRes.json();
      allItems.push(...itemsData.map(res => res.body).filter(item => {
        if (!item) return false;
        if (item.status === 'paused') {
          // Keep paused items ONLY if they are paused because of out of stock
          if (item.sub_status && item.sub_status.includes('out_of_stock')) {
            return true;
          }
          // Ignore items manually paused by the seller
          return false;
        }
        return true;
      }));
    }
    return allItems;
  } catch (error) {
    console.error('[ML Inventory] Error fetching seller items:', error.message);
    return [];
  }
}

/**
 * Fetch real 30-day sales map (unidades vendidas) from ML Orders API.
 * Uses a 35-day rolling window to cover UTC timezone differences and order processing times.
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

    // Use 60 days rolling window to capture current and previous month orders in DB
    const nowMs = Date.now();
    const date30AgoMs = nowMs - 30 * 24 * 60 * 60 * 1000;
    const dateFromIso = new Date(nowMs - 60 * 24 * 60 * 60 * 1000).toISOString();
    const salesMap = {};
    let offset = 0;
    const limit = 50;
    let totalOrders = Infinity;
    let totalRead = 0;

    while (offset < totalOrders && offset < 2000) {
      const url = `https://api.mercadolibre.com/orders/search?seller=${sId}&order.date_created.from=${encodeURIComponent(dateFromIso)}&sort=date_desc&limit=${limit}&offset=${offset}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[ML Orders] Order search failed (${res.status}): ${errText}`);
        break;
      }

      const data = await res.json();
      totalOrders = (data.paging && data.paging.total) || 0;
      const orders = data.results || [];
      totalRead += orders.length;

      orders.forEach(ord => {
        // Save order to ml_orders for real-time sales, tax & financial reporting
        try {
          const mlOrderId = String(ord.id);
          const dateCreated = ord.date_created || ord.date_closed || new Date().toISOString();
          const totalAmount = parseFloat(ord.total_amount || 0);
          const status = ord.status || 'confirmed';
          const buyerNickname = (ord.buyer && ord.buyer.nickname) || 'Cliente ML';
          const currencyId = ord.currency_id || 'COP';

          const items = (ord.order_items || []).map(i => ({
            item_id: i.item?.id,
            title: i.item?.title,
            seller_sku: i.item?.seller_sku || i.item?.seller_custom_field,
            quantity: i.quantity || 1,
            unit_price: i.unit_price || (totalAmount / (ord.order_items.length || 1)),
            full_unit_price: i.full_unit_price || i.unit_price
          }));

          db.saveMlOrder({
            account_id: targetAccountId,
            ml_order_id: mlOrderId,
            date_created: dateCreated,
            total_amount: totalAmount,
            currency_id: currencyId,
            status: status,
            buyer_nickname: buyerNickname,
            items_json: JSON.stringify(items)
          });
        } catch (saveErr) {
          console.error('[ML Orders] Error saving order to DB:', saveErr.message);
        }

        // Exclude cancelled and invalid orders from salesMap (30-day velocity for stock Full)
        const orderDateMs = new Date(ord.date_created).getTime();
        const isWithin30Days = orderDateMs >= date30AgoMs;

        if (isWithin30Days && ord.status !== 'cancelled' && ord.status !== 'invalid' && ord.order_items) {
          ord.order_items.forEach(oi => {
            const itemId = oi.item && oi.item.id;
            if (!itemId) return;
            const qty = parseInt(oi.quantity || 1, 10);
            salesMap[itemId] = (salesMap[itemId] || 0) + qty;
          });
        }
      });

      offset += orders.length;
      if (orders.length < limit) break;
    }

    console.log(`[ML Orders] Successfully read ${totalRead} orders for seller ${sId}. Total products with sales: ${Object.keys(salesMap).length}`);
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
      if (!token || !token.access_token) {
        console.log(`[ML Sync] Account ${acc.name} has no token - skipping`);
        continue;
      }

      // Fetch all items (active AND paused / sin stock)
      let items = await getSellerItems(acc.id);
      const itemsMap = new Map(items.map(i => [i.id, i]));

      // Fetch real 30-day sales map from ML Orders API
      const realSalesMap = await fetchRecentOrdersSalesMap(acc.id, acc.seller_id);
      const hasSalesData = Object.keys(realSalesMap).length > 0;

      // If there are item IDs in sales map that were not in seller items list, multiget their details
      const missingItemIds = Object.keys(realSalesMap).filter(id => !itemsMap.has(id));
      if (missingItemIds.length > 0) {
        console.log(`[ML Sync] Fetching ${missingItemIds.length} missing items found in sales history:`, missingItemIds);
        const accessToken = await auth.getValidToken(acc.id);
        for (let i = 0; i < missingItemIds.length; i += 20) {
          const chunk = missingItemIds.slice(i, i + 20);
          const itemsUrl = `https://api.mercadolibre.com/items?ids=${chunk.join(',')}`;
          const itemsRes = await fetch(itemsUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (itemsRes.ok) {
            const itemsData = await itemsRes.json();
            itemsData.forEach(res => {
              if (res.body && res.body.id) {
                const item = res.body;
                if (item.status === 'paused' && !(item.sub_status && item.sub_status.includes('out_of_stock'))) {
                   return; // Skip manually paused items
                }
                itemsMap.set(item.id, item);
              }
            });
          }
        }
      }

      const allItemsList = Array.from(itemsMap.values());

      for (const item of allItemsList) {
        const availableQuantity = item.available_quantity || 0;
        const sku = item.seller_custom_field
          || (item.attributes && item.attributes.find(a => a.id === 'SELLER_SKU')?.value_name)
          || item.id;

        const real30d = realSalesMap[item.id];
        const existing = db.queryOne('SELECT sales_last_30d FROM ml_full_inventory WHERE ml_item_id = ?', [item.id]);
        const currentSales30d = existing ? (existing.sales_last_30d || 0) : 0;

        const sales30d = (real30d !== undefined) ? real30d : currentSales30d;
        const sales7d = Math.round(sales30d * (7 / 30));

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

      // Delete items from the DB that are no longer active/out_of_stock
      const allItemIdsFromApi = Array.from(itemsMap.keys());
      if (allItemIdsFromApi.length > 0) {
        const placeholders = allItemIdsFromApi.map(() => '?').join(',');
        try {
          db.getDb().run(`DELETE FROM ml_full_inventory WHERE account_id = ? AND ml_item_id NOT IN (${placeholders})`, [acc.id, ...allItemIdsFromApi]);
        } catch(e) {
          console.error('[ML Sync] Error cleaning up old items:', e.message);
        }
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
