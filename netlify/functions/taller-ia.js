// Netlify function: IA gratis «Tu primer taller con IA» (Optimiza-T).
// Variables de entorno: ANTHROPIC_API_KEY (obligatoria), ANTHROPIC_MODEL (opcional, por defecto claude-sonnet-5-5),
// BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, BREVO_LIST_ID_IA (o BREVO_LIST_ID), NOTIFY_EMAIL.
const SYSTEM = "Eres la IA de Optimiza-T, creada por Chus Sama. Ayudas a profesionales que viven de lo que saben (terapeutas, formadoras, consultoras, profesoras, coaches, entrenadoras y cualquier persona que vende su conocimiento) a preparar su primer taller online en directo de 2 horas. Es el primer paso del Método Safari, el mismo que Chus usa en sus consultorías de negocio y tecnología: vender algo pequeño antes de construir algo grande.\n\nReglas:\n- Español de España, en femenino salvo que la profesión indique lo contrario, tono cercano y profesional, frases cortas, sin tecnicismos ni anglicismos y sin tono de gurú.\n- No das consejos de salud, diagnósticos ni tratamientos. El taller es educativo y general; lo individual se queda en su consulta. Si el tema es sanitario, enfócalo en educación y hábitos y añade en «aviso» un recordatorio breve.\n- No das precios, ni plataformas, ni consejos legales o fiscales.\n- No prometes resultados de salud ni cifras de dinero. No inventas datos ni estudios.\n- Si en las respuestas aparecen datos de pacientes o clientas (nombres, casos concretos), no los uses y añade en «aviso» que no se deben compartir.\n- Si las respuestas no tienen sentido o no tienen que ver con una profesión, devuelve igualmente el JSON lo mejor que puedas y explica en «aviso» qué falta.\n- Responde SOLO con un objeto JSON válido, sin texto antes ni después.";
const TASK = "Datos de la profesional:\n- Profesión: {profesion}\n- A quién atiende hoy: {a_quien}\n- Las preguntas que más le hacen:\n{preguntas}\n- Qué le gustaría que la gente se llevara: {se_lleve}\n\nPrepara su primer taller online en directo de 2 horas:\n1. Saca de sus preguntas frecuentes 3 temas posibles. Elige el mejor como «tema» y deja los otros dos en «alternativas». Para cada uno, una frase de por qué.\n2. Para quién: describe a la persona ideal en 2 o 3 frases y escribe 3 frases que diría ella, con sus propias palabras.\n3. Tres nombres cortos que digan el resultado, y una promesa con la fórmula «En 2 horas, [resultado] sin [lo que más le cuesta]».\n4. La estructura: 4 bloques que sumen 110 minutos (y 10 más de preguntas). Para cada bloque: título, minutos, objetivo en una frase y una actividad práctica para hacer durante el taller.\n5. Qué se lleva al terminar: una frase, algo tangible.\n6. Un post de Instagram de máximo 120 palabras para anunciarlo: empieza con un gancho y termina invitando a apuntarse. Sin fecha ni precio: escribe [fecha] y [enlace].\n7. Un mensaje de WhatsApp corto y personal para invitar a sus clientas, que empiece por «Hola, [nombre].» y termine con una pregunta.\n\nResponde SOLO con este JSON:\n{{\"tema\":{{\"titulo\":\"\",\"por_que\":\"\"}},\"alternativas\":[{{\"titulo\":\"\",\"por_que\":\"\"}},{{\"titulo\":\"\",\"por_que\":\"\"}}],\"para_quien\":{{\"descripcion\":\"\",\"frases\":[\"\",\"\",\"\"]}},\"nombres\":[\"\",\"\",\"\"],\"promesa\":\"\",\"estructura\":[{{\"titulo\":\"\",\"minutos\":25,\"objetivo\":\"\",\"actividad\":\"\"}},{{\"titulo\":\"\",\"minutos\":30,\"objetivo\":\"\",\"actividad\":\"\"}},{{\"titulo\":\"\",\"minutos\":30,\"objetivo\":\"\",\"actividad\":\"\"}},{{\"titulo\":\"\",\"minutos\":25,\"objetivo\":\"\",\"actividad\":\"\"}}],\"se_lleva\":\"\",\"post\":\"\",\"whatsapp\":\"\",\"aviso\":\"\"}}";
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const CALENDLY = "https://calendly.com/chussama-digital/15min";
const SKOOL = "https://www.skool.com/rentabiliza-t-con-ia-4357";
const MARKETING_TEXT = "Quiero recibir emails de Chus con ideas para convertir lo que sé en producto. Me puedo dar de baja cuando quiera.";

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const reply = (status, body) => ({ statusCode: status, headers: HEADERS, body: JSON.stringify(body) });
const clip = (v, n) => String(v ?? "").replace(/\s+\n/g, "\n").trim().slice(0, n);
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

// Freno sencillo por instancia (el límite de gasto de la cuenta de Anthropic es el freno de verdad).
const seen = new Map();
function tooSoon(key) {
  const now = Date.now(), day = 24 * 3600 * 1000;
  const list = (seen.get(key) || []).filter((t) => now - t < day);
  if (list.length >= 2) return true;
  list.push(now); seen.set(key, list); return false;
}

function fill(tpl, v) {
  return tpl.replace("{profesion}", v.profesion).replace("{a_quien}", v.a_quien)
    .replace("{preguntas}", v.preguntas).replace("{se_lleve}", v.se_lleve)
    .replace(/\{\{/g, "{").replace(/\}\}/g, "}");
}

function parseJson(text) {
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no json");
  return JSON.parse(text.slice(a, b + 1));
}

async function askClaude(v) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 3000, system: SYSTEM, messages: [{ role: "user", content: fill(TASK, v) }] }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  const out = parseJson(text);
  if (!out || !out.tema || !Array.isArray(out.estructura)) throw new Error("bad shape");
  return out;
}

async function brevo(path, body) {
  const res = await fetch("https://api.brevo.com/v3" + path, {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 400) throw new Error(`brevo ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

function resultHtml(r) {
  const li = (arr) => (arr || []).map((x) => `<li>${esc(x)}</li>`).join("");
  const blocks = (r.estructura || []).map((b) => `<li><b>${esc(b.titulo)}</b> (${esc(b.minutos)} min). ${esc(b.objetivo)}<br><i>Actividad:</i> ${esc(b.actividad)}</li>`).join("");
  return `
  <h3 style="color:#5C1A36;font-family:Georgia,serif">Tu tema: ${esc(r.tema && r.tema.titulo)}</h3><p>${esc(r.tema && r.tema.por_que)}</p>
  <p><b>Para quién:</b> ${esc(r.para_quien && r.para_quien.descripcion)}</p><ul>${li(r.para_quien && r.para_quien.frases)}</ul>
  <p><b>Nombres:</b> ${esc((r.nombres || []).join(" · "))}</p><p><b>Tu promesa:</b> ${esc(r.promesa)}</p>
  <p><b>La estructura (2 horas):</b></p><ol>${blocks}<li>Preguntas (10 min)</li></ol>
  <p><b>Se lleva:</b> ${esc(r.se_lleva)}</p>
  <p><b>Tu post:</b></p><p style="white-space:pre-line;background:#FFF6F1;padding:14px;border-radius:12px">${esc(r.post)}</p>
  <p><b>Tu mensaje de WhatsApp:</b></p><p style="white-space:pre-line;background:#FFF6F1;padding:14px;border-radius:12px">${esc(r.whatsapp)}</p>
  ${r.aviso ? `<p style="color:#7D6670"><i>${esc(r.aviso)}</i></p>` : ""}`;
}

async function sendEmails(v, r) {
  const sender = { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || "Chus · Optimiza-T" };
  if (!sender.email) throw new Error("BREVO_SENDER_EMAIL missing");
  const listId = Number(process.env.BREVO_LIST_ID_IA || process.env.BREVO_LIST_ID || 0);
  const contact = {
    email: v.email, updateEnabled: true,
    attributes: {
      FIRSTNAME: v.nombre, PROFESION: v.profesion, ORIGEN: "ia_primer_taller",
      CONSENT_MARKETING: v.marketing ? "sí" : "no", CONSENT_FECHA: new Date().toISOString(), CONSENT_TEXTO: v.marketing ? MARKETING_TEXT : "",
    },
  };
  if (v.marketing && listId > 0) contact.listIds = [listId];
  const html = `<div style="font-family:Arial,sans-serif;color:#5C1A36;line-height:1.6;max-width:620px;margin:0 auto">
    <p>Hola, ${esc(v.nombre)}:</p><p>Aquí tienes tu primer taller, tal como te lo ha preparado la IA de Optimiza-T. Revísalo y hazlo tuyo: la IA escribe el borrador, tú decides.</p>
    ${resultHtml(r)}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
    <p><b>¿Y ahora?</b> Te falta lo de detrás: la página para apuntarse, el cobro, el enlace y los recordatorios. Si quieres que lo veamos para tu caso:</p>
    <p><a href="${CALENDLY}" style="display:inline-block;background:#E8693A;color:#fff;text-decoration:none;padding:13px 22px;border-radius:999px;font-weight:bold">Reservar mi llamada gratis de 15 min</a></p>
    <p>Y en la comunidad gratuita tienes el kit completo, con los 7 prompts para preparar el contenido y la ficha: <a href="${SKOOL}">entrar en la comunidad</a>.</p>
    <p>Un abrazo,<br>Chus</p></div>`;
  const notify = `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Nueva IA «Tu primer taller»: ${esc(v.nombre)}</h2>
    <p><b>Email:</b> ${esc(v.email)} · <b>Profesión:</b> ${esc(v.profesion)} · <b>Marketing:</b> ${v.marketing ? "sí" : "no"}</p>
    <p><b>A quién atiende:</b> ${esc(v.a_quien)}</p><p><b>Preguntas frecuentes:</b><br>${esc(v.preguntas).replace(/\n/g, "<br>")}</p>
    <p><b>Qué quiere que se lleven:</b> ${esc(v.se_lleve)}</p><hr>${resultHtml(r)}</div>`;
  await Promise.allSettled([
    brevo("/contacts", contact),
    brevo("/smtp/email", { sender, to: [{ email: v.email, name: v.nombre }], subject: `${v.nombre}, aquí tienes tu primer taller`, htmlContent: html }),
    brevo("/smtp/email", { sender, to: [{ email: process.env.NOTIFY_EMAIL || "chussama.optimizat@gmail.com", name: "Chus" }], replyTo: { email: v.email, name: v.nombre }, subject: `IA taller: ${v.nombre} (${v.profesion})`, htmlContent: notify }),
  ]).then((rs) => rs.forEach((x) => x.status === "rejected" && console.error("email/brevo:", x.reason)));
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "method" });
  if (!process.env.ANTHROPIC_API_KEY) return reply(503, { error: "not_configured" });
  let b; try { b = JSON.parse(event.body || "{}"); } catch { return reply(400, { error: "json" }); }
  if (b.web) return reply(200, { ok: true }); // trampa para bots (campo oculto)
  const v = {
    nombre: clip(b.nombre, 60), email: clip(b.email, 120).toLowerCase(), marketing: Boolean(b.marketing),
    profesion: clip(b.profesion, 80), a_quien: clip(b.a_quien, 400), preguntas: clip(b.preguntas, 1200), se_lleve: clip(b.se_lleve, 400),
  };
  if (!v.nombre || !isEmail(v.email) || !b.privacidad) return reply(400, { error: "datos" });
  if (!v.profesion || !v.a_quien || v.preguntas.length < 10) return reply(400, { error: "respuestas" });
  const ip = (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"] || "").split(",")[0];
  if (tooSoon("e:" + v.email) || (ip && tooSoon("i:" + ip))) return reply(429, { error: "limite" });
  let r;
  try { r = await askClaude(v); }
  catch (e) { console.error("taller-ia:", e.message); return reply(502, { error: "ia" }); }
  if (process.env.BREVO_API_KEY) { try { await sendEmails(v, r); } catch (e) { console.error("brevo:", e.message); } }
  return reply(200, { ok: true, resultado: r });
};
