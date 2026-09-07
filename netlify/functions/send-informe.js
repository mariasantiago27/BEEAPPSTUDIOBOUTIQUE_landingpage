const { json, corsPreflight, parseJsonBody, isValidEmail } = require("./_helpers");

const FUGA_LABELS = {
  bufalo: "Búfalo · Que te encuentren",
  elefante: "Elefante · Que te compren",
  leon: "León · Que se sientan cuidados",
  rinoceronte: "Rinoceronte · Que vuelvan",
  leopardo: "Leopardo · Que te sobre tiempo",
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
  const firstName = payload.nombre || "Hola";

  const html = `
    <div style="font-family:Georgia,'Times New Roman',serif;color:#33302A;line-height:1.72;max-width:620px;margin:0 auto">
      <p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#A6533B;margin:0 0 18px">
        Tu informe · Test Big Five
      </p>
      <p style="margin:0 0 16px">Hola ${escapeHtml(firstName)},</p>
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
      subject: `${payload.nombre || "Tu informe"}, aquí tienes tu Test Big Five`,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo informe email failed (${res.status}): ${err}`);
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
  const nombre = String(body.nombre || body.name || "").trim();
  const radiografia = String(body.radiografia || body.radiografia_text || "").trim();
  const mayor_fuga = body.mayor_fuga || "";

  if (!isValidEmail(email)) return json(400, { error: "Invalid email" });
  if (!nombre) return json(400, { error: "Name is required" });
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
