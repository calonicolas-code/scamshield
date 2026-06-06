module.exports = async function handler(req, res) {
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

  const label = typeLabels[type] || 'content';
  const textContent = content && content !== 'screenshot' ? content : '[screenshot provided]';

  const prompt = 'You are ScamShield AI, an expert scam detection system. Analyze the provided ' + label + ' and respond ONLY with a valid JSON object, no markdown, no explanation outside the JSON.\n\nReturn exactly this structure:\n{\n  "verdict": "scam",\n  "score": 85,\n  "label": "Scam Detected",\n  "sub": "One short sentence.",\n  "flags": [{ "type": "red", "text": "flag label" }],\n  "summary": "2-3 sentence explanation."\n}\n\nRules:\n- score 80-100 = scam, 40-79 = suspicious, 0-39 = legit\n- verdict must be exactly: scam, suspicious, or legit\n- Include 3-5 flags\n- Respond in the same language as the content\n\nContent to analyze:\n' + textContent;

  try {
    const parts = [];
    if (imageBase64) {
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
    }
    parts.push({ text: prompt });

    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: parts }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 600 }
        })
      }
    );

    if (!response.ok) {
      const err = await response.json();
      console.error('Gemini error:', JSON.stringify(err));
      return res.status(502).json({ error: 'AI service error' });
    }

    const data = await response.json();
    const raw = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] ? data.candidates[0].content.parts[0].text : '';

    if (!raw) {
      console.error('Empty response from Gemini:', JSON.stringify(data));
      return res.status(502).json({ error: 'Empty AI response' });
    }

    var result;
    try {
      var cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      result = JSON.parse(cleaned);
    } catch (e) {
      console.error('JSON parse failed:', raw);
      return res.status(502).json({ error: 'Invalid AI response format' });
    }

    if (!result.verdict || result.score === undefined || !result.summary) {
      return res.status(502).json({ error: 'Incomplete AI response' });
    }

    return res.status(200).json(result);

  } catch (err) {
    console.error('Handler error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
