export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, content, imageBase64 } = req.body;
  if (!type || (!content && !imageBase64)) {
    return res.status(400).json({ error: 'Missing type or content' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const typeLabels = {
    message: 'text message or email',
    url: 'URL / website link',
    phone: 'phone number',
    screenshot: 'screenshot of a message or website'
  };

  const prompt = `You are ScamShield AI, an expert scam detection system. Analyze the provided ${typeLabels[type] || 'content'} and respond ONLY with a valid JSON object — no markdown, no explanation outside the JSON.

Return exactly this structure:
{
  "verdict": "scam" | "suspicious" | "legit",
  "score": <integer 0-100 representing scam risk, 100 = definitely a scam>,
  "label": "<short verdict label>",
  "sub": "<one short sentence summarizing the verdict>",
  "flags": [{ "type": "red" | "yellow" | "green", "text": "<short flag label>" }],
  "summary": "<2-3 sentence plain-language explanation>"
}

Rules:
- score 80-100 = scam, 40-79 = suspicious, 0-39 = legit
- Include 3-5 flags mixing red, yellow, green
- Always respond in the same language as the content analyzed

Content to analyze:
${content && content !== 'screenshot' ? content : '[screenshot provided]'}`;

  try {
    const parts = [];
    if (imageBase64) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
      parts.push({ text: prompt });
    } else {
      parts.push({ text: prompt });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 600 }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      return res.status(502).json({ error: 'AI service error', details: err });
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?
