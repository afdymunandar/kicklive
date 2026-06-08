// api/proxy.js — Vercel Serverless Function
export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url param');

  const target = decodeURIComponent(url);

  try {
    const targetUrl = new URL(target);

    const response = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Referer': 'https://jlbfpc.jlbfyh.com/',
        'Origin': 'https://jlbfpc.jlbfyh.com/',
      },
    });

    if (!response.ok) {
      return res.status(response.status).send('Upstream error: ' + response.status);
    }

    let body = await response.text();
    const contentType = response.headers.get('content-type') || 'application/vnd.apple.mpegurl';

    // Proxy base URL
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const proxyBase = `${proto}://${host}/api/proxy?url=`;

    // Rewrite absolute URLs dalam playlist m3u8
    body = body.replace(/(^|\s)(https?:\/\/[^\s#\n]+)/gm, (match, prefix, u) => {
      return prefix + proxyBase + encodeURIComponent(u);
    });

    // Rewrite relative paths
    body = body.replace(/^([^#\n][^\n]*\.ts[^\n]*)$/gm, (match) => {
      if (match.startsWith('http')) return match;
      const absolute = targetUrl.origin + '/' + match.replace(/^\//, '');
      return proxyBase + encodeURIComponent(absolute);
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    res.status(200).send(body);

  } catch (err) {
    res.status(500).send('Proxy error: ' + err.message);
  }
}
