const https = require('https');
const http = require('http');
const { URL } = require('url');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ error: 'url required' });

  let customHeaders = {};
  if (req.query.headers) {
    try { customHeaders = JSON.parse(decodeURIComponent(req.query.headers)); } catch(e) {}
  }

  fetchUrl(targetUrl, customHeaders, res, 0);
};

function fetchUrl(targetUrl, customHeaders, res, redirectCount) {
  if (redirectCount > 5) return res.status(502).json({ error: 'Too many redirects' });

  try {
    const parsed = new URL(targetUrl);
    const lib = parsed.protocol === 'https:' ? https : http;

    const headers = {
      'User-Agent': customHeaders['User-Agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Connection': 'keep-alive'
    };

    // Add custom headers
    if (customHeaders['Referer']) headers['Referer'] = customHeaders['Referer'];
    if (customHeaders['Origin']) headers['Origin'] = customHeaders['Origin'];
    if (customHeaders['Cookie']) headers['Cookie'] = customHeaders['Cookie'];

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: headers,
      timeout: 8000
    };

    const proxyReq = lib.request(options, (proxyRes) => {

      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode) && proxyRes.headers['location']) {
        let newUrl = proxyRes.headers['location'];
        if (!newUrl.startsWith('http')) {
          newUrl = parsed.protocol + '//' + parsed.host + newUrl;
        }
        proxyRes.resume();
        return fetchUrl(newUrl, customHeaders, res, redirectCount + 1);
      }

      // Error status
      if (proxyRes.statusCode >= 400) {
        let body = '';
        proxyRes.setEncoding('utf-8');
        proxyRes.on('data', c => body += c);
        proxyRes.on('end', () => {
          res.status(proxyRes.statusCode).json({
            error: 'Upstream error',
            status: proxyRes.statusCode,
            body: body.substring(0, 500)
          });
        });
        return;
      }

      const ct = proxyRes.headers['content-type'] || '';
      const isM3U8 = ct.includes('mpegurl') || ct.includes('m3u8') ||
                     targetUrl.includes('.m3u8') || targetUrl.includes('m3u8');
      const isMPD = ct.includes('dash') || ct.includes('mpd') ||
                    targetUrl.includes('.mpd');

      if (isM3U8) {
        handleM3U8(targetUrl, customHeaders, proxyRes, res);
      } else if (isMPD) {
        handleMPD(targetUrl, customHeaders, proxyRes, res);
      } else {
        // Binary pipe (ts, mp4, key, etc.)
        if (ct) res.setHeader('Content-Type', ct);
        if (proxyRes.headers['content-length']) {
          res.setHeader('Content-Length', proxyRes.headers['content-length']);
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache');
        res.status(200);
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Proxy failed: ' + err.message });
      }
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: 'Timeout' });
      }
    });

    proxyReq.end();
  } catch(err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
}

function handleM3U8(targetUrl, customHeaders, proxyRes, res) {
  let body = '';
  proxyRes.setEncoding('utf-8');
  proxyRes.on('data', c => body += c);
  proxyRes.on('end', () => {
    const baseUrl = getBaseUrl(targetUrl);
    const eh = encodeURIComponent(JSON.stringify(customHeaders));

    const lines = body.split('\n');
    const rewritten = lines.map(line => {
      const t = line.trim();

      // Empty line
      if (!t) return line;

      // Comment lines - check for URI= in EXT-X-KEY etc
      if (t.startsWith('#')) {
        if (t.includes('URI="')) {
          return t.replace(/URI="([^"]+)"/g, (match, uri) => {
            const full = makeAbsolute(uri, baseUrl);
            return 'URI="/api/proxy?url=' + encodeURIComponent(full) + '&headers=' + eh + '"';
          });
        }
        return line;
      }

      // URL line
      const full = makeAbsolute(t, baseUrl);
      return '/api/proxy?url=' + encodeURIComponent(full) + '&headers=' + eh;
    }).join('\n');

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(rewritten);
  });
}

function handleMPD(targetUrl, customHeaders, proxyRes, res) {
  let body = '';
  proxyRes.setEncoding('utf-8');
  proxyRes.on('data', c => body += c);
  proxyRes.on('end', () => {
    const baseUrl = getBaseUrl(targetUrl);
    const eh = encodeURIComponent(JSON.stringify(customHeaders));

    let rw = body;

    // Rewrite media, initialization, sourceURL
    rw = rw.replace(/(media|initialization|sourceURL)="([^"]+)"/g, (m, attr, url) => {
      // Skip if already has $
      if (url.includes('$')) {
        // Template URL - don't proxy (dash.js handles internally)
        return m;
      }
      const full = makeAbsolute(url, baseUrl);
      return attr + '="/api/proxy?url=' + encodeURIComponent(full) + '&headers=' + eh + '"';
    });

    // Rewrite BaseURL
    rw = rw.replace(/<BaseURL>([^<]+)<\/BaseURL>/g, (m, url) => {
      const full = makeAbsolute(url, baseUrl);
      return '<BaseURL>/api/proxy?url=' + encodeURIComponent(full) + '&headers=' + eh + '</BaseURL>';
    });

    res.setHeader('Content-Type', 'application/dash+xml');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(rw);
  });
}

function getBaseUrl(url) {
  const idx = url.lastIndexOf('/');
  return idx > 8 ? url.substring(0, idx + 1) : url + '/';
}

function makeAbsolute(url, baseUrl) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) {
    const parsed = new URL(baseUrl);
    return parsed.protocol + '//' + parsed.host + url;
  }
  return baseUrl + url;
}
