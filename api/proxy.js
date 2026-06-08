// api/proxy.js — Vercel Serverless Function
export default async function handler(req, res) {
  let { url } = req.query;
  if (!url) return res.status(400).send('Missing url param');

  // Handle double encoding
  try {
    let decoded = url;
    // Decode sampai tidak bisa di-decode lagi
    while (decoded !== decodeURIComponent(decoded)) {
      decoded = decodeURIComponent(decoded);
    }
    url = decoded;
  } catch(e) {
    // Kalau decode gagal, pakai url asli
  }

  // Validasi URL
  if (!url.startsWith('http')) {
    return res.status(400).send('Invalid url');
  }

  try {
    const targetUrl = new URL(url);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Referer': 'https://jlbfpc.jlbfyh.com/',
        'Origin': 'https://jlbfpc.jlbfyh.com/',
      },
    });

    if (!response.ok) {
      return res.status(response.status).send('Upstream: ' + response.status);
    }

    const contentType = response.headers.get('content-type') || '';

    // Kalau ini file .ts (video segment) — stream langsung, jangan rewrite
    if (url.includes('.ts') || contentType.includes('video') || contentType.includes('octet-stream')) {
      const buffer = await response.arrayBuffer();
      res.setHeader('Content-Type', contentType || 'video/mp2t');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=10');
      return res.status(200).send(Buffer.from(buffer));
    }

    // Kalau ini .m3u8 playlist — rewrite URL
    let body = await response.text();

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const proxyBase = `${proto}://${host}/api/proxy?url=`;

    // Rewrite absolute URLs
    body = body.replace(/^(https?:\/\/[^\s#\n]+)$/gm, (match) => {
      return proxyBase + encodeURIComponent(match);
    });

    // Rewrite relative .ts paths
    body = body.replace(/^([^#\n][^\n]*\.ts[^\n]*)$/gm, (match) => {
      if (match.startsWith('http')) return match;
      const absolute = targetUrl.origin + '/' + match.replace(/^\//, '');
      return proxyBase + encodeURIComponent(absolute);
    });

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).send(body);

  } catch (err) {
    return res.status(500).send('Proxy error: ' + err.message);
  }
}
