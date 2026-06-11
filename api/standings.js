// GET /api/standings  → tabela dos grupos da Copa (cache de 10 min no edge).
import { apiGet, WC_LEAGUE, WC_SEASON, sendErr } from './_lib.js';

export default async function handler(req, res) {
  try {
    const data = await apiGet('/standings', { league: WC_LEAGUE, season: WC_SEASON });
    // data[0].league.standings = array de grupos (cada grupo é um array de times)
    const league = data[0]?.league;
    const groups = (league?.standings || []).map((g) => ({
      group: g[0]?.group || '',
      rows: g.map((t) => ({
        rank: t.rank, team: t.team?.name, logo: t.team?.logo,
        points: t.points, played: t.all?.played, win: t.all?.win,
        draw: t.all?.draw, lose: t.all?.lose,
        gf: t.all?.goals?.for, ga: t.all?.goals?.against, gd: t.goalsDiff,
        form: t.form, desc: t.description,
      })),
    }));
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1200');
    res.status(200).json({ updated: new Date().toISOString(), groups });
  } catch (err) {
    sendErr(res, err);
  }
}
