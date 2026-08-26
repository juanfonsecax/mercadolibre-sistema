const db = require('../src/database');

async function main() {
  await db.initDb();
  
  console.log('=== ACCOUNTS ===');
  const accounts = db.getAccounts();
  console.log(JSON.stringify(accounts, null, 2));

  console.log('\n=== KNOWLEDGE BASE (SAMPLE) ===');
  const kbItems = db.getKnowledge();
  console.log(`Total KB items: ${kbItems.length}`);
  kbItems.slice(0, 5).forEach(k => {
    console.log(`- [${k.category}] ${k.title}: ${k.content ? k.content.substring(0, 80) : ''}...`);
  });

  console.log('\n=== PRODUCT CONTEXTS (SAMPLE) ===');
  const pcItems = db.getProductContexts();
  console.log(`Total Product Contexts: ${pcItems.length}`);
  pcItems.slice(0, 5).forEach(pc => {
    console.log(`- Item ID: ${pc.ml_item_id} | Title: ${pc.title}`);
  });

  console.log('\n=== RECENT QUESTIONS ===');
  const questions = db.getQuestions(10);
  console.log(`Total questions in db: ${questions ? questions.length : 0}`);
  if (questions && questions.length > 0) {
    questions.slice(0, 5).forEach(q => {
      console.log(`- Item: ${q.item_title} | Buyer: ${q.buyer_nickname}`);
      console.log(`  Q: ${q.question_text}`);
      console.log(`  A: ${q.generated_answer}`);
      console.log(`  Status: ${q.status}`);
    });
  }

  console.log('\n=== RECENT CLAIMS ===');
  const claims = db.getClaims(5);
  console.log(`Total claims in db: ${claims ? claims.length : 0}`);
  if (claims && claims.length > 0) {
    claims.forEach(c => {
      console.log(`- Claim #${c.ml_claim_id} | Reason: ${c.claim_reason} | Status: ${c.claim_status}`);
    });
  }

  console.log('\n=== RECENT MESSAGES ===');
  const messages = db.getMessages(5);
  console.log(`Total messages in db: ${messages ? messages.length : 0}`);
  if (messages && messages.length > 0) {
    messages.forEach(m => {
      console.log(`- Pack #${m.pack_id} | Buyer: ${m.buyer_nickname} | Last msg: ${m.last_message}`);
    });
  }
}

main().catch(err => console.error(err));
