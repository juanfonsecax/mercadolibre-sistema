const db = require('../src/database');
const { mlFetch } = require('../src/mercadolibre/auth');

async function testAdsAndClaims() {
  await db.initDb();
  const accounts = db.getAccounts();

  for (const acc of accounts) {
    console.log(`\n==============================================`);
    console.log(`🔍 CUENTA: ${acc.name} (SellerID: ${acc.seller_id})`);
    console.log(`==============================================`);

    // Endpoints alternativos de Advertising / Billing / PADS
    const endpoints = [
      `/PADS/advertisers/${acc.seller_id}/campaigns`,
      `/PADS/advertisers/${acc.seller_id}/reports`,
      `/billing/integration/group/ML/advertiser/${acc.seller_id}/summary`,
      `/billing/integration/periods?user_id=${acc.seller_id}`,
      `/billing/integration/group/ML/advertiser/${acc.seller_id}/bills`,
      `/post-purchase/v1/claims/search?seller_id=${acc.seller_id}`,
      `/claims/searchBySeller?seller_id=${acc.seller_id}`,
      `/v1/claims/search?seller_id=${acc.seller_id}`
    ];

    for (const ep of endpoints) {
      try {
        const data = await mlFetch(ep, acc.id);
        console.log(`  ✅ Success [${ep}]:`, JSON.stringify(data).slice(0, 300));
      } catch (err) {
        console.log(`  ⚠️ Error [${ep}]:`, err.message);
      }
    }
  }
}

testAdsAndClaims().catch(console.error);
