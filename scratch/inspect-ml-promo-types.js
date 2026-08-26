const db = require('../src/database');
const { mlFetch } = require('../src/mercadolibre/auth');

async function inspectPromoTypes() {
  await db.initDb();
  const accounts = db.getAccounts();

  for (const acc of accounts) {
    console.log(`\n==================================================`);
    console.log(`🔍 INSPECCIONANDO API V2 PROMOCIONES PARA: ${acc.name}`);
    console.log(`==================================================`);
    const listings = db.getMlFullInventory(acc.id);

    for (const item of listings) {
      if (!item.ml_item_id) continue;
      try {
        const promos = await mlFetch(`/seller-promotions/items/${item.ml_item_id}?app_version=v2`, acc.id);
        if (Array.isArray(promos) && promos.length > 0) {
          console.log(`\n📌 [${item.ml_item_id}] ${item.title}`);
          promos.forEach(p => {
            const isFixed = p.price && p.price > 0 && !p.min_discounted_price;
            console.log(`   --------------------------------------------------`);
            console.log(`   🏷️ Nombre: "${p.name || 'Descuento'}"`);
            console.log(`   🆔 ID Promo: ${p.id} | Tipo: ${p.type} | Status: ${p.status}`);
            console.log(`   💰 Precio Original: $${(p.original_price || item.price).toLocaleString('es-CO')} COP`);
            console.log(`   🎯 Precio Fijo ML: ${p.price ? '$' + p.price.toLocaleString('es-CO') + ' COP' : 'No'}`);
            console.log(`   📉 Min/Max Descuento: $${p.min_discounted_price || 0} - $${p.max_discounted_price || 0} COP`);
            console.log(`   💡 Precio Sugerido ML: $${p.suggested_discounted_price || 0} COP`);
            console.log(`   🔒 Permite Modificar Precio?: ${isFixed ? '❌ No (Precio Fijo Exigido por ML)' : '✅ Sí (Permite Precio Personalizado)'}`);
            console.log(`   📦 Stock Requerido: ${p.stock ? JSON.stringify(p.stock) : 'N/A'}`);
            console.log(`   🔑 Offer ID: ${p.offer_id || 'N/A'} | Ref ID: ${p.ref_id || 'N/A'}`);
          });
        }
      } catch (err) {
        // Skip items without candidate endpoints
      }
    }
  }
}

inspectPromoTypes().catch(console.error);
