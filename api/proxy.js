// api/proxy.js — Vercel Serverless Function
export default async function handler(req, res) {
  // Ambil raw URL dari query string - handle semua parameter
  const rawQuery = req.url.split('?').slice(1).join('?');
  const urlMatch = rawQuery.match(/^url=(.+)$/s);
  if (!urlMatch) return res.status(400).send('Missing url param');

  let url = urlMatch[1];

  // Decode URL
  try {
    url = decodeURIComponent(url);
    // Coba decode lagi kalau masih encoded
    if (url.includes('%')) {
      try { url = decodeURIComponent(url); } catch(e) {}
    }
  } catch(e) {}

  if (!url.startsWith('http')) {
    return res.status(400).send('Invalid url: ' + url.substring(0, 100));
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
      return res.status(response.status).send('Upstream: ' + response.status + ' for ' + url.substring(0, 100));
    }

    const contentType = response.headers.get('content-type') || '';

    // File .ts = stream binary langsung
    if (url.includes('.ts') || contentType.includes('video') || contentType.includes('octet-stream')) {
      const buffer = await response.arrayBuffer();
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=10');
      return res.status(200).send(Buffer.from(buffer));
    }

    // .m3u8 = rewrite URL
    let body = await response.text();
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const proxyBase = `${proto}://${host}/api/proxy?url=`;

    // Rewrite setiap baris yang berisi URL
    const lines = body.split('\n');
    const rewritten = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed === '') return line;
      if (trimmed.startsWith('http')) {
        return proxyBase + encodeURIComponent(trimmed);
      }
      // Relative path
      const absolute = targetUrl.origin + '/' + trimmed.replace(/^\//, '');
      return proxyBase + encodeURIComponent(absolute);
    });

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).send(rewritten.join('\n'));

  } catch (err) {
    return res.status(500).send('Proxy error: ' + err.message);
  }
}
