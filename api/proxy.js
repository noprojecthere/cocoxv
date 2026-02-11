const https = require('https');
const http = require('http');
const { URL } = require('url');

module.exports = (req, res) => {
  // CORS
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
    } catch (e) {
      // ignore
    }
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
      timeout: 30000
    };

    const proxyReq = lib.request(options, (proxyRes) => {
      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(proxyRes.statusCode)) {
        const location = proxyRes.headers['location'];
        if (location) {
          let redirectUrl = location;
          if (!location.startsWith('http')) {
            redirectUrl = `${parsed.protocol}//${parsed.host}${location}`;
          }
          const encodedHeaders = encodeURIComponent(JSON.stringify(customHeaders));
          return res.redirect(`/api/proxy?url=${encodeURIComponent(redirectUrl)}&headers=${encodedHeaders}`);
        }
      }

      const contentType = proxyRes.headers['content-type'] || '';

      // Set response headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache, no-store');

      if (proxyRes.headers['content-type']) {
        res.setHeader('Content-Type', proxyRes.headers['content-type']);
      }

      // Check if this is an m3u8 manifest
      const isM3U8 = contentType.includes('mpegurl') ||
                     contentType.includes('m3u8') ||
                     targetUrl.includes('.m3u8');

      // Check if this is an MPD manifest
      const isMPD = contentType.includes('dash') ||
                    contentType.includes('xml') ||
                    targetUrl.includes('.mpd');

      if (isM3U8) {
        // Rewrite m3u8 URLs
        let body = '';
        proxyRes.setEncoding('utf-8');
        proxyRes.on('data', chunk => body += chunk);
        proxyRes.on('end', () => {
          const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
          const encodedHeaders = encodeURIComponent(JSON.stringify(customHeaders));

          const rewritten = body.split('\n').map(line => {
            const trimmed = line.trim();

            // Skip empty lines and comments
            if (!trimmed || trimmed.startsWith('#')) {
              // But check for URI= in EXT-X-KEY lines
              if (trimmed.includes('URI="')) {
                return trimmed.replace(/URI="([^"]+)"/, (match, uri) => {
                  let fullUri = uri.startsWith('http') ? uri : baseUrl + uri;
                  return `URI="/api/proxy?url=${encodeURIComponent(fullUri)}&headers=${encodedHeaders}"`;
                });
              }
              return line;
            }

            // This is a URL line
            let fullUrl = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed;
            return `/api/proxy?url=${encodeURIComponent(fullUrl)}&headers=${encodedHeaders}`;
          }).join('\n');

          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
          res.status(200).send(rewritten);
        });
      } else if (isMPD) {
        // Rewrite MPD URLs
        let body = '';
        proxyRes.setEncoding('utf-8');
        proxyRes.on('data', chunk => body += chunk);
        proxyRes.on('end', () => {
          const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
          const encodedHeaders = encodeURIComponent(JSON.stringify(customHeaders));

          let rewritten = body;

          // Rewrite media, initialization, sourceURL attributes
          rewritten = rewritten.replace(/(media|initialization|sourceURL)="([^"]+)"/g, (match, attr, url) => {
            if (url.startsWith('http')) {
              return `${attr}="/api/proxy?url=${encodeURIComponent(url)}&headers=${encodedHeaders}"`;
            }
            return `${attr}="/api/proxy?url=${encodeURIComponent(baseUrl + url)}&headers=${encodedHeaders}"`;
          });

          // Rewrite BaseURL
          rewritten = rewritten.replace(/<BaseURL>([^<]+)<\/BaseURL>/g, (match, url) => {
            if (url.startsWith('http')) {
              return `<BaseURL>/api/proxy?url=${encodeURIComponent(url)}&headers=${encodedHeaders}</BaseURL>`;
            }
            return `<BaseURL>/api/proxy?url=${encodeURIComponent(baseUrl + url)}&headers=${encodedHeaders}</BaseURL>`;
          });

          res.setHeader('Content-Type', 'application/dash+xml');
          res.status(200).send(rewritten);
        });
      } else {
        // Binary content - pipe directly
        if (proxyRes.headers['content-length']) {
          res.setHeader('Content-Length', proxyRes.headers['content-length']);
        }
        res.status(proxyRes.statusCode);
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err.message);
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
