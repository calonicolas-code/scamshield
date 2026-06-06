module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, content } = req.body;
  if (!type || !content) return res.status(400).json({ error: 'Missing content' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: 'API key not configured' });

  const prompt = `Analyze this ${type} for scams. Respond ONLY with JSON: {"verdict":"scam"|"suspicious"|"legit","score":0-100,"label":"string","sub":"string","flags":[{"type":"red"|"yellow"|"green","text":"string"}],"summary":"string"}. Content: ${content}`;

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const d = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'Gemini error', details: d });
    const raw = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleaned);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
