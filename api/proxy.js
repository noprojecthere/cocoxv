const https = require('https');
const http = require('http');
const { URL } = require('url');

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const targetUrl = req.query.url;
  const headersParam = req.query.headers;

  if (!targetUrl) {
    return res.status(400).json({ error: 'url parameter required' });
  }

  let customHeaders = {};
  if (headersParam) {
    try {
      customHeaders = JSON.parse(decodeURIComponent(headersParam));
    } catch (e) {}
  }

  try {
    const parsed = new URL(targetUrl);
    const lib = parsed.protocol === 'https:' ? https : http;

    const reqHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Accept-Encoding': 'identity',
      ...customHeaders
    };

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: reqHeaders,
      timeout: 15000
    };

    const proxyReq = lib.request(options, (proxyRes) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
        const location = proxyRes.headers['location'];
        if (location) {
          let redirectUrl = location;
          if (!location.startsWith('http')) {
            redirectUrl = parsed.protocol + '//' + parsed.host + location;
          }
          const eh = encodeURIComponent(JSON.stringify(customHeaders));
          return res.writeHead(302, {
            'Location': '/api/proxy?url=' + encodeURIComponent(redirectUrl) + '&headers=' + eh
          }).end();
        }
      }

      const ct = proxyRes.headers['content-type'] || '';
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache, no-store');

      const isM3U8 = ct.includes('mpegurl') || ct.includes('m3u8') || targetUrl.includes('.m3u8');
      const isMPD = ct.includes('dash') || ct.includes('xml') || targetUrl.includes('.mpd');

      if (isM3U8) {
        let body = '';
        proxyRes.setEncoding('utf-8');
        proxyRes.on('data', c => body += c);
        proxyRes.on('end', () => {
          const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
          const eh = encodeURIComponent(JSON.stringify(customHeaders));

          const rewritten = body.split('\n').map(line => {
            const t = line.trim();

            if (!t || t.startsWith('#')) {
              if (t.includes('URI="')) {
                return t.replace(/URI="([^"]+)"/, (m, uri) => {
                  const full = uri.startsWith('http') ? uri : baseUrl + uri;
                  return 'URI="/api/proxy?url=' + encodeURIComponent(full) + '&headers=' + eh + '"';
                });
              }
              return line;
            }

            const full = t.startsWith('http') ? t : baseUrl + t;
            return '/api/proxy?url=' + encodeURIComponent(full) + '&headers=' + eh;
          }).join('\n');

          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.status(200).send(rewritten);
        });

      } else if (isMPD) {
        let body = '';
        proxyRes.setEncoding('utf-8');
        proxyRes.on('data', c => body += c);
        proxyRes.on('end', () => {
          const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
          const eh = encodeURIComponent(JSON.stringify(customHeaders));

          let rw = body;
          rw = rw.replace(/(media|initialization|sourceURL)="([^"]+)"/g, (m, attr, url) => {
            const full = url.startsWith('http') ? url : baseUrl + url;
            return attr + '="/api/proxy?url=' + encodeURIComponent(full) + '&headers=' + eh + '"';
          });

          rw = rw.replace(/<BaseURL>([^<]+)<\/BaseURL>/g, (m, url) => {
            const full = url.startsWith('http') ? url : baseUrl + url;
            return '<BaseURL>/api/proxy?url=' + encodeURIComponent(full) + '&headers=' + eh + '</BaseURL>';
          });

          res.setHeader('Content-Type', 'application/dash+xml');
          res.status(200).send(rw);
        });

      } else {
        if (proxyRes.headers['content-type']) {
          res.setHeader('Content-Type', proxyRes.headers['content-type']);
        }
        if (proxyRes.headers['content-length']) {
          res.setHeader('Content-Length', proxyRes.headers['content-length']);
        }
        res.status(proxyRes.statusCode);
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', (err) => {
      res.status(502).json({ error: 'Proxy failed', details: err.message });
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      res.status(504).json({ error: 'Timeout' });
    });

    proxyReq.end();

  } catch (err) {
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};
