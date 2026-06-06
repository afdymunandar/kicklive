// api/schedule.js - openfootball (data lengkap WC2026)

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CACHE_KEY = 'wc2026_sched_v5';
const CACHE_TTL = 1800; // 30 menit

async function redisGet(key) {
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    const data = await res.json();
    return data.result ? JSON.parse(data.result) : null;
  } catch { return null; }
}

async function redisSet(key, value, ttl) {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    await fetch(`${UPSTASH_URL}/set/${key}/ex/${ttl}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'text/plain'
      },
      body: JSON.stringify(value)
    });
  } catch {}
}

const FLAGS = {
  'Mexico':'🇲🇽','South Africa':'🇿🇦','South Korea':'🇰🇷','Czech Republic':'🇨🇿',
  'USA':'🇺🇸','United States':'🇺🇸','Canada':'🇨🇦','Brazil':'🇧🇷','France':'🇫🇷',
  'Germany':'🇩🇪','Argentina':'🇦🇷','Spain':'🇪🇸','England':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','Portugal':'🇵🇹',
  'Netherlands':'🇳🇱','Italy':'🇮🇹','Belgium':'🇧🇪','Croatia':'🇭🇷','Morocco':'🇲🇦',
  'Japan':'🇯🇵','Australia':'🇦🇺','Ecuador':'🇪🇨','Senegal':'🇸🇳','Ghana':'🇬🇭',
  'Cameroon':'🇨🇲','Tunisia':'🇹🇳','Saudi Arabia':'🇸🇦','Iran':'🇮🇷','Poland':'🇵🇱',
  'Denmark':'🇩🇰','Serbia':'🇷🇸','Switzerland':'🇨🇭','Uruguay':'🇺🇾','Colombia':'🇨🇴',
  'Chile':'🇨🇱','Peru':'🇵🇪','Costa Rica':'🇨🇷','Panama':'🇵🇦','Honduras':'🇭🇳',
  'Algeria':'🇩🇿','Egypt':'🇪🇬','Nigeria':'🇳🇬','Ivory Coast':'🇨🇮','Mali':'🇲🇱',
  'Turkey':'🇹🇷','Ukraine':'🇺🇦','Austria':'🇦🇹','Sweden':'🇸🇪','Norway':'🇳🇴',
  'New Zealand':'🇳🇿','Indonesia':'🇮🇩','Greece':'🇬🇷','Romania':'🇷🇴','Iraq':'🇮🇶',
  'Wales':'🏴󠁧󠁢󠁷󠁬󠁳󠁿','Scotland':'🏴󠁧󠁢󠁳󠁣󠁴󠁿','Guinea':'🇬🇳','Kenya':'🇰🇪',
  'Jamaica':'🇯🇲','Venezuela':'🇻🇪','Paraguay':'🇵🇾','Bolivia':'🇧🇴',
  'El Salvador':'🇸🇻','Guatemala':'🇬🇹','Trinidad and Tobago':'🇹🇹',
  'Congo DR':'🇨🇩','Zimbabwe':'🇿🇼','Uganda':'🇺🇬','Zambia':'🇿🇲'
};
const flag = n => FLAGS[n] || '🏳️';

function toWIB(timeStr) {
  try {
    const [time, tz] = timeStr.split(' ');
    const offset = parseInt(tz.replace('UTC','')) || 0;
    const [h,m] = time.split(':').map(Number);
    const wib = ((h - offset + 7) % 24 + 24) % 24;
    return `${String(wib).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  } catch { return '--:--'; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');

  // Flush cache jika ada param
  if (req.query.flush) {
    await fetch(`${UPSTASH_URL}/del/${CACHE_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    }).catch(() => {});
  }

  try {
    if (!req.query.flush) {
      const cached = await redisGet(CACHE_KEY);
      if (cached && cached.matches && cached.matches.length > 0) {
        return res.status(200).json({ ...cached, fromCache: true });
      }
    }

    // Fetch dari openfootball GitHub
    const r = await fetch(
      'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json',
      { headers: { 'User-Agent': 'KickLive/1.0' }, cache: 'no-store' }
    );
    if (!r.ok) throw new Error('Fetch failed: ' + r.status);
    const raw = await r.json();

    const matches = (raw.matches || []).map((m, i) => {
      const s1 = m.score?.ft?.[0] ?? null;
      const s2 = m.score?.ft?.[1] ?? null;
      return {
        id: i + 1,
        date: m.date || '',
        time: m.time ? toWIB(m.time) : '--:--',
        team1: m.team1 || 'TBD',
        team2: m.team2 || 'TBD',
        flag1: flag(m.team1),
        flag2: flag(m.team2),
        score1: s1 ?? '-',
        score2: s2 ?? '-',
        status: s1 !== null ? 'FT' : 'NS',
        group: m.group || m.round || 'World Cup 2026',
        venue: m.ground || ''
      };
    });

    const result = { matches, lastUpdated: new Date().toISOString(), source: 'openfootball', total: matches.length };

    // Simpan ke Redis pakai Upstash REST format yang benar
    await fetch(`${UPSTASH_URL}/set/${CACHE_KEY}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([CACHE_KEY, JSON.stringify(result), 'EX', CACHE_TTL])
    }).catch(() => {});

    return res.status(200).json({ ...result, fromCache: false });

  } catch (err) {
    return res.status(500).json({ matches: [], error: err.message });
  }
}
