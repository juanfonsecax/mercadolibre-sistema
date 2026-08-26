const db = require('../src/database');

async function run() {
  await db.initDb();
  const accounts = db.getAccounts();
  
  console.log("=== INFORME FINANCIERO MENSUAL 2026 (ENERO - AGOSTO) ===");
  
  for (let m = 1; m <= 8; m++) {
    const monthName = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto (al día de hoy)"][m - 1];
    console.log(`\n--- ${monthName} 2026 ---`);
    
    let totalGrossAll = 0;
    let totalNetAll = 0;
    let totalAdsAll = 0;

    for (const acc of accounts) {
      const summary = db.getFinancialSummary(acc.id, m, 2026);
      totalGrossAll += summary.gross_sales_cop;
      totalNetAll += summary.net_profit_cop;
      totalAdsAll += summary.ad_spend_cop;
      
      console.log(`  Store [${acc.name}]:`);
      console.log(`    - Ventas Brutas: $${summary.gross_sales_cop.toLocaleString('es-CO')} COP`);
      console.log(`    - Unidades Vendidas: ${summary.total_units_sold}`);
      console.log(`    - Costo de Mercadería (COGS): $${summary.cogs_cop.toLocaleString('es-CO')} COP`);
      console.log(`    - Comisiones Mercado Libre: $${summary.meli_commissions_cop.toLocaleString('es-CO')} COP`);
      console.log(`    - Gastos Publicidad (Ads): $${summary.ad_spend_cop.toLocaleString('es-CO')} COP`);
      console.log(`    - Devoluciones/Mermas: $${summary.returns_cost_cop.toLocaleString('es-CO')} COP`);
      console.log(`    - Ganancia Neta: $${summary.net_profit_cop.toLocaleString('es-CO')} COP (${summary.net_margin_percent}% margen)`);
    }

    console.log(`  TOTAL CONSOLIDADO MES (${monthName}):`);
    console.log(`    - Ventas Totales: $${totalGrossAll.toLocaleString('es-CO')} COP`);
    console.log(`    - Publicidad Total: $${totalAdsAll.toLocaleString('es-CO')} COP`);
    console.log(`    - Ganancia Neta Total: $${totalNetAll.toLocaleString('es-CO')} COP`);
  }
}

run().catch(console.error);
