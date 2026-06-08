// api/proxy.js — Vercel Serverless Function
export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url param');

  const target = decodeURIComponent(url);
  const targetUrl = new URL(target);
  
  try {
    const response = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
      },
    });

    let body = await response.text();
    const contentType = response.headers.get('content-type') || 'application/vnd.apple.mpegurl';
    
    // Proxy base URL
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const proxyBase = `${proto}://${host}/api/proxy?url=`;
    
    // Rewrite absolute URLs
    body = body.replace(/(^|[\s,])(https?:\/\/[^\s#\n]+)/g, (match, prefix, url) => {
      return prefix + proxyBase + encodeURIComponent(url);
    });
    
    // Rewrite relative paths
    body = body.replace(/(^|[\s,])(\/[^\/\s][^\s#\n]*)/g, (match, prefix, path) => {
      const absolute = targetUrl.origin + path;
      return prefix + proxyBase + encodeURIComponent(absolute);
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(body);
    
  } catch (err) {
    res.status(500).send('Proxy error: ' + err.message);
  }
}
