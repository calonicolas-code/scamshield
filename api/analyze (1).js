const Anthropic = require("@anthropic-ai/sdk");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { type, content, imageBase64, imageMediaType } = req.body;

  if (!content && !imageBase64) {
    return res.status(400).json({ error: "No content provided" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are ScamShield AI, an expert scam detection system. Analyze the provided content and respond ONLY with a valid JSON object — no markdown, no explanation outside the JSON.

Return this exact structure:
{
  "verdict": "SCAM" | "SUSPICIOUS" | "LEGITIMATE",
  "riskScore": <integer 0-100>,
  "title": "<short 4-6 word summary of what this is>",
  "explanation": "<2-3 sentences explaining your analysis>",
  "redFlags": ["<flag1>", "<flag2>", ...],
  "advice": ["<action1>", "<action2>", ...]
}

Rules:
- riskScore 0-30 = LEGITIMATE, 31-69 = SUSPICIOUS, 70-100 = SCAM
- redFlags: list specific suspicious elements found (empty array if none)
- advice: 2-4 actionable steps for the user
- Be concise, clear, and accurate
- Respond in the same language as the analyzed content`;

  try {
    let userContent;

    if (type === "screenshot" && imageBase64) {
      userContent = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: imageMediaType || "image/jpeg",
            data: imageBase64,
          },
        },
        {
          type: "text",
          text: "Analyze this screenshot for scam indicators. Return only the JSON.",
        },
      ];
    } else {
      const typeLabels = {
        message: "message or email",
        url: "URL or link",
        phone: "phone number",
      };
      const label = typeLabels[type] || "content";
      userContent = `Analyze this ${label} for scam indicators:\n\n${content}\n\nReturn only the JSON.`;
    }

    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Strip markdown fences if present
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleaned);

    // Validate required fields
    if (!result.verdict || result.riskScore === undefined) {
      throw new Error("Invalid response structure");
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("Analysis error:", err);
    return res.status(500).json({ error: "Analysis failed", detail: err.message });
  }
};
