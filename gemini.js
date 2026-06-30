const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-flash-lite-latest",
  "gemini-flash-latest"
]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: { message: "Method not allowed" } });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({
      error: { message: "Missing GEMINI_API_KEY environment variable" }
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const model = ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL;

    if (!body.payload) {
      return res.status(400).json({ error: { message: "Missing Gemini payload" } });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body.payload)
      }
    );

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: { message: text || "Gemini returned a non-JSON response" } };
    }

    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({
      error: { message: error.message || "Gemini proxy failed" }
    });
  }
}
