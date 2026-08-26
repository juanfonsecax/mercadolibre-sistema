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
5. COMPATIBILIDAD CON ASISTENTES DE VOZ Y HOMEKIT: Si el comprador pregunta por Apple HomeKit, aclara amablemente que NO es un dispositivo nativo HomeKit, pero es 100% compatible con Amazon Alexa, Google Home y mediante comandos de voz de Siri (Siri Shortcuts / Atajos de Siri) desde cualquier dispositivo Apple usando la App Tuya / Smart Life.
6. CONECTA CON LO QUE EL COMPRADOR QUIERE ESCUCHAR Y SENTIR: Háblale de la comodidad de controlar su hogar, la seguridad de su inversión, la calidad superior de grado industrial (+100.000 clics) y el respaldo del producto.
7. ELEVA LA PERCEPCIÓN DE VALOR: Enmarca la respuesta destacando las ventajas únicas del producto (protección de voltaje certificada, vidrio templado de lujo, estabilizador de luz anti-parpadeo incluido gratis, asesoría técnica completa).
8. CIERRA SIEMPRE CON UN CTA ENERGÉTICO A LA COMPRA: Concluye invitando entusiastamente al comprador a realizar su pedido ya mismo (ej: "¡Anímate a realizar tu compra ahora y te lo despachamos hoy mismo con envío prioritario!").

REGLAS DE POLÍTICA Y FORMATO:
- NUNCA reveles que eres un bot o IA. Responde como el vendedor experto.
- NUNCA compartas datos de contacto externos (WhatsApp, teléfono, email, redes) ni links prohibidos — viola las políticas de Mercado Libre.
- Responde en texto plano puro sin markdown, sin HTML y sin asteriscos. Longitud ideal entre 200 y 450 caracteres.
- Español de Colombia amigable, cálido, seguro y profesional.`;

const MESSAGE_SYSTEM_PROMPT = `Eres un asistente de atención post-venta para un vendedor de Mercado Libre Colombia de productos de domótica y tecnología inteligente. El cliente ya compró el producto y te escribe por mensaje privado post-venta.

REGLAS ESTRICTAS:
1. NUNCA reveles que eres un bot o IA.
2. El comprador ya pagó, así que sé extremadamente servicial, amable y paciente.
3. Si pregunta por soporte técnico, configuración o fallas de funcionamiento, entrega una explicación clara de la solución y PÍDELE AMABLEMENTE QUE ADJUNTE UNA FOTO O IMAGEN por este chat mostrando cómo tiene realizada la conexión eléctrica o instalación física para que el equipo técnico valide su caso adecuadamente.
4. Si pregunta por el estado del envío o guía, indícale amablemente que puede rastrear la guía desde el detalle de su compra en Mercado Libre.
5. NUNCA compartas enlaces ni datos de contacto externos prohibidos por ML.
6. Mantén la respuesta amigable, clara y soluciónalos rápido.
7. Máximo 450 caracteres. Solo texto plano.`;

const CLAIM_SYSTEM_PROMPT = `Eres un experto especialista en atención post-venta, resolución técnica y mediación neuro-persuasiva para un vendedor de tecnología y domótica en Mercado Libre Colombia.
Tu objetivo supremo es responder a los reclamos y novedades DE MANERA 100% RELEVANTE Y ESPECÍFICA a la queja exacta del comprador y la IA de Mercado Libre, defendiendo al vendedor, demostrando la calidad del producto y solucionando la duda sin perder reputación ni generar cobros de envío por devolución.

REGLA DE ORO DE PERTINENCIA TÉCNICA (OBLIGATORIO):
1. RESPONDER DIRECTAMENTE A LA NOVEDAD ESPECÍFICA Y AL TIPO DE PRODUCTO:
   - Lee detenidamente el TÍTULO DEL PRODUCTO, TIPO DE RECLAMO, MOTIVO y MENSAJE DEL COMPRADOR.
   - Si el producto es un TOMACORRIENTE / ENCHUFE (Smart Plug / Socket) y el comprador reclama por Amperaje (16A / 10A / 15A), Voltaje (110V-240V), Potencia (3500W-3800W max) o puesta a tierra: Responde ESPECÍFICAMENTE sobre el tomacorriente y sus especificaciones técnicas de corriente y voltaje. ¡PROHIBIDO mencionar interruptores, polo a tierra o capacitores de luz si el producto es un tomacorriente/enchufe!
   - Si el producto es un INTERRUPTOR Y PARPADEO DE LUZ: Explica la instalación del capacitor gratis en L1 y tecnología híbrida universal.
   - Si el comprador reclama por CONFIGURACIÓN WI-FI O APP: Entrega los pasos exactos de la red 2.4GHz en Tuya / Smart Life.
   - Si el comprador reclama por SOBRETENSIÓN O QUE CORTÓ LA LUZ: Menciona el varistor de protección MOV y revisión de breaker/fase.
   - SOLICITUD DE EVIDENCIA FOTOGRÁFICA DE CONEXIÓN: Para soporte técnico o reclamos por funcionamiento, pídele amablemente al comprador que adjunte por este chat una foto o imagen clara de cómo tiene realizada la conexión/cableado eléctrico o la instalación física. Esto demuestra atención técnica profesional ante la IA de Mercado Libre y nos permite analizar el problema.

PRINCIPIOS DE NEUROCIENCIA Y MEDIACIÓN ANTE LA IA DE MERCADO LIBRE:
1. EMPATÍA DESARMANTE: No acuses al comprador agresivamente. Inicia validando su inquietud: "Entendemos perfectamente tu inquietud respecto a [mencionar el tema exacto de la queja]...".
2. ANCLAJE DE AUTORIDAD Y CALIDAD CERTIFICADA: Destaca que el producto es de Calidad Industrial Certificada, cumple rigurosamente con las especificaciones técnicas publicadas y fue verificado antes del despacho.
3. GATILLOS ALGORÍTMICOS PARA LA IA DE MERCADO LIBRE: Usa términos clave que la IA de MeLi interpreta como "Asesoría técnica provista" y "Producto en perfecto estado": "Producto 100% verificado y operativo", "Especificación técnica confirmada", "Instrucciones de uso correcto provistas".
4. PASOS TÉCNICOS CLAROS 1-2-3 Y SOLICITUD DE IMAGEN DE INSTALACIÓN: Entrega soluciones concretas y pide la foto de la conexión para revisión.

REGLAS DE FORMATO:
- NUNCA reveles que eres un bot o IA.
- NUNCA compartas datos de contacto externos (WhatsApp, teléfono, email) prohibidos por ML.
- NUNCA des respuestas genéricas que no correspondan al producto o a la queja específica.
- Texto plano puro sin asteriscos, sin markdown, sin HTML.
- Longitud ideal: 250 a 550 caracteres. Español colombiano empático, seguro y técnico.`;

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
 * Generate an AI-powered response for a claim/dispute (Novedad)
 */
async function generateClaimResponse(claimDetails, messages, knowledgeContext, strategy = 'auto', productInfo = null, customInstruction = null) {
  if (!model) {
    if (!initGemini()) return null;
  }

  const contextParts = [];

  const itemTitle = productInfo?.title || claimDetails?.item_title || 'Producto Mercado Libre';
  const claimReason = claimDetails?.claim_reason || claimDetails?.reason || 'No especificada';
  const claimType = claimDetails?.claim_type || claimDetails?.type || 'No especificado';

  contextParts.push(`PRODUCTO EXACTO COMPRADO: ${itemTitle}
TIPO DE RECLAMO: ${claimType}
MOTIVO DE LA NOVEDAD: ${claimReason}
ESTADO: ${claimDetails?.claim_status || claimDetails?.status || 'Abierto'}`);

  const botOrBuyerMessages = (messages || [])
    .filter(m => m.sender === 'mediator' || m.sender === 'bot' || m.sender === 'complainant' || m.sender === 'buyer')
    .map(m => m.message_text || m.text || m.message || '')
    .filter(Boolean);

  const exactComplaintText = botOrBuyerMessages.length > 0
    ? botOrBuyerMessages.join('\n---\n')
    : (claimDetails?.claim_reason || claimDetails?.reason || 'Sin mensaje de detalle');

  contextParts.push(`MENSAJE / TEXTO EXACTO RECIBIDO DE LA IA DE MERCADO LIBRE O COMPRADOR:
"""
${exactComplaintText}
"""`);

  if (productInfo) {
    contextParts.push(`ESPECIFICACIONES TÉCNICAS Y DESCRIPCIÓN DEL PRODUCTO:
Título: ${productInfo.title || ''}
${productInfo.description ? `Descripción: ${productInfo.description.substring(0, 1200)}...` : ''}`);
  }

  if (messages && messages.length > 0) {
    contextParts.push('HISTORIAL COMPLETO DE MENSAJES DE LA NOVEDAD (IA MeLi / Comprador):');
    messages.forEach(msg => {
      const sender = msg.sender === 'complainant' || msg.sender === 'buyer' ? 'COMPRADOR' : (msg.sender === 'mediator' || msg.sender === 'bot' ? 'IA_MERCADO_LIBRE' : 'VENDEDOR');
      contextParts.push(`[${sender}]: ${msg.message_text || msg.text || msg.message}`);
    });
  }

  if (knowledgeContext && knowledgeContext.length > 0) {
    contextParts.push('BASE DE CONOCIMIENTO Y GUÍAS TÉCNICAS DEL VENDEDOR:');
    knowledgeContext.forEach(item => {
      contextParts.push(`[${item.category.toUpperCase()}] ${item.title}: ${item.content}`);
    });
  }

  let strategyInstruction = '';
  if (strategy === 'socket_power') {
    strategyInstruction = 'ESTRATEGIA ESPECÍFICA (TOMACORRIENTE/ENCHUFE - AMPERAJE Y POTENCIA): Explica de forma técnica y segura las especificaciones de corriente (16A / 10A, 110V-240V, corriente máxima) del enchufe o tomacorriente inteligente. Aclara que el producto cuenta con relé reforzado de potencia verificado de fábrica y medidor de consumo en la app Tuya.';
  } else if (strategy === 'capacitor') {
    strategyInstruction = 'ESTRATEGIA ESPECÍFICA (INTERRUPTOR - PARPADEO L1): Explica con claridad que el capacitor estabilizador de luz viene INCLUIDO GRATIS en la caja y se debe instalar en paralelo en el bombillo (L1) para solucionar cualquier parpadeo al instalar sin neutro.';
  } else if (strategy === 'wifi') {
    strategyInstruction = 'ESTRATEGIA ESPECÍFICA (WI-FI 2.4GHz): Explica los pasos de configuración Wi-Fi en la app Tuya / Smart Life, enfatizando que la red debe ser 2.4GHz y el Wi-Fi de 5GHz debe estar desactivado temporalmente durante la vinculación.';
  } else if (strategy === 'voltage') {
    strategyInstruction = 'ESTRATEGIA ESPECÍFICA (VOLTAJE Y CALIDAD): Explica que el producto cuenta con certificación industrial y varistor de protección MOV contra sobretensiones. Recomienda revisar la fase y breaker del hogar.';
  } else if (strategy === 'misuse') {
    strategyInstruction = 'ESTRATEGIA ESPECÍFICA (INCOMPATIBILIDAD / USO ERRÓNEO): Explica amablemente que el producto fue despachado 100% verificado y que cualquier fallo de encendido o ajuste se debe a una verificación técnica de borneras o especificación técnica de la carga conectada.';
  }

  if (customInstruction) {
    strategyInstruction += `\nINSTRUCCIÓN ADICIONAL PERSONALIZADA DEL USUARIO: ${customInstruction}`;
  }

  const prompt = `${CLAIM_SYSTEM_PROMPT}

REGLA DE ADAPTACIÓN CRÍTICA PARA ESTA RESPUESTA:
1. DEBES LEER EL "MENSAJE / TEXTO EXACTO RECIBIDO DE LA IA DE MERCADO LIBRE O COMPRADOR" ANTERIOR.
2. Tu respuesta DEBE abordar DIRECTA Y EXCLUSIVAMENTE las afirmaciones o quejas expresadas en ese texto.
   - Por ejemplo: Si la IA de MeLi o el comprador afirman que "el producto se anunciaba de 16A pero el producto entregado solo soporta 10A o la etiqueta dice 10A", tu respuesta DEBE EXPLICAR DIRECTAMENTE LA ESPECIFICACIÓN DE 16A (explicando la corriente pico máxima de 16A / 3520W frente a la nominal continua de 10A, la certificación del fabricante y el relé reforzado de alta potencia). Queda estrictamente prohibido responder sobre Wi-Fi o capacitores cuando el texto hable de la etiqueta de 16A vs 10A.
   - Si la queja es sobre parpadeo de luz, responde sobre el capacitor en L1.
   - Si la queja es sobre conexión a la app, responde sobre la red 2.4GHz.
3. Responde EXACTAMENTE al problema reportado en la notificación.

${strategyInstruction}

DATOS Y CONTEXTO COMPLETO DE LA NOVEDAD:
${contextParts.join('\n\n')}

Genera una respuesta empática, neuro-persuasiva y técnicamente precisa para la IA de Mercado Libre y el comprador. Solo devuelve el texto final en texto plano puro.`;

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

