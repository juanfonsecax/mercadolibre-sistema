const db = require('../src/database');

async function test() {
  await db.initDb();
  const septOrders = db.queryAll("SELECT id, account_id, date_created, total_amount FROM ml_orders WHERE date_created LIKE '2026-09-%'");
  console.log('September orders in DB:', septOrders.length, septOrders);
}

test();
