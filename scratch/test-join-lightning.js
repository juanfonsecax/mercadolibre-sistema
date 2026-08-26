const db = require('../src/database');
const { mlFetch } = require('../src/mercadolibre/auth');
const { joinPromotion, getItemPromotions } = require('../src/mercadolibre/promotions');

async function testLightningJoin() {
  await db.initDb();
  const acc = db.getAccounts()[0]; // Tienda Juan
  const itemId = 'MCO1538098653';

  console.log(`=== PROBANDO ACTIVACIÓN DE OFERTA RELÁMPAGO EN ${itemId} ===`);

  // 1. Obtener candidatos
  const candidates = await getItemPromotions(itemId, acc.id);
  console.log(`Candidatos encontrados:`, candidates.length);

  const lightningCandidate = candidates.find(c => c.type === 'LIGHTNING' || c.id.startsWith('LGH-'));

  if (!lightningCandidate) {
    console.log(`❌ No hay campaña LIGHTNING candidata disponible para ${itemId} en este momento.`);
    return;
  }

  console.log(`\n⚡ Oferta Relámpago Candidata:`);
  console.log(`   - ID: ${lightningCandidate.id}`);
  console.log(`   - Ref ID: ${lightningCandidate.ref_id}`);
  console.log(`   - Min Precio Permitido: $${lightningCandidate.min_discounted_price}`);
  console.log(`   - Max Precio Permitido: $${lightningCandidate.max_discounted_price}`);
  console.log(`   - Sugerido: $${lightningCandidate.suggested_discounted_price}`);
  console.log(`   - Rango Stock: Min ${lightningCandidate.stock?.min} - Max ${lightningCandidate.stock?.max}`);

  // Probar precio dentro del rango permitido (Sugerido)
  const validPrice = lightningCandidate.suggested_discounted_price || lightningCandidate.max_discounted_price;
  const validStock = lightningCandidate.stock?.min || 5;

  console.log(`\n🚀 Intentando activar con Precio Válido = $${validPrice} y Stock = ${validStock}...`);

  try {
    const res = await joinPromotion(itemId, lightningCandidate.id, 'LIGHTNING', validPrice, acc.id, { stock: validStock });
    console.log(`✅ ¡ÉXITO! Oferta Relámpago activada correctamente:`, res);
  } catch (err) {
    console.error(`❌ ERROR:`, err.message);
  }
}

testLightningJoin().catch(console.error);
