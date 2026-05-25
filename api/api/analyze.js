export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const { messages, isImage, imageData, imageMime, content, activeTab } = req.body;

  try {
    const systemPrompt = `You are a world-class cybersecurity expert specializing in scam and fraud detection. ${isImage ? 'First read all text visible in the image, then analyze it for scam indicators.' : ''} Respond ONLY in valid JSON (no markdown, no backticks): {"verdict":"SCAM"|"SUSPICIOUS"|"LEGITIMATE","score":<0-100>,"summary":"<one sentence>","analysis":"<2-3 sentences>","signals":[{"type":"danger"|"warning"|"ok","text":"<signal>"}]} Detect: urgency tactics, suspicious links, requests for sensitive data, unrealistic promises, impersonation, social engineering. Give 2-5 signals. Respond in the same language as the content.`;

    let body;
    if (isImage) {
      body = { contents: [{ parts: [
        { text: systemPrompt },
        { inline_data: { mime_type: imageMime, data: imageData } }
      ]}]};
    } else {
      body = { contents: [{ parts: [{ text: `${systemPrompt}\n\nAnalyze this ${activeTab}: ${content}` }] }]};
    }

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (data.error) return res.status(500).json({ error: data.error.message });

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({ raw });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
