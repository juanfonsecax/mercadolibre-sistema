const db = require('../src/database');
const { mlFetch } = require('../src/mercadolibre/auth');
const { getItemPromotions } = require('../src/mercadolibre/promotions');

async function testLightningExact() {
  await db.initDb();
  const acc = db.getAccounts()[0]; // Tienda Juan
  const itemId = 'MCO1538098653';

  const candidates = await getItemPromotions(itemId, acc.id);
  const lightningCandidate = candidates.find(c => c.type === 'LIGHTNING' || c.id.startsWith('LGH-'));

  if (!lightningCandidate) return;

  console.log("Candidato Lightining completo:", JSON.stringify(lightningCandidate, null, 2));

  // Prueba A: Usar exact price del candidato (23655)
  console.log(`\n--- Prueba A: deal_price = ${lightningCandidate.price} ---`);
  try {
    const payloadA = {
      promotion_id: lightningCandidate.id,
      promotion_type: 'LIGHTNING',
      deal_price: lightningCandidate.price,
      stock: lightningCandidate.stock?.min || 5
    };
    const resA = await mlFetch(`/seller-promotions/items/${itemId}?app_version=v2`, acc.id, {
      method: 'POST',
      body: JSON.stringify(payloadA)
    });
    console.log("✅ Prueba A Exitosa:", resA);
  } catch (errA) {
    console.log("❌ Prueba A falló:", errA.message);
  }

  // Prueba B: Pasar ref_id en la petición
  console.log(`\n--- Prueba B: Con ref_id = ${lightningCandidate.ref_id} ---`);
  try {
    const payloadB = {
      promotion_id: lightningCandidate.id,
      promotion_type: 'LIGHTNING',
      ref_id: lightningCandidate.ref_id,
      deal_price: lightningCandidate.price,
      stock: lightningCandidate.stock?.min || 5
    };
    const resB = await mlFetch(`/seller-promotions/items/${itemId}?app_version=v2`, acc.id, {
      method: 'POST',
      body: JSON.stringify(payloadB)
    });
    console.log("✅ Prueba B Exitosa:", resB);
  } catch (errB) {
    console.log("❌ Prueba B falló:", errB.message);
  }

  // Prueba C: Probar con otras ofertas disponibles (Campaña DEAL / SMART)
  console.log(`\n--- Prueba C: Probar Campaña DEAL P-MCO17895020 ---`);
  const dealCandidate = candidates.find(c => c.id === 'P-MCO17895020');
  if (dealCandidate) {
    try {
      const payloadC = {
        promotion_id: dealCandidate.id,
        promotion_type: 'DEAL',
        deal_price: dealCandidate.suggested_discounted_price || 53802
      };
      const resC = await mlFetch(`/seller-promotions/items/${itemId}?app_version=v2`, acc.id, {
        method: 'POST',
        body: JSON.stringify(payloadC)
      });
      console.log("✅ Prueba C Exitosa:", resC);
    } catch (errC) {
      console.log("❌ Prueba C falló:", errC.message);
    }
  }
}

testLightningExact().catch(console.error);
