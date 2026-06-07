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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  const systemPrompt = "You are ScamShield AI, an expert scam detection system. Analyze the provided content and respond ONLY with a valid JSON object — no markdown, no explanation outside the JSON.\n\nReturn this exact structure:\n{\n  \"verdict\": \"SCAM\" | \"SUSPICIOUS\" | \"LEGITIMATE\",\n  \"riskScore\": <integer 0-100>,\n  \"title\": \"<short 4-6 word summary>\",\n  \"explanation\": \"<2-3 sentences explaining your analysis>\",\n  \"redFlags\": [\"<flag1>\", \"<flag2>\"],\n  \"advice\": [\"<action1>\", \"<action2>\"]\n}\n\nRules:\n- riskScore 0-30 = LEGITIMATE, 31-69 = SUSPICIOUS, 70-100 = SCAM\n- redFlags: list specific suspicious elements found (empty array if none)\n- advice: 2-4 actionable steps for the user\n- Respond in the same language as the analyzed content";

  try {
    let parts;

    if (type === "screenshot" && imageBase64) {
      parts = [
        {
          inline_data: {
            mime_type: imageMediaType || "image/jpeg",
            data: imageBase64,
          },
        },
        { text: systemPrompt + "\n\nAnalyze this screenshot for scam indicators. Return only the JSON." },
      ];
    } else {
      var labels = { message: "message or email", url: "URL or link", phone: "phone number" };
      var label = labels[type] || "content";
      parts = [
        {
          text: systemPrompt + "\n\nAnalyze this " + label + " for scam indicators:\n\n" + content + "\n\nReturn only the JSON.",
        },
      ];
    }

    var geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=" + apiKey;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1024,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", JSON.stringify(data));
      return res.status(500).json({ error: "AI API error", detail: data.error ? data.error.message : "Unknown error" });
    }

    var rawText = "";
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
      rawText = data.candidates[0].content.parts[0].text;
    }

    var jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    var cleaned = jsonMatch[0].trim();
    var result = JSON.parse(cleaned);

    if (!result.verdict || result.riskScore === undefined) {
      throw new Error("Invalid response structure");
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("Analysis error:", err.message);
    return res.status(500).json({ error: "Analysis failed", detail: err.message });
  }
};
