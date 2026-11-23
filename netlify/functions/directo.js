// Netlify function: inscripción al directo gratuito de Optimiza-T.
// Variables: BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, BREVO_LIST_ID_DIRECTO (opcional), NOTIFY_EMAIL.
const EVENTO = {"dia": "10 de diciembre", "cuando": "Jueves 10 de diciembre · 19:00 (hora de Madrid)", "titulo": "De lo que sabes a tu producto, en directo", "origen": "directo_10dic", "inicio": "20261210T180000Z", "fin": "20261210T191500Z", "calendario": "https://calendar.google.com/calendar/render?action=TEMPLATE&text=Directo+Optimiza-T%3A+De+lo+que+sabes+a+tu+producto%2C+en+directo&dates=20261210T180000Z%2F20261210T191500Z&details=Directo+gratuito+con+Chus+Sama+%28Optimiza-T%29.+El+enlace+para+entrar+te+llega+por+email+el+d%C3%ADa+antes."};
const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const reply = (s, b) => ({ statusCode: s, headers: HEADERS, body: JSON.stringify(b) });
const clip = (v, n) => String(v ?? "").trim().slice(0, n);
const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const MARKETING_TEXT = "Quiero recibir emails de Chus con ideas para convertir lo que sé en producto. Me puedo dar de baja cuando quiera.";

async function brevo(path, body) {
  const res = await fetch("https://api.brevo.com/v3" + path, {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 400) throw new Error(`brevo ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "method" });
  if (!process.env.BREVO_API_KEY || !process.env.BREVO_SENDER_EMAIL) return reply(503, { error: "not_configured" });
  let b; try { b = JSON.parse(event.body || "{}"); } catch { return reply(400, { error: "json" }); }
  if (b.web) return reply(200, { ok: true });
  const v = { nombre: clip(b.nombre, 60), email: clip(b.email, 120).toLowerCase(), profesion: clip(b.profesion, 80), marketing: Boolean(b.marketing) };
  if (!v.nombre || !isEmail(v.email) || !b.privacidad) return reply(400, { error: "datos" });
  const sender = { email: process.env.BREVO_SENDER_EMAIL, name: process.env.BREVO_SENDER_NAME || "Chus · Optimiza-T" };
  const listId = Number(process.env.BREVO_LIST_ID_DIRECTO || 0);
  const contact = {
    email: v.email, updateEnabled: true,
    attributes: { FIRSTNAME: v.nombre, PROFESION: v.profesion, ORIGEN: EVENTO.origen,
      CONSENT_MARKETING: v.marketing ? "sí" : "no", CONSENT_FECHA: new Date().toISOString(), CONSENT_TEXTO: v.marketing ? MARKETING_TEXT : "" },
  };
  if (listId > 0) contact.listIds = [listId];
  const html = `<div style="font-family:Arial,sans-serif;color:#5C1A36;line-height:1.6;max-width:600px;margin:0 auto">
    <p>Hola, ${esc(v.nombre)}:</p>
    <p>¡Ya tienes tu plaza en el directo <b>${esc(EVENTO.titulo)}</b>!</p>
    <p style="background:#FFF6F1;border-radius:12px;padding:14px 16px"><b>${esc(EVENTO.cuando)}</b><br>Online y gratis. El día antes te mando el enlace para entrar.</p>
    <p><a href="${EVENTO.calendario}" style="display:inline-block;background:#E8693A;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:bold">Añadirlo a mi calendario</a></p>
    <p>Si no puedes conectarte ese día, no pasa nada: te mando la grabación.</p>
    <p>Mientras tanto, puedes entrar en la comunidad gratuita y ver la serie «De lo que sabes a tu producto»: <a href="https://www.skool.com/rentabiliza-t-con-ia-4357">entrar en la comunidad</a>.</p>
    <p>Nos vemos el jueves,<br>Chus</p></div>`;
  const notify = `<div style="font-family:Arial,sans-serif"><h2>Nueva inscripción al directo: ${esc(v.nombre)}</h2><p>${esc(v.email)} · ${esc(v.profesion || "—")} · marketing: ${v.marketing ? "sí" : "no"}</p></div>`;
  const rs = await Promise.allSettled([
    brevo("/contacts", contact),
    brevo("/smtp/email", { sender, to: [{ email: v.email, name: v.nombre }], subject: `${v.nombre}, tienes tu plaza para el directo del ${EVENTO.dia}`, htmlContent: html }),
    brevo("/smtp/email", { sender, to: [{ email: process.env.NOTIFY_EMAIL || "chussama.optimizat@gmail.com", name: "Chus" }], replyTo: { email: v.email, name: v.nombre }, subject: `Directo: nueva inscrita (${v.nombre})`, htmlContent: notify }),
  ]);
  rs.forEach((x) => x.status === "rejected" && console.error("directo:", x.reason));
  if (rs[1].status === "rejected") return reply(502, { error: "email" });
  return reply(200, { ok: true });
};
