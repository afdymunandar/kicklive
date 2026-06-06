// api/standings.js - pakai worldcup26.ir (gratis, no auth)

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CACHE_KEY = 'wc2026_standings_v2';
const CACHE_TTL = 300; // 5 menit

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
    await fetch(`${UPSTASH_URL}/set/${key}?EX=${ttl}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(JSON.stringify(value))
    });
  } catch {}
}

const FLAG_MAP = {
  'Mexico': '🇲🇽', 'South Africa': '🇿🇦', 'South Korea': '🇰🇷', 'Czech Republic': '🇨🇿',
  'USA': '🇺🇸', 'United States': '🇺🇸', 'Canada': '🇨🇦', 'Brazil': '🇧🇷',
  'France': '🇫🇷', 'Germany': '🇩🇪', 'Argentina': '🇦🇷', 'Spain': '🇪🇸',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Portugal': '🇵🇹', 'Netherlands': '🇳🇱', 'Italy': '🇮🇹',
  'Belgium': '🇧🇪', 'Croatia': '🇭🇷', 'Morocco': '🇲🇦', 'Japan': '🇯🇵',
  'Australia': '🇦🇺', 'Ecuador': '🇪🇨', 'Senegal': '🇸🇳', 'Ghana': '🇬🇭',
  'Cameroon': '🇨🇲', 'Tunisia': '🇹🇳', 'Saudi Arabia': '🇸🇦', 'Iran': '🇮🇷',
  'Poland': '🇵🇱', 'Denmark': '🇩🇰', 'Serbia': '🇷🇸', 'Switzerland': '🇨🇭',
  'Uruguay': '🇺🇾', 'Colombia': '🇨🇴', 'Chile': '🇨🇱', 'Peru': '🇵🇪',
  'Costa Rica': '🇨🇷', 'Panama': '🇵🇦', 'Honduras': '🇭🇳', 'Jamaica': '🇯🇲',
  'Algeria': '🇩🇿', 'Egypt': '🇪🇬', 'Nigeria': '🇳🇬', 'Ivory Coast': '🇨🇮',
  'Mali': '🇲🇱', 'Turkey': '🇹🇷', 'Ukraine': '🇺🇦', 'Austria': '🇦🇹',
  'Sweden': '🇸🇪', 'Norway': '🇳🇴', 'New Zealand': '🇳🇿', 'Indonesia': '🇮🇩',
  'Greece': '🇬🇷', 'Romania': '🇷🇴', 'Slovakia': '🇸🇰', 'Iraq': '🇮🇶',
  'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Guinea': '🇬🇳', 'Kenya': '🇰🇪'
};

function getFlag(name) { return FLAG_MAP[name] || '🏳️'; }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');

  try {
    const cached = await redisGet(CACHE_KEY);
    if (cached) return res.status(200).json({ ...cached, fromCache: true });

    const response = await fetch('https://worldcup26.ir/get/groups', {
      headers: { 'Accept': 'application/json', 'User-Agent': 'KickLive/1.0' }
    });

    if (!response.ok) throw new Error('API failed: ' + response.status);
    const raw = await response.json();

    const groups = Array.isArray(raw) ? raw : (raw.groups || raw.data || []);
    const standings = {};

    groups.forEach(group => {
      const groupName = (group.name || group.group || '').replace('Group ', '').trim();
      if (!groupName) return;

      const teams = group.teams || group.standings || [];
      standings[groupName] = teams.map((t, i) => ({
        pos: t.position || t.rank || (i + 1),
        name: t.name || t.team_name || t.team || 'TBD',
        flag: getFlag(t.name || t.team_name || t.team || ''),
        p: t.played || t.games_played || 0,
        w: t.won || t.wins || 0,
        d: t.drawn || t.draws || 0,
        l: t.lost || t.losses || 0,
        gf: t.goals_for || t.gf || 0,
        ga: t.goals_against || t.ga || 0,
        gd: t.goal_difference || t.gd || 0,
        pts: t.points || t.pts || 0
      }));
    });

    const result = { standings, lastUpdated: new Date().toISOString() };
    await redisSet(CACHE_KEY, result, CACHE_TTL);
    return res.status(200).json({ ...result, fromCache: false });

  } catch (err) {
    // Kalau gagal return empty — tournament belum mulai wajar kosong
    return res.status(200).json({
      standings: {},
      lastUpdated: new Date().toISOString(),
      error: err.message
    });
  }
}
