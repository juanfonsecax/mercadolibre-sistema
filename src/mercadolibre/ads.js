const db = require('../database');

/**
 * Calculates the Ad Groups (Winners, Medium, Low/New) based on sales performance.
 * @param {number} accountId - The ML account ID to calculate for (e.g., Juan's account).
 */
function calculateAdGroups(accountId) {
  // Fetch all items for this account
  const sql = `
    SELECT f.*, m.master_product_title 
    FROM ml_full_inventory f
    LEFT JOIN product_mappings m ON f.ml_item_id = m.ml_item_id
    WHERE f.account_id = ? AND f.status = 'active'
  `;
  const items = db.queryAll(sql, [accountId]);

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

  // Calculate budgets proportionally to 7-9-14
  const TOTAL_BUDGET_COP = 20000;
  const TOTAL_WEIGHT = 7 + 9 + 14; // 30
  
  const budget1 = Math.round((7 / TOTAL_WEIGHT) * TOTAL_BUDGET_COP);
  const budget2 = Math.round((9 / TOTAL_WEIGHT) * TOTAL_BUDGET_COP);
  const budget3 = TOTAL_BUDGET_COP - budget1 - budget2; // Remainder to group 3

  return {
    accountId,
    total_budget: TOTAL_BUDGET_COP,
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
