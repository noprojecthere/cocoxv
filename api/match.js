const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Match ID required. Use ?id=match1' });
  }

  // Sanitize ID to prevent path traversal
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(process.cwd(), 'public', 'matches', `${safeId}.json`);

  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return res.status(200).json(data);
    } else {
      return res.status(404).json({ error: `Match "${safeId}" not found` });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load match data', details: err.message });
  }
};
