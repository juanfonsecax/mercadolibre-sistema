const db = require('../src/database');

async function testFinancials() {
  await db.initDb();

  console.log("=== TESTING FINANCIAL SUMMARY ===");
  const summary = db.getFinancialSummary();
  console.log(JSON.stringify(summary, null, 2));

  console.log("\n=== TESTING SAVING EXPENSES ===");
  db.saveFinancialExpense({
    account_id: 1,
    period_month: new Date().getMonth() + 1,
    period_year: new Date().getFullYear(),
    ad_spend_cop: 250000,
    returns_cost_cop: 45000,
    extra_expenses_cop: 15000,
    notes: 'Prueba de ajuste de publicidad en campañas'
  });

  const updated = db.getFinancialSummary();
  console.log("\n=== UPDATED FINANCIAL SUMMARY ===");
  console.log("Ingresos Brutos:", summary.gross_sales_cop);
  console.log("Costo Mercancía (COGS):", updated.cogs_cop);
  console.log("Comisiones MeLi:", updated.meli_commissions_cop);
  console.log("Gastos Publicidad (Ads):", updated.ad_spend_cop);
  console.log("Devoluciones:", updated.returns_cost_cop);
  console.log("Utilidad Neta Real:", updated.net_profit_cop);
  console.log("Margen Neto %:", updated.net_margin_percent + "%");
  console.log("✅ FINANCIAL TEST PASSED SUCCESSFULLY!");
}

testFinancials().catch(err => console.error(err));
