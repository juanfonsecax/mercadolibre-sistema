const db = require('../src/database');
const { mlFetch } = require('../src/mercadolibre/auth');

async function testClaims() {
  await db.initDb();
  const accounts = db.getAccounts();

  for (const acc of accounts) {
    console.log(`\n🔍 CUENTA: ${acc.name} (${acc.seller_id})`);
    
    // Probar varios filtros en /post-purchase/v1/claims/search
    const filters = [
      `status=opened`,
      `status=closed`,
      `stage=dispute`,
      `stage=claim`,
      `stage=return`,
      `type=return`
    ];

    for (const f of filters) {
      try {
        const res = await mlFetch(`/post-purchase/v1/claims/search?seller_id=${acc.seller_id}&${f}&limit=10`, acc.id);
        const list = res?.data || res?.results || [];
        console.log(`  ✅ Filter [${f}]: Total = ${res?.paging?.total || list.length} items`);
        if (list.length > 0) {
          console.log(`     Sample claim ID:`, list[0].id, list[0].type, list[0].stage, list[0].status);
        }
      } catch (err) {
        console.log(`  ⚠️ Filter [${f}]:`, err.message);
      }
    }
  }
}

testClaims().catch(console.error);
