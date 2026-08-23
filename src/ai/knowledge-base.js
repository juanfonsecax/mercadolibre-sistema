const db = require('../database');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

/**
 * Load knowledge base from JSON files and database
 * Returns all relevant knowledge for AI context
 */
function loadKnowledgeBase() {
  const knowledge = [];

  // Load from database first (edits from dashboard take priority)
  const dbKnowledge = db.getKnowledge();
  knowledge.push(...dbKnowledge);

  // Load from JSON files if database is empty
  if (dbKnowledge.length === 0) {
    loadFromFiles(knowledge);
  }

  return knowledge;
}

/**
 * Load knowledge from JSON data files
 */
function loadFromFiles(knowledge) {
  const files = [
    { path: path.join(DATA_DIR, 'products.json'), category: 'product' },
    { path: path.join(DATA_DIR, 'faqs.json'), category: 'faq' },
    { path: path.join(DATA_DIR, 'policies.json'), category: 'policy' },
  ];

  for (const file of files) {
    try {
      if (fs.existsSync(file.path)) {
        const data = JSON.parse(fs.readFileSync(file.path, 'utf8'));
        if (Array.isArray(data)) {
          data.forEach(item => {
            knowledge.push({
              category: file.category,
              title: item.title || item.name || item.question || 'Sin título',
              content: item.content || item.description || item.answer || JSON.stringify(item),
              ml_item_id: item.ml_item_id || null,
            });
          });
        }
      }
    } catch (error) {
      console.error(`[KnowledgeBase] Error loading ${file.path}:`, error.message);
    }
  }
}

/**
 * Get relevant knowledge for a specific product/item
 */
function getKnowledgeForItem(itemId) {
  const allKnowledge = loadKnowledgeBase();

  // Get product-specific knowledge from standard knowledge base
  const productKnowledge = allKnowledge.filter(k =>
    k.ml_item_id === itemId || k.category === 'faq' || k.category === 'policy'
  );

  // Check if we have an AI-synthesized product context (Etapa 1)
  if (itemId && db.getProductContextByItemId) {
    try {
      const pContext = db.getProductContextByItemId(itemId);
      if (pContext) {
        if (pContext.ai_generated_context) {
          productKnowledge.unshift({
            category: 'product_ai_context',
            title: `Contexto Avanzado IA: ${pContext.title}`,
            content: pContext.ai_generated_context,
            ml_item_id: itemId,
          });
        } else if (pContext.description_text) {
          productKnowledge.unshift({
            category: 'product_description',
            title: `Descripción Oficial: ${pContext.title}`,
            content: pContext.description_text,
            ml_item_id: itemId,
          });
        }
      }
    } catch (e) {
      console.warn(`[KnowledgeBase] Error loading product_context for ${itemId}:`, e.message);
    }
  }

  return productKnowledge;
}

/**
 * Get all knowledge for claims context (policies + FAQs)
 */
function getKnowledgeForClaims() {
  const allKnowledge = loadKnowledgeBase();
  return allKnowledge.filter(k => k.category === 'policy' || k.category === 'faq');
}

/**
 * Import product data from Mercado Libre listings into knowledge base
 */
function importProductToKnowledge(item) {
  const existing = db.getKnowledge('product').find(k => k.ml_item_id === item.id);

  const content = [
    `Título: ${item.title}`,
    `Precio: $${item.price?.toLocaleString('es-CO')} COP`,
    `Condición: ${item.condition === 'new' ? 'Nuevo' : 'Usado'}`,
    `Stock: ${item.available_quantity || 'Disponible'}`,
    item.shipping?.free_shipping ? 'Envío gratis' : 'Envío con costo',
  ].filter(Boolean).join('\n');

  if (existing) {
    db.updateKnowledge(existing.id, {
      title: item.title,
      content: content,
      ml_item_id: item.id,
    });
  } else {
    db.saveKnowledge({
      category: 'product',
      title: item.title,
      content: content,
      ml_item_id: item.id,
    });
  }
}

/**
 * Seed default policies if knowledge base is empty
 */
function seedDefaults() {
  const existing = db.getKnowledge();
  if (existing.length > 0) return;

  const defaults = [
    {
      category: 'policy',
      title: 'Política de envíos',
      content: 'Realizamos envíos a todo Colombia a través de Mercado Envíos. El tiempo de entrega es de 3 a 7 días hábiles dependiendo de la ciudad. Los envíos se procesan de lunes a viernes.',
    },
    {
      category: 'policy',
      title: 'Política de garantía',
      content: 'Todos nuestros productos cuentan con 30 días de garantía desde la fecha de recepción. Si tienes algún inconveniente, puedes iniciar un reclamo y te ayudaremos a resolverlo.',
    },
    {
      category: 'policy',
      title: 'Política de devoluciones',
      content: 'Aceptamos devoluciones dentro de los primeros 30 días si el producto presenta defectos o no corresponde a la descripción. El proceso se gestiona directamente por Mercado Libre.',
    },
    {
      category: 'faq',
      title: '¿Tienen disponibilidad?',
      content: 'Sí, todos los productos publicados están disponibles para compra inmediata. Si aparece en la publicación, lo tenemos en stock.',
    },
    {
      category: 'faq',
      title: '¿Hacen envío a mi ciudad?',
      content: 'Sí, hacemos envíos a todas las ciudades de Colombia a través de Mercado Envíos.',
    },
    {
      category: 'faq',
      title: '¿Cuánto demora el envío?',
      content: 'El tiempo de entrega depende de tu ciudad. Generalmente entre 3 y 7 días hábiles después del despacho.',
    },
  ];

  defaults.forEach(item => db.saveKnowledge(item));
  console.log('[KnowledgeBase] Default knowledge seeded');
}

/**
 * Import past answered questions from Mercado Libre API and convert them into FAQs
 */
async function importPastQuestionsToKnowledge(accountId = null) {
  const questionsApi = require('../mercadolibre/questions');

  let targetAccounts = [];
  if (accountId && accountId !== 'all') {
    targetAccounts = [{ id: parseInt(accountId) }];
  } else {
    targetAccounts = db.getAccounts();
    if (!targetAccounts || targetAccounts.length === 0) targetAccounts = [{ id: 1 }];
  }

  let totalImported = 0;

  for (const acc of targetAccounts) {
    try {
      console.log(`[KnowledgeBase] Fetching past answered questions for account ${acc.id}...`);
      const pastQuestions = await questionsApi.getAnsweredQuestionsForSeller(acc.id, 50, 0);

      if (!pastQuestions || pastQuestions.length === 0) continue;

      const itemGroups = {};
      pastQuestions.forEach(q => {
        const itemId = q.item_id;
        const qText = q.text || '';
        const aText = q.answer?.text || '';

        if (!qText || qText.length < 5 || !aText || aText.length < 3) return;
        const lowerQ = qText.toLowerCase();
        if (lowerQ === 'hola' || lowerQ === 'disponible?' || lowerQ === 'buenos dias' || lowerQ === 'buenas tardes') return;

        if (!itemGroups[itemId]) itemGroups[itemId] = [];
        itemGroups[itemId].push({ question: qText, answer: aText });
      });

      for (const [itemId, qaList] of Object.entries(itemGroups)) {
        if (qaList.length === 0) continue;

        const formattedFaqs = qaList.slice(0, 10).map(qa => `• Pregunta: ${qa.question}\n  Respuesta: ${qa.answer}`).join('\n\n');
        const title = `Preguntas Frecuentes Reales (${itemId})`;
        const content = `Historial de preguntas reales y respuestas oficiales de compradores para este producto:\n\n${formattedFaqs}`;

        const existingList = db.getKnowledge('faq');
        const existing = existingList.find(k => k.ml_item_id === itemId);
        if (existing) {
          db.updateKnowledge(existing.id, { title, content, ml_item_id: itemId });
        } else {
          db.saveKnowledge({ category: 'faq', title, content, ml_item_id: itemId });
        }

        totalImported += qaList.length;
      }
    } catch (err) {
      console.error(`[KnowledgeBase] Error importing past questions for account ${acc.id}:`, err.message);
    }
  }

  db.logActivity('import_faqs', `${totalImported} preguntas reales importadas a la base de conocimiento`, { count: totalImported });
  return totalImported;
}

module.exports = {
  loadKnowledgeBase,
  getKnowledgeForItem,
  getKnowledgeForClaims,
  importProductToKnowledge,
  importPastQuestionsToKnowledge,
  seedDefaults,
};
