// api/standings.js
// Generate standings dari jadwal openfootball
// Sebelum tournament: tampilkan 12 grup dengan 48 tim (pts semua 0)
// Setelah match dimainkan: hitung otomatis dari score

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CACHE_KEY = 'wc2026_stand_v5';
const CACHE_TTL = 1800;

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
    await fetch(`${UPSTASH_URL}/set/${key}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify([key, JSON.stringify(value), 'EX', ttl])
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
  'Bosnia & Herzegovina':'🇧🇦','Haiti':'🇭🇹','Qatar':'🇶🇦','Curaçao':'🇨🇼',
  'Curaçao':'🇨🇼','Venezuela':'🇻🇪','El Salvador':'🇸🇻','Guatemala':'🇬🇹',
  'Trinidad and Tobago':'🇹🇹','Congo DR':'🇨🇩'
};
const flag = n => FLAGS[n] || '🏳️';

function calcStandings(matches) {
  const groups = {};

  // Init semua tim dari jadwal
  matches.forEach(m => {
    const g = (m.group || '').replace('Group ', '').trim();
    if (!g || g.length > 2) return; // skip non-group (knockout)
    if (!groups[g]) groups[g] = {};

    [m.team1, m.team2].forEach(team => {
      if (team && team !== 'TBD' && !groups[g][team]) {
        groups[g][team] = { name: team, flag: flag(team), p:0, w:0, d:0, l:0, gf:0, ga:0, gd:0, pts:0 };
      }
    });
  });

  // Hitung dari hasil pertandingan
  matches.forEach(m => {
    const g = (m.group || '').replace('Group ', '').trim();
    if (!g || g.length > 2) return;
    const s1 = m.score?.ft?.[0];
    const s2 = m.score?.ft?.[1];
    if (s1 === undefined || s2 === undefined) return;
    if (!groups[g]?.[m.team1] || !groups[g]?.[m.team2]) return;

    const t1 = groups[g][m.team1];
    const t2 = groups[g][m.team2];
    t1.p++; t2.p++;
    t1.gf += s1; t1.ga += s2; t1.gd = t1.gf - t1.ga;
    t2.gf += s2; t2.ga += s1; t2.gd = t2.gf - t2.ga;

    if (s1 > s2) { t1.w++; t1.pts+=3; t2.l++; }
    else if (s1 < s2) { t2.w++; t2.pts+=3; t1.l++; }
    else { t1.d++; t1.pts++; t2.d++; t2.pts++; }
  });

  // Sort dan format
  const result = {};
  Object.keys(groups).sort().forEach(g => {
    const sorted = Object.values(groups[g])
      .sort((a,b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.name.localeCompare(b.name))
      .map((t, i) => ({ pos: i+1, ...t }));
    result[g] = sorted;
  });

  return result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (req.query.flush) {
    await fetch(`${UPSTASH_URL}/del/${CACHE_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    }).catch(() => {});
  }

  try {
    if (!req.query.flush) {
      const cached = await redisGet(CACHE_KEY);
      if (cached && Object.keys(cached.standings || {}).length > 0) {
        return res.status(200).json({ ...cached, fromCache: true });
      }
    }

    // Fetch jadwal dari openfootball
    const r = await fetch(
      'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json',
      { headers: { 'User-Agent': 'KickLive/1.0' } }
    );
    const raw = await r.json();
    const standings = calcStandings(raw.matches || []);

    const result = { standings, lastUpdated: new Date().toISOString() };
    await redisSet(CACHE_KEY, result, CACHE_TTL);
    return res.status(200).json({ ...result, fromCache: false });

  } catch (err) {
    return res.status(200).json({ standings: {}, error: err.message });
  }
}
