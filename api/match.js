module.exports = (req, res) => {
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
      usage: 'yoursite.vercel.app/?id=match1',
      available: Object.keys(matches)
    });
  }

  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');

  // =============================================
  // ✅ SAARE MATCHES YAHAN ADD KARO
  // =============================================
  const matches = {

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

    // ✅ NAYA MATCH ADD KARNA HO TO:
    // "match3": {
    //   "title": "Match Name",
    //   "logo": "logo_url",
    //   "group": "Cricket",
    //   "url": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    //   "type": "hls",
    //   "headers": {},
    //   "drm": null
    // }

  };

  if (matches[safeId]) {
    return res.status(200).json(matches[safeId]);
  }

  return res.status(404).json({
    error: 'Match "' + safeId + '" not found',
    available: Object.keys(matches)
  });
};
