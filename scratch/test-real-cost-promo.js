const db = require('../src/database');
const { scanEligibleLightningDeals, scanAllPublicationCampaigns } = require('../src/mercadolibre/promotions');

async function testRealCostPromo() {
  await db.initDb();

  const deals = await scanEligibleLightningDeals(1);
  console.log("=== OFERTAS RELÁMPAGO CON COSTOS REALES ===");
  deals.forEach(d => {
    console.log(`📌 [${d.ml_item_id}] ${d.title}`);
    console.log(`   - Precio Lista Actual: $${d.current_price.toLocaleString('es-CO')} COP`);
    console.log(`   - Precio Oferta Relámpago: $${d.final_offer_price.toLocaleString('es-CO')} COP (-${d.discount_percent}%)`);
    console.log(`   - Stock Comprometido: 📦 ${d.stock_commitment} unds`);
    console.log(`   - Ganancia Neta Real Estimada: $${d.estimated_net_cop.toLocaleString('es-CO')} COP (${d.estimated_net_percent}% de margen)\n`);
  });
}

testRealCostPromo().catch(console.error);
