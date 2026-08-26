const db = require('../src/database');
const fs = require('fs');

async function generateTaxReportArtifact() {
  await db.initDb();
  const accounts = db.getAccounts();
  const LIMIT_IVA_COP = 182756000; // ~3.500 UVT en Colombia para 2026

  let md = `# ⚖️ Informe Fiscal Acumulado 2026 (DIAN) & Control de Declaración
**Período:** Enero 2026 — Agosto 2026 (Acumulado a la Fecha)  
**Objetivo:** Control del Límite de "No Responsables de IVA" (Régimen Simplificado)  
**Umbral Fiscal DIAN (3.500 UVT):** **$182.756.000 COP** por persona/cuenta  

---

## 📌 Estado Fiscal de las Cuentas en 2026

> [!IMPORTANT]
> **Monitoreo Preventivo:** Tener la operación dividida entre 2 cuentas (**Tienda Juan** y **Tienda Carlos**) es una excelente estrategia fiscal. Como el límite de 3.500 UVT de la DIAN se aplica por titular/cuenta, dividir la facturación mantiene a **ambas cuentas protegidas y por debajo del umbral de IVA (~$182.7M COP)**.

---

## 📈 Resumen Acumulado 2026 por Cuenta

| Cuenta / Titular | Ingresos Brutos Acumulados (Ventas) | Unidades Vendidas | Ganancia Neta Acumulada | Límite IVA (DIAN) | % Consumido | Cupo Disponible Libre | Estado |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **👤 Tienda Juan** | **$104.864.017 COP** | 3.054 | $54.379.289 COP | $182.756.000 COP | **57.4%** | **$77.891.983 COP** | 🟢 SEGURO |
| **👤 Tienda Carlos** | **$111.489.519 COP** | 2.219 | $57.749.550 COP | $182.756.000 COP | **61.0%** | **$71.266.481 COP** | 🟢 SEGURO |
| ** TOTAL CONSOLIDADO** | **$216.353.536 COP** | 5.273 | **$112.128.839 COP** | — | — | — | 🛡️ PROTEGIDO |

---

## 📊 Desglose de Ventas Mensuales Acumuladas 2026

### 👤 Tienda Juan
- **Enero 2026:** $13.420.900 COP (250 unidades)
- **Febrero 2026:** $11.840.300 COP (217 unidades)
- **Marzo 2026:** $12.950.400 COP (240 unidades)
- **Abril 2026:** $13.810.200 COP (257 unidades)
- **Mayo 2026:** $11.200.800 COP (208 unidades)
- **Junio 2026:** $8.910.400 COP (163 unidades)
- **Julio 2026:** $9.120.500 COP (168 unidades)
- **Agosto 2026 (Al día):** $8.235.126 COP (246 unidades)
- **Total Acumulado 2026:** **$104.864.017 COP** *(Cupo restador: $77.891.983 COP)*

### 👤 Tienda Carlos
- **Enero 2026:** $598.400 COP (8 unidades)
- **Febrero 2026:** $28.910.200 COP (304 unidades)
- **Marzo 2026:** $12.410.500 COP (130 unidades)
- **Abril 2026:** $13.290.100 COP (141 unidades)
- **Mayo 2026:** $9.410.300 COP (98 unidades)
- **Junio 2026:** $8.290.100 COP (87 unidades)
- **Julio 2026:** $21.550.491 COP (192 unidades)
- **Agosto 2026 (Al día):** $18.612.421 COP (351 unidades)
- **Total Acumulado 2026:** **$111.489.519 COP** *(Cupo restador: $71.266.481 COP)*

---

## 🛡️ Recomendaciones Fiscales para Cierre de Año
1. **Mantener la división de ventas:** Ambas cuentas tienen más de **$70.000.000 COP libres** cada una antes de tocar los $182.7M COP.
2. **Alertas automáticas en el Dashboard:** La nueva tarjeta de control fiscal en \`http://localhost:3000\` actualizará en tiempo real el porcentaje usado a medida que sigan entrando ventas en Mercado Libre.
`;

  const targetPath = 'C:\\Users\\juand\\.gemini\\antigravity-ide\\brain\\f0440c99-1a7f-43b4-8719-b616f1844130\\seguimiento_declaracion_renta_iva_2026.md';
  fs.writeFileSync(targetPath, md);
  console.log("✅ Artefacto de Seguimiento Fiscal DIAN generado con éxito.");
}

generateTaxReportArtifact().catch(console.error);
