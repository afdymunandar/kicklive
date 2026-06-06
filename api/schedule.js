// api/schedule.js - Vercel Serverless Function
// Fetch WC2026 schedule dari API-Sports, cache ke Upstash Redis 30 menit

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const API_KEY = process.env.API_SPORTS_KEY;
const CACHE_KEY = 'wc2026_schedule';
const CACHE_TTL = 1800; // 30 menit
const WC2026_ID = 1; // World Cup 2026 league ID di API-Sports

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
  // Ambil jadwal World Cup 2026 season 2026
  const res = await fetch('https://v3.football.api-sports.io/fixtures?league=' + WC2026_ID + '&season=2026', {
    headers: {
      'x-apisports-key': API_KEY
    }
  });
  const data = await res.json();

  if (!data.response || data.response.length === 0) {
    return null;
  }

  // Transform ke format yang dipakai web
  const matches = data.response.map(f => {
    const fixture = f.fixture;
    const teams = f.teams;
    const goals = f.goals;
    const status = f.fixture.status;

    let matchStatus = 'NS';
    if (status.short === 'FT' || status.short === 'AET' || status.short === 'PEN') matchStatus = 'FT';
    else if (['1H','HT','2H','ET','BT','P','SUSP','INT','LIVE'].includes(status.short)) matchStatus = 'LIVE';

    const date = new Date(fixture.date);
    const wibOffset = 7 * 60; // WIB = UTC+7
    const wibDate = new Date(date.getTime() + wibOffset * 60000);
    const timeStr = wibDate.toISOString().substr(11, 5);
    const dateStr = date.toISOString().split('T')[0];

    return {
      id: fixture.id,
      date: dateStr,
      time: timeStr,
      team1: teams.home.name,
      team2: teams.away.name,
      flag1: getFlagEmoji(teams.home.name),
      flag2: getFlagEmoji(teams.away.name),
      score1: goals.home ?? '-',
      score2: goals.away ?? '-',
      status: matchStatus,
      group: f.league.round || 'World Cup 2026',
      venue: fixture.venue?.name || ''
    };
  });

  return {
    matches,
    lastUpdated: new Date().toISOString(),
    total: matches.length
  };
}

function getFlagEmoji(countryName) {
  const flags = {
    'Brazil': '🇧🇷', 'France': '🇫🇷', 'Germany': '🇩🇪', 'Argentina': '🇦🇷',
    'Spain': '🇪🇸', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Portugal': '🇵🇹', 'Netherlands': '🇳🇱',
    'Italy': '🇮🇹', 'Belgium': '🇧🇪', 'Croatia': '🇭🇷', 'Mexico': '🇲🇽',
    'USA': '🇺🇸', 'Canada': '🇨🇦', 'Morocco': '🇲🇦', 'Japan': '🇯🇵',
    'South Korea': '🇰🇷', 'Australia': '🇦🇺', 'Ecuador': '🇪🇨', 'Qatar': '🇶🇦',
    'Senegal': '🇸🇳', 'Ghana': '🇬🇭', 'Cameroon': '🇨🇲', 'Tunisia': '🇹🇳',
    'Saudi Arabia': '🇸🇦', 'Iran': '🇮🇷', 'Poland': '🇵🇱', 'Denmark': '🇩🇰',
    'Serbia': '🇷🇸', 'Switzerland': '🇨🇭', 'Uruguay': '🇺🇾', 'Colombia': '🇨🇴',
    'Chile': '🇨🇱', 'Peru': '🇵🇪', 'Bolivia': '🇧🇴', 'Venezuela': '🇻🇪',
    'Paraguay': '🇵🇾', 'Costa Rica': '🇨🇷', 'Panama': '🇵🇦', 'Honduras': '🇭🇳',
    'Guatemala': '🇬🇹', 'Jamaica': '🇯🇲', 'Trinidad and Tobago': '🇹🇹',
    'Algeria': '🇩🇿', 'Egypt': '🇪🇬', 'Nigeria': '🇳🇬', 'Ivory Coast': '🇨🇮',
    'Mali': '🇲🇱', 'Guinea': '🇬🇳', 'Congo DR': '🇨🇩', 'South Africa': '🇿🇦',
    'Uganda': '🇺🇬', 'Zambia': '🇿🇲', 'Zimbabwe': '🇿🇼', 'Mozambique': '🇲🇿',
    'Indonesia': '🇮🇩', 'Thailand': '🇹🇭', 'Vietnam': '🇻🇳', 'China': '🇨🇳',
    'India': '🇮🇳', 'UAE': '🇦🇪', 'Iraq': '🇮🇶', 'Jordan': '🇯🇴',
    'Turkey': '🇹🇷', 'Greece': '🇬🇷', 'Ukraine': '🇺🇦', 'Czech Republic': '🇨🇿',
    'Slovakia': '🇸🇰', 'Hungary': '🇭🇺', 'Romania': '🇷🇴', 'Austria': '🇦🇹',
    'Sweden': '🇸🇪', 'Norway': '🇳🇴', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
    'New Zealand': '🇳🇿', 'Fiji': '🇫🇯'
  };
  return flags[countryName] || '🏳️';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'public, max-age=900'); // browser cache 15 menit

  try {
    // Cek cache Upstash dulu
    const cached = await redisGet(CACHE_KEY);
    if (cached) {
      return res.status(200).json({ ...cached, fromCache: true });
    }

    // Kalau cache kosong, fetch dari API
    const fresh = await fetchFromAPI();
    if (!fresh) {
      return res.status(200).json({ matches: [], lastUpdated: new Date().toISOString(), error: 'No data from API' });
    }

    // Simpan ke Upstash
    await redisSet(CACHE_KEY, fresh, CACHE_TTL);

    return res.status(200).json({ ...fresh, fromCache: false });
  } catch (err) {
    console.error('Schedule API error:', err);
    return res.status(500).json({ matches: [], error: err.message });
  }
      }

