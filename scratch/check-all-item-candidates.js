const db = require('../src/database');
const { mlFetch } = require('../src/mercadolibre/auth');

async function checkAllCandidates() {
  await db.initDb();
  const accounts = db.getAccounts();

  for (const acc of accounts) {
    console.log(`\n=== CANDIDATOS PROMO DE MERCADO LIBRE PARA ${acc.name} (Seller ${acc.seller_id}) ===`);
    const listings = db.getMlFullInventory(acc.id);

    for (const item of listings) {
      if (!item.ml_item_id) continue;
      try {
        const promos = await mlFetch(`/seller-promotions/items/${item.ml_item_id}?app_version=v2`, acc.id);
        if (Array.isArray(promos) && promos.length > 0) {
          console.log(`\n📦 [${item.ml_item_id}] ${item.title}`);
          promos.forEach(p => {
            console.log(`   - Tipo: ${p.type} | ID: ${p.id} | Nombre: "${p.name}" | Status: ${p.status} | Precio Sugerido: $${(p.suggested_discounted_price || p.price || 0).toLocaleString('es-CO')} COP`);
          });
        }
      } catch (err) {
        // Skip items without candidate endpoints
      }
    }
  }
}

checkAllCandidates().catch(console.error);
