const auth = require('./auth');
const db = require('../database');

/**
 * Fetch items published by seller for account
 */
async function getSellerItems(accountId = null) {
  try {
    const token = auth.getValidToken(accountId);
    if (!token || !token.seller_id) return [];

    const url = `https://api.mercadolibre.com/users/${token.seller_id}/items/search?limit=50`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });

    if (!response.ok) {
      console.warn(`[ML Inventory] Search items failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const itemIds = data.results || [];
    if (itemIds.length === 0) return [];

    // Multiget items details
    const itemsUrl = `https://api.mercadolibre.com/items?ids=${itemIds.slice(0, 20).join(',')}`;
    const itemsRes = await fetch(itemsUrl, {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });

    if (!itemsRes.ok) return [];
    const itemsData = await itemsRes.json();
    return itemsData.map(res => res.body).filter(Boolean);
  } catch (error) {
    console.error('[ML Inventory] Error fetching seller items:', error.message);
    return [];
  }
}

/**
 * Sync Full Inventory from Mercado Libre API into local DB
 */
async function syncMlFullInventory(accountId = null) {
  try {
    const accounts = accountId ? [db.getAccountById(accountId)].filter(Boolean) : db.getAccounts();
    let syncedCount = 0;

    for (const acc of accounts) {
      const items = await getSellerItems(acc.id);
      for (const item of items) {
        // Check if fulfillment / Full or standard stock
        const availableQuantity = item.available_quantity || 0;
        const sku = item.seller_custom_field || (item.attributes && item.attributes.find(a => a.id === 'SELLER_SKU')?.value_name) || item.id;
        
        // Estimated last 30d sales
        const sales30d = Math.max(5, Math.round((item.sold_quantity || 0) * 0.2));
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
