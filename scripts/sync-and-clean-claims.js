const db = require('../src/database');

async function cleanAndSyncClaims() {
  await db.initDb();
  console.log('[Script] Limpiando novedades antiguas y configurando los 2 casos activos...');

  // 1. Marcar reclamos antiguos como resueltos/archivados
  db.getDb().run(
    `UPDATE claims SET status = 'resolved' WHERE ml_order_id NOT IN ('2000017937600006', '2000014308421461')`
  );

  // 2. Caso 1: Venta #2000017937600006 (Carlos Ivan Garcia Cabrera - Chapa/Cerradura Inteligente)
  let claim1 = db.getClaimByMlId('5563162261');
  if (!claim1) {
    db.saveClaim({
      account_id: 1,
      ml_claim_id: '5563162261',
      ml_order_id: '2000017937600006',
      claim_type: 'mediations',
      claim_reason: 'Producto manipulado / tornillo dañado y rotado por el cliente',
      claim_status: 'opened',
      buyer_nickname: 'Carlos Ivan Garcia Cabrera',
      item_title: 'Cerradura / Chapa Inteligente con Baterías',
      status: 'active',
    });
    claim1 = db.getClaimByMlId('5563162261');
  } else {
    db.getDb().run(
      `UPDATE claims SET buyer_nickname = ?, item_title = ?, claim_reason = ?, status = 'active' WHERE id = ?`,
      ['Carlos Ivan Garcia Cabrera', 'Cerradura / Chapa Inteligente con Baterías', 'Producto manipulado / tornillo dañado y rotado por el cliente', claim1.id]
    );
  }

  if (claim1) {
    db.saveClaimMessage({
      claim_id: claim1.id,
      ml_claim_id: '5563162261',
      sender: 'complainant',
      message_text: 'Carlos Ivan Garcia Cabrera (14 ago 14:42 hs): el producto ya fue manipulado, tiene el tornillo completamente destruido y rotado, adicional no trae manual de instalación toca buscar tutoriales y el tornillo de apertura de la parte 2 donde se ponen las baterias esta dañado, no se puede ajustar ya que lo han forzado con anterioridad.',
      is_auto: false,
    });
  }

  // 3. Caso 2: Venta #2000014308421461 (Luis Eduardo Florez Martinez - Switch 3 Botones / Devolución en revisión)
  let claim2 = db.getClaimByMlId('556014308421461');
  if (!claim2) {
    db.saveClaim({
      account_id: 1,
      ml_claim_id: '556014308421461',
      ml_order_id: '2000014308421461',
      claim_type: 'returns',
      claim_reason: 'Devolución en revisión (Servientrega 2296011012)',
      claim_status: 'opened',
      buyer_nickname: 'Luis Eduardo Florez Martinez',
      item_title: 'Switch Interruptor Tactil Wifi Alexa Google Sin/con Neutro Blanco 3 Botones',
      status: 'active',
    });
    claim2 = db.getClaimByMlId('556014308421461');
  } else {
    db.getDb().run(
      `UPDATE claims SET buyer_nickname = ?, item_title = ?, claim_reason = ?, status = 'active' WHERE id = ?`,
      ['Luis Eduardo Florez Martinez', 'Switch Interruptor Tactil Wifi Alexa Google Sin/con Neutro Blanco 3 Botones', 'Devolución en revisión (Servientrega 2296011012)', claim2.id]
    );
  }

  if (claim2) {
    db.saveClaimMessage({
      claim_id: claim2.id,
      ml_claim_id: '556014308421461',
      sender: 'mediator',
      message_text: 'Luis Eduardo Florez Martinez (3 ago 16:40 hs) - Devolución en revisión: Estamos comprobando el estado del producto. Te avisaremos el resultado el miércoles 26 de agosto. Código de seguimiento Servientrega: 2296011012.',
      is_auto: false,
    });
  }

  await db.saveDbToFile();
  console.log('[Script] ✅ Novedades limpiadas e histórico actualizado con éxito.');
  process.exit(0);
}

cleanAndSyncClaims().catch(e => {
  console.error('[Script] Error:', e.message);
  process.exit(1);
});
