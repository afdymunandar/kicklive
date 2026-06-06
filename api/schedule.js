// api/schedule.js - pakai worldcup26.ir (gratis, no auth)

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CACHE_KEY = 'wc2026_schedule_v2';
const CACHE_TTL = 300; // 5 menit (real-time)

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
  'Australia': '🇦🇺', 'Ecuador': '🇪🇨', 'Qatar': '🇶🇦', 'Senegal': '🇸🇳',
  'Ghana': '🇬🇭', 'Cameroon': '🇨🇲', 'Tunisia': '🇹🇳', 'Saudi Arabia': '🇸🇦',
  'Iran': '🇮🇷', 'Poland': '🇵🇱', 'Denmark': '🇩🇰', 'Serbia': '🇷🇸',
  'Switzerland': '🇨🇭', 'Uruguay': '🇺🇾', 'Colombia': '🇨🇴', 'Chile': '🇨🇱',
  'Peru': '🇵🇪', 'Bolivia': '🇧🇴', 'Venezuela': '🇻🇪', 'Paraguay': '🇵🇾',
  'Costa Rica': '🇨🇷', 'Panama': '🇵🇦', 'Honduras': '🇭🇳', 'Jamaica': '🇯🇲',
  'Algeria': '🇩🇿', 'Egypt': '🇪🇬', 'Nigeria': '🇳🇬', 'Ivory Coast': '🇨🇮',
  'Mali': '🇲🇱', 'Turkey': '🇹🇷', 'Ukraine': '🇺🇦', 'Austria': '🇦🇹',
  'Sweden': '🇸🇪', 'Norway': '🇳🇴', 'New Zealand': '🇳🇿', 'Indonesia': '🇮🇩',
  'Wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'Scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Greece': '🇬🇷', 'Romania': '🇷🇴',
  'Slovakia': '🇸🇰', 'Hungary': '🇭🇺', 'Iraq': '🇮🇶', 'Jordan': '🇯🇴',
  'UAE': '🇦🇪', 'Congo DR': '🇨🇩', 'Kenya': '🇰🇪', 'Zimbabwe': '🇿🇼',
  'Uganda': '🇺🇬', 'Zambia': '🇿🇲', 'Guinea': '🇬🇳', 'Cuba': '🇨🇺',
  'El Salvador': '🇸🇻', 'Trinidad and Tobago': '🇹🇹', 'Guatemala': '🇬🇹'
};

function getFlag(name) {
  return FLAG_MAP[name] || '🏳️';
}

function toWIB(dateStr, timeStr) {
  // timeStr format: "13:00 UTC-6"
  try {
    const [time, tz] = timeStr.split(' ');
    const offset = parseInt(tz.replace('UTC', '')) || 0;
    const [h, m] = time.split(':').map(Number);
    const wibHour = (h - offset + 7 + 24) % 24;
    return `${String(wibHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  } catch {
    return timeStr;
  }
}

async function fetchFromWorldCup26() {
  const res = await fetch('https://worldcup26.ir/get/games', {
    headers: { 'Accept': 'application/json', 'User-Agent': 'KickLive/1.0' }
  });
  if (!res.ok) throw new Error('worldcup26.ir failed: ' + res.status);
  return await res.json();
}

async function fetchFromOpenFootball() {
  const res = await fetch(
    'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json',
    { headers: { 'User-Agent': 'KickLive/1.0' } }
  );
  if (!res.ok) throw new Error('openfootball failed');
  return await res.json();
}

function transformOpenFootball(raw) {
  const matches = (raw.matches || []).map((m, i) => {
    const score1 = m.score?.ft?.[0] ?? null;
    const score2 = m.score?.ft?.[1] ?? null;
    let status = 'NS';
    if (score1 !== null && score2 !== null) status = 'FT';

    return {
      id: i + 1,
      date: m.date,
      time: m.time ? toWIB(m.date, m.time) : '--:--',
      team1: m.team1 || 'TBD',
      team2: m.team2 || 'TBD',
      flag1: getFlag(m.team1),
      flag2: getFlag(m.team2),
      score1: score1 ?? '-',
      score2: score2 ?? '-',
      status,
      group: m.group || m.round || 'World Cup 2026',
      venue: m.ground || ''
    };
  });
  return { matches, lastUpdated: new Date().toISOString(), source: 'openfootball' };
}

function transformWorldCup26(raw) {
  const games = Array.isArray(raw) ? raw : (raw.games || raw.matches || raw.data || []);
  const matches = games.map((m, i) => {
    const score1 = m.home_score ?? m.score_home ?? null;
    const score2 = m.away_score ?? m.score_away ?? null;
    const statusRaw = (m.status || '').toLowerCase();
    let status = 'NS';
    if (statusRaw.includes('finish') || statusRaw.includes('ft') || statusRaw.includes('ended')) status = 'FT';
    else if (statusRaw.includes('live') || statusRaw.includes('progress') || statusRaw.includes('half')) status = 'LIVE';

    const dateStr = m.date || m.match_date || '';
    const timeStr = m.time || m.match_time || '--:--';

    return {
      id: m.id || i + 1,
      date: dateStr.split('T')[0],
      time: timeStr.substring(0, 5),
      team1: m.home_team || m.team1 || m.home || 'TBD',
      team2: m.away_team || m.team2 || m.away || 'TBD',
      flag1: getFlag(m.home_team || m.team1 || m.home || ''),
      flag2: getFlag(m.away_team || m.team2 || m.away || ''),
      score1: score1 ?? '-',
      score2: score2 ?? '-',
      status,
      group: m.group || m.stage || m.round || 'World Cup 2026',
      venue: m.stadium || m.venue || ''
    };
  });
  return { matches, lastUpdated: new Date().toISOString(), source: 'worldcup26.ir' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');

  try {
    // Cek cache
    const cached = await redisGet(CACHE_KEY);
    if (cached) return res.status(200).json({ ...cached, fromCache: true });

    // Coba worldcup26.ir dulu
    let result;
    try {
      const raw = await fetchFromWorldCup26();
      result = transformWorldCup26(raw);
    } catch (e) {
      // Fallback ke openfootball
      const raw = await fetchFromOpenFootball();
      result = transformOpenFootball(raw);
    }

    await redisSet(CACHE_KEY, result, CACHE_TTL);
    return res.status(200).json({ ...result, fromCache: false });

  } catch (err) {
    return res.status(500).json({ matches: [], error: err.message });
  }
}
