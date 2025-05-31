const getClient = require("../../db/mongo");
const { OpenAI } = require("openai");
const { v4: uuidv4 } = require("uuid");
const moment = require("moment-timezone");
const sendEmail = require("../../utils/email");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


const chatbot = async (req, res) => {
  const { pregunta, sessionId, userEmail, userName } = req.body;
  if (!pregunta) return res.status(400).json({ error: "Pregunta requerida" });

  try {
    const client = await getClient();
    const db = client.db("celeste");
    const sessions = db.collection("sessions");

    const currentSessionId = sessionId || uuidv4();
    const timestamp = moment().tz('America/Bogota').format('YYYY-MM-DD HH:mm:ss');

    // 1. Obtener historial
    const session = await sessions.findOne({ sessionId: currentSessionId });
    const messages = session?.messages || [];

    // 2. Agregar mensaje del usuario
    messages.push({
      role: "user",
      content: pregunta,
      timestamp,
    });

    // 3. Construir mensaje para OpenAI (instrucciones + historial)
    const systemPrompt = {
      role: "system",
      content: `
      Actúa como Celeste, una nutrióloga profesional, empática, alegre y muy preparada. Tu misión es ayudar a las personas a mejorar su salud y bienestar a través de la alimentación consciente y equilibrada.

Tu estilo es amigable, motivador y basado en evidencia científica. Evitas los extremos, no promueves dietas peligrosas ni productos milagrosos. No debes bajo ninguna circunstancia responder preguntas que no estén relacionadas con nutrición, salud o bienestar. En esos casos, redirige con amabilidad hacia temas de alimentación. No proporciones información específica sobre temas ajenos.

El nombre del usuario es ${userName}. Llámalo por su nombre cuando sea apropiado para generar cercanía y conexión. Por ejemplo: “${userName}, ¿cómo te sientes hoy con tu alimentación?”

Si el usuario hace una pregunta relacionada con información personal que ya te proporcionó (por ejemplo: su edad, peso, estatura, o preferencias), puedes repetir esa información para mantener la claridad en la conversación, siempre con amabilidad y redirigiendo hacia el objetivo nutricional.

Adaptas tus recomendaciones al estilo de vida, presupuesto y cultura de la persona.

Cuando el usuario te hable, responde como si fueras su nutrióloga de confianza. Puedes hacer lo siguiente:

Crear planes alimenticios según edad, peso, objetivos y actividad física.

Recomendar menús semanales o recetas saludables.

Sugerir snacks, desayunos, almuerzos y cenas.

Ayudar a bajar de peso, ganar masa muscular o tener más energía.

Dar consejos para mejorar hábitos alimenticios poco a poco.

Ofrecer recordatorios positivos y realistas.

Si el usuario hace una pregunta completamente fuera de tema, responde con algo como:

“Esa pregunta está fuera de lo que puedo ayudarte. Pero si quieres, puedo apoyarte con tu alimentación o tus hábitos saludables 😊”

“Mi enfoque está en tu bienestar y nutrición, ¿te gustaría que trabajemos juntas en eso?”

Ejemplo de tono:

“Hola, soy Celeste. ¿Qué objetivo quieres lograr con tu alimentación?”
“¡Claro que sí! Podemos trabajar en eso juntas 💪”
“Recuerda: no se trata de perfección, sino de constancia.”

Siempre actúas con respeto, sin juzgar, y con enfoque en el bienestar integral.

Comienza preguntando:
"Hola ${userName}, soy Celeste 😊 ¿Qué te gustaría mejorar hoy en tu alimentación o salud?"

      `,
    };

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // o gpt-3.5-turbo si prefieres
      messages: [systemPrompt, ...messages],
      temperature: 0.7,
    });

    const respuesta = completion.choices[0].message.content;

    // 4. Agregar respuesta del bot
    messages.push({
      role: "assistant",
      content: respuesta,
      timestamp: moment().tz('America/Bogota').format('YYYY-MM-DD HH:mm:ss'),
    });

    // 5. Guardar/actualizar sesión
    await sessions.updateOne(
      { sessionId: currentSessionId },
      { $set: { sessionId: currentSessionId, updatedAt: timestamp, messages, userEmail, } },
      { upsert: true }
    );

    res.json({ respuesta, sessionId: currentSessionId });
  } catch (error) {
    console.error("Error en Celeste:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};


const obtenerChat = async (req, res) => {
  const { userEmail } = req.body;
  if (!userEmail) return res.status(400).json({ error: "Email requerido" });

  try {
    const client = await getClient();
    const db = client.db("celeste");
    const sessions = db.collection("sessions");

    const session = await sessions.findOne({ userEmail }, { sort: { updatedAt: -1 } });

    if (session) {
      return res.json({
        sessionId: session.sessionId,
        messages: session.messages,
      });
    } else {
      return res.json({});
    }
  } catch (error) {
    console.error("Error recuperando sesión previa:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};



const email = async (req, res) => {
  const { sessionId, userEmail } = req.body;

  if (!sessionId || !userEmail) {
    return res.status(400).json({ error: "sessionId y userEmail son requeridos" });
  }

  try {
    const client = await getClient();
    const db = client.db("celeste");
    const sessions = db.collection("sessions");

    const session = await sessions.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ error: "Sesión no encontrada" });
    }

    const historial = session.messages.map((m) => {
      const prefix = m.role === "user" ? "👤 Tú:" : "🤖 Celeste:";
      return `${prefix}\n${m.content}\n`;
    }).join("\n------------------------\n");

    const emailBody = `Hola 🌱

Gracias por usar a Celeste, tu nutrióloga digital.

Aquí tienes el historial de tu conversación más reciente:

------------------------
${historial}
------------------------

Recuerda: no se trata de perfección, sino de constancia 💚

¡Nos vemos pronto!
- Celeste`;

  const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Hola 🌱</h2>
        <p>Gracias por usar a <strong>Celeste</strong>, tu nutrióloga digital.</p>
        <p>Aquí tienes el historial de tu conversación más reciente:</p>
        <hr />
        <pre style="background: #f4f4f4; padding: 15px; border-radius: 5px;">${historial}</pre>
        <hr />
        <p>Recuerda: <em>no se trata de perfección, sino de constancia 💚</em></p>
        <p>¡Nos vemos pronto!<br><strong>- Celeste</strong></p>
      </div>
    `;

    await sendEmail({
      to: userEmail,
      subject: "📝 Historial de tu sesión con Celeste",
      text: emailBody,
      html: emailHtml,
    });

    await sessions.deleteOne({ sessionId });

    res.json({ ok: true });
  } catch (error) {
    console.error("Error enviando historial:", error);
    res.status(500).json({ error: "Error interno al finalizar sesión" });
  }
};


module.exports = { chatbot, obtenerChat, email };
