const { mlFetch } = require('./auth');
const db = require('../database');

/**
 * Get unanswered questions for a seller account
 */
async function getUnansweredQuestions(accountId) {
  const account = db.getAccountById(accountId);
  const sellerId = account?.seller_id || (db.getToken(accountId) || {}).seller_id;
  if (!sellerId) throw new Error(`No hay seller_id para la cuenta ${accountId}. Autentícate primero.`);

  const data = await mlFetch(`/questions/search?seller_id=${sellerId}&status=UNANSWERED&sort_fields=date_created&sort_types=DESC`, accountId);
  return data.questions || [];
}

/**
 * Get details for a specific question
 */
async function getQuestionDetails(questionId, accountId) {
  return mlFetch(`/questions/${questionId}`, accountId);
}

/**
 * Answer a question on Mercado Libre
 */
async function answerQuestion(questionId, text, accountId) {
  return mlFetch('/answers', accountId, {
    method: 'POST',
    body: JSON.stringify({
      question_id: questionId,
      text: text,
    }),
  });
}

/**
 * Get details for a specific item/product
 */
async function getItemDetails(itemId, accountId) {
  return mlFetch(`/items/${itemId}`, accountId);
}

/**
 * Get item description
 */
async function getItemDescription(itemId, accountId) {
  try {
    return await mlFetch(`/items/${itemId}/description`, accountId);
  } catch {
    return { plain_text: '', text: '' };
  }
}

/**
 * Get recently answered questions (for context)
 */
async function getRecentAnsweredQuestions(itemId, accountId, limit = 5) {
  try {
    const data = await mlFetch(`/questions/search?item=${itemId}&status=ANSWERED&sort_fields=date_created&sort_types=DESC&limit=${limit}`, accountId);
    return data.questions || [];
  } catch {
    return [];
  }
}

/**
 * Get all seller's active listings
 */
async function getSellerItems(accountId, limit = 50, offset = 0) {
  const account = db.getAccountById(accountId);
  const sellerId = account?.seller_id || (db.getToken(accountId) || {}).seller_id;
  if (!sellerId) throw new Error(`No hay seller_id para la cuenta ${accountId}.`);

  const data = await mlFetch(`/users/${sellerId}/items/search?limit=${limit}&offset=${offset}`, accountId);
  const itemIds = data.results || [];

  if (itemIds.length === 0) return [];

  const items = await Promise.all(
    itemIds.map(id => mlFetch(`/items/${id}`, accountId).catch(() => null))
  );

  return items.filter(Boolean);
}

module.exports = {
  getUnansweredQuestions,
  getQuestionDetails,
  answerQuestion,
  getItemDetails,
  getItemDescription,
  getRecentAnsweredQuestions,
  getSellerItems,
};
