const { json, corsPreflight, parseJsonBody, isValidEmail, normalizeName } = require("./_helpers");

const MARKETING_CONSENT_TEXT =
  "Quiero recibir emails de Chus con ideas para convertir lo que sé en producto. Me puedo dar de baja cuando quiera.";

const FUGA_LABELS = {
  // Test «¿Vives de lo que sabes?» (Método Safari)
  mapa: "Paso 0 · Tu mapa",
  bufalo: "Paso 1 · Búfalo · Tu producto, a la vista",
  elefante: "Paso 2 · Elefante · Que puedan comprarlo",
  leon: "Paso 3 · León · Que lo disfruten",
  rino: "Paso 4 · Rinoceronte · Que se queden",
  rinoceronte: "Paso 4 · Rinoceronte · Que se queden",
  leopardo: "Paso 5 · Leopardo · Que funcione sin ti",
  avanzado: "Camino muy avanzado",
  inicio: "Punto de partida",
  objetivo: "Objetivo a 12 meses",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatAnswers(respuestas) {
  if (!respuestas || typeof respuestas !== "object") return "Sin respuestas";
  return Object.entries(respuestas)
    .map(([key, value]) => `${FUGA_LABELS[key] || key}: opción ${String.fromCharCode(65 + Number(value))}`)
    .join("<br>");
}

async function upsertBrevoContact(apiKey, payload) {
  const listId = Number(process.env.BREVO_LIST_ID || 0);
  const marketingOptIn = Boolean(payload.marketing_opt_in);
  const consentFecha = payload.fecha || new Date().toISOString();
  const body = {
    email: payload.email,
    updateEnabled: true,
    attributes: {
      FIRSTNAME: payload.nombre,
      PROFESION: payload.profesion || "",
      MAYOR_FUGA: FUGA_LABELS[payload.mayor_fuga] || payload.mayor_fuga || "",
      TEST_RESPUESTAS: JSON.stringify({ ...(payload.respuestas || {}), objetivo_texto: payload.objetivo || "" }),
      ORIGEN: payload.origen || "test_vives_de_lo_que_sabes",
      ETAPA: payload.etapa === "arrancando" ? "Por arrancar" : payload.etapa === "marcha" ? "En marcha" : payload.etapa || "",
      CONSENT_MARKETING: marketingOptIn ? "sí" : "no",
      CONSENT_FECHA: consentFecha,
      CONSENT_TEXTO: marketingOptIn ? MARKETING_CONSENT_TEXT : "",
    },
  };
  if (marketingOptIn && listId > 0) body.listIds = [listId];

  const res = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  if (res.ok || res.status === 400) return;
  const err = await res.text();
  throw new Error(`Brevo contact failed (${res.status}): ${err}`);
}

async function notifyOwner(apiKey, payload) {
  const to = process.env.NOTIFY_EMAIL || "chussama.optimizat@gmail.com";
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "Optimiza-T con IA";

  if (!senderEmail) {
    throw new Error("BREVO_SENDER_EMAIL not configured");
  }

  const subject = `Nuevo test ¿Vives de lo que sabes?: ${payload.nombre || payload.email}`;
  const html = `
    <div style="font-family:Georgia,serif;color:#333;line-height:1.6">
      <h2 style="color:#5C1A36;margin:0 0 16px">Nuevo test «¿Vives de lo que sabes?»</h2>
      <p><strong>Nombre:</strong> ${escapeHtml(payload.nombre)}</p>
      <p><strong>Email:</strong> <a href="mailto:${escapeHtml(payload.email)}">${escapeHtml(payload.email)}</a></p>
      <p><strong>Profesión:</strong> ${escapeHtml(payload.profesion || "—")}</p>
      <p><strong>Punto de partida:</strong> ${escapeHtml(payload.etapa || "—")}</p>
      <p><strong>Objetivo:</strong> ${escapeHtml(payload.objetivo || "—")}</p>
      <p><strong>Su paso ahora:</strong> ${escapeHtml(FUGA_LABELS[payload.mayor_fuga] || payload.mayor_fuga || "—")}</p>
      <p><strong>Respuestas:</strong><br>${formatAnswers(payload.respuestas)}</p>
      <p style="color:#666;font-size:13px">Fecha: ${escapeHtml(payload.fecha || new Date().toISOString())}</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:20px 0">
      <p style="font-size:14px">Siguiente paso: revisa el perfil en Brevo y, si encaja, escríbele o espera a que reserve la llamada de 15 min.</p>
    </div>
  `.trim();

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to, name: "Chus Santiago" }],
      replyTo: { email: payload.email, name: payload.nombre || payload.email },
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo email failed (${res.status}): ${err}`);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return corsPreflight();
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return json(503, {
      error: "Lead capture not configured",
      hint: "Add BREVO_API_KEY in Netlify environment variables",
    });
  }

  const body = parseJsonBody(event);
  if (!body) return json(400, { error: "Invalid JSON body" });

  const email = String(body.email || "").trim();
  const nombre = normalizeName(body.nombre || body.name || "");
  const profesion = String(body.profesion || body.profession || "").trim();

  if (!isValidEmail(email)) return json(400, { error: "Invalid email" });
  if (!nombre) return json(400, { error: "Name is required" });

  const payload = {
    evento: body.evento || "test_completado",
    nombre,
    email,
    profesion,
    etapa: body.etapa || body.stage || "",
    respuestas: body.respuestas || body.answers || {},
    mayor_fuga: body.mayor_fuga || "",
    objetivo: String(body.objetivo || "").slice(0, 200),
    origen: String(body.origen || "").slice(0, 60),
    marketing_opt_in: Boolean(body.marketing_opt_in),
    fecha: body.fecha || new Date().toISOString(),
  };

  try {
    await upsertBrevoContact(apiKey, payload);
    await notifyOwner(apiKey, payload);
    return json(200, { ok: true });
  } catch (err) {
    console.error("submit-lead error:", err);
    return json(502, { error: "Could not save lead", detail: err.message });
  }
};
