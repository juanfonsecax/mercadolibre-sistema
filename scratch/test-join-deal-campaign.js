const db = require('../src/database');
const { mlFetch } = require('../src/mercadolibre/auth');

async function testJoinDeal() {
  await db.initDb();
  const itemId = 'MCO1553357964';
  const accountId = 1;

  const payload = {
    promotion_id: "P-MCO17849021",
    promotion_type: "DEAL",
    deal_price: 36465
  };

  console.log(`🚀 Probando postular ${itemId} a la campaña DEAL 'P-MCO17849021'...`);
  try {
    const res = await mlFetch(`/seller-promotions/items/${itemId}?app_version=v2`, accountId, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    console.log("✅ RESPUESTA DE MERCADO LIBRE:", res);
  } catch (err) {
    console.error("❌ ERROR ML:", err.message);
  }
}

testJoinDeal().catch(console.error);
