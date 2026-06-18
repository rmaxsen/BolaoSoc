// GET /api/match?home=Brasil&away=Marrocos&date=2026-06-13
// Devolve, num pacote só: placar/status ao vivo, eventos (gols/cartões),
// escalações, estatísticas e histórico de confrontos (H2H).
// Faz várias chamadas à API só quando alguém abre o painel; o resultado
// é cacheado no edge (60s ao vivo, 1h quando não há jogo rolando) pra
// economizar a cota gratuita (100 req/dia).
import { apiGet, matchesTeam, WC_LEAGUE, WC_SEASON, sendErr } from './_lib.js';

const LIVE = new Set(['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT']);

export default async function handler(req, res) {
  const { home, away, date } = req.query;
  if (!home || !away) return res.status(400).json({ error: 'params', message: 'Faltam times.' });
  try {
    // 1) Acha o jogo (fixture) pela data + nomes dos times.
    const day = (date || '').slice(0, 10);
    let fixtures = await apiGet('/fixtures', { league: WC_LEAGUE, season: WC_SEASON, date: day || undefined });
    if (!fixtures.length && !day) fixtures = await apiGet('/fixtures', { league: WC_LEAGUE, season: WC_SEASON });
    const fx = fixtures.find((f) => {
      const h = f.teams?.home?.name, a = f.teams?.away?.name;
      return (matchesTeam(home, h) && matchesTeam(away, a)) || (matchesTeam(home, a) && matchesTeam(away, h));
    });

    if (!fx) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=7200');
      return res.status(200).json({ found: false, message: 'Ainda não achei dados oficiais desse jogo.' });
    }

    const fixtureId = fx.fixture.id;
    const status = fx.fixture.status?.short;
    const isLive = LIVE.has(status);
    const homeId = fx.teams.home.id, awayId = fx.teams.away.id;

    // 2) Em paralelo: eventos, escalações, estatísticas e H2H.
    const [events, lineups, stats, h2h] = await Promise.all([
      apiGet('/fixtures/events', { fixture: fixtureId }).catch(() => []),
      apiGet('/fixtures/lineups', { fixture: fixtureId }).catch(() => []),
      apiGet('/fixtures/statistics', { fixture: fixtureId }).catch(() => []),
      apiGet('/fixtures/headtohead', { h2h: `${homeId}-${awayId}`, last: 6 }).catch(() => []),
    ]);

    const payload = {
      found: true,
      status: { short: status, long: fx.fixture.status?.long, elapsed: fx.fixture.status?.elapsed },
      teams: {
        home: { name: fx.teams.home.name, logo: fx.teams.home.logo },
        away: { name: fx.teams.away.name, logo: fx.teams.away.logo },
      },
      goals: fx.goals,
      venue: fx.fixture.venue,
      events: events.map((e) => ({
        minute: e.time?.elapsed, extra: e.time?.extra, teamId: e.team?.id, team: e.team?.name,
        player: e.player?.name, assist: e.assist?.name, type: e.type, detail: e.detail,
      })),
      lineups: lineups.map((l) => ({
        teamId: l.team?.id, team: l.team?.name, formation: l.formation,
        coach: l.coach?.name,
        startXI: (l.startXI || []).map((p) => ({ name: p.player?.name, number: p.player?.number, pos: p.player?.pos })),
        subs: (l.substitutes || []).map((p) => ({ name: p.player?.name, number: p.player?.number, pos: p.player?.pos })),
      })),
      statistics: stats.map((s) => ({
        teamId: s.team?.id, team: s.team?.name,
        items: (s.statistics || []).map((x) => ({ type: x.type, value: x.value })),
      })),
      h2h: h2h
        .filter((g) => g.fixture?.id !== fixtureId)
        .slice(0, 6)
        .map((g) => ({
          date: g.fixture?.date, league: g.league?.name,
          home: g.teams?.home?.name, away: g.teams?.away?.name,
          gh: g.goals?.home, ga: g.goals?.away,
        })),
      homeId, awayId,
    };

    res.setHeader('Cache-Control', isLive
      ? 's-maxage=60, stale-while-revalidate=120'
      : 's-maxage=3600, stale-while-revalidate=7200');
    res.status(200).json(payload);
  } catch (err) {
    sendErr(res, err);
  }
}
