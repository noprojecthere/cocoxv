const https = require('https');
const http = require('http');
const { URL } = require('url');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const targetUrl = req.query.url;
  const headersParam = req.query.headers;

  if (!targetUrl) {
    return res.status(400).json({ error: 'URL parameter required' });
  }

  let customHeaders = {};
  if (headersParam) {
    try {
      customHeaders = JSON.parse(decodeURIComponent(headersParam));
    } catch (e) {
      // ignore parse errors
    }
  }

  try {
    const parsedUrl = new URL(targetUrl);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;

    const requestHeaders = {
      'User-Agent': customHeaders['User-Agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      ...customHeaders
    };

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: requestHeaders
    };

    const proxyReq = protocol.request(options, (proxyRes) => {
      // Forward content type
      const contentType = proxyRes.headers['content-type'];
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }

      // Forward content length if present
      if (proxyRes.headers['content-length']) {
        res.setHeader('Content-Length', proxyRes.headers['content-length']);
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');

      res.status(proxyRes.statusCode);

      // For m3u8 files, rewrite URLs to also go through proxy
      if (contentType && (contentType.includes('mpegurl') || contentType.includes('m3u8') || targetUrl.endsWith('.m3u8'))) {
        let body = '';
        proxyRes.setEncoding('utf-8');
        proxyRes.on('data', (chunk) => {
          body += chunk;
        });
        proxyRes.on('end', () => {
          // Rewrite relative URLs in m3u8
          const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
          const encodedHeaders = encodeURIComponent(JSON.stringify(customHeaders));

          const rewritten = body.replace(/^(?!#)(.+\.(ts|m3u8|m4s|mp4|key|aac|vtt).*)$/gm, (match) => {
            let fullUrl;
            if (match.startsWith('http://') || match.startsWith('https://')) {
              fullUrl = match.trim();
            } else {
              fullUrl = baseUrl + match.trim();
            }
            return `/api/proxy?url=${encodeURIComponent(fullUrl)}&headers=${encodedHeaders}`;
          });

          // Also handle lines that are just paths without known extensions
          const finalRewritten = rewritten.replace(/^(?!#)(?!\/api\/proxy)([^\s]+)$/gm, (match) => {
            if (match.trim() === '') return match;
            let fullUrl;
            const trimmed = match.trim();
            if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
              fullUrl = trimmed;
            } else {
              fullUrl = baseUrl + trimmed;
            }
            return `/api/proxy?url=${encodeURIComponent(fullUrl)}&headers=${encodedHeaders}`;
          });

          res.send(finalRewritten);
        });
      } else if (contentType && (contentType.includes('dash') || contentType.includes('xml') || targetUrl.endsWith('.mpd'))) {
        let body = '';
        proxyRes.setEncoding('utf-8');
        proxyRes.on('data', (chunk) => {
          body += chunk;
        });
        proxyRes.on('end', () => {
          const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
          const encodedHeaders = encodeURIComponent(JSON.stringify(customHeaders));

          // Rewrite media/init URLs in MPD
          const rewritten = body.replace(/(media|initialization|sourceURL)="([^"]+)"/g, (match, attr, url) => {
            if (url.startsWith('http')) {
              return `${attr}="/api/proxy?url=${encodeURIComponent(url)}&headers=${encodedHeaders}"`;
            }
            return `${attr}="/api/proxy?url=${encodeURIComponent(baseUrl + url)}&headers=${encodedHeaders}"`;
          });

          // Fix BaseURL
          const finalRewritten = rewritten.replace(/<BaseURL>([^<]+)<\/BaseURL>/g, (match, url) => {
            if (url.startsWith('http')) {
              return `<BaseURL>/api/proxy?url=${encodeURIComponent(url)}&headers=${encodedHeaders}</BaseURL>`;
            }
            return `<BaseURL>/api/proxy?url=${encodeURIComponent(baseUrl + url)}&headers=${encodedHeaders}</BaseURL>`;
          });

          res.setHeader('Content-Type', 'application/dash+xml');
          res.send(finalRewritten);
        });
      } else {
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', (err) => {
      console.error('Proxy error:', err);
      res.status(500).json({ error: 'Proxy request failed', details: err.message });
    });

    proxyReq.setTimeout(30000, () => {
      proxyReq.destroy();
      res.status(504).json({ error: 'Proxy request timeout' });
    });

    proxyReq.end();
  } catch (err) {
    res.status(500).json({ error: 'Invalid URL or proxy error', details: err.message });
  }
};
