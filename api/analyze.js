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

  const apiKey = process.env.ANTHROPIC_API_KEY;
console.log('ENV CHECK:', !!apiKey, Object.keys(process.env).filter(k => k.includes('ANTHROP')));
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const typeLabels = {
    message: 'text message or email',
    url: 'URL / website link',
    phone: 'phone number',
    screenshot: 'screenshot of a message or website'
  };

  const systemPrompt = `You are ScamShield AI, an expert scam detection system. Analyze the provided ${typeLabels[type] || 'content'} and respond ONLY with a valid JSON object — no markdown, no explanation outside the JSON.

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
- Always respond in the same language as the content analyzed`;

  const userContent = imageBase64
    ? [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
        { type: 'text', text: 'Analyze this screenshot for scam indicators.' }
      ]
    : [{ type: 'text', text: `Analyze this ${typeLabels[type]}:\n\n${content}` }];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(502).json({ error: 'AI service error', details: err });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || '';

    let result;
    try {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      result = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({ error: 'Invalid AI response format' });
    }

    if (!result.verdict || result.score === undefined || !result.summary) {
      return res.status(502).json({ error: 'Incomplete AI response' });
    }

    return res.status(200).json(result);

  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
