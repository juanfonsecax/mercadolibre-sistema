const db = require('../src/database');
const { mlFetch } = require('../src/mercadolibre/auth');

async function testApis() {
  await db.initDb();
  const accounts = db.getAccounts();

  console.log("=== PROBANDO APIS DE MERCADO LIBRE POR CUENTA ===");

  for (const acc of accounts) {
    console.log(`\n==============================================`);
    console.log(`🔍 CUENTA: ${acc.name} (ID: ${acc.id}, SellerID: ${acc.seller_id})`);
    console.log(`==============================================`);

    // 1. Probar consulta de Órdenes mes por mes en 2026
    for (let m = 1; m <= 8; m++) {
      const padM = String(m).padStart(2, '0');
      const lastDay = new Date(2026, m, 0).getDate();
      const fromIso = `2026-${padM}-01T00:00:00.000-05:00`;
      const toIso = `2026-${padM}-${lastDay}T23:59:59.000-05:00`;

      try {
        const ordersData = await mlFetch(
          `/orders/search?seller=${acc.seller_id}&order.date_created.from=${encodeURIComponent(fromIso)}&order.date_created.to=${encodeURIComponent(toIso)}&limit=1`,
          acc.id
        );
        const totalOrders = ordersData?.paging?.total || 0;
        console.log(`  📅 Mes ${padM}/2026: ${totalOrders} órdenes encontradas en ML API`);
      } catch (err) {
        console.error(`  ❌ Error en mes ${padM}/2026:`, err.message);
      }
    }

    // 2. Probar API de Publicidad (Product Ads / Advertising)
    console.log(`\n  📢 Probando endpoints de Publicidad (Mercado Ads / Product Ads)...`);
    const adEndpoints = [
      `/advertising/product_ads/campaigns?seller_id=${acc.seller_id}`,
      `/advertising/advertisers/${acc.seller_id}/campaigns`,
      `/advertising/advertisers/${acc.seller_id}/reports`,
      `/billing/user/${acc.seller_id}/periods`
    ];

    for (const ep of adEndpoints) {
      try {
        const adData = await mlFetch(ep, acc.id);
        console.log(`    ✅ Success [${ep}]:`, JSON.stringify(adData).slice(0, 200));
      } catch (err) {
        console.log(`    ⚠️ Warning/Error [${ep}]:`, err.message);
      }
    }

    // 3. Probar API de Reclamos / Devoluciones
    console.log(`\n  📦 Probando API de Reclamos y Devoluciones (Claims)...`);
    try {
      const claimsData = await mlFetch(`/claims/search?status=opened,closed&limit=10`, acc.id);
      const claimsList = claimsData?.data || claimsData?.results || [];
      console.log(`    ✅ Success [/claims/search]: ${claimsList.length} reclamos/devoluciones encontrados`);
      if (claimsList.length > 0) {
        console.log(`    Muestra de Reclamo:`, JSON.stringify(claimsList[0]).slice(0, 200));
      }
    } catch (err) {
      console.log(`    ⚠️ Error en claims:`, err.message);
    }
  }
}

testApis().catch(console.error);
