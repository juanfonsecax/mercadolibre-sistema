const db = require('./database');
const questions = require('./mercadolibre/questions');
const claims = require('./mercadolibre/claims');
const messagesApi = require('./mercadolibre/messages');
const gemini = require('./ai/gemini');
const kb = require('./ai/knowledge-base');

/**
 * Process a new question from Mercado Libre for a specific account
 */
async function processQuestion(questionId, accountId = null) {
  try {
    const existing = db.getQuestionByMlId(String(questionId));
    if (existing) {
      console.log(`[Processor] Question ${questionId} already processed`);
      return existing;
    }

    console.log(`[Processor] Processing question ${questionId} (Account: ${accountId})...`);

    // 1. Get question details from ML
    const questionData = await questions.getQuestionDetails(questionId, accountId);
    const itemId = questionData.item_id;

    // 2. Get product info for context
    let productInfo = null;
    try {
      productInfo = await questions.getItemDetails(itemId, accountId);
      const description = await questions.getItemDescription(itemId, accountId);
      if (description && description.plain_text) {
        productInfo.description = description.plain_text;
      }
    } catch (error) {
      console.warn(`[Processor] Could not fetch item ${itemId}:`, error.message);
    }

    // 3. Get relevant knowledge base context
    const knowledgeContext = kb.getKnowledgeForItem(itemId);

    // 4. Generate AI response
    const generatedAnswer = await gemini.generateQuestionAnswer(
      questionData.text,
      productInfo,
      knowledgeContext
    );

    // 5. Determine status based on mode
    const mode = process.env.AUTO_REPLY_MODE || 'supervised';
    let status = 'pending';

    if (mode === 'automatic' && generatedAnswer) {
      try {
        await questions.answerQuestion(questionId, generatedAnswer, accountId);
        status = 'answered';
        console.log(`[Processor] ✅ Auto-replied to question ${questionId}`);
        db.logActivity('auto_answer', `Pregunta ${questionId} respondida automáticamente`, {
          question: questionData.text,
          answer: generatedAnswer,
        }, accountId);
        db.updateDailyStats('questions_answered', accountId);
      } catch (error) {
        const isAlreadyAnswered = error.message && (
          error.message.includes('not_unanswered_question') ||
          error.message.includes('is not unanswered')
        );
        const isItemInactive = error.message && (
          error.message.includes('not_active_item') ||
          error.message.includes('Item must be active')
        );
        if (isAlreadyAnswered) {
          status = 'answered';
          console.log(`[Processor] ℹ️ Pregunta ${questionId} ya estaba respondida en Mercado Libre`);
          db.logActivity('auto_answer_already_answered', `Pregunta ${questionId} ya estaba respondida previamente en Mercado Libre`, null, accountId);
        } else if (isItemInactive) {
          status = 'closed_item';
          console.log(`[Processor] ⚠️ Publicación de pregunta ${questionId} está inactiva/pausada en Mercado Libre`);
          db.logActivity('auto_answer_item_inactive', `No se pudo responder pregunta ${questionId} porque la publicación está inactiva en Mercado Libre`, null, accountId);
        } else {
          console.error(`[Processor] Error auto-replying:`, error.message);
          status = 'error';
          db.logActivity('auto_answer_error', `Error al responder pregunta ${questionId}`, { error: error.message }, accountId);
        }
      }
    } else {
      console.log(`[Processor] 📋 Question ${questionId} queued for review`);
      db.logActivity('question_queued', `Pregunta ${questionId} en espera de aprobación`, {
        question: questionData.text,
        suggested_answer: generatedAnswer,
      }, accountId);
    }

    // 6. Save to database
    db.saveQuestion({
      account_id: accountId,
      ml_question_id: String(questionId),
      ml_item_id: itemId,
      item_title: productInfo?.title || questionData.item_id,
      buyer_nickname: questionData.from?.nickname || 'Comprador',
      question_text: questionData.text,
      generated_answer: generatedAnswer,
      status: status,
    });

    db.updateDailyStats('questions_received', accountId);

    return db.getQuestionByMlId(String(questionId));
  } catch (error) {
    console.error(`[Processor] Error processing question ${questionId}:`, error.message);
    db.logActivity('process_error', `Error procesando pregunta ${questionId}`, { error: error.message }, accountId);
    return null;
  }
}

/**
 * Process a claim/dispute notification for a specific account
 */
async function processClaim(claimId, accountId = null) {
  try {
    const existing = db.getClaimByMlId(String(claimId));

    console.log(`[Processor] Processing claim ${claimId} (Account: ${accountId})...`);

    // 1. Get claim details & messages
    const claimData = await claims.getClaimDetails(claimId, accountId);
    const messagesList = await claims.getClaimMessages(claimId, accountId);

    // 2. Save claim if new
    if (!existing) {
      db.saveClaim({
        account_id: accountId,
        ml_claim_id: String(claimId),
        ml_order_id: String(claimData.resource_id || claimData.order_id || ''),
        claim_type: claimData.type || claimData.claim_type || 'unknown',
        claim_reason: claimData.reason || claimData.reason_id || 'No especificada',
        claim_status: claimData.status || 'opened',
        buyer_nickname: claimData.players?.complainant?.nickname || 'Comprador',
        item_title: claimData.resource?.title || '',
        status: 'active',
      });

      db.updateDailyStats('claims_received', accountId);
    }

    const claim = db.getClaimByMlId(String(claimId));

    // Save claim messages
    if (messagesList.length > 0 && claim) {
      messagesList.forEach(msg => {
        const msgText = msg.message || msg.text || '';
        if (msgText) {
          db.saveClaimMessage({
            claim_id: claim.id,
            ml_claim_id: String(claimId),
            sender: msg.sender_role || msg.role || 'unknown',
            message_text: msgText,
            is_auto: false,
          });
        }
      });
    }

    // 3. Generate AI response for the claim
    const knowledgeContext = kb.getKnowledgeForClaims();
    const generatedResponse = await gemini.generateClaimResponse(
      claim || claimData,
      messagesList,
      knowledgeContext
    );

    if (generatedResponse) {
      const mode = process.env.AUTO_REPLY_MODE || 'supervised';

      if (mode === 'automatic') {
        try {
          await claims.sendClaimMessage(claimId, generatedResponse, accountId);
          if (claim) db.updateClaimStatus(claim.id, 'responded');
          db.logActivity('auto_claim_response', `Reclamo ${claimId} respondido automáticamente`, null, accountId);
          db.updateDailyStats('claims_responded', accountId);
        } catch (error) {
          console.error(`[Processor] Error auto-responding to claim:`, error.message);
          db.logActivity('claim_error', `Error al responder reclamo ${claimId}`, { error: error.message }, accountId);
        }
      } else {
        console.log(`[Processor] 📋 Claim ${claimId} response queued for review`);
        db.logActivity('claim_queued', `Reclamo ${claimId} respuesta sugerida lista para revisión`, {
          suggested_response: generatedResponse,
        }, accountId);
      }

      if (claim) {
        db.saveClaimMessage({
          claim_id: claim.id,
          ml_claim_id: String(claimId),
          sender: 'ai_suggestion',
          message_text: generatedResponse,
          is_auto: true,
        });
      }
    }

    return claim;
  } catch (error) {
    console.error(`[Processor] Error processing claim ${claimId}:`, error.message);
    db.logActivity('process_error', `Error procesando reclamo ${claimId}`, { error: error.message }, accountId);
    return null;
  }
}

/**
 * Process a direct post-purchase message for a pack_id and account
 */
async function processMessage(packId, accountId = null) {
  try {
    console.log(`[Processor] Processing direct message for pack ${packId} (Account: ${accountId})...`);

    // 1. Fetch conversation history from ML
    const historyList = await messagesApi.getPackMessages(packId, accountId);
    if (!historyList || historyList.length === 0) {
      console.log(`[Processor] No messages found for pack ${packId}`);
      return null;
    }

    // Get last message
    const lastMsg = historyList[historyList.length - 1];
    const lastMsgText = lastMsg.text || lastMsg.message || '';
    const lastSender = lastMsg.from?.user_id || lastMsg.sender || 'buyer';

    // 2. Save or update message thread in DB
    const messageDbId = db.saveMessage({
      account_id: accountId,
      pack_id: String(packId),
      order_id: String(lastMsg.order_id || ''),
      buyer_nickname: lastMsg.from?.nickname || 'Comprador',
      item_title: lastMsg.item_title || 'Producto',
      last_message: lastMsgText,
      status: 'pending',
    });

    // Save message history
    historyList.forEach(m => {
      const text = m.text || m.message || '';
      if (text) {
        db.saveMessageHistory({
          message_id: messageDbId,
          pack_id: String(packId),
          sender: m.from?.role || m.sender || 'buyer',
          message_text: text,
          is_auto: false,
        });
      }
    });

    db.updateDailyStats('messages_received', accountId);

    // 3. Generate AI answer if last message was from buyer
    const knowledgeContext = kb.getKnowledgeForClaims();
    const generatedAnswer = await gemini.generateMessageAnswer(
      lastMsgText,
      historyList.map(h => ({ sender: h.from?.role === 'seller' ? 'seller' : 'buyer', message_text: h.text || h.message || '' })),
      null,
      knowledgeContext
    );

    if (generatedAnswer) {
      db.saveMessage({
        pack_id: String(packId),
        last_message: lastMsgText,
        generated_answer: generatedAnswer,
        status: 'pending',
      });

      db.saveMessageHistory({
        message_id: messageDbId,
        pack_id: String(packId),
        sender: 'ai_suggestion',
        message_text: generatedAnswer,
        is_auto: true,
      });

      const mode = process.env.AUTO_REPLY_MODE || 'supervised';
      if (mode === 'automatic') {
        try {
          await messagesApi.sendPackMessage(packId, generatedAnswer, accountId);
          db.updateMessageStatus(messageDbId, 'answered', generatedAnswer);
          db.logActivity('auto_message', `Mensaje post-compra paquete ${packId} respondido automáticamente`, null, accountId);
          db.updateDailyStats('messages_responded', accountId);
        } catch (error) {
          console.error(`[Processor] Error auto-responding to pack message ${packId}:`, error.message);
        }
      } else {
        db.logActivity('message_queued', `Mensaje post-compra paquete ${packId} en espera de aprobación`, {
          suggested_answer: generatedAnswer,
        }, accountId);
      }
    }

    return db.getMessageById(messageDbId);
  } catch (error) {
    console.error(`[Processor] Error processing message for pack ${packId}:`, error.message);
    db.logActivity('process_error', `Error procesando mensaje paquete ${packId}`, { error: error.message }, accountId);
    return null;
  }
}

/**
 * Approve and send a pending question answer
 */
async function approveQuestion(questionDbId, editedAnswer = null) {
  const question = db.getQuestionById(questionDbId);
  if (!question) throw new Error('Pregunta no encontrada');

  const answerText = editedAnswer || question.generated_answer;
  if (!answerText) throw new Error('No hay respuesta para enviar');

  try {
    await questions.answerQuestion(question.ml_question_id, answerText, question.account_id);
    db.updateQuestionStatus(questionDbId, 'answered', answerText);
    db.updateDailyStats('questions_answered', question.account_id);
    db.logActivity('question_approved', `Pregunta ${question.ml_question_id} aprobada y enviada`, { answer: answerText }, question.account_id);
    return { success: true };
  } catch (error) {
    const isAlreadyAnswered = error.message && (
      error.message.includes('not_unanswered_question') ||
      error.message.includes('is not unanswered')
    );
    const isItemInactive = error.message && (
      error.message.includes('not_active_item') ||
      error.message.includes('Item must be active')
    );
    if (isAlreadyAnswered) {
      db.updateQuestionStatus(questionDbId, 'answered', answerText);
      db.logActivity('question_already_answered', `La pregunta ${question.ml_question_id} ya fue respondida previamente en Mercado Libre. Se actualizó el estado en el sistema.`, { answer: answerText }, question.account_id);
      return {
        success: true,
        alreadyAnswered: true,
        message: 'La pregunta ya había sido respondida previamente en Mercado Libre. Se actualizó el estado en el sistema.'
      };
    }
    if (isItemInactive) {
      db.updateQuestionStatus(questionDbId, 'closed_item', answerText);
      db.logActivity('question_item_closed', `La pregunta ${question.ml_question_id} pertenece a una publicación pausada o finalizada en Mercado Libre.`, null, question.account_id);
      return {
        success: true,
        itemClosed: true,
        message: 'La publicación en Mercado Libre está pausada o cerrada. La pregunta se ha marcado como no disponible.'
      };
    }
    db.logActivity('approve_error', `Error al aprobar pregunta ${question.ml_question_id}`, { error: error.message }, question.account_id);
    throw error;
  }
}

/**
 * Approve and send a claim response
 */
async function approveClaimResponse(claimDbId, editedResponse = null) {
  const claim = db.getClaimById(claimDbId);
  if (!claim) throw new Error('Reclamo no encontrado');

  const claimMessagesList = db.getClaimMessages(claimDbId);
  const aiSuggestion = claimMessagesList.find(m => m.sender === 'ai_suggestion');
  const responseText = editedResponse || (aiSuggestion ? aiSuggestion.message_text : null);

  if (!responseText) throw new Error('No hay respuesta para enviar');

  try {
    await claims.sendClaimMessage(claim.ml_claim_id, responseText, claim.account_id);
    db.updateClaimStatus(claimDbId, 'responded');
    db.updateDailyStats('claims_responded', claim.account_id);
    db.logActivity('claim_approved', `Reclamo ${claim.ml_claim_id} respondido`, { response: responseText }, claim.account_id);
    return { success: true };
  } catch (error) {
    db.logActivity('claim_approve_error', `Error al responder reclamo ${claim.ml_claim_id}`, { error: error.message }, claim.account_id);
    throw error;
  }
}

/**
 * Approve and send a direct post-purchase message
 */
async function approveMessage(messageDbId, editedAnswer = null) {
  const messageObj = db.getMessageById(messageDbId);
  if (!messageObj) throw new Error('Mensaje no encontrado');

  const answerText = editedAnswer || messageObj.generated_answer;
  if (!answerText) throw new Error('No hay respuesta para enviar');

  try {
    await messagesApi.sendPackMessage(messageObj.pack_id, answerText, messageObj.account_id);
    db.updateMessageStatus(messageDbId, 'answered', answerText);
    db.updateDailyStats('messages_responded', messageObj.account_id);
    db.logActivity('message_approved', `Mensaje post-compra paquete ${messageObj.pack_id} respondido`, { answer: answerText }, messageObj.account_id);
    return { success: true };
  } catch (error) {
    db.logActivity('message_approve_error', `Error al responder mensaje ${messageObj.pack_id}`, { error: error.message }, messageObj.account_id);
    throw error;
  }
}

function rejectQuestion(questionDbId) {
  db.updateQuestionStatus(questionDbId, 'rejected');
  db.logActivity('question_rejected', `Pregunta ${questionDbId} rechazada`);
  return { success: true };
}

function rejectMessage(messageDbId) {
  db.updateMessageStatus(messageDbId, 'rejected');
  db.logActivity('message_rejected', `Mensaje ${messageDbId} rechazado`);
  return { success: true };
}

// ── Polling functions per account ──

async function pollQuestionsForAccount(accountId) {
  try {
    const unanswered = await questions.getUnansweredQuestions(accountId);
    let processed = 0;

    for (const q of unanswered) {
      const existing = db.getQuestionByMlId(String(q.id));
      if (!existing) {
        await processQuestion(q.id, accountId);
        processed++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    return processed;
  } catch (error) {
    console.error(`[Polling] Error polling questions for account ${accountId}:`, error.message);
    return 0;
  }
}

async function pollClaimsForAccount(accountId) {
  try {
    const openClaims = await claims.getOpenClaims(accountId);
    let processed = 0;

    if (Array.isArray(openClaims)) {
      for (const c of openClaims) {
        const claimId = c.id || c.claim_id;
        if (claimId) {
          const existing = db.getClaimByMlId(String(claimId));
          if (!existing) {
            await processClaim(claimId, accountId);
            processed++;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
    }
    return processed;
  } catch (error) {
    console.error(`[Polling] Error polling claims for account ${accountId}:`, error.message);
    return 0;
  }
}

async function pollMessagesForAccount(accountId) {
  try {
    const recentOrders = await messagesApi.getRecentOrders(accountId);
    let processed = 0;

    for (const order of recentOrders) {
      const packId = order.pack_id || order.id;
      if (packId) {
        const existing = db.getMessageByPackId(String(packId));
        if (!existing) {
          await processMessage(packId, accountId);
          processed++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    return processed;
  } catch (error) {
    console.error(`[Polling] Error polling messages for account ${accountId}:`, error.message);
    return 0;
  }
}

async function pollAll() {
  try {
    const accounts = db.getAccounts();
    for (const account of accounts) {
      const token = db.getToken(account.id);
      if (token && Date.now() < token.expires_at) {
        await pollQuestionsForAccount(account.id);
        await pollClaimsForAccount(account.id);
        await pollMessagesForAccount(account.id);
      }
    }
  } catch (error) {
    console.error('[Polling] Error in pollAll:', error.message);
  }
}

async function regenerateQuestionAnswer(questionId) {
  const question = db.getQuestionById(questionId);
  if (!question) throw new Error(`Pregunta ${questionId} no encontrada`);

  const itemId = question.ml_item_id;
  const accountId = question.account_id || 1;

  let productInfo = null;
  try {
    productInfo = await questions.getItemDetails(itemId, accountId);
    const description = await questions.getItemDescription(itemId, accountId);
    if (description && (description.plain_text || description.text)) {
      productInfo.description = description.plain_text || description.text;
    }
  } catch (error) {
    console.warn(`[Processor] Could not fetch item ${itemId}:`, error.message);
  }

  const knowledgeContext = kb.getKnowledgeForItem(itemId);
  const generatedAnswer = await gemini.generateQuestionAnswer(
    question.question_text,
    productInfo,
    knowledgeContext
  );

  if (generatedAnswer) {
    db.updateQuestionAnswer(questionId, generatedAnswer);
  } else {
    throw new Error('No se pudo generar la respuesta de la IA. Verifica que tu GEMINI_API_KEY esté configurada en el menú de Configuración.');
  }

  return db.getQuestionById(questionId);
}

module.exports = {
  processQuestion,
  processClaim,
  processMessage,
  approveQuestion,
  approveClaimResponse,
  approveMessage,
  rejectQuestion,
  rejectMessage,
  regenerateQuestionAnswer,
  pollQuestionsForAccount,
  pollClaimsForAccount,
  pollMessagesForAccount,
  pollAll,
};
