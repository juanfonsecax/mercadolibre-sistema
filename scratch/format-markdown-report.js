const db = require('../src/database');
const fs = require('fs');

async function buildReportArtifact() {
  await db.initDb();
  const accs = db.getAccounts();
  const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto (Al día)'];

  let md = `# 📊 Informe Financiero Mensual Real (API Mercado Libre)
**Período:** Enero 2026 — Agosto 2026 (Auditoría Real por Órdenes)  
**Sistema:** Mercado Libre Bot Multi-Cuenta  
**Cuentas Auditadas:** Tienda Juan & Tienda Carlos  

---

## 🎯 Correcciones y Mejoras Implementadas

> [!IMPORTANT]
> 1. **Órdenes Reales por Mes (API de Mercado Libre):** Ya no se muestran cifras repetidas. Cada mes consulta exactamente las ventas u órdenes registradas en Mercado Libre para ese período.
> 2. **Publicidad (Mercado Ads):** Tienda Juan queda fijada en **$0 COP** por defecto. Para Tienda Carlos se permite ingresar el presupuesto pagado en Ads sin afectar a Juan.
> 3. **Devoluciones y Reclamos:** Se calculan a partir de los reclamos reales registrados en la API (\`/post-purchase/v1/claims\`).
> 4. **Selector de Mes y Año en la Web:** Se añadió un control desplegable en \`http://localhost:3000\` para consultar las finanzas de cualquier mes (Enero a Diciembre) de 2026 o 2025 al instante.

---

## 📈 Cierres Mensuales Reales 2026 (Consolidado)

| Mes | Ventas Brutas Totales (COP) | Unidades Vendidas | Costos Productos (COGS) | Comisiones ML (COP) | Publicidad (Ads) | Devoluciones / Mermas | Ganancia Neta Total (COP) | Margen Neto |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
`;

  for (let m = 1; m <= 8; m++) {
    let gross = 0, units = 0, cogs = 0, comm = 0, ads = 0, ret = 0, net = 0;
    accs.forEach(a => {
      const s = db.getFinancialSummary(a.id, m, 2026);
      gross += s.gross_sales_cop;
      units += s.total_units_sold;
      cogs += s.cogs_cop;
      comm += s.meli_commissions_cop;
      ads += s.ad_spend_cop;
      ret += s.returns_cost_cop;
      net += s.net_profit_cop;
    });

    const margin = gross > 0 ? ((net / gross) * 100).toFixed(1) : '0.0';
    md += `| **${monthNames[m - 1]} 2026** | $${gross.toLocaleString('es-CO')} | ${units} | $${cogs.toLocaleString('es-CO')} | $${comm.toLocaleString('es-CO')} | $${ads.toLocaleString('es-CO')} | $${ret.toLocaleString('es-CO')} | **$${net.toLocaleString('es-CO')}** | ${margin}% |\n`;
  }

  md += `\n---\n\n## 🏪 Desglose por Cuenta (Mes de Agosto 2026)\n\n`;

  for (const a of accs) {
    const s = db.getFinancialSummary(a.id, 8, 2026);
    md += `### 👤 ${a.name}\n`;
    md += `* **Ventas Brutas:** $${s.gross_sales_cop.toLocaleString('es-CO')} COP\n`;
    md += `* **Unidades Vendidas:** ${s.total_units_sold} unidades\n`;
    md += `* **Costo de Mercadería (COGS):** $${s.cogs_cop.toLocaleString('es-CO')} COP\n`;
    md += `* **Comisiones Mercado Libre:** $${s.meli_commissions_cop.toLocaleString('es-CO')} COP\n`;
    md += `* **Gastos Publicidad (Ads):** $${s.ad_spend_cop.toLocaleString('es-CO')} COP\n`;
    md += `* **Devoluciones y Mermas (Claims):** $${s.returns_cost_cop.toLocaleString('es-CO')} COP\n`;
    md += `* **Ganancia Neta Líquida:** **$${s.net_profit_cop.toLocaleString('es-CO')} COP** *(Margen Neto: ${s.net_margin_percent}%)\n\n`;
  }

  const targetPath = 'C:\\Users\\juand\\.gemini\\antigravity-ide\\brain\\f0440c99-1a7f-43b4-8719-b616f1844130\\informe_financiero_mensual_2026.md';
  fs.writeFileSync(targetPath, md);
  console.log("✅ Artefacto de Informe Financiero Actualizado exitosamente.");
}

buildReportArtifact().catch(console.error);
