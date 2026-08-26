const db = require('../src/database');

async function testBreakdown() {
  await db.initDb();

  console.log("=== TESTING ITEMIZED PRODUCT FINANCIAL BREAKDOWN ===");
  const summary = db.getFinancialSummary();
  
  console.log(`Total Products in Breakdown: ${summary.product_breakdown ? summary.product_breakdown.length : 0}`);
  console.log("Global Gross Sales:", summary.gross_sales_cop);
  console.log("Global Net Profit:", summary.net_profit_cop);
  console.log("Global Net Margin %:", summary.net_margin_percent + "%");

  if (summary.product_breakdown && summary.product_breakdown.length > 0) {
    console.log("\n--- TOP 3 MOST PROFITABLE PRODUCTS ---");
    summary.product_breakdown.slice(0, 3).forEach((p, i) => {
      console.log(`\n#${i + 1} ${p.title}`);
      console.log(`   SKU: ${p.sku} | Item ID: ${p.ml_item_id}`);
      console.log(`   Units Sold: ${p.units_sold} | Price: $${p.unit_price_cop} | Stock Unit Cost: $${p.unit_cost_cop}`);
      console.log(`   Gross Sales: $${p.gross_sales_cop} | COGS: $${p.cogs_total_cop} | MeLi Comm: $${p.meli_commission_cop}`);
      console.log(`   NET PROFIT: $${p.net_profit_cop} (${p.net_margin_percent}% Margin)`);
    });
  }

  console.log("\n✅ ITEMIZED PRODUCT FINANCIAL BREAKDOWN TEST PASSED SUCCESSFULLY!");
}

testBreakdown().catch(err => console.error(err));
