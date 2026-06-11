// File: api/proxy.js
// Proxy untuk stream m3u8/ts yang butuh Referer khusus

export default async function handler(req, res) {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://jalalive.id/'
      }
    });

    if (!response.ok) {
      return res.status(response.status).send('Upstream error: ' + response.status);
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // Kalau ini m3u8 (text), proses sebagai text & rewrite path segmen
    if (contentType.includes('mpegurl') || url.endsWith('.m3u8')) {
      const body = await response.text();
      const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);
      const rewritten = body.split('\n').map(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
          // line ini path segmen (.ts) atau variant playlist (.m3u8)
          const fullUrl = line.startsWith('http') ? line : baseUrl + line;
          return '/api/proxy?url=' + encodeURIComponent(fullUrl);
        }
        return line;
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).send(rewritten);
    }

    // Untuk file .ts (binary), forward sebagai buffer mentah
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(buffer);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
