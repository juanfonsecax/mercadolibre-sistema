const db = require('../src/database');

async function test() {
  await db.initDb();
  const latest = db.queryAll("SELECT id, account_id, date_created, total_amount FROM ml_orders ORDER BY date_created DESC LIMIT 5");
  console.log('Latest orders in DB:', latest);
}

test();
