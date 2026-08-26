const db = require('../src/database');
const { mlFetch } = require('../src/mercadolibre/auth');

async function testJoinSmart() {
  await db.initDb();
  const itemId = 'MCO2627908158';
  const accountId = 1;

  // SMART promotion candidate details
  const promoId = 'P-MCO17861004';
  const refId = 'CANDIDATE-MCO2627908158-76339614945';
  const offerId = 'OFFER-MCO2627908158-76339614945'; // or CANDIDATE-MCO2627908158-76339614945

  const payload = {
    promotion_id: promoId,
    promotion_type: 'SMART',
    offer_id: offerId,
    ref_id: refId,
    deal_price: 26093
  };

  console.log(`🚀 Probando postular ${itemId} a promoción SMART con offer_id '${offerId}' y ref_id '${refId}'...`);

  try {
    const res = await mlFetch(`/seller-promotions/items/${itemId}?app_version=v2`, accountId, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    console.log("✅ RESPUESTA ML:", res);
  } catch (err) {
    console.error("❌ ERROR ML:", err.message);
  }
}

testJoinSmart().catch(console.error);
