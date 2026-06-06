// api/schedule.js - worldcup26.ir + openfootball fallback

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CACHE_KEY = 'wc2026_sched_v3';
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
  'Japan':'🇯🇵','Australia':'🇦🇺','Ecuador':'🇪🇨','Senegal':'🇸🇳','Ghana':'🇬🇭',
  'Cameroon':'🇨🇲','Tunisia':'🇹🇳','Saudi Arabia':'🇸🇦','Iran':'🇮🇷','Poland':'🇵🇱',
  'Denmark':'🇩🇰','Serbia':'🇷🇸','Switzerland':'🇨🇭','Uruguay':'🇺🇾','Colombia':'🇨🇴',
  'Chile':'🇨🇱','Peru':'🇵🇪','Costa Rica':'🇨🇷','Panama':'🇵🇦','Honduras':'🇭🇳',
  'Algeria':'🇩🇿','Egypt':'🇪🇬','Nigeria':'🇳🇬','Ivory Coast':'🇨🇮','Mali':'🇲🇱',
  'Turkey':'🇹🇷','Ukraine':'🇺🇦','Austria':'🇦🇹','Sweden':'🇸🇪','Norway':'🇳🇴',
  'New Zealand':'🇳🇿','Indonesia':'🇮🇩','Greece':'🇬🇷','Romania':'🇷🇴','Iraq':'🇮🇶',
  'Wales':'🏴󠁧󠁢󠁷󠁬󠁳󠁿','Scotland':'🏴󠁧󠁢󠁳󠁣󠁴󠁿','Guinea':'🇬🇳','Kenya':'🇰🇪',
  'Jamaica':'🇯🇲','Venezuela':'🇻🇪','Paraguay':'🇵🇾','Bolivia':'🇧🇴'
};
const flag = n => FLAGS[n] || '🏳️';

function toWIB(timeStr) {
  try {
    const [time, tz] = timeStr.split(' ');
    const offset = parseInt(tz.replace('UTC','')) || 0;
    const [h,m] = time.split(':').map(Number);
    const wib = (h - offset + 7 + 24) % 24;
    return `${String(wib).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  } catch { return timeStr || '--:--'; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=60');

  try {
    const cached = await redisGet(CACHE_KEY);
    if (cached) return res.status(200).json({ ...cached, fromCache: true });

    let matches = [];
    let source = '';

    // Coba worldcup26.ir
    try {
      const r = await fetch('https://worldcup26.ir/get/games', {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
      });
      if (r.ok) {
        const raw = await r.json();
        const games = Array.isArray(raw) ? raw : (raw.games || raw.matches || raw.data || []);
        matches = games.map((m, i) => {
          const s1 = m.home_score ?? m.score_home ?? null;
          const s2 = m.away_score ?? m.score_away ?? null;
          const st = (m.status || '').toLowerCase();
          let status = 'NS';
          if (st.includes('finish') || st.includes('ft') || st.includes('end')) status = 'FT';
          else if (st.includes('live') || st.includes('progress') || st.includes('half')) status = 'LIVE';
          return {
            id: m.id || i+1,
            date: (m.date || m.match_date || '').split('T')[0],
            time: (m.time || m.match_time || '--:--').substring(0,5),
            team1: m.home_team || m.team1 || m.home || 'TBD',
            team2: m.away_team || m.team2 || m.away || 'TBD',
            flag1: flag(m.home_team || m.team1 || m.home || ''),
            flag2: flag(m.away_team || m.team2 || m.away || ''),
            score1: s1 ?? '-', score2: s2 ?? '-',
            status,
            group: m.group || m.stage || m.round || 'World Cup 2026',
            venue: m.stadium || m.venue || ''
          };
        });
        source = 'worldcup26.ir';
      }
    } catch {}

    // Fallback openfootball
    if (!matches.length) {
      const r = await fetch('https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json');
      const raw = await r.json();
      matches = (raw.matches || []).map((m, i) => {
        const s1 = m.score?.ft?.[0] ?? null;
        const s2 = m.score?.ft?.[1] ?? null;
        return {
          id: i+1,
          date: m.date,
          time: m.time ? toWIB(m.time) : '--:--',
          team1: m.team1 || 'TBD',
          team2: m.team2 || 'TBD',
          flag1: flag(m.team1), flag2: flag(m.team2),
          score1: s1 ?? '-', score2: s2 ?? '-',
          status: s1 !== null ? 'FT' : 'NS',
          group: m.group || m.round || 'World Cup 2026',
          venue: m.ground || ''
        };
      });
      source = 'openfootball';
    }

    const result = { matches, lastUpdated: new Date().toISOString(), source };
    await redisSet(CACHE_KEY, result, CACHE_TTL);
    return res.status(200).json({ ...result, fromCache: false });

  } catch (err) {
    return res.status(500).json({ matches: [], error: err.message });
  }
}
