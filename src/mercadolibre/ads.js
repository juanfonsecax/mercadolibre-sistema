const db = require('../database');

/**
 * Calculates the Ad Groups (Winners, Medium, Low/New) based on sales performance.
 * STRICT REQUIREMENT: Only products physically in stock in Mercado Envíos Full warehouse (Fase 3: ml_full_inventory, units_full > 0).
 * Any product with units_full <= 0 or not present in Full is completely excluded from Ads.
 * 
 * @param {number} accountId - The ML account ID to calculate for (1: Juan, 2: Carlos).
 * @param {number|null} customBudget - Optional override for daily budget.
 */
function calculateAdGroups(accountId, customBudget = null) {
  const targetAccountId = accountId ? parseInt(accountId) : 1;
  const account = db.getAccountById(targetAccountId);

  // Daily budget: custom, or from account settings, or default (Carlos: 9524, Juan: 0)
  const defaultBudget = targetAccountId === 2 ? 9524 : 0;
  const TOTAL_BUDGET_COP = customBudget ? parseFloat(customBudget) : (account?.daily_ad_budget_cop != null ? account.daily_ad_budget_cop : defaultBudget);

  // Fetch all items for this account from Fase 3 (ml_full_inventory)
  const allFullItems = db.getMlFullInventory(targetAccountId);

  // STRICT FILTER: Only products with physical stock in Mercado Libre Full warehouse (units_full > 0)
  const items = allFullItems.filter(item => (item.units_full || 0) > 0);

  const group1 = []; // Winners (>= 15 sales)
  const group2 = []; // Medium (5 - 14 sales)
  const group3 = []; // Low / New (< 5 sales)

  // Categorize based on sales_last_30d
  items.forEach(item => {
    const sales30 = item.sales_last_30d || 0;

    // Thresholds:
    // >= 15 sales in 30 days -> Winner (Group 1)
    // >= 5 and < 15 sales -> Medium (Group 2)
    // < 5 sales -> Low/New (Group 3)
    if (sales30 >= 15) {
      group1.push(item);
    } else if (sales30 >= 5) {
      group2.push(item);
    } else {
      group3.push(item);
    }
  });

  // Calculate budgets proportionally using 7-9-14 weights, but only for active groups that have products
  // Base weights: Group 1 = 7, Group 2 = 9, Group 3 = 14
  const w1 = group1.length > 0 ? 7 : 0;
  const w2 = group2.length > 0 ? 9 : 0;
  const w3 = group3.length > 0 ? 14 : 0;
  const totalActiveWeight = w1 + w2 + w3;

  let budget1 = 0;
  let budget2 = 0;
  let budget3 = 0;

  if (totalActiveWeight > 0 && TOTAL_BUDGET_COP > 0) {
    if (w1 > 0 && w2 > 0 && w3 > 0) {
      budget1 = Math.round((7 / 30) * TOTAL_BUDGET_COP);
      budget2 = Math.round((9 / 30) * TOTAL_BUDGET_COP);
      budget3 = TOTAL_BUDGET_COP - budget1 - budget2;
    } else if (w1 > 0 && w2 > 0 && w3 === 0) {
      // Carlos scenario: only G1 and G2 have Full stock (ratio 7 to 9)
      budget1 = Math.round((7 / 16) * TOTAL_BUDGET_COP);
      budget2 = TOTAL_BUDGET_COP - budget1;
      budget3 = 0;
    } else if (w1 > 0 && w2 === 0 && w3 > 0) {
      budget1 = Math.round((7 / 21) * TOTAL_BUDGET_COP);
      budget3 = TOTAL_BUDGET_COP - budget1;
      budget2 = 0;
    } else if (w1 === 0 && w2 > 0 && w3 > 0) {
      budget2 = Math.round((9 / 23) * TOTAL_BUDGET_COP);
      budget3 = TOTAL_BUDGET_COP - budget2;
      budget1 = 0;
    } else if (w1 > 0) {
      budget1 = TOTAL_BUDGET_COP;
    } else if (w2 > 0) {
      budget2 = TOTAL_BUDGET_COP;
    } else if (w3 > 0) {
      budget3 = TOTAL_BUDGET_COP;
    }
  }

  const totalFullUnits = items.reduce((acc, curr) => acc + (curr.units_full || 0), 0);

  return {
    accountId: targetAccountId,
    accountName: account?.name || `Cuenta #${targetAccountId}`,
    total_budget: Math.round(TOTAL_BUDGET_COP),
    monthly_estimated_cop: Math.round(TOTAL_BUDGET_COP * 30),
    total_items_full_stock: items.length,
    total_units_full_stock: totalFullUnits,
    groups: [
      {
        id: 1,
        name: '🏆 Grupo 1 (Winners / Alta Rotación)',
        description: 'Productos top con stock en Full. Si las ventas orgánicas suben, se puede calibrar la publicidad.',
        budget_allocated: budget1,
        weight: w1,
        items: group1
      },
      {
        id: 2,
        name: '📈 Grupo 2 (Ventas Medias)',
        description: 'Ventas constantes en Full. Publicidad balanceada para acelerar rotación.',
        budget_allocated: budget2,
        weight: w2,
        items: group2
      },
      {
        id: 3,
        name: '🚀 Grupo 3 (Nuevos / Estancados)',
        description: 'Pocas ventas pero disponibles en bodega Full. Impulso publicitario para ganar posicionamiento.',
        budget_allocated: budget3,
        weight: w3,
        items: group3
      }
    ]
  };
}

module.exports = {
  calculateAdGroups
};
