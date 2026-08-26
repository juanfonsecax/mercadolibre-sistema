const db = require('../src/database');
const { scanEligibleLightningDeals, getItemPromotions, fetchItemLivePriceAndOfferStatus } = require('../src/mercadolibre/promotions');

async function testScanFix() {
  await db.initDb();
  const deals = await scanEligibleLightningDeals(1);
  console.log(`=== OFERTAS RELÁMPAGO ENCONTRADAS (${deals.length}) ===`);
  console.log(JSON.stringify(deals, null, 2));
}

testScanFix().catch(console.error);
