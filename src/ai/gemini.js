const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let model = null;

function initGemini() {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes('TU_GEMINI')) {
    console.warn('[Gemini] No valid API key configured — AI responses disabled');
    return false;
  }
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  model = genAI.getGenerativeModel({ model: modelName });
  return true;
}

const QUESTION_SYSTEM_PROMPT = `Eres un experto copywriter de ventas y neuro-marketing enfocado en comercio electrónico para un vendedor líder en Mercado Libre Colombia de domótica, tecnología y productos inteligentes.
Tu único objetivo es responder a los compradores potenciales con ALTA PERCEPCIÓN DE VALOR, seguridad absoluta, emoción positiva y un LLAMADO A LA ACCIÓN (CTA) motivador que cierre la compra de inmediato.

PRINCIPIOS DE NEUROCIENCIA Y MARKETING EMOCIONAL:
1. NUNCA DES RESPUESTAS EVASIVAS: Prohibido decir "voy a verificar", "déjame consultar" o "después te aviso". Responde con total seguridad, solvencia y claridad a la duda exacta del cliente.
2. PREGUNTAS CLAVE DE POLO A TIERRA / CABLE NEUTRO: Si el comprador pregunta si "funciona sin polo a tierra", "sin neutro" o "requiere neutro", aclara con total seguridad que ¡SÍ FUNCIONA PERFECTAMENTE! Explica que es Tecnología Híbrida Universal e INCLUYE GRATIS en la caja el Capacitor / Estabilizador de Luz. El capacitor se instala fácilmente en el bombillo (L1) y cumple la función de la línea neutra para alimentar el módulo WiFi sin necesidad de pasar cables adicionales ni romper paredes, evitando el parpadeo de las luces.
3. DISPONIBILIDAD DE VARIANTES Y COLORES (1, 2 Y 3 BOTONES EN BLANCO Y NEGRO): Contamos con las 6 variantes activas (1, 2 y 3 botones tanto en Blanco como en Negro). Si el comprador pregunta por disponibilidad de algún color o cantidad de botones, responde SIEMPRE que ¡SÍ TENEMOS DISPONIBILIDAD INMEDIATA! Explícale que puede seleccionar el color o modelo directamente en el desplegable de variantes de la publicación. Si en la publicación actual no le aparece activa esa variante específica, indícale amablemente que haga clic en "Ver más publicaciones del vendedor" donde encontrará la publicación de ese color/modelo con stock listo para despacho.
4. FACTURACIÓN ELECTRÓNICA Y LEGALIDAD: Si preguntan por Factura Electrónica, responde de forma protegida y profesional. Para ventas individuales entregamos documento de venta legal (Régimen No Responsable de IVA). Sin embargo, para compras al por mayor, volúmenes o montos grandes, SÍ gestionamos la factura electrónica según la cantidad de unidades requeridas. Invita al comprador a realizar la compra o indicarnos la cantidad deseada para coordinar por el chat de la compra.
5. CONECTA CON LO QUE EL COMPRADOR QUIERE ESCUCHAR Y SENTIR: Háblale de la comodidad de controlar su hogar, la seguridad de su inversión, la calidad superior de grado industrial (+100.000 clics) y el respaldo del producto.
6. ELEVA LA PERCEPCIÓN DE VALOR: Enmarca la respuesta destacando las ventajas únicas del producto (protección de voltaje certificada, vidrio templado de lujo, estabilizador de luz anti-parpadeo incluido gratis, asesoría técnica completa).
7. CIERRA SIEMPRE CON UN CTA ENERGÉTICO A LA COMPRA: Concluye invitando entusiastamente al comprador a realizar su pedido ya mismo (ej: "¡Anímate a realizar tu compra ahora y te lo despachamos hoy mismo con envío prioritario!").

REGLAS DE POLÍTICA Y FORMATO:
- NUNCA reveles que eres un bot o IA. Responde como el vendedor experto.
- NUNCA compartas datos de contacto externos (WhatsApp, teléfono, email, redes) ni links prohibidos — viola las políticas de Mercado Libre.
- Responde en texto plano puro sin markdown, sin HTML y sin asteriscos. Longitud ideal entre 200 y 450 caracteres.
- Español de Colombia amigable, cálido, seguro y profesional.`;

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
 * Safely generate content with automatic model fallback if quota (429) is hit
 */
async function safeGenerateContent(promptOrContents) {
  if (!model) {
    if (!initGemini()) return null;
  }
  try {
    return await model.generateContent(promptOrContents);
  } catch (error) {
    if (error.message && (error.message.includes('429') || error.message.includes('quota') || error.message.includes('Quota'))) {
      console.log('[Gemini] ⚠️ Cuota alcanzada en modelo principal. Probando alternativo (Lite)...');
      const testRes = await testConnection();
      if (testRes.ok && model) {
        try {
          return await model.generateContent(promptOrContents);
        } catch (err2) {
          console.error('[Gemini] Fallback model error:', err2.message);
        }
      }
    }
    throw error;
  }
}

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
    const result = await safeGenerateContent(prompt);
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
    const result = await safeGenerateContent(prompt);
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
    const result = await safeGenerateContent(prompt);
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

  const preferredModel = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  const modelsToTry = Array.from(new Set([
    preferredModel,
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.0-flash-lite',
    'gemini-2.0-flash',
  ]));
  const errors = [];
  let isQuotaExceeded = false;

  for (const mName of modelsToTry) {
    try {
      const testModel = genAI.getGenerativeModel({ model: mName });
      const result = await testModel.generateContent('Responde solo "OK" si puedes leer este mensaje.');
      model = testModel; // save working model
      return { ok: true, model: mName, response: result.response.text().trim() };
    } catch (err) {
      console.warn(`[Gemini] Model ${mName} failed:`, err.message);
      if (err.message && (err.message.includes('429') || err.message.includes('Quota exceeded') || err.message.includes('quota'))) {
        isQuotaExceeded = true;
      }
      errors.push(`${mName}: ${err.message}`);
    }
  }

  if (isQuotaExceeded) {
    return {
      ok: false,
      error: `Has superado la cuota gratuita de tu GEMINI_API_KEY en Google AI Studio (Límite de peticiones alcanzado). Espera unos segundos o genera una nueva API Key en aistudio.google.com/apikey`
    };
  }

  return {
    ok: false,
    error: `Error probando modelos de Gemini (${errors.join(' | ')}). Verifica tu GEMINI_API_KEY en aistudio.google.com/apikey`
  };
}

/**
 * Evaluate promotion strategy & margin using Gemini AI
 */
async function evaluatePromotionStrategy(productData, targetMarginPercent = 20) {
  if (!model) {
    if (!initGemini()) {
      const margin = productData.net_margin_percent || 0;
      return `Recomendación automática: Margen calculado del ${margin.toFixed(1)}%.`;
    }
  }

  const prompt = `Eres un consultor experto en comercio electrónico y estrategias de precios para Mercado Libre Colombia.
Analiza la siguiente propuesta de oferta/promoción y determina si es altamente rentable o si entraña riesgos de margen:

DATOS DEL PRODUCTO Y OFERTA:
- Producto: ${productData.title || 'Producto'}
- Precio Original / Lista: $${(productData.original_price || 0).toLocaleString('es-CO')} COP
- Precio Oferta Propuesto: $${(productData.promo_price || 0).toLocaleString('es-CO')} COP
- Descuento: ${(productData.discount_percent || 0).toFixed(1)}%
- Comisión Mercado Libre: ${productData.ml_commission_percent || 13}%
- Costo Envío estimado (Flex/Full): $${(productData.shipping_cost_cop || 0).toLocaleString('es-CO')} COP
- Costo de Adquisición (FOB/CIF Landed): $${(productData.product_cost_cop || 0).toLocaleString('es-CO')} COP
- Ganancia Neta Calculada: $${(productData.net_margin_cop || 0).toLocaleString('es-CO')} COP
- Margen Neto Calculado: ${(productData.net_margin_percent || 0).toFixed(1)}%
- Margen Mínimo Deseado: ${targetMarginPercent}%

INSTRUCCIONES:
1. Emite un dictamen claro (RECOMENDADO, PRECAUCIÓN o NO RECOMENDADO).
2. Justifica brevemente la razón (máximo 2 frases).
3. Responde en texto plano, en español de Colombia, máximo 280 caracteres.`;

  try {
    const result = await safeGenerateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('[Gemini] Error evaluating promotion strategy:', error.message);
    const margin = productData.net_margin_percent || 0;
    if (margin >= targetMarginPercent) {
      return `✅ RECOMENDADO: La oferta deja una ganancia neta del ${margin.toFixed(1)}% ($${(productData.net_margin_cop || 0).toLocaleString('es-CO')} COP).`;
    } else {
      return `⚠️ PRECAUCIÓN: El margen neto (${margin.toFixed(1)}%) está por debajo de tu objetivo del ${targetMarginPercent}%.`;
    }
  }
}

/**
 * Analyze product listing description and pictures to generate a rich AI product context
 */
async function generateMultimodalProductContext(itemData, descriptionText, imageParts = []) {
  if (!model) {
    if (!initGemini()) return null;
  }

  const attributesFormatted = Array.isArray(itemData.attributes)
    ? itemData.attributes.map(a => `- ${a.name}: ${a.value_name || (a.value_struct ? a.value_struct.number : '') || 'N/A'}`).join('\n')
    : 'No especificados';

  const textPrompt = `Eres un experto especialista en análisis de productos de comercio electrónico y atención al cliente en Mercado Libre Colombia.
Analiza detenidamente la siguiente publicación de producto, incluyendo su descripción textual, especificaciones y TODAS las imágenes adjuntas (afiches, diagramas, infografías y sellos).

INFORMACIÓN DE LA PUBLICACIÓN:
- Título: ${itemData.title || 'Sin título'}
- Precio: $${(itemData.price || 0).toLocaleString('es-CO')} COP
- Condición: ${itemData.condition === 'new' ? 'Nuevo' : 'Usado'}
- Atributos / Especificaciones:
${attributesFormatted}

DESCRIPCIÓN COMPLETA DE LA PUBLICACIÓN:
"""
${descriptionText || 'Sin descripción textual.'}
"""

REGLA CRÍTICA DE ANÁLISIS DE IMÁGENES (OCR E INFOGRAFÍAS A FONDO):
Inspecciona y LEE TODO EL TEXTO Y LOS DIAGRAMAS DENTRO DE CADA IMAGEN ADJUNTA. Las imágenes contienen los mayores elementos diferenciadores y ventajas competitivas de este producto frente a la competencia.

EXTRAE E INCLUYE OBLIGATORIAMENTE SI APARECEN EN FOTOS O EN TEXTO:
1. 🛡️ BLINDAJE DE VOLTAJE Y CERTIFICACIONES COLOMBIANAS:
   - Certificado de Seguridad Eléctrica Colombia (Ej: Certificado co.9019129 o similar).
   - "Único con blindaje de voltaje en Colombia" para proteger contra la red eléctrica inestable de Colombia, tormentas y picos de voltaje que queman interruptores genéricos.
   - Componentes de protección interna: Varistor de Protección contra Sobretensiones (MOV), Fusible de Acción Rápida y Filtro de Ruido Eléctrico.
2. 💎 GRADO DE CALIDAD Y COMPARATIVA (+100.000 CLICS):
   - Nivel de calidad: "Calidad Premium Certificada - Grado Industrial" con vida útil de más de 100.000 clics (comparado con 20.000 o 40.000 clics de versiones de baja/estándar calidad).
   - Panel de vidrio templado de alta resistencia a rayones, humedad e impactos.
   - Borneras de conexión traseras de grado industrial y sellos CE / RoHS / FCC.
3. 💡 ESTABILIZADOR DE LUZ / CAPACITADOR ANTI-PARPADEO GRATIS:
   - Inclusión GRATIS del Estabilizador de Luz en la compra (elimina el parpadeo molesto en bombillas LED o luces que quedan encendidas tenue en sistemas sin neutro).
4. 🔌 TECNOLOGÍA HÍBRIDA UNIVERSAL (CON O SIN CABLE NEUTRO):
   - Diagrama de cableado e instalación fácil para 1 Gang (1 botón), 2 Gang (2 botones) y 3 Gang (3 botones), en colores Blanco y Negro.
5. 📲 COMPATIBILIDAD CON SMART HOME:
   - Conexión Wi-Fi 2.4GHz con Tuya App, Smart Life, Alexa y Google Home.

Devuelve una síntesis estructurada clara con las siguientes secciones:

1. 📌 RESUMEN Y PUNTOS FUERTES DEL PRODUCTO
2. 🛡️ CERTIFICADOS, BLINDAJE Y SEGURIDAD ELÉCTRICA (Certificado Colombia co.9019129, MOV, Fusible, Filtro)
3. 💎 GRADO DE CALIDAD Y MATERIALES (+100.000 Clics industrial, Vidrio templado)
4. 🔌 INSTALACIÓN Y COMPATIBILIDAD (Con/Sin neutro, Estabilizador anti-parpadeo gratis incluido, 1/2/3 botones, Blanco/Negro)
5. 📷 DETALLES VISUALES DE LAS FOTOS E INFOGRAFÍAS
6. ❓ PREGUNTAS FRECUENTES Y RESPUESTAS RECOMENDADAS

Responde en texto claro en español de Colombia, estructurado y muy completo.`;

  try {
    const contents = [textPrompt, ...imageParts];
    const result = await safeGenerateContent(contents);
    return result.response.text().trim();
  } catch (error) {
    console.error('[Gemini] Error generating product AI context:', error.message);
    return null;
  }
}

module.exports = {
  initGemini,
  generateQuestionAnswer,
  generateMessageAnswer,
  generateClaimResponse,
  evaluatePromotionStrategy,
  generateMultimodalProductContext,
  testConnection,
};

