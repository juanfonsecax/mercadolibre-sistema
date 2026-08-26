const db = require('../src/database');
const gemini = require('../src/ai/gemini');

async function testSim() {
  await db.initDb();
  
  const testQuestion = "¿Hola amigo funciona si mi casa no tiene cable neutro? ¿Y si no me gusta la puedo devolver?";
  const productInfo = {
    title: "Interruptor Inteligente Wifi Con O Sin Neutro Con Capacitor Negro | 2 Botones",
    price: 45000,
    condition: "new",
    available_quantity: 15,
    description: "Interruptor inteligente táctil wifi de 2 botones. Funciona con o sin cable neutro. Incluye capacitor estabilizador de luz."
  };
  const kbContext = db.getKnowledge();

  console.log("--- PROMPT TEST FOR QUESTION ---");
  const answer = await gemini.generateQuestionAnswer(testQuestion, productInfo, kbContext);
  console.log("GENERATED ANSWER:");
  console.log(answer);
}

testSim().catch(err => console.error(err));
