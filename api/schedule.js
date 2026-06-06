export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const response = await fetch(
    'https://v3.football.api-sports.io/fixtures?league=1&season=2026&next=10',
    { headers: { 'x-apisports-key': process.env.API_SPORTS_KEY } }
  );
  
  const data = await response.json();
  return res.status(200).json(data);
}
