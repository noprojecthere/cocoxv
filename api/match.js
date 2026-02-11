const path = require('path');
const fs = require('fs');

module.exports = (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({
      error: 'Match ID required',
      usage: 'Use ?id=match1'
    });
  }

  // Sanitize
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');

  // Try multiple paths (Vercel ke different build locations)
  const possiblePaths = [
    path.join(process.cwd(), 'public', 'matches', `${safeId}.json`),
    path.join(process.cwd(), 'matches', `${safeId}.json`),
    path.join(__dirname, '..', 'public', 'matches', `${safeId}.json`),
    path.join(__dirname, '..', 'matches', `${safeId}.json`)
  ];

  for (const filePath of possiblePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(raw);
        return res.status(200).json(data);
      }
    } catch (e) {
      continue;
    }
  }

  // If file not found, try embedded matches
  const embeddedMatches = getEmbeddedMatches();
  if (embeddedMatches[safeId]) {
    return res.status(200).json(embeddedMatches[safeId]);
  }

  return res.status(404).json({
    error: `Match "${safeId}" not found`,
    available: Object.keys(embeddedMatches)
  });
};

// BACKUP: Agar JSON files na milein to ye embedded data use hoga
function getEmbeddedMatches() {
  return {
    "match1": {
      "title": "🔴 England vs West Indies - STAR HINDI 🇮🇳",
      "logo": "http://api.sofascore.com/api/v1/unique-tournament/11185/image/dark",
      "group": "Cricket",
      "url": "https://jcevents.hotstar.com/bpk-tv/f0e3e64ae415771d8e460317ce97aa5e/Fallback/f0e3e64ae415771d8e460317ce97aa5e.m3u8",
      "type": "hls",
      "headers": {
        "Referer": "https://www.hotstar.com/",
        "Origin": "https://www.hotstar.com",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
      },
      "drm": null
    },
    "match2": {
      "title": "🏏 England vs West Indies - WILLOW",
      "logo": "http://api.sofascore.com/api/v1/unique-tournament/11185/image/dark",
      "group": "Cricket",
      "url": "https://otte.live.fly.ww.aiv-cdn.net/sin-nitro/live/clients/dash/enc/cqqpbb9tmi/out/v1/62a1d9fa14bb4acfad5085e413df06c0/cenc.mpd",
      "type": "dash",
      "headers": {},
      "drm": {
        "type": "clearkey",
        "keyId": "0aec2fcbea8d842e2d6196fc12fc5208",
        "key": "ea343Yey5fNjkT37Rdfpc3NWwY6vLZXoCtT3"
      }
    }
  };
}
