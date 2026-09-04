const db = require('../src/database');

async function seed() {
  await db.initDb();
  const rawDb = db.getDb();

  console.log('--- Configurando Tienda Juan (Sin Publicidad) ---');
  // 1. Juan (Account 1): 0 COP
  rawDb.run('UPDATE accounts SET daily_ad_budget_cop = 0 WHERE id = 1');
  rawDb.run('DELETE FROM ad_budgets_history WHERE account_id = 1');
  rawDb.run(`
    INSERT INTO ad_budgets_history (account_id, daily_budget_cop, start_date, end_date, notes)
    VALUES (1, 0, '2026-07-01', NULL, 'Sin campañas de publicidad lanzadas')
  `);

  console.log('--- Configurando Tienda Carlos (Data Real Julio, Agosto y Septiembre) ---');
  // 2. Carlos (Account 2)
  rawDb.run('UPDATE accounts SET daily_ad_budget_cop = 9524 WHERE id = 2');
  rawDb.run('DELETE FROM ad_budgets_history WHERE account_id = 2');

  // Julio: $356.199 total en 31 días = ~11.490 COP/día
  rawDb.run(`
    INSERT INTO ad_budgets_history (account_id, daily_budget_cop, start_date, end_date, notes)
    VALUES (2, 11490.29, '2026-07-01', '2026-07-31', 'Inversión real Mercado Ads Julio ($356.199 COP - 15 ventas)')
  `);

  // Agosto: $1.499.896 total en 31 días = ~48.383,74 COP/día
  rawDb.run(`
    INSERT INTO ad_budgets_history (account_id, daily_budget_cop, start_date, end_date, notes)
    VALUES (2, 48383.74, '2026-08-01', '2026-08-31', 'Inversión real Mercado Ads Agosto ($1.499.896 COP - 97 ventas)')
  `);

  // Septiembre en adelante: $9.524 COP/día fijo en curso
  rawDb.run(`
    INSERT INTO ad_budgets_history (account_id, daily_budget_cop, start_date, end_date, notes)
    VALUES (2, 9524, '2026-09-01', NULL, 'Campaña activa actual Carlos ($9.524 COP/día)')
  `);

  // 3. Registrar en financial_expenses para que el mes cerrado de Julio y Agosto tengan la cifra EXACTA al centavo
  db.saveFinancialExpense({
    account_id: 2,
    period_month: 7,
    period_year: 2026,
    ad_spend_cop: 356199,
    returns_cost_cop: 0,
    extra_expenses_cop: 0,
    notes: 'Mercado Ads Julio: $356.199 COP (15 ventas, $1.722.400 ingresos, 295 clics, 61.076 impresiones)'
  });

  db.saveFinancialExpense({
    account_id: 2,
    period_month: 8,
    period_year: 2026,
    ad_spend_cop: 1499896,
    returns_cost_cop: 0,
    extra_expenses_cop: 0,
    notes: 'Mercado Ads Agosto: $1.499.896 COP (97 ventas, $8.123.666 ingresos, 1.767 clics, 301.666 impresiones)'
  });

  // Juan no tiene gastos en esos meses
  db.saveFinancialExpense({
    account_id: 1,
    period_month: 7,
    period_year: 2026,
    ad_spend_cop: 0,
    returns_cost_cop: 0,
    extra_expenses_cop: 0,
    notes: 'Sin publicidad'
  });

  db.saveFinancialExpense({
    account_id: 1,
    period_month: 8,
    period_year: 2026,
    ad_spend_cop: 0,
    returns_cost_cop: 0,
    extra_expenses_cop: 0,
    notes: 'Sin publicidad'
  });

  await db.forceSaveDb();
  console.log('✅ Base de datos actualizada con éxito con la data real de Mercado Ads!');

  // Validaciones
  console.log('\n--- Verificación Julio 2026 Carlos ---');
  const finJulio = db.getFinancialSummary(2, 7, 2026);
  console.log({
    mes: 'Julio 2026',
    ad_spend_cop: finJulio.ad_spend_cop,
    net_profit_cop: finJulio.net_profit_cop,
    ad_breakdown: finJulio.ad_breakdown
  });

  console.log('\n--- Verificación Agosto 2026 Carlos ---');
  const finAgosto = db.getFinancialSummary(2, 8, 2026);
  console.log({
    mes: 'Agosto 2026',
    ad_spend_cop: finAgosto.ad_spend_cop,
    net_profit_cop: finAgosto.net_profit_cop,
    ad_breakdown: finAgosto.ad_breakdown
  });

  console.log('\n--- Verificación Septiembre 2026 Carlos ---');
  const finSeptCarlos = db.getFinancialSummary(2, 9, 2026);
  console.log({
    mes: 'Septiembre 2026',
    ad_spend_cop: finSeptCarlos.ad_spend_cop, // Transcurrido (3 días)
    ad_spend_projected_cop: finSeptCarlos.ad_spend_projected_cop, // 30 días
    net_profit_cop: finSeptCarlos.net_profit_cop
  });

  console.log('\n--- Verificación Septiembre 2026 Juan ---');
  const finSeptJuan = db.getFinancialSummary(1, 9, 2026);
  console.log({
    mes: 'Septiembre 2026',
    ad_spend_cop: finSeptJuan.ad_spend_cop,
    ad_spend_projected_cop: finSeptJuan.ad_spend_projected_cop,
    net_profit_cop: finSeptJuan.net_profit_cop
  });
}

seed();
