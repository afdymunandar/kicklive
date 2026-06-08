// api/proxy.js
export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url param');

  const target = decodeURIComponent(url);
  
  try {
    const response = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
    });

    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');

    const body = await response.text();
    res.status(response.status).send(body);
  } catch (err) {
    res.status(500).send('Proxy error: ' + err.message);
  }
}

