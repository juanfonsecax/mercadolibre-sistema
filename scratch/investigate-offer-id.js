const db = require('../src/database');
const { mlFetch } = require('../src/mercadolibre/auth');

async function investigateOfferId() {
  await db.initDb();
  const itemId = 'MCO2627908158';
  const accountId = 1;

  console.log(`🔍 Investigando promociones y offer_id para ${itemId}...`);
  try {
    const promos = await mlFetch(`/seller-promotions/items/${itemId}?app_version=v2`, accountId);
    console.log("=== CANDIDATOS PROMO DE MCO2627908158 ===");
    console.log(JSON.stringify(promos, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
  }
}

investigateOfferId().catch(console.error);
