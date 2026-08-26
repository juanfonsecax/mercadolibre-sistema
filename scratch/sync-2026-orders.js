const db = require('../src/database');
const { mlFetch } = require('../src/mercadolibre/auth');

async function syncAllHistoricalOrders() {
  await db.initDb();
  const accounts = db.getAccounts();

  console.log("=== SINCRONIZANDO HISTORIAL COMPLETO DE ÓRDENES (2025 - 2026) ===");

  const years = [2025, 2026];

  for (const acc of accounts) {
    console.log(`\n📦 Sincronizando órdenes de ${acc.name} (Seller ID: ${acc.seller_id})...`);
    let totalSyncedAccount = 0;

    for (const yr of years) {
      for (let m = 1; m <= 12; m++) {
        // Stop if future date beyond current date
        const now = new Date();
        if (yr === 2026 && m > (now.getMonth() + 1)) break;

        const padM = String(m).padStart(2, '0');
        const lastDay = new Date(yr, m, 0).getDate();
        const fromIso = `${yr}-${padM}-01T00:00:00.000-05:00`;
        const toIso = `${yr}-${padM}-${lastDay}T23:59:59.000-05:00`;

        let offset = 0;
        let totalOrders = Infinity;
        let monthSynced = 0;

        while (offset < totalOrders && offset < 1000) {
          try {
            const res = await mlFetch(
              `/orders/search?seller=${acc.seller_id}&order.date_created.from=${encodeURIComponent(fromIso)}&order.date_created.to=${encodeURIComponent(toIso)}&sort=date_desc&limit=50&offset=${offset}`,
              acc.id
            );

            totalOrders = res?.paging?.total || 0;
            const orders = res?.results || [];

            for (const ord of orders) {
              if (ord.status === 'cancelled') continue;

              const mlOrderId = String(ord.id);
              const dateCreated = ord.date_created || ord.date_closed;
              const totalAmount = parseFloat(ord.total_amount || 0);
              const buyerNickname = ord.buyer?.nickname || 'Cliente ML';
              const items = (ord.order_items || []).map(i => ({
                item_id: i.item?.id,
                title: i.item?.title,
                seller_sku: i.item?.seller_sku,
                quantity: i.quantity,
                unit_price: i.unit_price,
                full_unit_price: i.full_unit_price
              }));

              const existing = db.queryOne('SELECT id FROM ml_orders WHERE ml_order_id = ?', [mlOrderId]);
              if (existing) {
                db.runSql(
                  `UPDATE ml_orders SET date_created = ?, total_amount = ?, status = ?, buyer_nickname = ?, items_json = ? WHERE id = ?`,
                  [dateCreated, totalAmount, ord.status, buyerNickname, JSON.stringify(items), existing.id]
                );
              } else {
                db.runSql(
                  `INSERT INTO ml_orders (account_id, ml_order_id, date_created, total_amount, status, buyer_nickname, items_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  [acc.id, mlOrderId, dateCreated, totalAmount, ord.status, buyerNickname, JSON.stringify(items)]
                );
              }
              monthSynced++;
            }

            offset += orders.length;
            if (orders.length < 50) break;
          } catch (err) {
            console.error(`  ❌ Error sincronizando ${padM}/${yr} para ${acc.name}:`, err.message);
            break;
          }
        }

        if (monthSynced > 0) {
          console.log(`  📅 Mes ${padM}/${yr}: ${monthSynced} órdenes reales sincronizadas`);
        }
        totalSyncedAccount += monthSynced;
      }
    }

    console.log(`✅ Total ${acc.name}: ${totalSyncedAccount} órdenes históricas guardadas en DB.`);
  }

  await db.forceSaveDb();
  console.log("\n🎉 Sincronización completa de órdenes finalizada.");
}

syncAllHistoricalOrders().catch(console.error);
