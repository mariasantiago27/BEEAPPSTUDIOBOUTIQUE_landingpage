const { json, corsPreflight, parseJsonBody, isValidEmail, normalizeName } = require("./_helpers");

const FUGA_LABELS = {
  mapa: "Paso 0 · Tu mapa",
  bufalo: "Paso 1 · Búfalo · Tu producto, a la vista",
  elefante: "Paso 2 · Elefante · Que puedan comprarlo",
  leon: "Paso 3 · León · Que lo disfruten",
  rino: "Paso 4 · Rinoceronte · Que se queden",
  leopardo: "Paso 5 · Leopardo · Que funcione sin ti",
  avanzado: "Tu camino está muy avanzado",
};

const CALENDLY_URL =
  process.env.CALENDLY_BOOKING_URL || "https://calendly.com/chussama-digital/15min";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function radiografiaToHtml(text) {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

async function sendInformeEmail(apiKey, payload) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "Optimiza-T con IA";

  if (!senderEmail) {
    throw new Error("BREVO_SENDER_EMAIL not configured");
  }

  const worst = FUGA_LABELS[payload.mayor_fuga] || payload.mayor_fuga || "Tu mayor fuga";
  const greeting = payload.nombre
    ? `Hola ${escapeHtml(payload.nombre)},`
    : "Hola,";
  const subjectName = payload.nombre || "Tu informe";

  const html = `
    <div style="font-family:Georgia,'Times New Roman',serif;color:#33302A;line-height:1.72;max-width:620px;margin:0 auto">
      <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#A6533B;margin:0 0 18px">
        Tu informe · Test Big Five
      </p>
      <p style="margin:0 0 16px">${greeting}</p>
      <p style="margin:0 0 10px;font-size:13px;color:#8A8171">Mayor fuga: ${escapeHtml(worst)}</p>
      <div style="font-size:16px;margin:0 0 28px">${radiografiaToHtml(payload.radiografia)}</div>
      <hr style="border:none;border-top:1px solid #D9CFBB;margin:28px 0">
      <p style="font-size:16px;margin:0 0 14px">¿Quieres que lo veamos juntas?</p>
      <p style="margin:0 0 24px">
        <a href="${escapeHtml(CALENDLY_URL)}" style="display:inline-block;background:#A6533B;color:#F6F1E7;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:600">
          Reserva tu llamada gratis de 15 min →
        </a>
      </p>
      <p style="font-size:13px;color:#8A8171;margin:0">Sin compromiso. Si no hace falta que hagas nada, te lo digo yo.</p>
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
      to: [{ email: payload.email, name: payload.nombre || payload.email }],
      replyTo: { email: senderEmail, name: senderName },
      subject: `${subjectName}, aquí tienes tu Test Big Five`,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo informe email failed (${res.status}): ${err}`);
  }
}


function block(title, text, dark) {
  const bg = dark ? "#5C1A36" : "#FFFFFF";
  const color = dark ? "#FFF6F1" : "#5C1A36";
  const label = dark ? "#E9A3B6" : "#E8693A";
  return `
      <div style="background:${bg};color:${color};border-radius:18px;padding:20px 22px;margin:0 0 12px">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:${label}">${escapeHtml(title)}</p>
        <p style="margin:0;font-size:16px;line-height:1.6">${escapeHtml(text)}</p>
      </div>`;
}

async function sendResultadoEmail(apiKey, payload) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "Chus · Optimiza-T";
  if (!senderEmail) throw new Error("BREVO_SENDER_EMAIL not configured");
  const r = payload.resultado;
  const html = `
    <div style="background:#F7DDE3;padding:28px 16px;font-family:Arial,Helvetica,sans-serif;color:#5C1A36">
      <div style="max-width:600px;margin:0 auto">
        <p style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#E8693A;font-weight:700;margin:0 0 10px">Tu resultado · ¿Vives de lo que sabes?</p>
        <p style="font-family:Georgia,serif;font-size:26px;line-height:1.2;margin:0 0 18px">Hola ${escapeHtml(payload.nombre)}, tu paso ahora: <em style="color:#E8693A">${escapeHtml(payload.paso)}</em></p>
        ${block("Tu punto de partida", r.inicio)}
        ${block(payload.paso, r.freno)}
        ${block("Lo que puedes hacer esta semana", r.semana)}
        ${block("Tu siguiente paso", r.siguiente, true)}
        <p style="font-size:16px;line-height:1.6;margin:18px 0 14px"><strong>¿Lo vemos juntas?</strong> En una llamada de 15 minutos me cuentas tu caso y vemos si tiene sentido trabajar juntas.</p>
        <p style="margin:0 0 22px"><a href="${escapeHtml(CALENDLY_URL)}" style="display:inline-block;background:#E8693A;color:#FFFFFF;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:700">Reservar mi llamada de 15 minutos</a></p>
        <p style="font-size:14px;color:#7D6670;margin:0">Un abrazo,<br>Chus</p>
      </div>
    </div>`.trim();
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: payload.email, name: payload.nombre || payload.email }],
      replyTo: { email: process.env.NOTIFY_EMAIL || senderEmail, name: "Chus Sama" },
      subject: `${payload.nombre}, aquí tienes tu resultado`,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo resultado email failed (${res.status}): ${err}`);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return corsPreflight();
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return json(503, {
      error: "Email delivery not configured",
      hint: "Add BREVO_API_KEY in Netlify environment variables",
    });
  }

  const body = parseJsonBody(event);
  if (!body) return json(400, { error: "Invalid JSON body" });

  const email = String(body.email || "").trim();
  const nombre = normalizeName(body.nombre || body.name || "");
  const radiografia = String(body.radiografia || body.radiografia_text || "").trim();
  const mayor_fuga = body.mayor_fuga || "";

  if (!isValidEmail(email)) return json(400, { error: "Invalid email" });
  if (!nombre) return json(400, { error: "Name is required" });
  // Nuevo test «¿Vives de lo que sabes?»: el resultado llega ya escrito (textos fijos)
  const r = body.resultado;
  if (r && typeof r === "object") {
    const clean = (v) => String(v || "").slice(0, 800);
    const resultado = { inicio: clean(r.inicio), freno: clean(r.freno), semana: clean(r.semana), siguiente: clean(r.siguiente) };
    const paso = String(body.paso || "").slice(0, 120);
    try {
      await sendResultadoEmail(apiKey, { nombre, email, paso, resultado });
      return json(200, { ok: true });
    } catch (err) {
      console.error("[send-informe] Error:", err);
      return json(502, { error: "Could not send resultado", detail: err.message });
    }
  }

  if (!radiografia) return json(400, { error: "Missing radiografia" });

  const payload = { nombre, email, radiografia, mayor_fuga };

  try {
    await sendInformeEmail(apiKey, payload);
    console.info("[send-informe] Informe enviado a", email);
    return json(200, { ok: true });
  } catch (err) {
    console.error("[send-informe] Error:", err);
    return json(502, { error: "Could not send informe", detail: err.message });
  }
};
