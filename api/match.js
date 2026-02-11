module.exports = function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  var id = req.query.id;
  if (!id) {
    return res.status(400).json({
      error: 'Match ID required',
      usage: '?id=match1',
      available: Object.keys(getMatches())
    });
  }

  var matches = getMatches();
  var safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');

  if (matches[safeId]) {
    return res.status(200).json(matches[safeId]);
  }

  return res.status(404).json({
    error: 'Match "' + safeId + '" not found',
    available: Object.keys(matches)
  });
};

function getMatches() {
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
    },

    "test": {
      "title": "🧪 Test - HLS (No Headers)",
      "logo": "",
      "group": "Test",
      "url": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      "type": "hls",
      "headers": {},
      "drm": null
    },

    "testproxy": {
      "title": "🧪 Test - HLS via Proxy",
      "logo": "",
      "group": "Test",
      "url": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      "type": "hls",
      "headers": {
        "Referer": "https://example.com/",
        "Origin": "https://example.com"
      },
      "drm": null
    },

    "testdash": {
      "title": "🧪 Test - DASH (No DRM)",
      "logo": "",
      "group": "Test",
      "url": "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd",
      "type": "dash",
      "headers": {},
      "drm": null
    },

    "testdrm": {
      "title": "🧪 Test - DASH ClearKey DRM",
      "logo": "",
      "group": "Test",
      "url": "https://media.axprod.net/TestVectors/v7-MultiDRM-SingleKey/Manifest_1080p_ClearKey.mpd",
      "type": "dash",
      "headers": {},
      "drm": {
        "type": "clearkey",
        "keyId": "9eb2cfcbe8cc84d626a9b34793ba4851",
        "key": "166634c675823c235a4a9446fad52e4d"
      }
    }

  };
}
