const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let model = null;

function initGemini() {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes('TU_GEMINI')) {
    console.warn('[Gemini] No valid API key configured — AI responses disabled');
    return false;
  }
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  model = genAI.getGenerativeModel({ model: modelName });
  return true;
}

const QUESTION_SYSTEM_PROMPT = `Eres un asistente virtual de ventas para un vendedor de Mercado Libre en Colombia especializado en tecnología, domótica y productos inteligentes. Tu trabajo es responder preguntas de compradores potenciales de manera profesional, amigable y persuasiva.

REGLAS ESTRICTAS:
1. NUNCA reveles que eres un bot o inteligencia artificial. Responde como si fueras el vendedor.
2. NUNCA inventes información que no esté en el contexto proporcionado.
3. Si no tienes la información para responder, di algo como "¡Hola! Con gusto, permíteme verificar eso y te respondo pronto."
4. Usa un tono amigable, cercano pero profesional. Puedes usar "¡" y emojis moderadamente.
5. Las respuestas deben ser CONCISAS (máximo 350 caracteres idealmente, nunca más de 500).
6. Si la pregunta es sobre disponibilidad, siempre confirma que hay stock salvo que el contexto diga lo contrario.
7. Si preguntan por envío, responde según las políticas de envío del contexto.
8. Si preguntan por garantía, responde según las políticas de garantía del contexto.
9. NUNCA compartas datos de contacto (WhatsApp, teléfono, email, redes sociales) — esto viola las políticas de Mercado Libre.
10. Siempre intenta motivar la compra de forma sutil.
11. Responde en español colombiano natural.
12. NUNCA uses markdown, HTML, ni formato especial — solo texto plano.`;

const MESSAGE_SYSTEM_PROMPT = `Eres un asistente de atención post-venta para un vendedor de Mercado Libre Colombia de productos de domótica y tecnología inteligente. El cliente ya compró el producto y te escribe por mensaje privado post-venta.

REGLAS ESTRICTAS:
1. NUNCA reveles que eres un bot o IA.
2. El comprador ya pagó, así que sé extremadamente servicial, amable y paciente.
3. Si pregunta por soporte técnico, configuración o apps (Tuya, Smart Life, Alexa, Google Home), explica amablemente los pasos de vinculación.
4. Si pregunta por el estado del envío o guía, indícale amablemente que puede rastrear la guía desde el detalle de su compra en Mercado Libre.
5. NUNCA compartas enlaces ni datos de contacto externos prohibidos por ML.
6. Mantén la respuesta amigable, clara y soluciónalos rápido.
7. Máximo 450 caracteres. Solo texto plano.`;

const CLAIM_SYSTEM_PROMPT = `Eres un asistente de servicio al cliente para un vendedor de Mercado Libre en Colombia. Tu trabajo es responder a reclamos y novedades post-venta de manera empática, profesional y orientada a resolver el problema.

REGLAS ESTRICTAS:
1. NUNCA reveles que eres un bot o inteligencia artificial.
2. Sé empático con el comprador — reconoce su frustración antes de ofrecer soluciones.
3. Ofrece soluciones concretas según las políticas del vendedor.
4. Si el problema es de envío (paquete no llegó, demora), sugiere verificar el tracking y asegura que se está haciendo seguimiento.
5. Si el problema es de calidad del producto, ofrece reemplazo o solución según la política de garantía.
6. NUNCA aceptes reembolsos ni tomes decisiones financieras — solo ofrece comunicarte para resolver.
7. NUNCA compartas datos de contacto externos.
8. Mantén un tono comprensivo y profesional.
9. Respuestas de máximo 500 caracteres.
10. Responde en español colombiano natural.
11. NUNCA uses markdown, HTML, ni formato especial — solo texto plano.`;

/**
 * Generate an AI-powered answer for a buyer's question
 */
async function generateQuestionAnswer(questionText, productInfo, knowledgeContext) {
  if (!model) {
    if (!initGemini()) return null;
  }

  const contextParts = [];

  if (productInfo) {
    contextParts.push(`PRODUCTO: ${productInfo.title || 'Sin título'}
Precio: ${productInfo.price ? `$${productInfo.price.toLocaleString('es-CO')} COP` : 'No disponible'}
Estado: ${productInfo.condition === 'new' ? 'Nuevo' : 'Usado'}
Stock disponible: ${productInfo.available_quantity || 'Disponible'}
${productInfo.description ? `Descripción: ${productInfo.description}` : ''}`);
  }

  if (knowledgeContext && knowledgeContext.length > 0) {
    contextParts.push('INFORMACIÓN ADICIONAL DEL VENDEDOR:');
    knowledgeContext.forEach(item => {
      contextParts.push(`[${item.category.toUpperCase()}] ${item.title}: ${item.content}`);
    });
  }

  const prompt = `${QUESTION_SYSTEM_PROMPT}

CONTEXTO:
${contextParts.join('\n\n')}

PREGUNTA DEL COMPRADOR:
"${questionText}"

Genera una respuesta natural, concisa y amigable para esta pregunta. Solo devuelve la respuesta, sin explicaciones adicionales.`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();
    return response.replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error('[Gemini] Error generating question answer:', error.message);
    return null;
  }
}

/**
 * Generate an AI-powered answer for a post-purchase direct message
 */
async function generateMessageAnswer(messageText, history, productInfo, knowledgeContext) {
  if (!model) {
    if (!initGemini()) return null;
  }

  const contextParts = [];

  if (productInfo) {
    contextParts.push(`PRODUCTO ADQUIRIDO: ${productInfo.title || 'Sin título'}`);
  }

  if (history && history.length > 0) {
    contextParts.push('HISTORIAL DE LA CONVERSACIÓN:');
    history.forEach(m => {
      contextParts.push(`${m.sender === 'buyer' ? 'COMPRADOR' : 'VENDEDOR'}: ${m.message_text}`);
    });
  }

  if (knowledgeContext && knowledgeContext.length > 0) {
    contextParts.push('BASE DE CONOCIMIENTO Y POLÍTICAS:');
    knowledgeContext.forEach(item => {
      contextParts.push(`[${item.category.toUpperCase()}] ${item.title}: ${item.content}`);
    });
  }

  const prompt = `${MESSAGE_SYSTEM_PROMPT}

CONTEXTO DE LA VENTA:
${contextParts.join('\n\n')}

ÚLTIMO MENSAJE RECIBIDO DEL COMPRADOR:
"${messageText}"

Genera una respuesta amigable, clara y soluciónalos rápido. Solo devuelve la respuesta, sin explicaciones adicionales.`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();
    return response.replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error('[Gemini] Error generating message answer:', error.message);
    return null;
  }
}

/**
 * Generate an AI-powered response for a claim/dispute
 */
async function generateClaimResponse(claimDetails, messages, knowledgeContext) {
  if (!model) {
    if (!initGemini()) return null;
  }

  const contextParts = [];

  if (claimDetails) {
    contextParts.push(`TIPO DE RECLAMO: ${claimDetails.claim_type || claimDetails.type || 'No especificado'}
RAZÓN: ${claimDetails.claim_reason || claimDetails.reason || 'No especificada'}
ESTADO: ${claimDetails.claim_status || claimDetails.status || 'Abierto'}
PRODUCTO: ${claimDetails.item_title || 'No especificado'}`);
  }

  if (messages && messages.length > 0) {
    contextParts.push('HISTORIAL DE MENSAJES:');
    messages.forEach(msg => {
      const sender = msg.sender === 'complainant' ? 'COMPRADOR' : 'VENDEDOR';
      contextParts.push(`${sender}: ${msg.message_text || msg.text || msg.message}`);
    });
  }

  if (knowledgeContext && knowledgeContext.length > 0) {
    contextParts.push('POLÍTICAS DEL VENDEDOR:');
    knowledgeContext.forEach(item => {
      contextParts.push(`[${item.category.toUpperCase()}] ${item.title}: ${item.content}`);
    });
  }

  const prompt = `${CLAIM_SYSTEM_PROMPT}

CONTEXTO:
${contextParts.join('\n\n')}

Genera una respuesta empática y orientada a resolver el problema. Solo devuelve la respuesta, sin explicaciones adicionales.`;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();
    return response.replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error('[Gemini] Error generating claim response:', error.message);
    return null;
  }
}

/**
 * Test the Gemini connection
 */
async function testConnection() {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes('TU_GEMINI')) {
    return {
      ok: false,
      error: 'No has agregado la clave GEMINI_API_KEY en las variables de entorno de Render (o en tu archivo .env). Obtén tu clave en aistudio.google.com/apikey'
    };
  }

  if (!genAI) {
    initGemini();
  }

  const modelsToTry = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'];
  let lastError = '';

  for (const mName of modelsToTry) {
    try {
      const testModel = genAI.getGenerativeModel({ model: mName });
      const result = await testModel.generateContent('Responde solo "OK" si puedes leer este mensaje.');
      model = testModel; // save working model
      return { ok: true, model: mName, response: result.response.text().trim() };
    } catch (err) {
      console.warn(`[Gemini] Model ${mName} failed:`, err.message);
      lastError = err.message;
    }
  }

  return { ok: false, error: `Error conectando con Gemini: ${lastError || 'Verifica que tu API Key esté activa en Google AI Studio.'}` };
}

module.exports = {
  initGemini,
  generateQuestionAnswer,
  generateMessageAnswer,
  generateClaimResponse,
  testConnection,
};
