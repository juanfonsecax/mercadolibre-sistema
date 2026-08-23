const db = require('../database');

/**
 * Curated Deep Technical Knowledge Base & Web Research Data
 * Built for Tuya, Smart Life, ESPACIA Smart Switches, Plugs, Bulbs & Smart Locks.
 */
const DEEP_WEB_RESEARCH_FAQS = [
  // --- INTERRUPTORES INTELIGENTES (ESPACIA / TUYA) ---
  {
    category: 'faq',
    title: '🌐 [Web Research] ¿Por qué la bombilla LED parpadea en instalaciones sin neutro y cómo lo resuelve el Estabilizador ESPACIA?',
    content: `EXPLICACIÓN TÉCNICA Y SOLUCIÓN:
En instalaciones eléctricas SIN CABLE NEUTRO (muy comunes en Colombia), el interruptor inteligente necesita tomar una micro-corriente de fuga a través de la bombilla para mantener encendidos su chip WiFi y su pantalla táctil cuando la luz está apagada.
Debido a que las bombillas LED modernas consumen tan pocos vatios, esa micro-corriente hace que el condensador interno de la bombilla se cargue y descargue, provocando un molesto parpadeo o que la luz quede encendida con un leve brillo tenue en la oscuridad.

SOLUCIÓN COMPLETA:
El interruptor incluye GRATIS un Estabilizador de Luz / Capacitador Anti-Parpadeo. Este componente se conecta EN PARALELO con la bombilla principal (en la bornera L1 de la lámpara en el techo, entre la fase de retorno L1 y el neutro del techo).
El capacitador crea un camino de derivación dedicado para la corriente de standby del WiFi, eliminando el 100% del parpadeo y permitiendo una iluminación impecable y estable.`
  },
  {
    category: 'faq',
    title: '🌐 [Web Research] ¿Cómo emparejar y solucionar problemas de conexión a redes WiFi (2.4GHz vs 5GHz)?',
    content: `GUÍA DE CONEXIÓN WIFI 2.4GHz:
Todos los dispositivos de domótica Tuya / Smart Life (interruptores, enchufes, bombillos) requieren conectarse exclusivamente a la banda Wi-Fi de 2.4 GHz (Estándar 802.11 b/g/n). No son compatibles con redes de 5 GHz.

RECOMENDACIONES PARA EL EMPAREJAMIENTO:
1. Si tu router tiene un solo nombre (SSID) para 2.4GHz y 5GHz (Band Steering/Smart Connect), desactiva temporalmente la red 5GHz desde la configuración del módem o aleja el celular del router para forzar la banda 2.4GHz durante los 30 segundos de vinculación.
2. Asegúrate de que el nombre del WiFi y la contraseña no contengan caracteres especiales ni espacios.
3. Para poner el interruptor en MODO PAREO (EZ Mode): Mantén presionado cualquier botón táctil durante 5 a 10 segundos hasta que la luz LED azul/roja parpadee rápidamente.`
  },
  {
    category: 'faq',
    title: '🌐 [Web Research] ¿Qué es el Blindaje de Voltaje Certificado (co.9019129) y cómo protege de la red eléctrica inestable de Colombia?',
    content: `ESPECIFICACIONES DE SEGURIDAD ELÉCTRICA:
En Colombia, los picos de voltaje, descargas por tormentas eléctricas y fluctuaciones del suministro eléctrico son las causas principales de falla en interruptores táctiles genéricos.

El sistema ESPACIA integra 3 componentes de protección de grado industrial:
1. Varistor de Protección contra Sobretensiones (MOV): Absorbe los picos repentinos de alto voltaje enviando la sobretensión a tierra de forma segura.
2. Fusible de Acción Rápida: Desconecta el circuito en microsegundos ante cortocircuitos graves.
3. Filtro de Ruido Eléctrico: Elimina parásitos y armónicos de la red eléctrica para proteger la electrónica interna.
Certificación oficial de seguridad eléctrica en Colombia No. co.9019129. Vida útil testeada de +100.000 clics (Grado Industrial).`
  },
  {
    category: 'faq',
    title: '🌐 [Web Research] ¿Es compatible con Polo a Tierra, Dimerización y Luz Guía Nocturna?',
    content: `ESPECIFICACIONES ADICIONALES:
1. Polo a Tierra: Funciona perfectamente en cajas con o sin polo a tierra. El circuito electrónico interno está aislado dieléctricamente tras el panel de vidrio templado ignífugo.
2. Dimerización / Atenuación: Este modelo es un interruptor ON/OFF táctil de alta potencia. Enciende y apaga cualquier tipo de bombilla (LED, ahorradora, incandescente o halógena). Para regular la intensidad de la luz (dimmer), se recomienda usar bombillos inteligentes RGB+CW compatibles con Tuya/Smart Life.
3. Luz Guía Nocturna: Cuenta con un indicador LED suave que permite ubicar el interruptor en la oscuridad. Se puede personalizar o apagar desde la app Smart Life / Tuya.`
  },

  // --- ENCHUFES INTELIGENTES (SMART PLUGS 15A/16A) ---
  {
    category: 'faq',
    title: '🌐 [Web Research] ¿Sirve un enchufe inteligente para Aire Acondicionado (Mini Split) y medición de energía?',
    content: `ESPECIFICACIONES DE ENCHUFES INTELIGENTES 15A / 16A:
1. Potencia y Amperaje: Soporta hasta 15A / 16A de carga continua (hasta 1500W en 110V / 3000W en 220V). Es compatible con aires acondicionados Mini Split de hasta 12.000 BTU, ventiladores, calentadores, cafeteras y electrodomésticos.
2. Medición de Energía (Power Metering): La app muestra en tiempo real el consumo en Vatios (W), Amperios (A), Voltaje (V) y el consumo acumulado mensual en Kilovatios-Hora (kWh), ideal para controlar el gasto eléctrico.
3. Automatización: Permite programar encendido y apagado por horarios, temporizador regresivo y control por voz con Alexa, Google Home y accesos directos de Siri.`
  },

  // --- BOMBILLOS INTELIGENTES LED RGB+CW ---
  {
    category: 'faq',
    title: '🌐 [Web Research] Especificaciones de Bombillos LED Inteligentes (Roseta E27, Atenuación y Colores)',
    content: `ESPECIFICACIONES DE BOMBILLOS LED INTELIGENTES:
1. Roseta Estándar E27: Compatible con cualquier lámpara o roseta tradicional de hogar en Colombia (110V - 220V).
2. Tono de Luz Blanco y RGB: Permite graduar desde Blanco Cálido (2700K para descanso/habitación) hasta Blanco Frío (6500K para estudio/trabajo), además de 16 millones de colores RGB.
3. Dimmer / Atenuación de Brillo: Se puede regular la intensidad del brillo del 1% al 100% desde la app o por comando de voz ("Alexa, pon la luz al 50%").
4. Sincronización de Música y Escenas: Los colores cambian al ritmo de la música o según escenarios programados (lectura, cena, película, fiesta). Vida útil aproximada de 25.000 horas.`
  },

  // --- CERRADURAS INTELIGENTES (SMART LOCKS TUYA) ---
  {
    category: 'faq',
    title: '🌐 [Web Research] Modo Paso (Libre Acceso), Baterías y Apertura de Emergencia por USB en Cerraduras',
    content: `ESPECIFICACIONES DE CERRADURAS INTELIGENTES TUYA:
1. Modo Paso / Libre Acceso (Passage Mode): Permite dejar la puerta desbloqueada para libre paso sin pedir huella ni clave durante eventos o reuniones. Se activa desde la App Tuya/Smart Life o desde el teclado digitando * + # + [Clave Administrador] + #.
2. Manija Reversible Ambidiestra: La manija se adapta fácilmente para apertura hacia la izquierda o hacia la derecha.
3. Baterías y Autonomía: Funciona con 4 baterías alcalinas AA / AAA con autonomía de 6 a 12 meses. La app y la cerradura emiten alertas cuando la batería baja del 20%.
4. Puerto USB de Emergencia + Llave Física: Si las baterías se agotan por completo, incluye un puerto microUSB / USB-C exterior para conectar una Power Bank portátil y suministrar energía de emergencia para abrir. También incluye llaves mecánicas de alta seguridad.`
  }
];

/**
 * Inject deep web research FAQs into knowledge base database
 */
async function runWebResearchEnrichment(accountId = null) {
  let added = 0;

  DEEP_WEB_RESEARCH_FAQS.forEach(faq => {
    const existing = db.getKnowledge().find(k => k.title === faq.title);
    if (!existing) {
      db.saveKnowledge(faq);
      added++;
    } else {
      db.updateKnowledge(existing.id, faq);
      added++;
    }
  });

  db.logActivity('web_research', `Base de conocimiento enriquecida con ${added} ítems de investigación web sobre domótica, interruptores, enchufes y cerraduras`, { count: added }, accountId);
  return added;
}

module.exports = {
  DEEP_WEB_RESEARCH_FAQS,
  runWebResearchEnrichment,
};
