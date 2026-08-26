const db = require('../src/database');
const { joinPromotion } = require('../src/mercadolibre/promotions');

async function testFix() {
  await db.initDb();
  const itemId = 'MCO2627908158';
  const accountId = 1;

  console.log(`🚀 Probando joinPromotion para ${itemId} usando el nuevo resolvedor de offer_id...`);

  try {
    const res = await joinPromotion(itemId, 'P-MCO17861004', 'SMART', 26093, accountId);
    console.log("✅ ¡ÉXITO COMPLETO EN MERCADO LIBRE!", res);
  } catch (err) {
    console.error("❌ ERROR:", err.message);
  }
}

testFix().catch(console.error);
