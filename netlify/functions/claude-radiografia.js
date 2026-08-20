const { json, corsPreflight, parseJsonBody } = require("./_helpers");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return corsPreflight();
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json(503, {
      error: "Radiografia AI not configured",
      hint: "Add ANTHROPIC_API_KEY in Netlify environment variables",
    });
  }

  const body = parseJsonBody(event);
  if (!body || !body.prompt) return json(400, { error: "Missing prompt" });

  const model = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{ role: "user", content: body.prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Anthropic error:", res.status, err);
      return json(502, { error: "Claude API error", status: res.status });
    }

    const data = await res.json();
    const text = (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!text) return json(502, { error: "Empty response from Claude" });

    return json(200, { radiografia: text, text });
  } catch (err) {
    console.error("claude-radiografia error:", err);
    return json(502, { error: "Could not generate radiografia" });
  }
};
