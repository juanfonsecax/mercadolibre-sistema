const db = require('../src/database');
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(
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

// Robust multiline CSV parser
function parseFullCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') i++;
      currentRow.push(currentVal.trim());
      if (currentRow.some(c => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }

  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    rows.push(currentRow);
  }

  return rows;
}

async function run() {
  await db.initDb();
  const text = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseFullCSV(text);

  db.getDb().run('DELETE FROM china_shipments');

  let count = 0;
  rows.forEach((cols, idx) => {
    const productName = cols[0] ? cols[0].replace(/^"|"$/g, '').trim() : '';
    if (!productName || productName.toUpperCase().includes('PRODUCT') || productName.toUpperCase().includes('PEDIR') || productName.toUpperCase().includes('SEPRODUCTS')) return;

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

    let finalWineryDate = chineseWineryDate;
    let finalEtaDate = etaDate;
    if (productName.toLowerCase().includes('gafas') && (productName.toLowerCase().includes('se') || productName.toLowerCase().includes('sñr') || productName.toLowerCase().includes('senora') || productName.toLowerCase().includes('señora'))) {
      finalWineryDate = '10/07/2026';
      finalEtaDate = 'October 8, 2026';
    }

    let deliveryStatus = cols[32] || '';
    if (!deliveryStatus) {
      if (rawStatus === 'House') deliveryStatus = 'RECIBIDO EN CASA';
      else if (rawStatus === 'In China') deliveryStatus = 'EN CHINA';
      else deliveryStatus = 'EN CAMINO';
    }

    db.saveChinaShipment({
      product_name: productName,
      notion_link: notionLink,
      quantity,
      chinese_winery_date: finalWineryDate,
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
      eta_date: finalEtaDate,
      days_to_arrive: daysToArrive,
      active_transit_units: activeTransitUnits,
      delivery_status: deliveryStatus
    });

    count++;
  });

  db.saveDbToFile();
  console.log('✅ IMPORTER COMPLETED. Total products imported:', count);
  const dbRows = db.getChinaShipments();
  console.log('✅ DB TOTAL ROWS:', dbRows.length);
}

run();
