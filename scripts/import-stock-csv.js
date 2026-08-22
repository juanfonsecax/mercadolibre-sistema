const fs = require('fs');
const path = require('path');
const db = require('../src/database');

const CSV_PATH = process.argv[2] || path.join(
  process.env.USERPROFILE || 'C:\\Users\\juand',
  'Downloads',
  'bffb9a92-9ca1-4354-8343-e968ed1b249d_ExportBlock-5e58d08d-31a2-49cd-a2cb-12fba117161b',
  'ExportBlock-5e58d08d-31a2-49cd-a2cb-12fba117161b-Part-1',
  'STOCK ACTUALIZADO AGOSTO14 26da272ac4798046b543fa349da3fa97.csv'
);

function parseCopPrice(str) {
  if (!str) return 0;
  // Format: "COP 8,406.00" or "COP 10,397,000.00"
  const clean = str.replace(/COP/gi, '').replace(/\s+/g, '').replace(/,/g, '');
  return parseFloat(clean) || 0;
}

function generateSku(productName) {
  return productName
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function categorizeProduct(name) {
  const n = name.toLowerCase();
  if (n.includes('panoxyl') || n.includes('eucerin') || n.includes('la roche') || n.includes('tocobo') || n.includes('fixodent') || n.includes('hair') || n.includes('vichy') || n.includes('mielle') || n.includes('neutrogena')) {
    return { category: 'Salud & Cuidado Personal', account_id: 1 }; // Tienda Juan
  }
  return { category: 'Domótica & Electrónica', account_id: 2 }; // Tienda Carlos
}

function extractFullStock(description) {
  if (!description) return 0;
  const match = description.match(/full\s*(\d+)/i);
  return match ? parseInt(match[1]) : 0;
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
  console.log(`[Importer] Leyendo CSV desde: ${CSV_PATH}`);

  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ Archivo CSV no encontrado en: ${CSV_PATH}`);
    process.exit(1);
  }

  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const rawLines = content.split(/\r?\n/);
  
  // Combine multi-line CSV entries if any
  const lines = [];
  let currentLine = '';
  for (const raw of rawLines) {
    if (currentLine) currentLine += ' ' + raw;
    else currentLine = raw;
    
    // Count quotes to check if balanced
    const quoteCount = (currentLine.match(/"/g) || []).length;
    if (quoteCount % 2 === 0) {
      lines.push(currentLine);
      currentLine = '';
    }
  }

  if (lines.length <= 1) {
    console.error('❌ El archivo CSV está vacío o sin datos');
    process.exit(1);
  }

  let importedLocal = 0;
  let importedFull = 0;

  // Process rows (skip header line 0)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    const productName = cols[0];
    if (!productName || productName.toUpperCase() === 'PRODUCTO') continue;

    // Skip discontinued products requested by user
    if (db.isProductDiscontinued(productName)) continue;

    const internetUnits = parseInt(cols[1] || 0) || 0;
    const piezaUnits = parseInt(cols[2] || 0) || 0;
    const salaUnits = parseInt(cols[3] || 0) || 0;
    const stockTotal = parseInt(cols[4] || 0) || (internetUnits + piezaUnits + salaUnits);
    const unitCostCop = parseCopPrice(cols[5]);
    const binNumber = cols[7] || '';

    // Only import items with physical house stock > 0
    if (stockTotal <= 0) continue;

    const sku = generateSku(productName);
    const { category, account_id } = categorizeProduct(productName);

    // Build location string
    const locationParts = [];
    if (binNumber) locationParts.push(`Estante #${binNumber}`);
    if (internetUnits > 0) locationParts.push(`Internet: ${internetUnits}`);
    if (piezaUnits > 0) locationParts.push(`Pieza: ${piezaUnits}`);
    if (salaUnits > 0) locationParts.push(`Sala: ${salaUnits}`);
    const location = locationParts.join(' | ') || 'Bodega Principal';

    // 1. Save or Update in local_inventory
    const existingLocal = db.getLocalInventory().find(x => x.sku === sku);
    db.saveLocalInventoryItem({
      id: existingLocal ? existingLocal.id : null,
      account_id,
      sku,
      title: productName,
      category,
      units_house: stockTotal,
      unit_cost_cop: unitCostCop,
      min_stock_alert: 15,
      location
    });
    importedLocal++;
  }

  db.saveDbToFile();

  console.log('');
  console.log(`✅ ¡Importación de Stock Casa completada exitosamente!`);
  console.log(`   - 🏠 Productos con Stock Físico en Casa (Units > 0): ${importedLocal}`);
  console.log('');
}

runImport().catch(err => {
  console.error('Fatal error during CSV import:', err);
  process.exit(1);
});
