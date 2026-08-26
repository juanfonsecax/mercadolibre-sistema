const db = require('../src/database');
const { mlFetch } = require('../src/mercadolibre/auth');

async function inspectItemPromotions() {
  await db.initDb();
  const accounts = db.getAccounts();

  const itemId = 'MCO1538098653';

  console.log(`=== INVESTIGANDO PROMOCIONES Y PRECIOS PERMITIDOS PARA ${itemId} ===`);

  for (const acc of accounts) {
    try {
      const itemData = await mlFetch(`/items/${itemId}`, acc.id);
      console.log(`\n📌 Información de la Publicación (${acc.name}):`);
      console.log(`   - Título: ${itemData.title}`);
      console.log(`   - Precio Actual: $${itemData.price?.toLocaleString('es-CO')} ${itemData.currency_id}`);
      console.log(`   - Precio Original: ${itemData.original_price ? '$' + itemData.original_price.toLocaleString('es-CO') : 'No definido'}`);
      console.log(`   - Estado: ${itemData.status}`);

      const promoData = await mlFetch(`/seller-promotions/items/${itemId}?app_version=v2`, acc.id);
      console.log(`\n📢 Promociones Disponibles en API v2 para ${itemId}:`);
      console.log(JSON.stringify(promoData, null, 2));

    } catch (err) {
      console.log(`  ⚠️ Error consultando en ${acc.name}:`, err.message);
    }
  }
}

inspectItemPromotions().catch(console.error);
