const db = require('../database');

/**
 * Calculates the Ad Groups (Winners, Medium, Low/New) based on sales performance.
 * @param {number} accountId - The ML account ID to calculate for (e.g., Juan's account or Carlos).
 * @param {number|null} customBudget - Optional override for daily budget.
 */
function calculateAdGroups(accountId, customBudget = null) {
  const targetAccountId = accountId ? parseInt(accountId) : 1;
  const account = db.getAccountById(targetAccountId);

  // Daily budget: custom, or from account settings, or default (Carlos: 9524, Juan: 20000)
  const defaultBudget = targetAccountId === 2 ? 9524 : 20000;
  const TOTAL_BUDGET_COP = customBudget ? parseFloat(customBudget) : (account?.daily_ad_budget_cop || defaultBudget);

  // Fetch all items for this account using getMlFullInventory
  const items = db.getMlFullInventory(targetAccountId);

  const group1 = []; // Winners
  const group2 = []; // Medium
  const group3 = []; // Low/New

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

  // Calculate budgets proportionally to 7-9-14 (Total weight = 30)
  const TOTAL_WEIGHT = 7 + 9 + 14; // 30
  
  const budget1 = Math.round((7 / TOTAL_WEIGHT) * TOTAL_BUDGET_COP);
  const budget2 = Math.round((9 / TOTAL_WEIGHT) * TOTAL_BUDGET_COP);
  const budget3 = TOTAL_BUDGET_COP - budget1 - budget2; // Remainder to group 3

  return {
    accountId: targetAccountId,
    accountName: account?.name || `Cuenta #${targetAccountId}`,
    total_budget: Math.round(TOTAL_BUDGET_COP),
    monthly_estimated_cop: Math.round(TOTAL_BUDGET_COP * 30),
    groups: [
      {
        id: 1,
        name: '🏆 Grupo 1 (Winners / Alta Rotación)',
        description: 'Productos top. Si las ventas orgánicas suben, se puede bajar la publicidad.',
        budget_allocated: budget1,
        weight: 7,
        items: group1
      },
      {
        id: 2,
        name: '📈 Grupo 2 (Ventas Medias)',
        description: 'Ventas esporádicas. Publicidad constante para mantener rotación.',
        budget_allocated: budget2,
        weight: 9,
        items: group2
      },
      {
        id: 3,
        name: '🚀 Grupo 3 (Nuevos / Estancados)',
        description: 'Pocas o nulas ventas. Inyección de presupuesto para ganar visibilidad.',
        budget_allocated: budget3,
        weight: 14,
        items: group3
      }
    ]
  };
}

module.exports = {
  calculateAdGroups
};
