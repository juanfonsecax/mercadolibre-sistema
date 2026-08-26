const db = require('../src/database');
const { runAutoPilotPromotionsWorker } = require('../src/mercadolibre/promotions');

async function testWorker() {
  await db.initDb();
  console.log("=== EJECUTANDO PROBETA DEL PILOTO AUTOMÁTICO DE OFERTAS Y CAMPAÑAS ===");
  await runAutoPilotPromotionsWorker(1);
  console.log("✅ Worker completado exitosamente.");
}

testWorker().catch(console.error);
