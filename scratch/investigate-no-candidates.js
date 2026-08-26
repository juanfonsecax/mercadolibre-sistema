const db = require('../src/database');
const { mlFetch } = require('../src/mercadolibre/auth');

async function investigateItem() {
  await db.initDb();
  const itemId = 'MCO1553357964';
  const accountId = 1; // Tienda Juan

  console.log(`🔍 Investigando item ${itemId} en Mercado Libre API v2...`);

  try {
    const rawPromos = await mlFetch(`/seller-promotions/items/${itemId}?app_version=v2`, accountId);
    console.log("=== GET /seller-promotions/items/MCO1553357964?app_version=v2 ===");
    console.log(JSON.stringify(rawPromos, null, 2));
  } catch (err) {
    console.error("Error fetching promos for item:", err.message);
  }

  try {
    const itemDetail = await mlFetch(`/items/${itemId}`, accountId);
    console.log("\n=== GET /items/MCO1553357964 ===");
    console.log({
      id: itemDetail.id,
      title: itemDetail.title,
      price: itemDetail.price,
      base_price: itemDetail.base_price,
      original_price: itemDetail.original_price,
      status: itemDetail.status,
      sub_status: itemDetail.sub_status,
      listing_type_id: itemDetail.listing_type_id,
      deal_ids: itemDetail.deal_ids,
      tags: itemDetail.tags
    });
  } catch (err) {
    console.error("Error fetching item details:", err.message);
  }
}

investigateItem().catch(console.error);
