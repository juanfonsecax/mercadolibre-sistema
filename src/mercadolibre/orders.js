const auth = require('./auth');
const db = require('../database');

/**
 * Syncs recent orders from Mercado Libre API into the ml_orders table.
 * @param {number|null} accountId - Specific account ID or null for all accounts.
 * @param {number} daysBack - Number of days to look back (default 60 days to cover current & previous month).
 */
async function syncMlOrders(accountId = null, daysBack = 60) {
  try {
    const accounts = db.getAccounts();
    const targetAccounts = accountId ? accounts.filter(a => a.id === parseInt(accountId)) : accounts;

    let totalOrdersProcessed = 0;
    let newOrdersCount = 0;
    let updatedOrdersCount = 0;

    const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

    for (const acc of targetAccounts) {
      const accessToken = await auth.getValidToken(acc.id);
      if (!accessToken) {
        console.warn(`[ML Orders Sync] No valid token for account ${acc.name} (id: ${acc.id})`);
        continue;
      }

      let sellerId = acc.seller_id;
      if (!sellerId) {
        const tokenObj = db.getToken(acc.id);
        sellerId = tokenObj && (tokenObj.user_id || tokenObj.seller_id);
      }
      if (!sellerId) {
        try {
          const meRes = await fetch('https://api.mercadolibre.com/users/me', {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (meRes.ok) {
            const me = await meRes.json();
            sellerId = me.id;
            db.updateAccountSellerInfo(acc.id, String(sellerId), String(sellerId));
          }
        } catch (e) {
          console.error(`[ML Orders Sync] Error fetching seller_id for ${acc.name}:`, e.message);
        }
      }

      if (!sellerId) {
        console.warn(`[ML Orders Sync] Could not determine seller_id for account ${acc.name}`);
        continue;
      }

      console.log(`[ML Orders Sync] 📦 Sincronizando órdenes para ${acc.name} desde ${fromDate.substring(0, 10)}...`);

      let offset = 0;
      const limit = 50;
      let totalPaging = Infinity;
      let accountOrders = 0;

      while (offset < totalPaging && offset < 2000) {
        try {
          const url = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.date_created.from=${encodeURIComponent(fromDate)}&sort=date_desc&limit=${limit}&offset=${offset}`;
          const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

          if (!res.ok) {
            const errBody = await res.text();
            console.warn(`[ML Orders Sync] Orders search API returned ${res.status}: ${errBody}`);
            break;
          }

          const data = await res.json();
          totalPaging = (data.paging && data.paging.total) || 0;
          const orders = data.results || [];
          if (orders.length === 0) break;

          for (const ord of orders) {
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

            const result = db.saveMlOrder({
              account_id: acc.id,
              ml_order_id: mlOrderId,
              date_created: dateCreated,
              total_amount: totalAmount,
              currency_id: currencyId,
              status: status,
              buyer_nickname: buyerNickname,
              items_json: JSON.stringify(items)
            });

            if (result && result.isNew) {
              newOrdersCount++;
            } else {
              updatedOrdersCount++;
            }
            accountOrders++;
          }

          offset += orders.length;
          if (orders.length < limit) break;
        } catch (fetchErr) {
          console.error(`[ML Orders Sync] Error fetching page at offset ${offset}:`, fetchErr.message);
          break;
        }
      }

      console.log(`[ML Orders Sync] ✅ ${acc.name}: ${accountOrders} órdenes procesadas.`);
      totalOrdersProcessed += accountOrders;
    }

    db.saveDbToFile();
    db.logActivity('sync_orders', `Sincronizadas ${totalOrdersProcessed} órdenes de Mercado Libre (${newOrdersCount} nuevas, ${updatedOrdersCount} actualizadas)`);

    return {
      success: true,
      totalOrdersProcessed,
      newOrdersCount,
      updatedOrdersCount,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[ML Orders Sync] Fatal error syncing orders:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Historical full sync for a whole year if needed.
 */
async function syncHistoricalOrders(accountId = null, year = 2026) {
  const now = new Date();
  const currentMonth = (year === now.getFullYear()) ? (now.getMonth() + 1) : 12;

  console.log(`[ML Historical Orders] Sincronizando año ${year} mes 1 a ${currentMonth}...`);
  // Sync in blocks of days or 60-day windows
  const days = (currentMonth * 31) + 5;
  return await syncMlOrders(accountId, days);
}

module.exports = {
  syncMlOrders,
  syncHistoricalOrders
};
