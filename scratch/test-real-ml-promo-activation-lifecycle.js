const db = require('../src/database');
const { mlFetch } = require('../src/mercadolibre/auth');

async function testLifecycle() {
  await db.initDb();
  const itemId = 'MCO2627908158';
  const accountId = 1;

  console.log(`\n==================================================`);
  console.log(`🔍 DIAGNÓSTICO DE CICLO DE VIDA DE OFERTA EN ML PARA: ${itemId}`);
  console.log(`==================================================`);

  // Step 1: GET candidates
  console.log(`\n1️⃣ Consultando promociones/candidatos antes de activar...`);
  const initialPromos = await mlFetch(`/seller-promotions/items/${itemId}?app_version=v2`, accountId);
  console.log("Promociones actuales:", JSON.stringify(initialPromos, null, 2));

  if (!Array.isArray(initialPromos) || initialPromos.length === 0) {
    console.log("No hay promociones candidatas.");
    return;
  }

  const candidate = initialPromos[0];
  console.log(`\n2️⃣ Intentando activar candidatura: "${candidate.name}" (${candidate.type} - ID: ${candidate.id})...`);

  const payload = {
    promotion_id: candidate.id,
    promotion_type: candidate.type,
    deal_price: candidate.price && candidate.price > 0 ? candidate.price : (candidate.suggested_discounted_price || 26093),
  };
  if (candidate.offer_id || candidate.ref_id || candidate.id) {
    payload.offer_id = candidate.offer_id || candidate.ref_id || candidate.id;
  }
  if (candidate.ref_id) payload.ref_id = candidate.ref_id;

  console.log("Payload enviado a POST /seller-promotions/items/... :", JSON.stringify(payload, null, 2));

  try {
    const postRes = await mlFetch(`/seller-promotions/items/${itemId}?app_version=v2`, accountId, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    console.log("\n3️⃣ RESPUESTA RECIBIDA DE POST EN ML:", JSON.stringify(postRes, null, 2));
  } catch (err) {
    console.error("\n❌ ERROR EN POST DE ML:", err.message);
  }

  // Step 3: Check GET 2 seconds later
  console.log(`\n4️⃣ Esperando 3 segundos y consultando GET /seller-promotions/items/${itemId}...`);
  await new Promise(r => setTimeout(r, 3000));
  const afterPromos = await mlFetch(`/seller-promotions/items/${itemId}?app_version=v2`, accountId);
  console.log("Promociones 3s después:", JSON.stringify(afterPromos, null, 2));

  // Step 4: Check GET item prices/details
  console.log(`\n5️⃣ Consultando GET /items/${itemId}...`);
  const itemDetail = await mlFetch(`/items/${itemId}`, accountId);
  console.log(`Precio base: $${itemDetail.price} | Status: ${itemDetail.status} | Sub-status: ${itemDetail.sub_status}`);
}

testLifecycle().catch(console.error);
