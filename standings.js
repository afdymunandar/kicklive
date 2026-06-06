// api/standings.js - Vercel Serverless Function
// Fetch WC2026 standings dari API-Sports, cache ke Upstash Redis 30 menit

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const API_KEY = process.env.API_SPORTS_KEY;
const CACHE_KEY = 'wc2026_standings';
const CACHE_TTL = 1800; // 30 menit
const WC2026_ID = 1; // World Cup 2026 league ID

async function redisGet(key) {
  const res = await fetch(`${UPSTASH_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  const data = await res.json();
  return data.result ? JSON.parse(data.result) : null;
}

async function redisSet(key, value, ttl) {
  await fetch(`${UPSTASH_URL}/set/${key}?EX=${ttl}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(JSON.stringify(value))
  });
}

async function fetchFromAPI() {
  const res = await fetch('https://v3.football.api-sports.io/standings?league=' + WC2026_ID + '&season=2026', {
    headers: { 'x-apisports-key': API_KEY }
  });
  const data = await res.json();

  if (!data.response || data.response.length === 0) {
    return null;
  }

  const standings = {};
  const allStandings = data.response[0]?.league?.standings || [];

  allStandings.forEach(groupArr => {
    if (!groupArr.length) return;
    // Group name: "Group A" → "A"
    const groupName = groupArr[0]?.group?.replace('Group ', '') || '?';
    standings[groupName] = groupArr.map(team => ({
      pos: team.rank,
      name: team.team.name,
      flag: getFlagEmoji(team.team.name),
      p: team.all.played,
      w: team.all.win,
      d: team.all.draw,
      l: team.all.lose,
      gf: team.all.goals.for,
      ga: team.all.goals.against,
      gd: team.goalsDiff,
      pts: team.points
    }));
  });

  return {
    standings,
    lastUpdated: new Date().toISOString()
  };
}

function getFlagEmoji(countryName) {
  const flags = {
    'Brazil': '🇧🇷', 'France': '🇫🇷', 'Germany': '🇩🇪', 'Argentina': '🇦🇷',
    'Spain': '🇪🇸', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Portugal': '🇵🇹', 'Netherlands': '🇳🇱',
    'Italy': '🇮🇹', 'Belgium': '🇧🇪', 'Croatia': '🇭🇷', 'Mexico': '🇲🇽',
    'USA': '🇺🇸', 'Canada': '🇨🇦', 'Morocco': '🇲🇦', 'Japan': '🇯🇵',
    'South Korea': '🇰🇷', 'Australia': '🇦🇺', 'Saudi Arabia': '🇸🇦', 'Iran': '🇮🇷',
    'Poland': '🇵🇱', 'Denmark': '🇩🇰', 'Serbia': '🇷🇸', 'Switzerland': '🇨🇭',
    'Uruguay': '🇺🇾', 'Colombia': '🇨🇴', 'Ecuador': '🇪🇨', 'Chile': '🇨🇱',
    'Peru': '🇵🇪', 'Bolivia': '🇧🇴', 'Venezuela': '🇻🇪', 'Paraguay': '🇵🇾',
    'Costa Rica': '🇨🇷', 'Panama': '🇵🇦', 'Honduras': '🇭🇳', 'Jamaica': '🇯🇲',
    'Algeria': '🇩🇿', 'Egypt': '🇪🇬', 'Nigeria': '🇳🇬', 'Ivory Coast': '🇨🇮',
    'Morocco': '🇲🇦', 'Senegal': '🇸🇳', 'Ghana': '🇬🇭', 'Cameroon': '🇨🇲',
    'Tunisia': '🇹🇳', 'South Africa': '🇿🇦', 'Mali': '🇲🇱', 'Guinea': '🇬🇳',
    'Turkey': '🇹🇷', 'Ukraine': '🇺🇦', 'Czech Republic': '🇨🇿', 'Austria': '🇦🇹',
    'Sweden': '🇸🇪', 'Norway': '🇳🇴', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
    'New Zealand': '🇳🇿', 'Indonesia': '🇮🇩', 'Japan': '🇯🇵', 'Qatar': '🇶🇦'
  };
  return flags[countryName] || '🏳️';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'public, max-age=900');

  try {
    const cached = await redisGet(CACHE_KEY);
    if (cached) {
      return res.status(200).json({ ...cached, fromCache: true });
    }

    const fresh = await fetchFromAPI();
    if (!fresh) {
      return res.status(200).json({ standings: {}, lastUpdated: new Date().toISOString(), error: 'No standings data yet' });
    }

    await redisSet(CACHE_KEY, fresh, CACHE_TTL);
    return res.status(200).json({ ...fresh, fromCache: false });
  } catch (err) {
    console.error('Standings API error:', err);
    return res.status(500).json({ standings: {}, error: err.message });
  }
}
