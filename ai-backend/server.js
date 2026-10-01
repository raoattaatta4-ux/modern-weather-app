import express from "express";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

const hits = new Map();
function rateLimit(req, res, next) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
  const now = Date.now();
  const windowMs = 60_000;
  const max = 30;
  const old = hits.get(ip) || [];
  const recent = old.filter(t => now - t < windowMs);
  if (recent.length >= max) return res.status(429).json({ error: "Too many requests. Please wait a moment." });
  recent.push(now);
  hits.set(ip, recent);
  next();
}

app.get("/", (req, res) => {
  res.json({ ok: true, service: "GHL OpenRouter Voice Agent Backend" });
});

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/chat", rateLimit, async (req, res) => {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Server API key is not configured." });

    const input = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const clean = input
      .filter(m => m && ["user", "assistant", "system"].includes(m.role) && typeof m.content === "string")
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content.slice(0, 12000) }));

    if (!clean.some(m => m.role === "user")) {
      return res.status(400).json({ error: "No user message provided." });
    }

    const messages = [
      {
        role: "system",
        content: "You are a fast, helpful general-purpose AI assistant for a website voice/chat widget. Answer the user's actual question directly. Match the user's language. If they write Roman Urdu, reply in simple Roman Urdu. Help with coding, writing, study, business, explanations and general knowledge. Be concise unless detail is requested. If a question depends on live/current information, say that your answer may need current verification rather than inventing facts."
      },
      ...clean.filter(m => m.role !== "system")
    ];

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
        "HTTP-Referer": process.env.APP_URL || "https://example.com",
        "X-Title": "GHL Voice AI Agent"
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "openai/gpt-4o",
        messages,
        temperature: 0.5,
        max_tokens: 1200
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || data?.message || "OpenRouter request failed."
      });
    }

    const answer = data?.choices?.[0]?.message?.content;
    if (!answer) return res.status(502).json({ error: "No AI response received." });

    res.json({ answer, model: data?.model || process.env.OPENROUTER_MODEL || "openai/gpt-4o" });
  } catch (error) {
    res.status(500).json({ error: error?.message || "Unexpected server error." });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, "0.0.0.0", () => {
  console.log("AI backend listening on port " + port);
});
