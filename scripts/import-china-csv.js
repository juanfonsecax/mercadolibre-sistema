const fs = require('fs');
const path = require('path');
const db = require('../src/database');

const CSV_PATH = process.argv[2] || path.join(
  process.env.USERPROFILE || 'C:\\Users\\juand',
  'Downloads',
  'cc19263a-067c-466c-a026-d584baf5b822_ExportBlock-407fe7a0-d86d-45a2-bc40-ba80a6ad0359',
  'ExportBlock-407fe7a0-d86d-45a2-bc40-ba80a6ad0359-Part-1',
  'IMPORTACIONES 2026 2fea272ac4798074beb0c2a33a525493.csv'
);

function parseCopPrice(str) {
  if (!str) return 0;
  const clean = str.replace(/COP/gi, '').replace(/\s+/g, '').replace(/,/g, '');
  return parseFloat(clean) || 0;
}

function parsePercent(str) {
  if (!str) return 0;
  const clean = str.replace(/%/g, '').replace(/\s+/g, '').replace(/,/g, '');
  return parseFloat(clean) || 0;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

async function runImport() {
  await db.initDb();
  console.log(`[China Importer] Leyendo CSV desde: ${CSV_PATH}`);

  let filePath = CSV_PATH;
  if (!fs.existsSync(filePath)) {
    filePath = path.join(
      process.env.USERPROFILE || 'C:\\Users\\juand',
      'Downloads',
      '8a1add21-c770-42e3-bc2b-76304640d553_ExportBlock-2761deb1-683b-42bd-b42e-eae935b6ef9c',
      'ExportBlock-2761deb1-683b-42bd-b42e-eae935b6ef9c-Part-1',
      'IMPORTACIONES 2026 2fea272ac4798074beb0c2a33a525493.csv'
    );
  }

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Archivo CSV de importaciones no encontrado`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const rawLines = content.split(/\r?\n/);
  
  const lines = [];
  let currentLine = '';
  for (const raw of rawLines) {
    if (currentLine) currentLine += ' ' + raw;
    else currentLine = raw;
    
    const quoteCount = (currentLine.match(/"/g) || []).length;
    if (quoteCount % 2 === 0) {
      lines.push(currentLine);
      currentLine = '';
    }
  }

  // Clear existing importations before reload
  db.getDb().run('DELETE FROM china_shipments');

  let importedShipments = 0;

  // Header is line 2 (starts from index 3)
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    const productName = cols[0];
    if (!productName || productName.toUpperCase() === 'PRODUCTS') continue;

    const notionLink = cols[1] || '';
    const quantity = parseInt(cols[2] || 0) || 0;
    const chineseWineryDate = cols[3] || '';
    const agency = cols[4] || 'William';
    const supply = cols[5] || 'Alibaba';
    const rawStatus = cols[8] || 'In progress';
    const totalPriceCop = parseCopPrice(cols[9]);
    const boxes = parseInt(cols[10] || 0) || 0;
    const lengthM = parseFloat(cols[11] || 0) || 0;
    const heightM = parseFloat(cols[12] || 0) || 0;
    const widthM = parseFloat(cols[13] || 0) || 0;
    const cubicMeter = parseFloat(cols[14] || 0) || (boxes * lengthM * heightM * widthM);
    const containerM3Cost = parseCopPrice(cols[15]);
    const importCostCop = parseCopPrice(cols[16]);
    const nationalFreightCop = parseCopPrice(cols[17]);
    const fullCostCop = parseCopPrice(cols[18]);
    const extraExpensesCop = parseCopPrice(cols[19]);
    const unitCostCop = parseCopPrice(cols[20]);
    const totalCostCop = parseCopPrice(cols[21]);
    const priceMlCop = parseCopPrice(cols[22]);
    const commissionMlCop = parseCopPrice(cols[23]);
    const incomeCop = parseCopPrice(cols[24]);
    const marginPercent = parsePercent(cols[25]);
    const totalProfitCop = parseCopPrice(cols[26]);
    const totalMoneyCop = parseCopPrice(cols[27]);
    const paymentCard = cols[28] || '';
    const etaDate = cols[29] || '';
    const daysToArrive = parseInt(cols[30] || 0) || 0;
    const activeTransitUnits = parseInt(cols[31] || 0) || 0;
    const deliveryStatus = cols[32] || 'EN CAMINO';

    db.saveChinaShipment({
      product_name: productName,
      notion_link: notionLink,
      quantity,
      chinese_winery_date: chineseWineryDate,
      agency,
      supply,
      status: rawStatus,
      total_price_cop: totalPriceCop,
      boxes,
      length_m: lengthM,
      height_m: heightM,
      width_m: widthM,
      cubic_meter: cubicMeter,
      container_m3_cost: containerM3Cost,
      import_cost_cop: importCostCop,
      national_freight_cop: nationalFreightCop,
      full_cost_cop: fullCostCop,
      extra_expenses_cop: extraExpensesCop,
      unit_cost_cop: unitCostCop,
      total_cost_cop: totalCostCop,
      price_ml_cop: priceMlCop,
      commission_ml_cop: commissionMlCop,
      income_cop: incomeCop,
      margin_percent: marginPercent,
      total_profit_cop: totalProfitCop,
      total_money_cop: totalMoneyCop,
      payment_card: paymentCard,
      eta_date: etaDate,
      days_to_arrive: daysToArrive,
      active_transit_units: activeTransitUnits,
      delivery_status: deliveryStatus
    });

    importedShipments++;
  }

  console.log('');
  console.log(`✅ ¡Importación completa de Embarques China 2026!`);
  console.log(`   - 🚢 Filas/Importaciones procesadas: ${importedShipments}`);
  console.log('');
}

runImport().catch(err => {
  console.error('Fatal error importing china CSV:', err);
  process.exit(1);
});
