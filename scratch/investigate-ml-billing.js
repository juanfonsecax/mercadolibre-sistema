const db = require('../src/database');
const { mlFetch } = require('../src/mercadolibre/auth');

async function investigateBillingAndReturns() {
  await db.initDb();
  const accounts = db.getAccounts();

  for (const acc of accounts) {
    console.log(`\n==================================================`);
    console.log(`🔍 INVESTIGANDO APIS EN CUENTA: ${acc.name} (${acc.seller_id})`);
    console.log(`==================================================`);

    // 1. Endpoints de Billing / Facturación
    const billingEndpoints = [
      `/billing/user/sellers/${acc.seller_id}/periods`,
      `/billing/user/sellers/${acc.seller_id}/billing_documents`,
      `/billing/integration/group/ML/account/user/${acc.seller_id}/period/latest/details`,
      `/billing/integration/group/ML/account/user/${acc.seller_id}/details`,
      `/billing/integration/periods?user_id=${acc.seller_id}`,
      `/billing/integration/group/ML/advertiser/${acc.seller_id}/bills`,
      `/advertising/advertisers/${acc.seller_id}`,
      `/advertising/advertisers`,
      `/advertising/PADS/advertisers/${acc.seller_id}`
    ];

    console.log("\n--- 1. Pruebas de Facturación y Publicidad ---");
    for (const ep of billingEndpoints) {
      try {
        const res = await mlFetch(ep, acc.id);
        console.log(`  ✅ [${ep}]:`, JSON.stringify(res).slice(0, 300));
      } catch (err) {
        console.log(`  ⚠️ [${ep}]:`, err.message);
      }
    }

    // 2. Pruebas de Detalle de Reclamos y Envíos de Devolución
    console.log("\n--- 2. Pruebas de Costos de Envíos en Devoluciones ---");
    try {
      const claimsRes = await mlFetch(`/post-purchase/v1/claims/search?seller_id=${acc.seller_id}&status=closed&limit=3`, acc.id);
      const claims = claimsRes?.data || claimsRes?.results || [];

      for (const cl of claims) {
        console.log(`  🔍 Reclamo ID: ${cl.id}, Tipo: ${cl.type}, Stage: ${cl.stage}`);
        try {
          const clDetail = await mlFetch(`/post-purchase/v1/claims/${cl.id}`, acc.id);
          console.log(`     Detalle Reclamo:`, JSON.stringify(clDetail).slice(0, 250));

          // Consultar devolución si existe
          const returnsDetail = await mlFetch(`/post-purchase/v1/claims/${cl.id}/returns`, acc.id);
          console.log(`     Devolución Detail:`, JSON.stringify(returnsDetail).slice(0, 250));
        } catch (errDet) {
          console.log(`     Error en detalle reclamo:`, errDet.message);
        }
      }
    } catch (errClaims) {
      console.log(`  ⚠️ Error en claims:`, errClaims.message);
    }
  }
}

investigateBillingAndReturns().catch(console.error);
