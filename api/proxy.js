// api/proxy.js — Vercel Serverless Function
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Ambil URL dari query - gabungkan semua setelah "url="
  const fullQuery = req.url;
  const urlIndex = fullQuery.indexOf('?url=');
  if (urlIndex === -1) return res.status(400).send('Missing url param');
  
  // Ambil semua karakter setelah "?url=" sebagai URL
  let encodedUrl = fullQuery.slice(urlIndex + 5);
  
  let url;
  try {
    url = decodeURIComponent(encodedUrl);
  } catch(e) {
    url = encodedUrl;
  }

  if (!url.startsWith('http')) {
    return res.status(400).send('Invalid url');
  }

  try {
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
      return res.status(response.status).send('Upstream error: ' + response.status);
    }

    const contentType = response.headers.get('content-type') || '';

    // File .ts = binary stream
    if (url.includes('.ts') || contentType.includes('video') || contentType.includes('octet-stream')) {
      const buffer = await response.arrayBuffer();
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=10');
      return res.status(200).send(Buffer.from(buffer));
    }

    // .m3u8 = rewrite URLs per baris
    let body = await response.text();
    const targetUrl = new URL(url);
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const proxyBase = `${proto}://${host}/api/proxy?url=`;

    const lines = body.split('\n').map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || trimmed === '') return line;
      if (trimmed.startsWith('http')) {
        return proxyBase + encodeURIComponent(trimmed);
      }
      const absolute = targetUrl.origin + (trimmed.startsWith('/') ? trimmed : '/' + trimmed);
      return proxyBase + encodeURIComponent(absolute);
    });

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).send(lines.join('\n'));

  } catch (err) {
    return res.status(500).send('Proxy error: ' + err.message);
  }
}
