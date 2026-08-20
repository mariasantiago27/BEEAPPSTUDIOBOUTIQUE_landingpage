const { json, corsPreflight, parseJsonBody, isValidEmail } = require("./_helpers");

const FUGA_LABELS = {
  bufalo: "Búfalo · Que te encuentren",
  elefante: "Elefante · Que te compren",
  leon: "León · Que se sientan cuidados",
  rinoceronte: "Rinoceronte · Que vuelvan",
  leopardo: "Leopardo · Que te sobre tiempo",
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
    .map(([key, value]) => `${FUGA_LABELS[key] || key}: opción ${Number(value) + 1}/4`)
    .join("<br>");
}

async function upsertBrevoContact(apiKey, payload) {
  const listId = Number(process.env.BREVO_LIST_ID || 0);
  const body = {
    email: payload.email,
    updateEnabled: true,
    attributes: {
      FIRSTNAME: payload.nombre,
      PROFESION: payload.profesion || "",
      MAYOR_FUGA: FUGA_LABELS[payload.mayor_fuga] || payload.mayor_fuga || "",
      TEST_RESPUESTAS: JSON.stringify(payload.respuestas || {}),
      ORIGEN: "test_big_five",
      ETAPA: payload.etapa === "arrancando" ? "Por arrancar" : payload.etapa === "marcha" ? "En marcha" : payload.etapa || "",
    },
  };
  if (listId > 0) body.listIds = [listId];

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
  const to = process.env.NOTIFY_EMAIL || "chussama.digital@gmail.com";
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "Optimiza-T con IA";

  if (!senderEmail) {
    throw new Error("BREVO_SENDER_EMAIL not configured");
  }

  const subject = `Nuevo test Big Five: ${payload.nombre || payload.email}`;
  const html = `
    <div style="font-family:Georgia,serif;color:#333;line-height:1.6">
      <h2 style="color:#A6533B;margin:0 0 16px">Nuevo lead del test Big Five</h2>
      <p><strong>Nombre:</strong> ${escapeHtml(payload.nombre)}</p>
      <p><strong>Email:</strong> <a href="mailto:${escapeHtml(payload.email)}">${escapeHtml(payload.email)}</a></p>
      <p><strong>Profesión:</strong> ${escapeHtml(payload.profesion || "—")}</p>
      <p><strong>Momento:</strong> ${escapeHtml(payload.etapa === "arrancando" ? "Por arrancar" : payload.etapa === "marcha" ? "En marcha con clientes" : "—")}</p>
      <p><strong>Mayor fuga:</strong> ${escapeHtml(FUGA_LABELS[payload.mayor_fuga] || payload.mayor_fuga || "—")}</p>
      <p><strong>Respuestas:</strong><br>${formatAnswers(payload.respuestas)}</p>
      <p style="color:#666;font-size:13px">Fecha: ${escapeHtml(payload.fecha || new Date().toISOString())}</p>
      <hr style="border:none;border-top:1px solid #ddd;margin:20px 0">
      <p style="font-size:14px">Siguiente paso: revisa el perfil en Brevo y, si encaja, escríbele o espera a que reserve la llamada de 30 min.</p>
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
  const nombre = String(body.nombre || body.name || "").trim();
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
