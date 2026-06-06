// api/standings.js - worldcup26.ir

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CACHE_KEY = 'wc2026_stand_v3';
const CACHE_TTL = 300;

async function redisGet(key) {
  try {
    const res = await fetch(`${UPSTASH_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    });
    const data = await res.json();
    if (!data.result) return null;
    return JSON.parse(data.result);
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
      body: JSON.stringify({ value: JSON.stringify(value), ex: ttl })
    });
  } catch {}
}

const FLAGS = {
  'Mexico':'🇲🇽','South Africa':'🇿🇦','South Korea':'🇰🇷','Czech Republic':'🇨🇿',
  'USA':'🇺🇸','United States':'🇺🇸','Canada':'🇨🇦','Brazil':'🇧🇷','France':'🇫🇷',
  'Germany':'🇩🇪','Argentina':'🇦🇷','Spain':'🇪🇸','England':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','Portugal':'🇵🇹',
  'Netherlands':'🇳🇱','Italy':'🇮🇹','Belgium':'🇧🇪','Croatia':'🇭🇷','Morocco':'🇲🇦',
  'Japan':'🇯🇵','Australia':'🇦🇺','Senegal':'🇸🇳','Ghana':'🇬🇭','Cameroon':'🇨🇲',
  'Tunisia':'🇹🇳','Saudi Arabia':'🇸🇦','Iran':'🇮🇷','Poland':'🇵🇱','Denmark':'🇩🇰',
  'Serbia':'🇷🇸','Switzerland':'🇨🇭','Uruguay':'🇺🇾','Colombia':'🇨🇴','Chile':'🇨🇱',
  'Costa Rica':'🇨🇷','Panama':'🇵🇦','Honduras':'🇭🇳','Algeria':'🇩🇿','Egypt':'🇪🇬',
  'Nigeria':'🇳🇬','Ivory Coast':'🇨🇮','Mali':'🇲🇱','Turkey':'🇹🇷','Ukraine':'🇺🇦',
  'New Zealand':'🇳🇿','Indonesia':'🇮🇩','Greece':'🇬🇷','Iraq':'🇮🇶','Guinea':'🇬🇳'
};
const flag = n => FLAGS[n] || '🏳️';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');

  try {
    const cached = await redisGet(CACHE_KEY);
    if (cached) return res.status(200).json({ ...cached, fromCache: true });

    const r = await fetch('https://worldcup26.ir/get/groups', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    });
    if (!r.ok) throw new Error('API ' + r.status);

    const raw = await r.json();
    const groups = Array.isArray(raw) ? raw : (raw.groups || raw.data || []);
    const standings = {};

    groups.forEach(g => {
      const name = (g.name || g.group || '').replace('Group ','').trim();
      if (!name) return;
      const teams = g.teams || g.standings || [];
      standings[name] = teams.map((t, i) => ({
        pos: t.position || t.rank || i+1,
        name: t.name || t.team_name || t.team || 'TBD',
        flag: flag(t.name || t.team_name || t.team || ''),
        p: t.played || t.games_played || 0,
        w: t.won || t.wins || 0,
        d: t.drawn || t.draws || 0,
        l: t.lost || t.losses || 0,
        gf: t.goals_for || t.gf || 0,
        ga: t.goals_against || t.ga || 0,
        pts: t.points || t.pts || 0
      }));
    });

    const result = { standings, lastUpdated: new Date().toISOString() };
    await redisSet(CACHE_KEY, result, CACHE_TTL);
    return res.status(200).json({ ...result, fromCache: false });

  } catch (err) {
    return res.status(200).json({ standings: {}, error: err.message });
  }
}
