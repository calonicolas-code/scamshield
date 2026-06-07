module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  var body = req.body;
  var type = body.type;
  var content = body.content;
  var imageBase64 = body.imageBase64;
  var imageMediaType = body.imageMediaType;

  if (!content && !imageBase64) {
    return res.status(400).json({ error: "No content provided" });
  }

  var apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  var prompt = "You are ScamShield AI. Analyze the content and respond ONLY with valid JSON, no markdown, no text outside JSON. Structure: {\"verdict\":\"SCAM\"|\"SUSPICIOUS\"|\"LEGITIMATE\",\"riskScore\":0-100,\"title\":\"short summary\",\"explanation\":\"2-3 sentences\",\"redFlags\":[],\"advice\":[]}. riskScore 0-30=LEGITIMATE, 31-69=SUSPICIOUS, 70-100=SCAM. Respond in the same language as the content.";

  try {
    var parts;

    if (type === "screenshot" && imageBase64) {
      parts = [
        { inline_data: { mime_type: imageMediaType || "image/jpeg", data: imageBase64 } },
        { text: prompt + " Analyze this screenshot." }
      ];
    } else {
      var label = type === "url" ? "URL" : type === "phone" ? "phone number" : "message";
      parts = [{ text: prompt + " Analyze this " + label + ": " + content }];
    }

    var url = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=" + apiKey;

    var response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: parts }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
      })
    });

    var data = await response.json();

    if (!response.ok) {
      console.error("Gemini error:", JSON.stringify(data));
      return res.status(500).json({ error: "AI API error", detail: data.error ? data.error.message : "Unknown" });
    }

    var rawText = "";
    if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
      rawText = data.candidates[0].content.parts[0].text;
    }

    var match = rawText.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in response");
    var result = JSON.parse(match[0]);

    if (!result.verdict || result.riskScore === undefined) {
      throw new Error("Invalid structure");
    }

    return res.status(200).json(result);

  } catch (err) {
    console.error("Error:", err.message);
    return res.status(500).json({ error: "Analysis failed", detail: err.message });
  }
};
