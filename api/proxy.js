// api/proxy.js — Vercel Serverless Function
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Ambil raw URL dari req.url
  const fullUrl = req.url;
  const urlIndex = fullUrl.indexOf('?url=');
  if (urlIndex === -1) return res.status(400).send('Missing url param');

  let url;
  try {
    url = decodeURIComponent(fullUrl.slice(urlIndex + 5));
    if (url.includes('%')) {
      try { url = decodeURIComponent(url); } catch(e) {}
    }
  } catch(e) {
    url = fullUrl.slice(urlIndex + 5);
  }

  if (!url.startsWith('http')) {
    return res.status(400).send('Invalid url');
  }

  try {
    const targetUrl = new URL(url);
    // Base URL untuk resolve relative paths
    const baseUrl = targetUrl.href.substring(0, targetUrl.href.lastIndexOf('/') + 1);

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

    // File .ts = binary stream langsung
    if (url.includes('.ts') || contentType.includes('video') || contentType.includes('octet-stream')) {
      const buffer = await response.arrayBuffer();
      res.setHeader('Content-Type', 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=10');
      return res.status(200).send(Buffer.from(buffer));
    }

    // .m3u8 = rewrite URLs
    let body = await response.text();
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const proxyBase = `${proto}://${host}/api/proxy?url=`;

    const lines = body.split('\n').map(line => {
      const trimmed = line.trim();
      // Skip comment dan empty lines
      if (trimmed.startsWith('#') || trimmed === '') return line;
      
      let absoluteUrl;
      if (trimmed.startsWith('http')) {
        // Sudah absolute
        absoluteUrl = trimmed;
      } else if (trimmed.startsWith('/')) {
        // Root-relative
        absoluteUrl = targetUrl.origin + trimmed;
      } else {
        // Relative to current path
        absoluteUrl = baseUrl + trimmed;
      }
      
      return proxyBase + encodeURIComponent(absoluteUrl);
    });

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache');
    return res.status(200).send(lines.join('\n'));

  } catch (err) {
    return res.status(500).send('Proxy error: ' + err.message);
  }
}
EOF
echo "done"
