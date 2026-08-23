const auth = require('./auth');
const db = require('../database');
const { generateMultimodalProductContext } = require('../ai/gemini');

/**
 * Helper to fetch image from URL and convert to Base64 inlineData for Gemini
 */
async function fetchImageInlineData(imageUrl) {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Data = buffer.toString('base64');
    
    let mimeType = 'image/jpeg';
    if (imageUrl.toLowerCase().endsWith('.png')) mimeType = 'image/png';
    if (imageUrl.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';

    return {
      inlineData: {
        data: base64Data,
        mimeType: mimeType
      }
    };
  } catch (err) {
    console.warn(`[ProductContext] Error fetching image ${imageUrl}:`, err.message);
    return null;
  }
}

/**
 * Fetch active items that sold in the last 30 days for an account
 */
async function fetchTopSellingActiveItems(accountId = 1) {
  const accessToken = await auth.getValidToken(accountId);
  if (!accessToken) {
    console.warn(`[ProductContext] No valid token for account ${accountId}`);
    return [];
  }

  const tokenObj = db.getToken(accountId);
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
    console.warn(`[ProductContext] Seller ID not found for account ${accountId}`);
    return [];
  }

  // 1. Fetch sales map from last 30 days orders
  const salesMap = {};
  const date30Ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let offset = 0;
  const limit = 50;
  let totalOrders = Infinity;

  try {
    while (offset < totalOrders && offset < 500) {
      const url = `https://api.mercadolibre.com/orders/search?seller=${sellerId}&order.date_created.from=${date30Ago}&sort=date_desc&limit=${limit}&offset=${offset}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) break;

      const data = await res.json();
      totalOrders = (data.paging && data.paging.total) || 0;
      const orders = data.results || [];

      orders.forEach(ord => {
        if (ord.order_items) {
          ord.order_items.forEach(oi => {
            const itemId = oi.item?.id;
            if (itemId) {
              const qty = oi.quantity || 1;
              salesMap[itemId] = (salesMap[itemId] || 0) + qty;
            }
          });
        }
      });

      offset += orders.length;
      if (orders.length < limit) break;
    }
  } catch (err) {
    console.error('[ProductContext] Error fetching 30-day orders:', err.message);
  }

  // 2. Query active seller items
  const activeItemIds = new Set();
  try {
    let offsetItem = 0;
    let totalItems = Infinity;
    while (offsetItem < totalItems && offsetItem < 500) {
      const url = `https://api.mercadolibre.com/users/${sellerId}/items/search?status=active&limit=50&offset=${offsetItem}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) break;
      const data = await res.json();
      totalItems = (data.paging && data.paging.total) || 0;
      const results = data.results || [];
      results.forEach(id => activeItemIds.add(id));
      offsetItem += results.length;
      if (results.length < 50) break;
    }
  } catch (err) {
    console.error('[ProductContext] Error querying active items:', err.message);
  }

  // 3. Filter active items that have sales in last 30 days
  const targetItemIds = [];
  activeItemIds.forEach(itemId => {
    const sales30d = salesMap[itemId] || 0;
    if (sales30d > 0) {
      targetItemIds.push({ id: itemId, sales_30d: sales30d });
    }
  });

  // Sort by sales descending
  targetItemIds.sort((a, b) => b.sales_30d - a.sales_30d);

  // If no items with >0 sales in 30d were found, fallback to top active items
  if (targetItemIds.length === 0) {
    Array.from(activeItemIds).slice(0, 20).forEach(itemId => {
      targetItemIds.push({ id: itemId, sales_30d: 0 });
    });
  }

  return targetItemIds;
}

/**
 * Fetch full item data + plain text description from Mercado Libre API
 */
async function fetchItemDetailsAndDescription(itemId, accountId = 1) {
  const accessToken = await auth.getValidToken(accountId);
  if (!accessToken) return null;

  try {
    const itemRes = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!itemRes.ok) return null;
    const itemData = await itemRes.json();

    let descriptionText = '';
    try {
      const descRes = await fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (descRes.ok) {
        const descData = await descRes.json();
        descriptionText = descData.plain_text || descData.text || '';
      }
    } catch (e) {
      console.warn(`[ProductContext] No description found for ${itemId}`);
    }

    return { itemData, descriptionText };
  } catch (err) {
    console.error(`[ProductContext] Error fetching item ${itemId}:`, err.message);
    return null;
  }
}

/**
 * Extract AI context for a single item (with images) and save to database
 */
async function extractAndSaveProductContext(itemId, sales30d = 0, accountId = 1) {
  const details = await fetchItemDetailsAndDescription(itemId, accountId);
  if (!details || !details.itemData) return null;

  const { itemData, descriptionText } = details;

  const pictures = itemData.pictures || [];
  const imageUrls = pictures.slice(0, 4).map(p => p.secure_url || p.url).filter(Boolean);

  const imageParts = [];
  for (const imgUrl of imageUrls) {
    const inlineData = await fetchImageInlineData(imgUrl);
    if (inlineData) imageParts.push(inlineData);
  }

  const aiContext = await generateMultimodalProductContext(itemData, descriptionText, imageParts);

  const contextRecord = {
    account_id: accountId,
    ml_item_id: itemId,
    title: itemData.title || 'Producto ML',
    price: itemData.price || 0,
    sold_quantity_30d: sales30d || itemData.sold_quantity || 0,
    status: itemData.status || 'active',
    permalink: itemData.permalink || '',
    thumbnail: itemData.secure_thumbnail || itemData.thumbnail || (imageUrls[0] || ''),
    description_text: descriptionText,
    attributes: itemData.attributes || [],
    image_urls: imageUrls,
    ai_generated_context: aiContext || 'Contexto no generado.',
    has_images_analyzed: imageParts.length > 0 ? 1 : 0
  };

  db.saveProductContext(contextRecord);
  return contextRecord;
}

/**
 * Sync product contexts for all active items sold in the last 30 days
 */
async function syncAllProductContexts(accountId = 1) {
  console.log(`[ProductContext] Starting sync of product contexts for account ${accountId}...`);

  const topItems = await fetchTopSellingActiveItems(accountId);
  console.log(`[ProductContext] Found ${topItems.length} active items to process.`);

  const results = [];
  for (const itemInfo of topItems) {
    try {
      console.log(`[ProductContext] Processing ${itemInfo.id} (${itemInfo.sales_30d} sales 30d)...`);
      const record = await extractAndSaveProductContext(itemInfo.id, itemInfo.sales_30d, accountId);
      if (record) results.push(record);
    } catch (err) {
      console.error(`[ProductContext] Failed to process ${itemInfo.id}:`, err.message);
    }
  }

  db.logActivity('context_sync', `Sincronización de contextos completada (${results.length} ítems procesados)`, { count: results.length }, accountId);
  return results;
}

module.exports = {
  fetchTopSellingActiveItems,
  fetchItemDetailsAndDescription,
  extractAndSaveProductContext,
  syncAllProductContexts,
};
