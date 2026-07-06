// Función serverless de Netlify: llama a la API de Anthropic desde el servidor,
// para que la API key nunca viaje al navegador del visitante.
//
// Configuración necesaria en Netlify (Site settings → Environment variables):
//   ANTHROPIC_API_KEY  → tu clave secreta de https://console.anthropic.com
//   ANTHROPIC_MODEL    → opcional, por defecto usa claude-sonnet-4-5-20250929
//
// Esta función NO funciona en local con `npx serve` (es solo HTML estático).
// Se activa automáticamente al desplegar este proyecto en Netlify.

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Falta configurar ANTHROPIC_API_KEY en las variables de entorno de Netlify." }),
    };
  }

  let prompt;
  try {
    const body = JSON.parse(event.body || "{}");
    prompt = body.prompt;
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Cuerpo de la petición inválido." }) };
  }

  if (!prompt || typeof prompt !== "string") {
    return { statusCode: 400, body: JSON.stringify({ error: "Falta el prompt." }) };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: data?.error?.message || "Error llamando a la IA." }),
      };
    }

    const texto = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Error interno al llamar a la IA." }) };
  }
};
