const db = require('../src/database');

async function calculateYtdSales() {
  await db.initDb();
  const accounts = db.getAccounts();
  const LIMIT_IVA_COP = 182756000; // ~3.500 UVT para 2026

  console.log("=== SEGUIMIENTO ACUMULADO 2026 PARA DECLARACIÓN DE RENTA E IVA (DIAN) ===");
  console.log(`Límite No Responsable de IVA (3.500 UVT 2026): $${LIMIT_IVA_COP.toLocaleString('es-CO')} COP\n`);

  for (const acc of accounts) {
    let ytdGrossSales = 0;
    let ytdNetSales = 0;
    let ytdUnitsSold = 0;

    for (let m = 1; m <= 8; m++) {
      const summary = db.getFinancialSummary(acc.id, m, 2026);
      ytdGrossSales += summary.gross_sales_cop;
      ytdNetSales += summary.net_profit_cop;
      ytdUnitsSold += summary.total_units_sold;
    }

    const pctUsed = ((ytdGrossSales / LIMIT_IVA_COP) * 100).toFixed(1);
    const marginRemaining = LIMIT_IVA_COP - ytdGrossSales;

    console.log(`👤 ACUMULADO 2026 - [${acc.name}] (Enero a Agosto):`);
    console.log(`   - Ingresos Brutos Acumulados (Ventas): $${ytdGrossSales.toLocaleString('es-CO')} COP`);
    console.log(`   - Ganancia Neta Acumulada: $${ytdNetSales.toLocaleString('es-CO')} COP`);
    console.log(`   - Unidades Totales Vendidas: ${ytdUnitsSold}`);
    console.log(`   - Porcentaje del Límite de IVA consumido: ${pctUsed}%`);
    console.log(`   - Margen Disponible antes de superar $182.7M COP: $${marginRemaining.toLocaleString('es-CO')} COP\n`);
  }
}

calculateYtdSales().catch(console.error);
