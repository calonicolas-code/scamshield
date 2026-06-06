module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  const key = process.env.GEMINI_API_KEY;
  
  if (!key) {
    return res.status(200).json({ debug: 'NO KEY', env: Object.keys(process.env).filter(k => k.includes('GEM') || k.includes('API')) });
  }
  
  return res.status(200).json({ debug: 'KEY FOUND', keyStart: key.substring(0, 8) });
};
