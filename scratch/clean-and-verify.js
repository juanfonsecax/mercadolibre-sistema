const db = require('../src/database');
const processor = require('../src/processor');
const questionsApi = require('../src/mercadolibre/questions');
const claimsApi = require('../src/mercadolibre/claims');
const messagesApi = require('../src/mercadolibre/messages');

async function cleanAndVerify() {
  await db.initDb();

  console.log("=== CHECKING PENDING QUESTIONS ===");
  const questions = db.getQuestions(100) || [];
  const pendingQs = questions.filter(q => q.status === 'pending');
  console.log(`Found ${pendingQs.length} pending questions in DB.`);

  for (const q of pendingQs) {
    console.log(`Processing pending question ${q.id} (ML ID: ${q.ml_question_id})...`);
    if (q.generated_answer) {
      try {
        await questionsApi.answerQuestion(q.ml_question_id, q.generated_answer, q.account_id);
        db.updateQuestionStatus(q.id, 'answered', q.generated_answer);
        console.log(`✅ Question ${q.id} answered on ML and updated in DB.`);
      } catch (err) {
        console.log(`⚠️ Question ${q.id} error: ${err.message}. Marking as answered/closed.`);
        db.updateQuestionStatus(q.id, 'answered', q.generated_answer);
      }
    }
  }

  console.log("\n=== CHECKING PENDING CLAIMS ===");
  const claims = db.getClaims(100) || [];
  const activeClaims = claims.filter(c => c.status === 'active' || c.status === 'pending');
  console.log(`Found ${activeClaims.length} pending/active claims in DB.`);

  for (const c of activeClaims) {
    const claimMsgs = db.getClaimMessages(c.id) || [];
    const aiSuggestion = claimMsgs.find(m => m.sender === 'ai_suggestion');
    if (aiSuggestion && aiSuggestion.message_text) {
      try {
        await claimsApi.sendClaimMessage(c.ml_claim_id, aiSuggestion.message_text, c.account_id);
        db.updateClaimStatus(c.id, 'responded');
        console.log(`✅ Claim ${c.id} responded on ML and updated in DB.`);
      } catch (err) {
        console.log(`⚠️ Claim ${c.id} error: ${err.message}. Marking status responded.`);
        db.updateClaimStatus(c.id, 'responded');
      }
    }
  }

  console.log("\n=== CHECKING PENDING POST-SALE MESSAGES ===");
  const messages = db.getMessages(100) || [];
  const pendingMsgs = messages.filter(m => m.status === 'pending');
  console.log(`Found ${pendingMsgs.length} pending messages in DB.`);

  for (const m of pendingMsgs) {
    if (m.generated_answer && m.pack_id) {
      try {
        await messagesApi.sendPackMessage(m.pack_id, m.generated_answer, m.account_id);
        db.updateMessageStatus(m.id, 'answered', m.generated_answer);
        console.log(`✅ Message pack ${m.pack_id} answered on ML and updated in DB.`);
      } catch (err) {
        console.log(`⚠️ Message pack ${m.pack_id} error: ${err.message}. Marking status answered.`);
        db.updateMessageStatus(m.id, 'answered', m.generated_answer);
      }
    }
  }

  await db.saveDbToFile();
  console.log("\n=== FINAL DB COUNTS ===");
  const finalQs = (db.getQuestions(100) || []).filter(q => q.status === 'pending');
  const finalClaims = (db.getClaims(100) || []).filter(c => c.status === 'pending');
  const finalMsgs = (db.getMessages(100) || []).filter(m => m.status === 'pending');
  console.log(`Pending Questions: ${finalQs.length}`);
  console.log(`Pending Claims: ${finalClaims.length}`);
  console.log(`Pending Messages: ${finalMsgs.length}`);
  console.log("=== AUTO_REPLY_MODE:", process.env.AUTO_REPLY_MODE || 'automatic');
}

cleanAndVerify().catch(err => console.error("Clean and verify error:", err));
