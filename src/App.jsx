import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from './supabase.js';

/* ============================================================
   BOLÃO DA COPA 2026 — versão definitiva (Supabase + Vercel)
   Placar exato 3 pts | vencedor/empate 1 pt
   Janela do palpite (abre 24h antes, fecha 15 min antes)
   é validada NO SERVIDOR — aqui na tela é só informação.
   ============================================================ */

const LOCK_MIN = 15;
const OPEN_HOURS = 24;
const SESSION_KEY = 'bolao26:session';

/* ---------- Bandeiras ---------- */
const FLAGS = {
  'México': '🇲🇽', 'África do Sul': '🇿🇦', 'Coreia do Sul': '🇰🇷', 'Rep. Tcheca': '🇨🇿',
  'Canadá': '🇨🇦', 'Bósnia e Herzegovina': '🇧🇦', 'Catar': '🇶🇦', 'Suíça': '🇨🇭',
  'Brasil': '🇧🇷', 'Marrocos': '🇲🇦', 'Haiti': '🇭🇹', 'Escócia': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Estados Unidos': '🇺🇸', 'Paraguai': '🇵🇾', 'Austrália': '🇦🇺', 'Turquia': '🇹🇷',
  'Alemanha': '🇩🇪', 'Curaçao': '🇨🇼', 'Costa do Marfim': '🇨🇮', 'Equador': '🇪🇨',
  'Holanda': '🇳🇱', 'Japão': '🇯🇵', 'Suécia': '🇸🇪', 'Tunísia': '🇹🇳',
  'Bélgica': '🇧🇪', 'Egito': '🇪🇬', 'Irã': '🇮🇷', 'Nova Zelândia': '🇳🇿',
  'Espanha': '🇪🇸', 'Cabo Verde': '🇨🇻', 'Arábia Saudita': '🇸🇦', 'Uruguai': '🇺🇾',
  'França': '🇫🇷', 'Senegal': '🇸🇳', 'Iraque': '🇮🇶', 'Noruega': '🇳🇴',
  'Argentina': '🇦🇷', 'Argélia': '🇩🇿', 'Áustria': '🇦🇹', 'Jordânia': '🇯🇴',
  'Portugal': '🇵🇹', 'RD Congo': '🇨🇩', 'Uzbequistão': '🇺🇿', 'Colômbia': '🇨🇴',
  'Inglaterra': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croácia': '🇭🇷', 'Panamá': '🇵🇦', 'Gana': '🇬🇭',
};
const flag = (t) => FLAGS[t] || '⚽';
const PHASES_KO = ['32 avos de final', 'Oitavas de final', 'Quartas de final', 'Semifinal', '3º lugar', 'Final'];

// Copa 2026 bracket seeding — 32 slots (par = confronto), baseado no chaveamento oficial FIFA
// g=grupo, p=posição (1=1º,2=2º,3=melhor 3º), lbl=label para exibir no bracket vazio
const COPA2026_SEEDS = [
  // Lado esquerdo (8 confrontos, slots 0-15)
  {lbl:'1E',g:'E',p:1},{lbl:'3º',p:3},
  {lbl:'1I',g:'I',p:1},{lbl:'3º',p:3},
  {lbl:'2A',g:'A',p:2},{lbl:'2B',g:'B',p:2},
  {lbl:'1F',g:'F',p:1},{lbl:'2C',g:'C',p:2},
  {lbl:'2K',g:'K',p:2},{lbl:'2L',g:'L',p:2},
  {lbl:'1H',g:'H',p:1},{lbl:'2J',g:'J',p:2},
  {lbl:'1D',g:'D',p:1},{lbl:'3º',p:3},
  {lbl:'1G',g:'G',p:1},{lbl:'3º',p:3},
  // Lado direito (8 confrontos, slots 16-31)
  {lbl:'1C',g:'C',p:1},{lbl:'2F',g:'F',p:2},
  {lbl:'2E',g:'E',p:2},{lbl:'2I',g:'I',p:2},
  {lbl:'1A',g:'A',p:1},{lbl:'3º',p:3},
  {lbl:'1L',g:'L',p:1},{lbl:'3º',p:3},
  {lbl:'1J',g:'J',p:1},{lbl:'2H',g:'H',p:2},
  {lbl:'2D',g:'D',p:2},{lbl:'2G',g:'G',p:2},
  {lbl:'1B',g:'B',p:1},{lbl:'3º',p:3},
  {lbl:'1K',g:'K',p:1},{lbl:'3º',p:3},
];

/* ---------- Bandeiras reais (flagcdn) — código ISO por seleção ---------- */
const FLAG_CODES = {
  'México': 'mx', 'África do Sul': 'za', 'Coreia do Sul': 'kr', 'Rep. Tcheca': 'cz',
  'Canadá': 'ca', 'Bósnia e Herzegovina': 'ba', 'Catar': 'qa', 'Suíça': 'ch',
  'Brasil': 'br', 'Marrocos': 'ma', 'Haiti': 'ht', 'Escócia': 'gb-sct',
  'Estados Unidos': 'us', 'Paraguai': 'py', 'Austrália': 'au', 'Turquia': 'tr',
  'Alemanha': 'de', 'Curaçao': 'cw', 'Costa do Marfim': 'ci', 'Equador': 'ec',
  'Holanda': 'nl', 'Japão': 'jp', 'Suécia': 'se', 'Tunísia': 'tn',
  'Bélgica': 'be', 'Egito': 'eg', 'Irã': 'ir', 'Nova Zelândia': 'nz',
  'Espanha': 'es', 'Cabo Verde': 'cv', 'Arábia Saudita': 'sa', 'Uruguai': 'uy',
  'França': 'fr', 'Senegal': 'sn', 'Iraque': 'iq', 'Noruega': 'no',
  'Argentina': 'ar', 'Argélia': 'dz', 'Áustria': 'at', 'Jordânia': 'jo',
  'Portugal': 'pt', 'RD Congo': 'cd', 'Uzbequistão': 'uz', 'Colômbia': 'co',
  'Inglaterra': 'gb-eng', 'Croácia': 'hr', 'Panamá': 'pa', 'Gana': 'gh',
};

/* Team primary colors (jersey colors) for KO design */
const TEAM_COLORS = {
  'Brasil': '#1e3c72', 'Argentina': '#1a5aa0', 'França': '#003399', 'Alemanha': '#000000',
  'Holanda': '#FF6B35', 'Itália': '#0066cc', 'Espanha': '#c60c1e', 'Portugal': '#006600',
  'Inglaterra': '#003366', 'Bélgica': '#FFD700', 'Uruguai': '#001f3f', 'Croácia': '#c60c1e',
  'Suíça': '#c8102e', 'México': '#006c3a', 'Colômbia': '#FFD700', 'Peru': '#c8102e',
  'Japão': '#003399', 'Coreia do Sul': '#c60c1e', 'Turquia': '#c8102e', 'Irã': '#c60c1e',
  'Egito': '#FFD700', 'Marrocos': '#005B3F', 'Senegal': '#00a651', 'Austrália': '#FFCD00',
  'Estados Unidos': '#002868', 'Canadá': '#FF0000', 'Costa Rica': '#002868', 'Panamá': '#0066cc',
  'Equador': '#FFD700', 'Paraguai': '#cc0000', 'Catar': '#8c1432',
  'Arábia Saudita': '#006c41', 'Jordânia': '#000000', 'Uzbequistão': '#003399', 'Curaçao': '#2563eb',
  'Suécia': '#003399', 'Noruega': '#BA0C2F', 'Tcheca': '#0B40B5', 'Áustria': '#ED2939',
  'Bósnia e Herzegovina': '#0066cc', 'Escócia': '#0066cc', 'País de Gales': '#15af51',
  'Iraque': '#CE1126', 'Haiti': '#00209F', 'Costa do Marfim': '#FCD116', 'Gana': '#FFD700',
  'Tunísia': '#E70013', 'Cabo Verde': '#2563eb', 'RD Congo': '#007fff', 'Rep. Tcheca': '#0B40B5',
  'Nigéria': '#007A5E', 'África do Sul': '#FFB81C', 'Nova Zelândia': '#000000',
};

/* Componente de bandeira: imagem real com fallback pro emoji se faltar código. */
function Flag({ team, size = 44 }) {
  const code = FLAG_CODES[team];
  if (!code) return <span style={{ fontSize: size * 0.78, lineHeight: 1 }} aria-hidden>{flag(team)}</span>;
  const w = Math.round(size);
  return (
    <img
      src={`https://flagcdn.com/h${size >= 40 ? 60 : 40}/${code}.png`}
      srcSet={`https://flagcdn.com/h${size >= 40 ? 120 : 80}/${code}.png 2x`}
      alt={`Bandeira ${team}`} width={w} height={Math.round(w * 0.68)} loading="lazy"
      style={{ borderRadius: 4, objectFit: 'cover', boxShadow: '0 2px 6px rgba(0,0,0,.28)', display: 'inline-block', verticalAlign: 'middle' }}
    />
  );
}

function Avatar({ user, size = 36 }) {
  if (!user) return null;
  const s = { width: size, height: size };
  if (user.avatar_url) return <img src={user.avatar_url} className="bl-avatar" alt={user.name} style={s} />;
  const initial = (user.name || '?')[0].toUpperCase();
  return <div className="bl-avatar-initials" style={{ ...s, fontSize: Math.round(size * 0.42) }}>{initial}</div>;
}

/* Campeão: palpite extra (5 pts), fecha em 21/06/2026 23:59 Brasília. */
const CHAMPION_PTS = 5;
const CHAMPION_DEADLINE = new Date('2026-06-21T23:59:59-03:00').getTime();

const BOOT_PTS = 2;
const BOOT_DEADLINE = new Date('2026-06-21T23:59:59-03:00').getTime();

/* ---------- Util ---------- */
const TZ = 'America/Sao_Paulo';
const fmtDay = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const dayKey = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: TZ });

const lockTime = (m) => new Date(m.kickoff).getTime() - LOCK_MIN * 60 * 1000;
const openTime = (m) => new Date(m.kickoff).getTime() - OPEN_HOURS * 60 * 60 * 1000;
const isLocked = (m, now) => now >= lockTime(m);
const isOpenWindow = (m, now) => now >= openTime(m) && now < lockTime(m);

function fmtCountdown(ms) {
  if (ms <= 0) return null;
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ${min % 60}min`;
  return `${Math.floor(h / 24)} dias`;
}

function points(pick, res, isKO = false) {
  if (!pick || !res) return null;
  const scoreAxis = (() => {
    if (pick.home === res.home && pick.away === res.away) return 3;
    return Math.sign(pick.home - pick.away) === Math.sign(res.home - res.away) ? 1 : 0;
  })();
  if (!isKO) return scoreAxis;
  // KO: infer pick qualifier from non-draw pick, or use explicit pick.qualifier
  const pickQ = pick.qualifier || (pick.home !== pick.away
    ? (pick.home > pick.away ? 'home' : 'away')
    : null);
  const resQ = res.qualifier || null;
  const qualAxis = (pickQ && resQ && pickQ === resQ) ? 2 : 0;
  return scoreAxis + qualAxis;
}

const loadSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
};
const saveSession = (s) => localStorage.setItem(SESSION_KEY, JSON.stringify(s));
const clearSession = () => localStorage.removeItem(SESSION_KEY);

const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error((error.message || 'Erro inesperado').replace(/^.*?: /, ''));
  return data;
};

/* ── ESPN API (gratuita, sem chave, CORS aberto) ── */
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world';
const ESPN_V2 = 'https://site.api.espn.com/apis/v2/sports/soccer/fifa.world';

async function espnGet(base, path, params = {}) {
  const url = new URL(base + path);
  Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, String(v)); });
  const r = await fetch(url.toString(), { cache: 'no-store' });
  if (!r.ok) { const e = new Error(`ESPN ${r.status}`); e.kind = 'api'; throw e; }
  return r.json();
}

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const TEAM_EN = {
  'México': ['Mexico'], 'África do Sul': ['South Africa'], 'Coreia do Sul': ['South Korea', 'Korea Republic'],
  'Rep. Tcheca': ['Czech Republic', 'Czechia'], 'Canadá': ['Canada'], 'Bósnia e Herzegovina': ['Bosnia and Herzegovina', 'Bosnia', 'Bosnia-Herzegovina'],
  'Catar': ['Qatar'], 'Suíça': ['Switzerland'], 'Brasil': ['Brazil'], 'Marrocos': ['Morocco'], 'Haiti': ['Haiti'],
  'Escócia': ['Scotland'], 'Estados Unidos': ['USA', 'United States'], 'Paraguai': ['Paraguay'], 'Austrália': ['Australia'],
  'Turquia': ['Turkey', 'Turkiye', 'Türkiye'], 'Alemanha': ['Germany'], 'Curaçao': ['Curacao'],
  'Costa do Marfim': ["Ivory Coast", "Cote d'Ivoire"], 'Equador': ['Ecuador'], 'Holanda': ['Netherlands'],
  'Japão': ['Japan'], 'Suécia': ['Sweden'], 'Tunísia': ['Tunisia'], 'Bélgica': ['Belgium'], 'Egito': ['Egypt'],
  'Irã': ['Iran'], 'Nova Zelândia': ['New Zealand'], 'Espanha': ['Spain'], 'Cabo Verde': ['Cape Verde Islands', 'Cape Verde'],
  'Arábia Saudita': ['Saudi Arabia'], 'Uruguai': ['Uruguay'], 'França': ['France'], 'Senegal': ['Senegal'],
  'Iraque': ['Iraq'], 'Noruega': ['Norway'], 'Argentina': ['Argentina'], 'Argélia': ['Algeria'], 'Áustria': ['Austria'],
  'Jordânia': ['Jordan'], 'Portugal': ['Portugal'], 'RD Congo': ['DR Congo', 'Congo DR'], 'Uzbequistão': ['Uzbekistan'],
  'Colômbia': ['Colombia'], 'Inglaterra': ['England'], 'Croácia': ['Croatia'], 'Panamá': ['Panama'], 'Gana': ['Ghana'],
};

function matchesTeam(ptName, apiName) {
  const a = norm(apiName);
  if (!a) return false;
  const cands = [ptName, ...(TEAM_EN[ptName] || [])].map(norm);
  return cands.some((c) => c && (c === a || a.includes(c) || c.includes(a)));
}

async function fetchStandings() {
  const data = await espnGet(ESPN_V2, '/standings');
  const groups = (data.children || []).map((g) => {
    const entries = g.standings?.entries || [];
    return {
      group: g.name,
      rows: entries.map((e, i) => {
        const stats = {};
        (e.stats || []).forEach((s) => { stats[s.name] = s.value; });
        return {
          rank: i + 1,
          team: e.team?.displayName,
          logo: e.team?.logos?.[0]?.href,
          points: stats.points ?? 0,
          played: stats.gamesPlayed ?? 0,
          win: stats.wins ?? 0,
          draw: stats.ties ?? 0,
          lose: stats.losses ?? 0,
          gf: stats.pointsFor ?? 0,
          ga: stats.pointsAgainst ?? 0,
          gd: stats.pointDifferential ?? 0,
          desc: e.note?.description || '',
        };
      }).sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.team?.localeCompare(b.team))
        .map((r, i) => ({ ...r, rank: i + 1 })),
    };
  });
  return { updated: new Date().toISOString(), groups };
}

function espnStatus(comp) {
  const name = comp?.status?.type?.name || '';
  if (name === 'STATUS_FINAL' || name === 'STATUS_FULL_TIME') return 'FT';
  if (name === 'STATUS_HALFTIME') return 'HT';
  if (name === 'STATUS_FIRST_HALF') return '1H';
  if (name === 'STATUS_SECOND_HALF') return '2H';
  if (name === 'STATUS_EXTRA_TIME') return 'ET';
  if (name === 'STATUS_SHOOTOUT') return 'P';
  if (name === 'STATUS_IN_PROGRESS') return 'LIVE';
  return 'NS';
}

// Extrai todos os nomes possíveis de um competitor ESPN para o matchesTeam
function espnTeamNames(c) {
  if (!c) return [];
  const t = c.team || {};
  return [t.displayName, t.name, t.shortDisplayName, t.abbreviation, t.location].filter(Boolean);
}

function findEspnEvent(events, home, away) {
  return events.find((e) => {
    const comps = e.competitions?.[0]?.competitors || [];
    const allNames = comps.map(espnTeamNames);
    if (allNames.length < 2) return false;
    const [n0, n1] = allNames;
    return (n0.some((n) => matchesTeam(home, n)) && n1.some((n) => matchesTeam(away, n))) ||
           (n0.some((n) => matchesTeam(away, n)) && n1.some((n) => matchesTeam(home, n)));
  });
}

async function espnScoreboard(dateStr) {
  const sb = await espnGet(ESPN_BASE, '/scoreboard', dateStr ? { dates: dateStr } : {});
  return sb.events || [];
}

// Busca o evento ESPN para um jogo, tentando a data do kickoff, o dia anterior e o scoreboard do dia atual.
async function findEspnEventForMatch(home, away, kickoff) {
  const dateStr = (kickoff || '').slice(0, 10).replace(/-/g, '');
  // dia anterior (jogo às 23h Brasília pode ser categorizado no dia de antes pela ESPN)
  const prevDate = dateStr ? (() => {
    const d = new Date(kickoff); d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  })() : '';

  for (const ds of [dateStr, prevDate, '']) {
    const events = await espnScoreboard(ds);
    const ev = findEspnEvent(events, home, away);
    if (ev) return ev;
  }
  return null;
}

async function fetchMatchInfo(home, away, kickoff) {
  const ev = await findEspnEventForMatch(home, away, kickoff);
  if (!ev) return { found: false, message: 'Ainda não achei dados oficiais desse jogo.' };

  const comp = ev.competitions[0];
  const homeComp = comp.competitors.find((c) => c.homeAway === 'home') || comp.competitors[0];
  const awayComp = comp.competitors.find((c) => c.homeAway === 'away') || comp.competitors[1];
  const short = espnStatus(comp);

  const summary = await espnGet(ESPN_BASE, '/summary', { event: ev.id }).catch(() => ({}));

  // Gols/cartões/subs a partir dos plays de cada jogador no roster
  const allEvents = [];
  for (const roster of summary.rosters || []) {
    const teamName = roster.team?.displayName;
    for (const player of roster.roster || []) {
      for (const play of player.plays || []) {
        if (!play.scoringPlay && !play.redCard && !play.yellowCard && !play.substitution) continue;
        const min = parseInt((play.clock?.displayValue || '0').replace(/[^0-9]/g, '')) || 0;
        allEvents.push({
          minute: min, extra: null, team: teamName,
          player: player.athlete?.displayName,
          type: play.didScore ? 'Goal' : play.redCard || play.yellowCard ? 'Card' : 'subst',
          detail: play.redCard ? 'Red Card' : play.yellowCard ? 'Yellow Card' : '',
        });
      }
    }
  }
  allEvents.sort((a, b) => a.minute - b.minute);

  const lineups = (summary.rosters || []).map((roster) => ({
    team: roster.team?.displayName,
    formation: roster.formation?.name || '',
    coach: roster.coach?.[0]?.athlete?.displayName || '',
    startXI: (roster.roster || []).filter((p) => p.starter)
      .map((p) => ({ name: p.athlete?.displayName, number: p.jersey, pos: p.position?.abbreviation })),
    subs: (roster.roster || []).filter((p) => !p.starter)
      .map((p) => ({ name: p.athlete?.displayName, number: p.jersey, pos: p.position?.abbreviation })),
  }));

  const statistics = (summary.boxscore?.teams || []).map((t) => ({
    team: t.team?.displayName,
    items: (t.statistics || []).map((s) => ({ type: s.label, value: s.displayValue })),
  }));

  const venue = summary.gameInfo?.venue;

  return {
    found: true,
    status: { short, long: comp.status?.type?.description || '', elapsed: comp.status?.displayClock || null },
    teams: {
      home: { name: homeComp.team?.displayName || homeComp.team?.name, logo: homeComp.team?.logo },
      away: { name: awayComp.team?.displayName || awayComp.team?.name, logo: awayComp.team?.logo },
    },
    goals: { home: homeComp.score != null ? Number(homeComp.score) : null, away: awayComp.score != null ? Number(awayComp.score) : null },
    venue: venue ? { name: venue.fullName || venue.name, city: venue.address?.city } : null,
    events: allEvents,
    lineups,
    statistics,
    h2h: [],
  };
}

async function fetchArtilhariaFromGames(matches, results) {
  const scorers = {};
  const finalized = matches.filter((m) => results[m.id]);

  for (const m of finalized) {
    try {
      const ev = await findEspnEventForMatch(m.home, m.away, m.kickoff);
      if (!ev) continue;
      const summary = await espnGet(ESPN_BASE, '/summary', { event: ev.id }).catch(() => ({}));

      for (const roster of summary.rosters || []) {
        const teamName = roster.team?.displayName;
        for (const player of roster.roster || []) {
          for (const play of player.plays || []) {
            if (!play.didScore) continue;
            const playerName = player.athlete?.displayName;
            if (!playerName) continue;
            if (!scorers[playerName]) scorers[playerName] = { name: playerName, team: teamName, goals: 0, apps: 0 };
            scorers[playerName].goals++;
          }
        }
      }
    } catch {}
  }

  return Object.values(scorers).sort((a, b) => b.goals - a.goals);
}

async function fetchArtilharia() {
  const data = await espnGet(ESPN_BASE, '/statistics', { _bust: Math.random().toString(36).slice(2) });
  const cat = (data.stats || []).find((s) => s.abbreviation === 'G' || (s.displayName || '').toLowerCase().includes('goal'));
  return (cat?.leaders || []).map((l) => ({
    name: l.athlete?.displayName || l.athlete?.fullName || '—',
    team: l.team?.displayName || l.team?.name || '—',
    teamAbbr: l.team?.abbreviation || '',
    goals: Number(l.value) || 0,
    assists: Number((l.statistics || []).find((s) => s.name === 'goalAssists')?.value) || 0,
    appearances: Number((l.statistics || []).find((s) => s.name === 'appearances')?.value) || 0,
  })).filter((p) => p.goals > 0);
}

function useLiveScores(matches, me, rpcFn) {
  const [scores, setScores] = useState({});
  const autoSaved = useRef(new Set());

  const poll = useCallback(async () => {
    if (!matches.length) return;
    try {
      const sb = await espnGet(ESPN_BASE, '/scoreboard', {}).catch(() => null);
      if (!sb?.events) return;
      const newScores = {};
      for (const ev of sb.events) {
        const comp = ev.competitions?.[0]; if (!comp) continue;
        const homeComp = comp.competitors.find((c) => c.homeAway === 'home') || comp.competitors[0];
        const awayComp = comp.competitors.find((c) => c.homeAway === 'away') || comp.competitors[1];
        // data do evento ESPN em Brasília (YYYY-MM-DD)
        const evDateBR = ev.date ? new Date(ev.date).toLocaleDateString('pt-BR', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }) : null;
        for (const m of matches) {
          // só casa se a data do kickoff em Brasília bate com a data do evento ESPN
          const kickoffDateBR = new Date(m.kickoff).toLocaleDateString('pt-BR', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
          if (!evDateBR || evDateBR !== kickoffDateBR) continue;
          const hNames = espnTeamNames(homeComp); const aNames = espnTeamNames(awayComp);
          if (hNames.some((n) => matchesTeam(m.home, n)) && aNames.some((n) => matchesTeam(m.away, n))) {
            const short = espnStatus(comp);
            // ignora jogos não iniciados (status NS)
            if (short === 'NS') continue;
            const h = homeComp?.score != null ? Number(homeComp.score) : null;
            const a = awayComp?.score != null ? Number(awayComp.score) : null;
            newScores[m.id] = { home: h, away: a, status: short, elapsed: comp.status?.displayClock || null };
            // auto-save quando FT e admin logado
            if (short === 'FT' && me?.isAdmin && h != null && a != null && !autoSaved.current.has(m.id)) {
              autoSaved.current.add(m.id);
              rpcFn('set_result', { p_name: me.name, p_pin: me.pin, p_match: m.id, p_home: Math.round(h), p_away: Math.round(a) }).catch(() => {});
            }
          }
        }
      }
      setScores(newScores);
    } catch {}
  }, [matches, me, rpcFn]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 60000);
    return () => clearInterval(id);
  }, [poll]);

  return scores;
}

/* ============================================================ CSS ============================================================ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;600;700;800&family=Oswald:wght@400;500;600;700&family=Barlow:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@500;600;700&display=swap');
@keyframes mm-cardIn{0%{transform:translateY(22px) scale(.985)}100%{transform:none}}
@keyframes mm-rise{0%{transform:translateY(12px)}100%{transform:none}}
@keyframes mm-rise2{0%{transform:translateY(12px);opacity:0}100%{transform:none;opacity:1}}
@keyframes mm-glow{0%,100%{opacity:.32;transform:translate(-50%,-50%) scale(.82)}50%{opacity:.78;transform:translate(-50%,-50%) scale(1.18)}}
@keyframes mm-ring{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
@keyframes mm-pulse{0%,100%{transform:translate(-50%,-50%) scale(1)}50%{transform:translate(-50%,-50%) scale(1.05)}}
@keyframes mm-seam{0%{opacity:.25}50%{opacity:.9}100%{opacity:.25}}
@keyframes mm-badge{0%{transform:translate(-50%,-5px) scale(.82)}60%{transform:translate(-50%,0) scale(1.06)}100%{transform:translate(-50%,0)}}
:root{--campo:#0B2A1C;--campo2:#0E3322;--cal:#F4F0E4;--papel:#FBF8EF;--tinta:#15241C;--canarinho:#FFC629;--bandeira:#1E9E55;--royal:#2447C5;--apito:#D7263D;--cinza:#6E7A70;--board:#0d1f14;}
[data-theme="dark"]{--campo:#0a0f1f;--campo2:#0d1428;--papel:#0d1428;--tinta:#e8e4d8;--cinza:#8a96b0;--board:#060d1a}
[data-theme="dark"] .bl-card{border-color:#1e2d50}
[data-theme="dark"] .bl-card-inner{border-color:rgba(255,255,255,.08)}
[data-theme="dark"] .bl-panel{border-color:#1e2d50}
[data-theme="dark"] .bl-rank{border-color:#1e2d50}
[data-theme="dark"] .bl-grp{border-color:#1e2d50}
[data-theme="dark"] .bl-in{background:#060d1a;border-color:#1e2d50;color:var(--tinta)}
[data-theme="dark"] .bl-stamp{background:rgba(13,20,40,.95)}
[data-theme="dark"] .bl-mi-tabs button{background:#0d1428;color:var(--cinza);border-color:#1e2d50}
[data-theme="dark"] .bl-picks .row:nth-child(odd){background:rgba(255,255,255,.04)}
[data-theme="dark"] .bl-tabs{background:rgba(6,13,26,.95)}
[data-theme="dark"] .bl-grp h3{background:#060d1a}
[data-theme="dark"] .bl-meta .grupo{background:#060d1a}
*{box-sizing:border-box} html,body,#root{min-height:100%} body{margin:0}
.bl-app{min-height:100vh;font-family:'Archivo',system-ui,-apple-system,sans-serif;color:var(--tinta);
  background:
    radial-gradient(ellipse 160% 60% at 50% -5%, rgba(255,198,41,.14), transparent 55%),
    radial-gradient(ellipse 90% 35% at 50% 105%, rgba(0,0,0,.45), transparent 65%),
    repeating-linear-gradient(0deg, var(--campo) 0 90px, var(--campo2) 90px 180px);
  padding-bottom:96px;padding-top:env(safe-area-inset-top)}

/* ── Top status bar ── */
.bl-topbar{position:fixed;top:0;left:0;right:0;z-index:100;
  padding:env(safe-area-inset-top) 0 0;
  background:rgba(11,42,28,.96);backdrop-filter:blur(14px);
  border-bottom:1px solid rgba(255,198,41,.2);pointer-events:none;
  box-shadow:0 4px 0 rgba(11,42,28,.96)}
.bl-topbar-in{display:flex;align-items:center;justify-content:center;gap:10px;
  padding:5px 16px 5px;font-size:12px;font-weight:700;color:var(--cal);min-height:28px}
.bl-topbar-live{display:inline-flex;align-items:center;gap:5px;color:var(--apito)}
.bl-topbar-live .dot{width:6px;height:6px;border-radius:50%;background:currentColor}
.bl-topbar-score{font-weight:900;font-size:14px;color:var(--canarinho)}
.bl-topbar-sep{color:rgba(244,240,228,.25);font-weight:400}
.bl-topbar-dim{color:rgba(244,240,228,.55);font-weight:600}
@media(prefers-reduced-motion:no-preference){.bl-topbar-live .dot{animation:bl-blink 1s ease-in-out infinite}}
[data-theme="dark"] .bl-topbar{background:rgba(6,13,26,.96)}
.bl-display{font-family:'Archivo Black','Archivo',sans-serif;letter-spacing:.5px}
.bl-wrap{max-width:680px;margin:0 auto;padding:0 14px}

/* ── Hero ── */
.bl-hero{padding:34px 0 20px;text-align:center;color:var(--cal);padding-top:calc(34px + 38px + env(safe-area-inset-top))}
.bl-logo{width:90px;height:90px;object-fit:contain;margin-bottom:8px;filter:drop-shadow(0 4px 12px rgba(0,0,0,.5))}
.bl-crest{display:inline-flex;flex-direction:column;align-items:center;gap:3px;border:3px solid var(--canarinho);
  border-radius:20px 20px 50% 50%/20px 20px 42% 42%;padding:16px 34px 24px;
  background:rgba(0,0,0,.30);
  box-shadow:0 8px 0 rgba(0,0,0,.35),0 0 50px rgba(255,198,41,.15),inset 0 1px 0 rgba(255,198,41,.2);}
.bl-crest .ano{color:var(--canarinho);font-size:12px;letter-spacing:5px;opacity:.9}
.bl-crest h1{margin:2px 0 0;font-size:clamp(28px,7.5vw,46px);line-height:1;color:var(--cal);text-shadow:3px 3px 0 rgba(0,0,0,.45),0 0 30px rgba(255,198,41,.2)}
.bl-rules{margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;font-size:12px}
.bl-chip{background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:5px 14px;color:var(--cal);backdrop-filter:blur(4px)}
.bl-chip b{color:var(--canarinho)}

/* ── Tabs ── */
.bl-tabs{position:sticky;top:0;z-index:40;background:rgba(11,42,28,.95);backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,198,41,.3)}
.bl-app[data-tb="1"] .bl-tabs{top:calc(29px + env(safe-area-inset-top))}
.bl-tabs-in{max-width:680px;margin:0 auto;display:flex;gap:4px;padding:8px 10px}
.bl-tab{flex:1;border:0;border-radius:10px;padding:10px 4px;font:inherit;font-weight:800;font-size:13px;color:rgba(244,240,228,.6);background:transparent;cursor:pointer;position:relative;transition:background .2s,color .2s}
.bl-tab:hover{background:rgba(255,255,255,.07);color:rgba(244,240,228,.9)}
.bl-tab[data-on="1"]{background:var(--canarinho);color:#241a00}
.bl-tab:focus-visible{outline:3px solid var(--canarinho);outline-offset:-3px}

/* ── PWA: barra de navegação no rodapé ── */
@media(display-mode:standalone){
  .bl-tabs,.bl-app[data-tb="1"] .bl-tabs{position:fixed;top:auto;bottom:0;left:0;right:0;border-bottom:none;border-top:1px solid rgba(255,198,41,.3);padding-bottom:env(safe-area-inset-bottom)}
  .bl-tabs-in{padding:6px 10px 4px}
  .bl-tab{border-radius:12px;padding:8px 4px 6px;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px}
  .bl-app{padding-bottom:calc(64px + env(safe-area-inset-bottom))}
  [data-theme="dark"] .bl-tabs{background:rgba(6,13,26,.96)}
}
.bl-badge{position:absolute;top:2px;right:8px;min-width:18px;height:18px;border-radius:9px;background:var(--apito);color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;padding:0 5px}

/* ── Day separator ── */
.bl-day{margin:26px 0 12px;display:flex;align-items:center;gap:14px;color:var(--cal)}
.bl-day::before,.bl-day::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(244,240,228,.35),transparent)}
.bl-day span{font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:rgba(244,240,228,.65)}

/* ── Match card ── */
.bl-card{background:var(--papel);border:2px solid #20301F;border-radius:18px;margin-bottom:14px;
  box-shadow:0 6px 0 rgba(0,0,0,.32),0 2px 24px rgba(0,0,0,.16);
  overflow:hidden;position:relative;transition:transform .22s cubic-bezier(.2,.8,.3,1),box-shadow .22s}
.bl-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;
  background:linear-gradient(90deg,transparent 0%,var(--canarinho) 50%,transparent 100%);
  opacity:0;transition:opacity .22s}
.bl-card:hover{transform:translateY(-3px);box-shadow:0 10px 0 rgba(0,0,0,.32),0 6px 32px rgba(0,0,0,.22)}
.bl-card:hover::before{opacity:1}
.bl-card-inner{border:2px dashed rgba(32,48,31,.2);border-radius:12px;margin:7px;padding:12px 12px 14px}
.bl-card-collapsed{cursor:pointer;margin-bottom:6px;opacity:.75;transition:opacity .18s,transform .18s}
.bl-card-collapsed:hover{opacity:1;transform:translateY(-1px)}
.bl-collapsed-inner{display:flex;align-items:center;gap:8px;padding:12px 14px;flex-wrap:nowrap;overflow:hidden}
.bl-collapsed-date{font-size:11px;color:var(--cinza);white-space:nowrap;min-width:32px}
.bl-collapsed-teams{display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:0}
.bl-collapsed-teams .bl-collapsed-name{font-size:12px;font-weight:600;line-height:1.1;white-space:normal;text-align:center;max-width:90px;word-break:break-word}
.bl-collapsed-score{display:flex;align-items:center;gap:4px;font-weight:900;font-size:16px;white-space:nowrap;padding:0 4px}
.bl-collapsed-x{color:var(--cinza);font-weight:400;font-size:13px}
.bl-collapsed-expand{color:var(--cinza);font-size:14px;margin-left:4px}
.bl-collapse-btn{position:absolute;top:6px;right:8px;background:none;border:none;cursor:pointer;
  font-size:11px;color:var(--cinza);padding:2px 6px;border-radius:8px;opacity:.6}
.bl-collapse-btn:hover{opacity:1;background:rgba(0,0,0,.06)}

/* ── Card meta ── */
.bl-meta{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--cinza);font-weight:600;margin-bottom:12px;gap:8px}
.bl-meta .grupo{background:var(--tinta);color:var(--cal);border-radius:999px;padding:3px 10px;font-weight:800;font-size:10px;letter-spacing:.6px;white-space:nowrap}

/* ── Teams + scoreboard ── */
.bl-teams{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center}
.bl-team{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.bl-team .fl{font-size:44px;line-height:1;filter:drop-shadow(0 3px 8px rgba(0,0,0,.25))}
.bl-team .nm{font-weight:800;font-size:14px;line-height:1.2;max-width:90px}
.bl-x{display:flex;align-items:center;background:var(--board);border-radius:14px;
  border:2px solid rgba(255,198,41,.15);padding:6px 8px;
  box-shadow:inset 0 2px 14px rgba(0,0,0,.55),0 2px 10px rgba(0,0,0,.3);gap:2px}
.bl-score-in{width:52px;height:60px;text-align:center;font:inherit;font-weight:900;font-size:28px;
  border:none;border-radius:8px;background:transparent;
  color:rgba(255,255,255,.88);caret-color:var(--canarinho);
  transition:color .15s,background .15s,text-shadow .15s}
.bl-score-in::placeholder{color:rgba(255,255,255,.16)}
.bl-score-in:focus-visible{outline:none;background:rgba(255,198,41,.09);border-radius:8px}
.bl-score-in:disabled{color:rgba(255,255,255,.2)}
.bl-score-in.has-value:disabled{color:rgba(255,255,255,.55)}
.bl-score-in.draft{color:var(--canarinho);text-shadow:0 0 14px rgba(255,198,41,.5)}
.bl-vs{font-weight:900;color:rgba(255,255,255,.18);font-size:14px;padding:0 3px;user-select:none}

/* ── Result display ── */
.bl-final{display:flex;align-items:center;gap:10px;font-size:30px;font-weight:900;
  justify-content:center;background:rgba(0,0,0,.07);border-radius:12px;
  padding:10px 24px;margin-top:12px;border:1px solid rgba(32,48,31,.1)}
.bl-final small{font-size:10px;color:var(--cinza);display:block;text-align:center;line-height:1.4;font-weight:600}

/* ── Stamp ── */
.bl-stamp{position:absolute;top:10px;right:12px;transform:rotate(8deg);font-size:9px;font-weight:900;
  letter-spacing:2px;padding:4px 10px;border-radius:4px;border:2.5px solid currentColor;
  background:rgba(255,255,255,.92);pointer-events:none;text-transform:uppercase;
  box-shadow:2px 2px 0 currentColor}
.bl-stamp.aberto{color:var(--bandeira)} .bl-stamp.fechado{color:var(--apito)} .bl-stamp.fim{color:var(--royal)} .bl-stamp.breve{color:var(--cinza)}

/* ── Card footer ── */
.bl-foot{margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;color:var(--cinza)}
.bl-mini{border:0;background:none;font:inherit;font-size:12px;font-weight:700;color:var(--royal);cursor:pointer;padding:4px 0;text-decoration:underline}
.bl-mini:focus-visible{outline:2px solid var(--royal);outline-offset:2px;border-radius:4px}
.bl-pts{font-weight:900;border-radius:999px;padding:4px 13px;font-size:13px}
.bl-pts.p3{background:var(--canarinho);color:#241a00} .bl-pts.p1{background:var(--bandeira);color:#fff} .bl-pts.p0{background:#d8d3c4;color:#5c5c52}

/* ── Picks accordion ── */
.bl-picks{border-top:1px solid rgba(32,48,31,.15);margin:10px 4px 4px;padding:10px 6px 4px;font-size:13px}
.bl-picks .row{display:flex;justify-content:space-between;padding:5px 6px;border-radius:7px}
.bl-picks .row:nth-child(odd){background:rgba(32,48,31,.05)}
.bl-picks .me{font-weight:800}

/* ── Save bar ── */
.bl-savebar{position:fixed;left:0;right:0;bottom:0;z-index:50;padding:12px 14px 18px;
  background:linear-gradient(transparent,rgba(11,42,28,.97) 38%)}
.bl-savebar-in{max-width:680px;margin:0 auto;display:flex;gap:10px}
.bl-btn{border:2px solid #20301F;border-radius:14px;padding:15px 20px;font:inherit;font-weight:900;font-size:16px;
  cursor:pointer;box-shadow:0 5px 0 rgba(0,0,0,.32);transition:transform .08s,box-shadow .12s}
.bl-btn:active{transform:translateY(4px);box-shadow:0 1px 0 rgba(0,0,0,.3)}
.bl-btn:focus-visible{outline:3px solid #fff;outline-offset:2px}
.bl-btn.amarelo{background:var(--canarinho);color:#241a00;flex:1}
.bl-btn.verde{background:var(--bandeira);color:#fff}
.bl-btn:disabled{opacity:.5;cursor:not-allowed}

/* ── Filter pills ── */
.bl-filtros{display:flex;gap:6px;overflow-x:auto;padding:14px 2px 2px;scrollbar-width:none}
.bl-filtros::-webkit-scrollbar{display:none}
.bl-f{border:1.5px solid rgba(244,240,228,.35);background:transparent;color:rgba(244,240,228,.75);
  border-radius:999px;padding:7px 16px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;
  transition:background .18s,color .18s,border-color .18s}
.bl-f:hover{border-color:rgba(244,240,228,.65);color:var(--cal)}
.bl-f[data-on="1"]{background:var(--cal);color:var(--tinta);border-color:var(--cal)}
.bl-f:focus-visible{outline:3px solid var(--canarinho);outline-offset:2px}

/* ── Ranking ── */
.bl-rank{background:var(--papel);border:2px solid #20301F;border-radius:18px;
  box-shadow:0 6px 0 rgba(0,0,0,.3),0 2px 24px rgba(0,0,0,.14);overflow:hidden;margin-top:14px}
.bl-rank table{width:100%;border-collapse:collapse;font-size:14px;table-layout:fixed}
.bl-rank th{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--cinza);
  text-align:left;padding:14px 12px 8px}
.bl-rank td{padding:12px 12px;border-top:1px solid rgba(32,48,31,.1)}
.bl-rank .num{text-align:center;font-variant-numeric:tabular-nums}
.bl-rank .tot{font-weight:900;font-size:18px;text-align:center}
.bl-rank .rank-gold{background:linear-gradient(135deg,rgba(255,198,41,.18) 0%,rgba(255,198,41,.08) 100%)}
.bl-rank .rank-gold td{padding:18px 12px}
.bl-rank .rank-gold td:first-child{border-left:4px solid var(--canarinho)}
.bl-rank .rank-gold .tot{font-size:26px}
.bl-rank .rank-gold td:nth-child(2){font-size:16px}
.bl-rank .rank-silver{background:rgba(192,200,210,.1)}
.bl-rank .rank-silver td{padding:14px 12px}
.bl-rank .rank-silver td:first-child{border-left:3px solid #A8B4BE}
.bl-rank .rank-silver .tot{font-size:21px}
.bl-rank .rank-bronze{background:rgba(181,101,29,.08)}
.bl-rank .rank-bronze td:first-child{border-left:3px solid #C07040}
.bl-rank .rank-bronze .tot{font-size:19px}
.bl-rank-av{position:relative;display:inline-flex;flex-shrink:0;align-items:center;justify-content:center}
.bl-rank-av .bl-avatar,.bl-rank-av .bl-avatar-initials{position:relative;z-index:1}
.bl-rank-av.m1,.bl-rank-av.m2,.bl-rank-av.m3{padding:3px;border-radius:50%}
.bl-rank-av.m1{background:linear-gradient(135deg,#FFE566 0%,#D4900A 50%,#FFE566 100%);box-shadow:0 0 0 2px #20301F,0 3px 12px rgba(212,144,10,.55)}
.bl-rank-av.m2{background:linear-gradient(135deg,#F4F4F4 0%,#B2B9C2 50%,#F4F4F4 100%);box-shadow:0 0 0 2px #20301F,0 2px 8px rgba(0,0,0,.3)}
.bl-rank-av.m3{background:linear-gradient(135deg,#F2C090 0%,#A85020 50%,#F2C090 100%);box-shadow:0 0 0 2px #20301F,0 2px 8px rgba(168,80,32,.4)}
.bl-rank-av.m1::before,.bl-rank-av.m2::before,.bl-rank-av.m3::before,
.bl-rank-av.m1::after,.bl-rank-av.m2::after,.bl-rank-av.m3::after{
  content:'';position:absolute;top:22%;width:7px;height:9px;
  border-radius:50%;border:3px solid transparent;z-index:0}
.bl-rank-av.m1::before,.bl-rank-av.m1::after{border-color:#D4900A}
.bl-rank-av.m2::before,.bl-rank-av.m2::after{border-color:#9BA4AF}
.bl-rank-av.m3::before,.bl-rank-av.m3::after{border-color:#A85020}
.bl-rank-av.m1::before,.bl-rank-av.m2::before,.bl-rank-av.m3::before{left:-7px;border-right:none;border-radius:50% 0 0 50%}
.bl-rank-av.m1::after,.bl-rank-av.m2::after,.bl-rank-av.m3::after{right:-7px;border-left:none;border-radius:0 50% 50% 0}
.bl-rank-badge{position:absolute;bottom:-5px;right:-4px;z-index:2;
  width:14px;height:14px;border-radius:50%;font-size:8px;font-weight:900;
  display:flex;align-items:center;justify-content:center;border:1.5px solid #20301F}
.bl-rank-av.m1 .bl-rank-badge{background:#D4900A;color:#fff}
.bl-rank-av.m2 .bl-rank-badge{background:#9BA4AF;color:#fff}
.bl-rank-av.m3 .bl-rank-badge{background:#A85020;color:#fff}
.bl-rank-av.mx .bl-rank-badge{background:var(--campo2);color:var(--cinza)}
.bl-avatar{border-radius:50%;object-fit:cover;display:block;flex-shrink:0}
.bl-avatar-initials{border-radius:50%;background:linear-gradient(135deg,var(--bandeira),#1a5c2a);color:#fff;
  display:flex;align-items:center;justify-content:center;font-weight:900;flex-shrink:0;text-transform:uppercase}
.bl-avatar-upload{position:relative;cursor:pointer;display:inline-block}
.bl-avatar-upload input[type=file]{display:none}
.bl-avatar-overlay{position:absolute;inset:0;border-radius:50%;background:rgba(0,0,0,.55);
  display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;font-size:20px;pointer-events:none}
.bl-avatar-upload:hover .bl-avatar-overlay,.bl-avatar-upload:active .bl-avatar-overlay{opacity:1}
.bl-medal{display:inline-flex;width:32px;height:32px;border-radius:50%;align-items:center;justify-content:center;
  font-weight:900;font-size:13px;border:2px solid #20301F;margin-right:4px;transition:transform .2s}
.bl-medal:hover{transform:scale(1.15)}
.bl-medal.m1{background:linear-gradient(135deg,#FFE566,#D4900A);box-shadow:0 2px 10px rgba(212,144,10,.45)}
.bl-medal.m2{background:linear-gradient(135deg,#F4F4F4,#B2B9C2);box-shadow:0 2px 8px rgba(0,0,0,.22)}
.bl-medal.m3{background:linear-gradient(135deg,#F2C090,#A85020);box-shadow:0 2px 8px rgba(168,80,32,.35)}
.bl-medal.mx{background:#E8E3D3;font-size:12px}

/* ── Panels / forms ── */
.bl-panel{background:var(--papel);border:2px solid #20301F;border-radius:18px;
  box-shadow:0 6px 0 rgba(0,0,0,.3),0 2px 20px rgba(0,0,0,.12);padding:22px;margin-top:18px}
.bl-panel h2{margin:0 0 4px;font-size:20px}
.bl-panel p.sub{margin:0 0 14px;font-size:13px;color:var(--cinza)}
.bl-field{margin-bottom:12px}
.bl-field label{display:block;font-size:12px;font-weight:800;margin-bottom:5px;letter-spacing:.4px;text-transform:uppercase;color:#3e4a40}
.bl-in{width:100%;border:2px solid #20301F;border-radius:10px;padding:12px;font:inherit;font-size:16px;background:#fff}
.bl-in:focus-visible{outline:3px solid var(--royal);outline-offset:1px}
.bl-erro{background:#FBE3E6;border:1.5px solid var(--apito);color:#8d1626;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:12px}
.bl-info{background:#E7F0E9;border:1.5px solid var(--bandeira);color:#14502e;border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:12px}
.bl-link{border:0;background:none;font:inherit;color:var(--royal);font-weight:800;cursor:pointer;text-decoration:underline;padding:0}
.bl-link:focus-visible{outline:2px solid var(--canarinho);outline-offset:2px;border-radius:2px}
.bl-admin-row{display:grid;grid-template-columns:1fr 56px 14px 56px auto;gap:6px;align-items:center;padding:9px 0;border-top:1px dashed rgba(32,48,31,.2);font-size:13px}
.bl-admin-row .t{font-weight:700;line-height:1.2}
.bl-admin-row input{width:56px;height:42px;text-align:center;font:inherit;font-weight:800;font-size:17px;border:2px solid #20301F;border-radius:8px}
.bl-okbtn{border:2px solid #20301F;background:var(--bandeira);color:#fff;border-radius:8px;height:42px;padding:0 12px;font:inherit;font-weight:900;cursor:pointer}
.bl-okbtn:focus-visible{outline:3px solid var(--royal);outline-offset:2px}
.bl-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}

/* ── Toast ── */
.bl-toast{position:fixed;bottom:88px;left:50%;transform:translateX(-50%);z-index:60;
  background:var(--tinta);color:var(--cal);border:2px solid var(--canarinho);border-radius:14px;
  padding:12px 22px;font-weight:800;font-size:14px;
  box-shadow:0 8px 28px rgba(0,0,0,.55);animation:blpop .22s ease-out;max-width:90vw;text-align:center}

/* ── Skeleton ── */
.bl-skel{border-radius:8px;background:linear-gradient(90deg,rgba(32,48,31,.1) 25%,rgba(32,48,31,.22) 50%,rgba(32,48,31,.1) 75%);background-size:200% 100%}

/* ── Keyframes ── */
@keyframes blpop{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes bl-shimmer{from{background-position:-200% 0}to{background-position:200% 0}}
@keyframes bl-stamp-in{0%{opacity:0;transform:rotate(24deg) scale(.45)}60%{transform:rotate(5deg) scale(1.1)}100%{opacity:1;transform:rotate(8deg) scale(1)}}
@keyframes bl-pulse-glow{0%,100%{box-shadow:0 5px 0 rgba(0,0,0,.32)}50%{box-shadow:0 5px 30px rgba(255,198,41,.75),0 5px 0 rgba(0,0,0,.32)}}
@keyframes bl-slide-down{from{opacity:0;transform:translateY(-7px)}to{opacity:1;transform:none}}
@keyframes bl-fade-up{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
@keyframes bl-board-in{from{opacity:0;transform:scaleX(.92)}to{opacity:1;transform:none}}

/* ── Motion ── */
@media(prefers-reduced-motion:no-preference){
  .bl-skel{animation:bl-shimmer 1.6s linear infinite}
  .bl-stamp{animation:bl-stamp-in .45s cubic-bezier(.2,.85,.35,1) both}
  .bl-btn.pulse{animation:bl-pulse-glow 2.4s ease-in-out infinite}
  .bl-picks{animation:bl-slide-down .28s ease-out both}
  .bl-hero{animation:bl-fade-up .5s ease-out both}
  .bl-x{animation:bl-board-in .3s ease-out both}
}
@media(prefers-reduced-motion:reduce){
  .bl-toast{animation:none}.bl-btn:active{transform:none}
  .bl-card:hover{transform:none;box-shadow:0 6px 0 rgba(0,0,0,.32)}
  .bl-card::before{display:none}
}

/* ── Breakpoints ── */
@media(max-width:420px){
  .bl-team .nm{font-size:12px;max-width:74px}
  .bl-team .fl{font-size:36px}
  .bl-score-in{width:46px;font-size:24px}
}
@media(max-width:360px){
  .bl-team .fl{font-size:30px}
  .bl-card-inner{padding:8px 8px 10px}
  .bl-score-in{width:42px;height:54px;font-size:22px}
  .bl-crest{padding:12px 22px 18px}
  .bl-wrap{padding:0 10px}
  .bl-x{padding:5px 6px}
}

/* ── Stats resumo ── */
.bl-stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}
.bl-stat-box{background:linear-gradient(135deg,#1a3024,#0f2418);border:1.5px solid rgba(255,198,41,.25);border-radius:14px;padding:10px 8px;text-align:center;color:var(--cal)}
.bl-stat-box .sv{font-size:22px;font-weight:900;color:var(--canarinho);line-height:1}
.bl-stat-box .sl{font-size:10px;font-weight:700;color:rgba(244,240,228,.65);margin-top:3px;line-height:1.3;letter-spacing:.3px}

/* ── Rank history chart ── */
.bl-chart{background:var(--papel);border:2px solid #20301F;border-radius:18px;margin-top:14px;padding:16px;overflow:hidden}
.bl-chart h3{margin:0 0 10px;font-size:14px;font-weight:800;color:var(--tinta)}
.bl-chart-legend{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:10px}
.bl-chart-legend span{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:var(--tinta)}
.bl-chart-legend i{width:20px;height:3px;border-radius:2px;display:inline-block}

/* ── Dark mode toggle ── */
.bl-dark-btn{border:1.5px solid rgba(255,198,41,.4);background:rgba(0,0,0,.2);border-radius:999px;padding:5px 12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer;color:var(--cal);line-height:1;transition:background .2s}
.bl-dark-btn:hover{background:rgba(255,198,41,.15)}
.bl-toggle-btn{border:1.5px solid rgba(32,48,31,.35);background:transparent;border-radius:8px;padding:6px 14px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;color:var(--cinza);transition:background .18s,color .18s,border-color .18s}
.bl-toggle-btn:hover,.bl-toggle-btn[data-on="1"]{background:var(--tinta);color:var(--cal);border-color:var(--tinta)}

/* ── Collapsed pick badge ── */
.bl-collapsed-pick{font-size:10px;font-weight:700;color:var(--cinza);white-space:nowrap;background:rgba(32,48,31,.07);border-radius:999px;padding:2px 8px;margin-left:4px}

/* ── Champion pick card ── */
.bl-champ{background:linear-gradient(135deg,#1a3024,#0f2418);border:2px solid var(--canarinho);
  border-radius:18px;margin:14px 0;padding:18px 18px 20px;color:var(--cal);position:relative;overflow:hidden;
  box-shadow:0 6px 0 rgba(0,0,0,.32),0 0 40px rgba(255,198,41,.12)}
.bl-champ h3{margin:0 0 2px;font-size:18px;color:var(--canarinho);display:flex;align-items:center;gap:8px}
.bl-champ .sub{margin:0 0 14px;font-size:12.5px;color:rgba(244,240,228,.72);line-height:1.5}
.bl-champ select{width:100%;border:2px solid rgba(255,198,41,.5);border-radius:12px;padding:13px 12px;
  font:inherit;font-size:16px;background:#0d1f14;color:var(--cal);font-weight:700}
.bl-champ select:focus-visible{outline:3px solid var(--canarinho);outline-offset:1px}
.bl-champ .cur{margin-top:12px;font-size:13px;color:rgba(244,240,228,.85);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.bl-champ .cur b{color:var(--canarinho)}
.bl-champ .lock{margin-top:12px;font-size:13px;color:rgba(244,240,228,.85)}
.bl-champ-badge{display:inline-flex;align-items:center;gap:5px;background:var(--canarinho);color:#241a00;
  font-weight:900;font-size:11px;border-radius:999px;padding:3px 10px}
.bl-rank .champ-col{font-size:11px;text-align:center}
.bl-champ-hit{color:var(--canarinho);font-weight:900}

/* ── Tabela (standings) ── */
.bl-grp{background:var(--papel);border:2px solid #20301F;border-radius:16px;margin-top:14px;overflow:hidden;
  box-shadow:0 5px 0 rgba(0,0,0,.28)}
.bl-grp h3{margin:0;padding:12px 14px;background:var(--tinta);color:var(--cal);font-size:14px;letter-spacing:1px}
.bl-grp table{width:100%;border-collapse:collapse;font-size:13px}
.bl-grp th{font-size:9.5px;letter-spacing:.6px;text-transform:uppercase;color:var(--cinza);text-align:center;padding:8px 4px;font-weight:800}
.bl-grp th.l,.bl-grp td.l{text-align:left}
.bl-grp td{padding:9px 4px;text-align:center;border-top:1px solid rgba(32,48,31,.1);font-variant-numeric:tabular-nums}
.bl-grp td.tname{font-weight:700;display:flex;align-items:center;gap:7px;text-align:left}
.bl-grp td.tname img{width:20px;height:14px;object-fit:cover;border-radius:2px;box-shadow:0 1px 3px rgba(0,0,0,.25)}
.bl-grp tr.qual td{background:rgba(30,158,85,.09)}
.bl-grp td.pts{font-weight:900}
.bl-grp .pos{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;
  font-weight:900;font-size:11px;background:#E8E3D3}
.bl-grp tr.qual .pos{background:var(--bandeira);color:#fff}

/* ── Painel de info do jogo ── */
.bl-mi{border-top:1px dashed rgba(32,48,31,.25);margin:8px 6px 4px;padding:10px 4px 4px;font-size:13px}
.bl-mi-live{display:inline-flex;align-items:center;gap:6px;background:var(--apito);color:#fff;font-weight:900;
  font-size:11px;border-radius:999px;padding:3px 10px}
.bl-mi-live .dot{width:7px;height:7px;border-radius:50%;background:#fff}
.bl-mi h4{margin:14px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.8px;color:var(--cinza)}
.bl-mi .ev{display:flex;gap:8px;align-items:baseline;padding:3px 0;border-bottom:1px solid rgba(32,48,31,.06)}
.bl-mi .ev .mn{font-weight:900;color:var(--tinta);min-width:34px}
.bl-mi .xi{display:grid;grid-template-columns:1fr 1fr;gap:4px 14px;font-size:12px}
.bl-mi .xi .pl{display:flex;gap:6px}.bl-mi .xi .pl .n{color:var(--cinza);min-width:20px;font-weight:800}
.bl-mi .form{font-weight:900;color:var(--royal);font-size:12px}
.bl-mi .st{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid rgba(32,48,31,.07)}
.bl-mi .st .lbl{font-size:11px;color:var(--cinza);flex:1;text-align:center}
.bl-mi .st b{min-width:42px;text-align:center}
.bl-mi .h2h{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(32,48,31,.06);font-size:12px}
.bl-mi-dim{color:var(--cinza);font-size:12.5px;padding:6px 0}
.bl-mi-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px}
.bl-mi-tabs button{border:1.5px solid rgba(32,48,31,.25);background:#fff;border-radius:999px;padding:5px 12px;
  font:inherit;font-size:11.5px;font-weight:800;cursor:pointer;color:var(--cinza)}
.bl-mi-tabs button[data-on="1"]{background:var(--tinta);color:var(--cal);border-color:var(--tinta)}
@media(prefers-reduced-motion:no-preference){.bl-mi-live .dot{animation:bl-blink 1s ease-in-out infinite}}
@keyframes bl-blink{50%{opacity:.25}}

/* ── KO Bracket ── */
.bl-ko-phase{font-size:11px;font-weight:900;letter-spacing:2px;text-transform:uppercase;color:var(--canarinho);
  margin:16px 0 12px;padding:8px 12px;background:rgba(255,198,41,.1);border-left:4px solid var(--canarinho);border-radius:0 6px 6px 0}
.bl-ko-match{background:var(--papel);border:2px solid #20301F;border-radius:16px;padding:0;
  box-shadow:0 6px 16px rgba(0,0,0,.35);font-size:13px;display:flex;align-items:stretch;
  min-height:140px;overflow:hidden;position:relative}
.bl-ko-match::before,.bl-ko-match::after{content:'';position:absolute;width:2px;height:60%;background:rgba(255,198,41,.25);top:20%}
.bl-ko-match::before{left:48%}.bl-ko-match::after{right:48%}
.bl-ko-team{display:flex;flex-direction:column;justify-content:center;gap:6px;padding:16px 14px;flex:1;
  border-right:1px solid rgba(255,198,41,.12);position:relative}
.bl-ko-team:last-child{border-right:none}
.bl-ko-team.winner{background:rgba(255,198,41,.05)}
.bl-ko-name{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--tinta)}
.bl-ko-score{font-weight:900;font-size:28px;line-height:1;color:rgba(244,240,228,.9)}
.bl-ko-team.winner .bl-ko-name{color:var(--bandeira);font-weight:800}
.bl-ko-team.winner .bl-ko-score{color:var(--bandeira)}
.bl-ko-vs{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-weight:900;font-size:11px;
  letter-spacing:1px;color:rgba(255,198,41,.7);background:var(--papel);padding:4px 8px;white-space:nowrap;
  border-radius:4px;border:1.5px solid rgba(255,198,41,.25);z-index:10}
.bl-ko-info{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);font-size:9px;color:var(--cinza);
  white-space:nowrap;letter-spacing:.5px}
`;


/* ============================================================ App ============================================================ */
function TopBar({ matches, results, liveScores, now }) {
  // 1) Tem jogo ao vivo?
  const live = matches.find((m) => {
    const s = liveScores?.[m.id];
    return s && ['1H','2H','HT','ET','P','LIVE'].includes(s.status);
  });
  if (live) {
    const s = liveScores[live.id];
    const elapsed = s.elapsed ? ` ${s.elapsed}` : '';
    const statusLabel = s.status === 'HT' ? ' · Intervalo' : elapsed ? ` · ${elapsed}'` : '';
    return (
      <div className="bl-topbar">
        <div className="bl-topbar-in">
          <span className="bl-topbar-live"><span className="dot"/>AO VIVO</span>
          <span>{flag(live.home)} {live.home}</span>
          <span className="bl-topbar-score">{s.home ?? '–'} × {s.away ?? '–'}</span>
          <span>{live.away} {flag(live.away)}</span>
          {statusLabel && <span className="bl-topbar-dim">{statusLabel}</span>}
        </div>
      </div>
    );
  }

  // 2) Janela aberta agora (sem palpite salvo não verificamos — só mostramos o jogo)
  const aberto = matches.find((m) => !results[m.id] && isOpenWindow(m, now));
  if (aberto) {
    const fecha = fmtCountdown(lockTime(aberto) - now);
    return (
      <div className="bl-topbar">
        <div className="bl-topbar-in">
          <span style={{ color: 'var(--bandeira)', fontWeight: 900 }}>🔓</span>
          <span>{flag(aberto.home)} {aberto.home}</span>
          <span className="bl-topbar-sep">×</span>
          <span>{aberto.away} {flag(aberto.away)}</span>
          {fecha && <span className="bl-topbar-dim">· fecha em {fecha}</span>}
        </div>
      </div>
    );
  }

  // 3) Próximo jogo que vai abrir em breve (< 3h)
  const breve = matches
    .filter((m) => !results[m.id] && now < openTime(m) && openTime(m) - now < 3 * 60 * 60 * 1000)
    .sort((a, b) => openTime(a) - openTime(b))[0];
  if (breve) {
    const abre = fmtCountdown(openTime(breve) - now);
    return (
      <div className="bl-topbar">
        <div className="bl-topbar-in">
          <span className="bl-topbar-dim">Em breve:</span>
          <span>{flag(breve.home)} {breve.home}</span>
          <span className="bl-topbar-sep">×</span>
          <span>{breve.away} {flag(breve.away)}</span>
          {abre && <span className="bl-topbar-dim">· abre em {abre}</span>}
        </div>
      </div>
    );
  }

  return null;
}

function SkeletonCard() {
  return (
    <div className="bl-card" style={{ cursor: 'default' }}>
      <div className="bl-card-inner">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="bl-skel" style={{ height: 22, width: '32%', borderRadius: 999 }} />
          <div className="bl-skel" style={{ height: 14, width: '40%' }} />
        </div>
        <div className="bl-teams">
          <div className="bl-team">
            <div className="bl-skel" style={{ width: 44, height: 44, borderRadius: '50%' }} />
            <div className="bl-skel" style={{ width: 68, height: 14, marginTop: 8 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--board)', borderRadius: 14, padding: '6px 8px' }}>
            <div className="bl-skel" style={{ width: 52, height: 60, borderRadius: 8, background: 'rgba(255,255,255,.07)', backgroundImage: 'none' }} />
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
            <div className="bl-skel" style={{ width: 52, height: 60, borderRadius: 8, background: 'rgba(255,255,255,.07)', backgroundImage: 'none' }} />
          </div>
          <div className="bl-team">
            <div className="bl-skel" style={{ width: 44, height: 44, borderRadius: '50%' }} />
            <div className="bl-skel" style={{ width: 68, height: 14, marginTop: 8 }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
          <div className="bl-skel" style={{ height: 13, width: '42%' }} />
          <div className="bl-skel" style={{ height: 13, width: '26%' }} />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [boot, setBoot] = useState('loading');
  const [me, setMe] = useState(null); // {slug,name,pin,isAdmin}
  const [users, setUsers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [picksAll, setPicksAll] = useState({});
  const [results, setResults] = useState({});
  const [champPicks, setChampPicks] = useState({}); // slug -> team
  const [worldChampion, setWorldChampion] = useState(null);
  const [bootPicks, setBootPicks] = useState({});  // slug -> player_name
  const [bootWinner, setBootWinner] = useState(null);
  const [pedroVotes, setPedroVotes] = useState({});  // slug -> vote (boolean)
  const [draft, setDraft] = useState({});
  const [tab, setTab] = useState('jogos');
  const [filtro, setFiltro] = useState('todos');
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === '1');
  const alertedWindows = useRef(new Set());

  const say = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(t); }, []);

  useEffect(() => {
    for (const m of matches) {
      const ot = openTime(m);
      if (ot <= now && ot > now - 60000 && !alertedWindows.current.has(m.id)) {
        alertedWindows.current.add(m.id);
        say(`🔓 Janela aberta: ${m.home} × ${m.away} — palpite até 15min antes!`);
      }
    }
  }, [now, matches, say]);

  const loadAll = useCallback(async () => {
    const [mq, uq, pq, rq] = await Promise.all([
      supabase.from('matches').select('*').order('kickoff'),
      supabase.from('participants').select('*'),
      supabase.from('picks').select('*'),
      supabase.from('results').select('*'),
    ]);
    if (mq.error || uq.error || pq.error || rq.error) throw new Error('Falha ao carregar dados.');
    setMatches(mq.data || []);
    setUsers(uq.data || []);
    const pa = {};
    (pq.data || []).forEach((p) => { (pa[p.user_slug] = pa[p.user_slug] || {})[p.match_id] = p; });
    setPicksAll(pa);
    const rs = {};
    (rq.data || []).forEach((r) => { rs[r.match_id] = r; });
    setResults(rs);
    // Campeão: tabelas podem ainda não existir (antes de rodar a migração v2) — toleramos erro.
    const [cq, bq, pvq, tqFull] = await Promise.all([
      supabase.from('champion_picks').select('*'),
      supabase.from('boot_picks').select('*'),
      supabase.from('pedro_votes').select('*'),
      supabase.from('tournament').select('champion,boot_winner').eq('id', 1).maybeSingle(),
    ]);
    if (!cq.error) {
      const cp = {};
      (cq.data || []).forEach((c) => { cp[c.user_slug] = c.team; });
      setChampPicks(cp);
    }
    if (!bq.error) {
      const bp = {};
      (bq.data || []).forEach((b) => { bp[b.user_slug] = b.player_name; });
      setBootPicks(bp);
    }
    if (!pvq.error) {
      const pv = {};
      (pvq.data || []).forEach((v) => { pv[v.user_slug] = v.vote; });
      setPedroVotes(pv);
    }
    if (!tqFull.error) {
      setWorldChampion(tqFull.data?.champion ?? null);
      setBootWinner(tqFull.data?.boot_winner ?? null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadAll();
        const sess = loadSession();
        if (sess && sess.slug) setMe(sess);
      } catch (e) { say(e.message); }
      setBoot('ready');
    })();
  }, [loadAll, say]);

  // atualiza dados sozinho a cada 60s
  useEffect(() => {
    const t = setInterval(() => { loadAll().catch(() => {}); }, 60000);
    return () => clearInterval(t);
  }, [loadAll]);

  const refresh = useCallback(async () => {
    try { await loadAll(); setNow(Date.now()); say('Atualizado ✅'); } catch (e) { say(e.message); }
  }, [loadAll, say]);

  /* ---------- auth ---------- */
  async function handleAuth(mode, name, pin, setErr) {
    setErr('');
    setBusy(true);
    try {
      const fn = mode === 'criar' ? 'register_user' : 'login_user';
      const data = await rpc(fn, { p_name: name, p_pin: pin });
      const sess = { slug: data.slug, name: data.name, pin, isAdmin: data.is_admin };
      saveSession(sess);
      setMe(sess);
      await loadAll();
      say(mode === 'criar' && data.is_admin ? 'Bolão criado! Você é o organizador 👑' : `Fala, ${data.name}! ⚽`);
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  }

  function logout() { clearSession(); setMe(null); setDraft({}); }

  /* ---------- palpites ---------- */
  const myPicks = (me && picksAll[me.slug]) || {};
  const setDraftScore = (mid, side, val) => {
    if (side === 'qualifier') {
      setDraft((d) => {
        const cur = d[mid] || { h: myPicks[mid]?.home ?? null, a: myPicks[mid]?.away ?? null };
        return { ...d, [mid]: { ...cur, qualifier: val } };
      });
      return;
    }
    const n = val === '' ? null : Math.max(0, Math.min(99, parseInt(val, 10)));
    setDraft((d) => {
      const cur = d[mid] || { h: myPicks[mid]?.home ?? null, a: myPicks[mid]?.away ?? null };
      const updated = { ...cur, [side]: Number.isNaN(n) ? null : n };
      // If score changes to non-draw, clear qualifier (it's inferred)
      if (side === 'h' || side === 'a') {
        const newH = side === 'h' ? (Number.isNaN(n) ? null : n) : cur.h;
        const newA = side === 'a' ? (Number.isNaN(n) ? null : n) : cur.a;
        if (newH != null && newA != null && newH !== newA) updated.qualifier = null;
      }
      return { ...d, [mid]: updated };
    });
  };

  const pendingDraft = useMemo(() => Object.entries(draft).filter(([mid, p]) => {
    const m = matches.find((x) => x.id === mid);
    if (!m || !isOpenWindow(m, now)) return false;
    if (p.h == null || p.a == null) return false;
    // KO draw requires qualifier selection
    const isKO = m.phase !== 'Grupos';
    if (isKO && p.h === p.a && !p.qualifier) return false;
    return myPicks[mid]?.home !== p.h || myPicks[mid]?.away !== p.a || myPicks[mid]?.qualifier !== (p.qualifier || null);
  }), [draft, matches, now, myPicks]);

  async function savePicks() {
    if (!me || pendingDraft.length === 0) return;
    setBusy(true);
    try {
      const payload = pendingDraft.map(([id, p]) => {
        const m = matches.find((x) => x.id === id);
        const isKO = m?.phase !== 'Grupos';
        const qualifier = isKO
          ? (p.qualifier || (p.h > p.a ? 'home' : p.h < p.a ? 'away' : null))
          : null;
        return { id, h: p.h, a: p.a, qualifier };
      });
      const n = await rpc('save_picks', { p_name: me.name, p_pin: me.pin, p_picks: payload });
      setDraft({});
      await loadAll();
      say(n === 1 ? '1 palpite salvo ✅' : `${n} palpites salvos ✅`);
    } catch (e) { say(e.message); } finally { setBusy(false); }
  }

  async function saveChampion(team) {
    if (!me || !team) return;
    setBusy(true);
    try {
      await rpc('set_champion', { p_name: me.name, p_pin: me.pin, p_team: team });
      await loadAll();
      say(`Campeão palpitado: ${team} 🏆`);
    } catch (e) { say(e.message); } finally { setBusy(false); }
  }

  async function saveBootPick(player) {
    if (!me || !player) return;
    setBusy(true);
    try {
      await rpc('set_boot_pick', { p_name: me.name, p_pin: me.pin, p_player: player });
      await loadAll();
      say(`Chuteira de ouro: ${player} 👟`);
    } catch (e) { say(e.message); } finally { setBusy(false); }
  }

  async function savePedroVote(vote) {
    if (!me) return;
    setBusy(true);
    try {
      await rpc('set_pedro_vote', { p_name: me.name, p_pin: me.pin, p_vote: vote });
      await loadAll();
      say(`Votou ${vote} 👕`);
    } catch (e) { console.error('pedro vote error:', e); say(e.message || 'Erro ao votar'); } finally { setBusy(false); }
  }

  /* ---------- ranking ---------- */
  const ranking = useMemo(() => {
    const rows = users.map((u) => {
      let total = 0, exatos = 0, vencedores = 0;
      for (const m of matches) {
        const res = results[m.id]; if (!res) continue;
        const p = points(picksAll[u.slug]?.[m.id], res, m.phase !== 'Grupos'); if (p == null) continue;
        total += p; if (p === 3) exatos++; if (p === 1) vencedores++;
      }
      const champTeam = champPicks[u.slug] || null;
      const champHit = worldChampion && champTeam === worldChampion;
      if (champHit) total += CHAMPION_PTS;
      const bootPlayer = bootPicks[u.slug] || null;
      const bootHit = bootWinner && bootPlayer && bootPlayer.toLowerCase() === bootWinner.toLowerCase();
      if (bootHit) total += BOOT_PTS;
      return { slug: u.slug, name: u.name, avatar_url: u.avatar_url || null, total, exatos, vencedores, champTeam, champHit, bootPlayer, bootHit };
    });
    rows.sort((a, b) => b.total - a.total || b.exatos - a.exatos || b.vencedores - a.vencedores || a.name.localeCompare(b.name));
    return rows;
  }, [users, matches, results, picksAll, champPicks, worldChampion, bootPicks, bootWinner, pedroVotes]);

  const rankHistory = useMemo(() => {
    const sorted = [...matches].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    const cumulative = {};
    users.forEach((u) => { cumulative[u.slug] = 0; });
    const history = [];
    for (const m of sorted) {
      const res = results[m.id];
      if (!res) continue;
      for (const u of users) {
        const p = points(picksAll[u.slug]?.[m.id], res, m.phase !== 'Grupos');
        if (p != null) cumulative[u.slug] = (cumulative[u.slug] || 0) + p;
      }
      history.push({ matchLabel: `${m.home.slice(0,3)}×${m.away.slice(0,3)}`, scores: { ...cumulative } });
    }
    return history;
  }, [matches, results, users, picksAll]);

  const liveScores = useLiveScores(matches, me, rpc);

  const liveRanking = useMemo(() => {
    const hasLive = matches.some((m) => {
      const s = liveScores?.[m.id];
      return s && ['1H','2H','HT','ET','P','LIVE'].includes(s.status);
    });
    if (!hasLive) return null;
    const rows = users.map((u) => {
      let total = 0, exatos = 0, vencedores = 0;
      for (const m of matches) {
        const res = results[m.id];
        const live = liveScores?.[m.id];
        const effectiveRes = res || (live && live.home != null && live.away != null ? { home: live.home, away: live.away } : null);
        if (!effectiveRes) continue;
        const p = points(picksAll[u.slug]?.[m.id], effectiveRes, m.phase !== 'Grupos');
        if (p == null) continue;
        total += p; if (p === 3) exatos++; if (p >= 1) vencedores++;
      }
      const champHit = worldChampion && champPicks[u.slug] === worldChampion;
      if (champHit) total += CHAMPION_PTS;
      const bootHit = bootWinner && bootPicks[u.slug] && bootPicks[u.slug].toLowerCase() === bootWinner.toLowerCase();
      if (bootHit) total += BOOT_PTS;
      return { slug: u.slug, name: u.name, avatar_url: u.avatar_url || null, total, exatos, vencedores };
    });
    rows.sort((a, b) => b.total - a.total || b.exatos - a.exatos || b.vencedores - a.vencedores || a.name.localeCompare(b.name));
    return rows;
  }, [matches, results, liveScores, users, picksAll, champPicks, worldChampion, bootPicks, bootWinner, pedroVotes]);

  const pendentes = useMemo(() => {
    if (!me) return 0;
    return matches.filter((m) => {
      if (!isOpenWindow(m, now)) return false;
      const d = draft[m.id]; const s = myPicks[m.id];
      return !((d && d.h != null && d.a != null) || (s && s.home != null));
    }).length;
  }, [matches, now, draft, myPicks, me]);

  /* ============================ RENDER ============================ */
  if (boot === 'loading') {
    return (
      <div className="bl-app">
        <style>{CSS}</style>
        <header className="bl-hero">
          <div className="bl-crest">
            <img src="/logo.png" alt="EngSoc" className="bl-logo" />
            <span className="ano bl-display">★ 2026 ★</span>
            <h1 className="bl-display">BOLÃO DA COPA</h1>
            <span style={{ fontSize: 13, opacity: .9, fontWeight: 700, letterSpacing: 1 }}>ENGSOC</span>
            <span style={{ fontSize: 11, opacity: .7 }}>EUA · México · Canadá</span>
          </div>
        </header>
        <div className="bl-wrap" style={{ paddingTop: 8 }}>
          <div className="bl-day"><span>carregando…</span></div>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      </div>
    );
  }

  const toggleDark = () => {
    setDarkMode((d) => {
      const next = !d;
      localStorage.setItem('darkMode', next ? '1' : '0');
      return next;
    });
  };

  const topBarVisible = (() => {
    if (matches.some((m) => { const s = liveScores?.[m.id]; return s && ['1H','2H','HT','ET','P','LIVE'].includes(s.status); })) return true;
    if (matches.some((m) => !results[m.id] && isOpenWindow(m, now))) return true;
    const soon = matches.filter((m) => !results[m.id]).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff))[0];
    return !!(soon && new Date(soon.kickoff).getTime() - now < 3 * 3600000);
  })();

  return (
    <div className="bl-app" data-theme={darkMode ? 'dark' : undefined} data-tb={topBarVisible ? '1' : '0'}>
      <style>{CSS}</style>
      <TopBar matches={matches} results={results} liveScores={liveScores} now={now} />
      <header className="bl-hero">
        <div className="bl-crest">
          <img src="/logo.png" alt="EngSoc" className="bl-logo" />
          <span className="ano bl-display">★ 2026 ★</span>
          <h1 className="bl-display">BOLÃO DA COPA</h1>
          <span style={{ fontSize: 13, opacity: .9, fontWeight: 700, letterSpacing: 1 }}>ENGSOC</span>
          <span style={{ fontSize: 11, opacity: .7 }}>EUA · México · Canadá</span>
        </div>
        <div className="bl-rules">
          <span className="bl-chip">Placar exato <b>3 pts</b></span>
          <span className="bl-chip">Vencedor/empate <b>1 pt</b></span>
          <span className="bl-chip">Abre <b>24h</b> antes · fecha <b>15 min</b> antes</span>
        </div>
        {me && (
          <div style={{ marginTop: 10, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>{me.isAdmin ? '👑 ' : '⚽ '}<b>{me.name}</b></span>
            <span style={{ color: 'rgba(244,240,228,.4)' }}>·</span>
            <button className="bl-link" style={{ color: 'var(--canarinho)' }} onClick={refresh}>atualizar</button>
            <span style={{ color: 'rgba(244,240,228,.4)' }}>·</span>
            <button className="bl-link" style={{ color: 'var(--canarinho)' }} onClick={logout}>sair</button>
            <span style={{ color: 'rgba(244,240,228,.4)' }}>·</span>
            <button className="bl-dark-btn" onClick={toggleDark} title={darkMode ? 'Modo claro' : 'Modo escuro'}>
              {darkMode ? '☀️ claro' : '🌙 noite'}
            </button>
          </div>
        )}
      </header>

      {!me ? (
        <AuthScreen onSubmit={handleAuth} busy={busy} firstUser={users.length === 0} />
      ) : (
        <>
          <nav className="bl-tabs" aria-label="Seções">
            <div className="bl-tabs-in">
              <button className="bl-tab" data-on={tab === 'jogos' ? 1 : 0} onClick={() => { setTab('jogos'); loadAll().catch(() => {}); }}>
                Jogos {pendentes > 0 && <span className="bl-badge">{pendentes}</span>}
              </button>
              <button className="bl-tab" data-on={tab === 'ranking' ? 1 : 0} onClick={() => { setTab('ranking'); loadAll().catch(() => {}); window.scrollTo(0,0); }}>Ranking</button>
              <button className="bl-tab" data-on={tab === 'tabela' ? 1 : 0} onClick={() => { setTab('tabela'); window.scrollTo(0,0); }}>{matches.some((m) => PHASES_KO.includes(m.phase)) ? 'Classificação' : 'Tabela'}</button>
              <button className="bl-tab" data-on={tab === 'artilharia' ? 1 : 0} onClick={() => { setTab('artilharia'); window.scrollTo(0,0); }}>⚽ Art.</button>
              {me.isAdmin && <button className="bl-tab" data-on={tab === 'admin' ? 1 : 0} onClick={() => { setTab('admin'); loadAll().catch(() => {}); window.scrollTo(0,0); }}>Admin</button>}
            </div>
          </nav>

          <main className="bl-wrap">
            {tab === 'jogos' && (
              <JogosTab matches={matches} me={me} users={users} now={now}
                picksAll={picksAll} myPicks={myPicks} draft={draft} results={results}
                filtro={filtro} setFiltro={setFiltro} setDraftScore={setDraftScore}
                myChampion={champPicks[me.slug] || null} onSaveChampion={saveChampion} busy={busy}
                liveScores={liveScores} pedroVotes={pedroVotes} onPedroVote={savePedroVote} />
            )}
            {tab === 'ranking' && <RankingTab ranking={ranking} liveRanking={liveRanking} meSlug={me.slug} results={results} worldChampion={worldChampion} rankHistory={rankHistory} picksAll={picksAll} />}
            {tab === 'tabela' && <TabelaTab active={tab === 'tabela'} matches={matches} results={results} draft={draft} setDraftScore={setDraftScore} myPicks={myPicks} darkMode={darkMode} savePicks={savePicks} busy={busy} users={users} picksAll={picksAll} me={me} />}
            {tab === 'artilharia' && <ArtilhariaTab me={me} myBootPick={bootPicks[me?.slug] || null} bootWinner={bootWinner} onSaveBootPick={saveBootPick} busy={busy} bootPicks={bootPicks} users={users} matches={matches} results={results} />}
            {tab === 'admin' && me.isAdmin && (
              <AdminTab me={me} matches={matches} results={results} users={users} now={now}
                worldChampion={worldChampion} liveScores={liveScores}
                onDone={async (msg) => { await loadAll(); say(msg); }} onError={(e) => say(e)} busy={busy} setBusy={setBusy} />
            )}
          </main>

          {tab === 'jogos' && pendingDraft.length > 0 && (
            <div className="bl-savebar">
              <div className="bl-savebar-in">
                <button className={`bl-btn amarelo${!busy ? ' pulse' : ''}`} disabled={busy} onClick={savePicks}>
                  {busy ? 'Salvando…' : `Salvar ${pendingDraft.length} palpite${pendingDraft.length > 1 ? 's' : ''} ⚽`}
                </button>
              </div>
            </div>
          )}

          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            style={{
              position: 'fixed',
              bottom: 20,
              right: 20,
              width: 50,
              height: 50,
              borderRadius: '50%',
              background: 'var(--verde)',
              border: 'none',
              color: 'var(--tinta)',
              fontSize: 24,
              fontWeight: 700,
              cursor: 'pointer',
              opacity: 0.8,
              transition: 'opacity .2s',
            }}
            onMouseEnter={(e) => (e.target.style.opacity = '1')}
            onMouseLeave={(e) => (e.target.style.opacity = '0.8')}
            title="Voltar ao topo"
          >
            ↑
          </button>
        </>
      )}
      {toast && <div className="bl-toast" role="status">{toast}</div>}
    </div>
  );
}

/* ============================ Auth ============================ */
function AuthScreen({ onSubmit, busy, firstUser }) {
  const [mode, setMode] = useState(firstUser ? 'criar' : 'entrar');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  return (
    <main className="bl-wrap" style={{ maxWidth: 440 }}>
      <div className="bl-panel">
        <h2 className="bl-display">{mode === 'criar' ? 'Entrar no bolão' : 'Já estou no bolão'}</h2>
        <p className="sub">
          {mode === 'criar'
            ? firstUser ? 'Você será o primeiro — e vira o organizador (lança os resultados).' : 'Crie seu nome e um PIN para proteger seus palpites.'
            : 'Digite o mesmo nome e PIN que você cadastrou.'}
        </p>
        {err && <div className="bl-erro">{err}</div>}
        <div className="bl-field">
          <label htmlFor="bl-nome">Seu nome</label>
          <input id="bl-nome" className="bl-in" value={name} maxLength={24} placeholder="ex: Rainer"
            onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </div>
        <div className="bl-field">
          <label htmlFor="bl-pin">PIN (4 a 6 números)</label>
          <input id="bl-pin" className="bl-in" value={pin} inputMode="numeric" maxLength={6} placeholder="••••"
            type="password" onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </div>
        <button className="bl-btn amarelo" style={{ width: '100%' }} disabled={busy}
          onClick={() => onSubmit(mode, name, pin, setErr)}>
          {busy ? 'Um momento…' : mode === 'criar' ? 'Criar e entrar' : 'Entrar'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
          {mode === 'criar'
            ? <>Já tem conta? <button className="bl-link" onClick={() => { setMode('entrar'); setErr(''); }}>Entrar</button></>
            : <>Primeira vez? <button className="bl-link" onClick={() => { setMode('criar'); setErr(''); }}>Criar minha conta</button></>}
        </p>
      </div>
      <p style={{ color: 'rgba(244,240,228,.7)', fontSize: 12, textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
        Esqueceu o PIN? Fala com o organizador do bolão, que ele reseta pra você.
      </p>
    </main>
  );
}

/* ============================ Palpite Pedro ============================ */
const PEDRO_QUESTION = 'Qual tamanho de camisa o Pedro deveria usar?';

function PedroVoteCard({ me, pedroVotes, onVote, busy }) {
  const myVote = me ? pedroVotes[me.slug] : undefined;
  const voted = myVote !== undefined;
  const counts = { P: 0, M: 0, G: 0 };
  Object.values(pedroVotes).forEach(v => { if (counts[v] !== undefined) counts[v]++; });
  const total = counts.P + counts.M + counts.G;

  return (
    <div className="bl-champ" style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 22 }}>🇧🇷</span>
        <h3 className="bl-display" style={{ margin: 0, fontSize: 15 }}>Palpite especial</h3>
      </div>
      <p className="sub" style={{ fontStyle: 'italic' }}>"{PEDRO_QUESTION}"</p>
      {!voted ? (
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          {['P', 'M', 'G'].map(sz => (
            <button key={sz} className="bl-btn" style={{ flex: 1, padding: '10px', fontSize: 16, fontWeight: 800, background: '#6E7A70', color: '#fff' }}
              disabled={busy} onClick={() => onVote(sz)}>
              {sz}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
            Você votou: <span style={{ color: 'var(--bandeira)' }}>{myVote}</span>
          </div>
          {total > 0 && (
            <div style={{ fontSize: 12, color: 'var(--cinza)' }}>
              P: {counts.P} · M: {counts.M} · G: {counts.G} · {total} {total === 1 ? 'voto' : 'votos'}
            </div>
          )}
          <div style={{ fontSize: 11, color: 'var(--cinza)', marginTop: 4, fontStyle: 'italic' }}>Voto definitivo — não pode alterar 🔒</div>
        </div>
      )}
    </div>
  );
}

/* ============================ Campeão ============================ */
function ChampionCard({ myChampion, onSave, busy }) {
  const [sel, setSel] = useState(myChampion || '');
  const open = Date.now() < CHAMPION_DEADLINE;
  const teams = Object.keys(FLAGS).sort((a, b) => a.localeCompare(b));
  const deadlineTxt = new Date(CHAMPION_DEADLINE).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <div className="bl-champ">
      <h3 className="bl-display">🏆 Palpite de campeão <span className="bl-champ-badge">+{CHAMPION_PTS} pts</span></h3>
      <p className="sub">Quem levanta a taça? Acertar vale <b>{CHAMPION_PTS} pontos</b> no fim. Dá pra trocar até <b>{deadlineTxt}</b>.</p>
      {open ? (
        <>
          <select value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Escolha o campeão">
            <option value="">— escolher seleção —</option>
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="cur">
            {myChampion
              ? <>Seu palpite atual: <Flag team={myChampion} size={18} /> <b>{myChampion}</b></>
              : <span style={{ color: 'rgba(244,240,228,.6)' }}>Você ainda não palpitou o campeão.</span>}
            <button className="bl-btn amarelo" style={{ flex: 'none', padding: '8px 16px', fontSize: 13, marginLeft: 'auto' }}
              disabled={busy || !sel || sel === myChampion} onClick={() => onSave(sel)}>
              {sel === myChampion ? 'Salvo' : 'Salvar campeão'}
            </button>
          </div>
        </>
      ) : (
        <div className="lock">
          🔒 O palpite de campeão já fechou.{' '}
          {myChampion ? <>Você escolheu <Flag team={myChampion} size={18} /> <b style={{ color: 'var(--canarinho)' }}>{myChampion}</b>.</> : 'Você não chegou a palpitar.'}
        </div>
      )}
    </div>
  );
}

/* ============================ Jogos ============================ */
function JogosTab({ matches, me, users, now, picksAll, myPicks, draft, results, filtro, setFiltro, setDraftScore, myChampion, onSaveChampion, busy, liveScores, pedroVotes, onPedroVote }) {
  const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const [hideFinished, setHideFinished] = useState(() => localStorage.getItem('hideFinished') === '1');
  const firstOpenRef = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const el = firstOpenRef.current;
      if (!el) return;
      const y = el.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }, 400);
    return () => clearTimeout(t);
  }, []);
  const toggleHideFinished = (v) => { setHideFinished(v); localStorage.setItem('hideFinished', v ? '1' : '0'); };
  const filtered = matches.filter((m) => {
    if (filtro === 'todos') return true;
    if (filtro === 'abertos') return isOpenWindow(m, now);
    if (filtro === 'pendentes') {
      if (!isOpenWindow(m, now)) return false;
      const d = draft[m.id], s = myPicks[m.id];
      return !((d && d.h != null && d.a != null) || (s && s.home != null));
    }
    if (filtro === 'mata') return m.phase !== 'Grupos';
    return m.grp === filtro;
  });

  const byDay = [];
  let lastKey = null;
  for (const m of filtered) {
    const k = dayKey(m.kickoff);
    if (k !== lastKey) { byDay.push({ day: m.kickoff, items: [] }); lastKey = k; }
    byDay[byDay.length - 1].items.push(m);
  }

  const statsData = useMemo(() => {
    const resultMatches = matches.filter((m) => results[m.id]);
    if (resultMatches.length === 0) return null;
    let totalPts = 0, exatos = 0, vencedores = 0, semPalpite = 0;
    for (const m of resultMatches) {
      const res = results[m.id];
      const pick = myPicks[m.id];
      if (!pick) { semPalpite++; continue; }
      const p = points(pick, res, m.phase !== 'Grupos');
      if (p == null) { semPalpite++; continue; }
      totalPts += p;
      if (p === 3) exatos++;
      if (p === 1) vencedores++;
    }
    return { totalPts, exatos, vencedores, semPalpite };
  }, [matches, results, myPicks]);

  return (
    <section aria-label="Jogos">
      <ChampionCard myChampion={myChampion} onSave={onSaveChampion} busy={busy} />
      {statsData && (
        <div className="bl-stats-row">
          <div className="bl-stat-box"><div className="sv">{statsData.totalPts}</div><div className="sl">Total de pontos</div></div>
          <div className="bl-stat-box"><div className="sv">{statsData.exatos}</div><div className="sl">Placares exatos</div></div>
          <div className="bl-stat-box"><div className="sv">{statsData.vencedores}</div><div className="sl">Acertos result.</div></div>
          <div className="bl-stat-box"><div className="sv">{statsData.semPalpite}</div><div className="sl">Sem palpite</div></div>
        </div>
      )}
      <div className="bl-filtros" role="tablist" aria-label="Filtrar jogos">
        {[['todos', 'Todos'], ['abertos', 'Abertos'], ['pendentes', 'Sem palpite'], ['mata', 'Mata-mata']].map(([k, l]) => (
          <button key={k} className="bl-f" data-on={filtro === k ? 1 : 0} onClick={() => setFiltro(k)}>{l}</button>
        ))}
        {grupos.map((g) => (
          <button key={g} className="bl-f" data-on={filtro === g ? 1 : 0} onClick={() => setFiltro(g)}>Grupo {g}</button>
        ))}
      </div>

      {filtered.some((m) => results[m.id]) && (
        <div style={{ textAlign: 'right', marginBottom: 8 }}>
          <button className="bl-toggle-btn" data-on={hideFinished ? 1 : 0} onClick={() => toggleHideFinished(!hideFinished)}>
            {hideFinished ? 'Mostrar encerrados' : 'Ocultar encerrados'}
          </button>
        </div>
      )}

      {byDay.length === 0 && (
        <div className="bl-panel" style={{ textAlign: 'center' }}>
          <p style={{ margin: 0 }}>Nenhum jogo aqui. {filtro === 'mata' ? 'O organizador adiciona o mata-mata quando os cruzamentos saírem.' : 'Mude o filtro acima.'}</p>
        </div>
      )}

      {(() => {
        const LIVE_ST = ['1H','2H','HT','ET','P','LIVE','INT','BT'];
        // dia-alvo do scroll: 1º com jogo AO VIVO; se não houver, 1º com jogo sem resultado
        let targetKey = null;
        for (const { items } of byDay) {
          const visible = hideFinished ? items.filter((m) => !results[m.id]) : items;
          if (visible.some((m) => LIVE_ST.includes(liveScores?.[m.id]?.status))) { targetKey = dayKey(items[0].kickoff); break; }
        }
        if (!targetKey) {
          for (const { items } of byDay) {
            const visible = hideFinished ? items.filter((m) => !results[m.id]) : items;
            if (visible.some((m) => !results[m.id])) { targetKey = dayKey(items[0].kickoff); break; }
          }
        }
        return byDay.map(({ day, items }) => {
          const visible = hideFinished ? items.filter((m) => !results[m.id]) : items;
          if (!visible.length) return null;
          const dayRef = dayKey(day) === targetKey ? firstOpenRef : null;
          return (
            <div key={dayKey(day)} ref={dayRef}>
              <div className="bl-day"><span>{fmtDay(day)}</span></div>
              {visible.map((m) => (
                <MatchCard key={m.id} m={m} me={me} users={users} now={now}
                  picksAll={picksAll} myPicks={myPicks} draft={draft} res={results[m.id]}
                  setDraftScore={setDraftScore} liveScore={liveScores?.[m.id]} />
              ))}
            </div>
          );
        });
      })()}
    </section>
  );
}

function MatchCard({ m, me, users, now, picksAll, myPicks, draft, res, setDraftScore, liveScore }) {
  const [open, setOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const locked = isLocked(m, now);
  const inWindow = isOpenWindow(m, now);
  const beforeWindow = now < openTime(m);
  const cdAbre = fmtCountdown(openTime(m) - now);
  const cdFecha = fmtCountdown(lockTime(m) - now);
  const d = draft[m.id];
  const saved = myPicks[m.id];
  const valH = d ? d.h : saved?.home ?? null;
  const valA = d ? d.a : saved?.away ?? null;
  const pts = res && saved ? points(saved, res, m.phase !== 'Grupos') : null;
  const isLive = ['1H', '2H', 'HT', 'ET', 'LIVE'].includes(liveScore?.status);
  const isFinished = !!res;
  const [collapsed, setCollapsed] = useState(isFinished);
  const stamp = res ? ['fim', 'ENCERRADO'] : isLive ? ['aberto', '🔴 AO VIVO'] : locked ? ['fechado', 'FECHADO'] : beforeWindow ? ['breve', 'EM BREVE'] : ['aberto', 'ABERTO'];
  const hCls = d && d.h != null ? ' draft' : valH != null ? ' has-value' : '';
  const aCls = d && d.a != null ? ' draft' : valA != null ? ' has-value' : '';

  const others = users
    .map((u) => ({ slug: u.slug, name: u.name, pick: picksAll[u.slug]?.[m.id] }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const quantos = others.filter((o) => o.pick).length;

  if (isFinished && collapsed) {
    return (
      <article className="bl-card bl-card-collapsed" onClick={() => setCollapsed(false)} title="Clique para expandir">
        <div className="bl-collapsed-inner">
          <span className="bl-collapsed-date">{fmtTime(m.kickoff).split(' ')[0]}</span>
          <div className="bl-collapsed-teams">
            <Flag team={m.home} size={22} /><span className="bl-collapsed-name">{m.home}</span>
          </div>
          <div className="bl-collapsed-score">
            <span>{res.home}</span><span className="bl-collapsed-x">×</span><span>{res.away}</span>
          </div>
          <div className="bl-collapsed-teams">
            <Flag team={m.away} size={22} /><span className="bl-collapsed-name">{m.away}</span>
          </div>
          {pts != null && <span className={`bl-pts p${pts}`} style={{ marginLeft: 8 }}>{pts === 3 ? '⭐3' : pts === 1 ? '+1' : '0'}</span>}
          {saved ? (
            <span className="bl-collapsed-pick">{saved.home}×{saved.away}</span>
          ) : (
            <span className="bl-collapsed-pick" style={{ opacity: .5 }}>sem palpite</span>
          )}
          <span className="bl-collapsed-expand">▸</span>
        </div>
      </article>
    );
  }

  return (
    <article className="bl-card">
      <span className={`bl-stamp ${stamp[0]}`}>{stamp[1]}</span>
      <div className="bl-card-inner">
        <div className="bl-meta">
          <span className="grupo">{m.phase === 'Grupos' ? `GRUPO ${m.grp}` : m.phase.toUpperCase()}</span>
          <span>{fmtTime(m.kickoff)} (Brasília){m.city ? ` · ${m.city}` : ''}</span>
        </div>

        {m.phase === 'Grupos' ? (
          <div className="bl-teams">
            <div className="bl-team"><span className="fl"><Flag team={m.home} /></span><span className="nm">{m.home}</span></div>
            <div className="bl-x">
              <input className={`bl-score-in${hCls}`} aria-label={`Gols de ${m.home}`} inputMode="numeric" maxLength={2}
                disabled={!inWindow} value={valH ?? ''} placeholder="–"
                onChange={(e) => setDraftScore(m.id, 'h', e.target.value.replace(/\D/g, ''))} />
              <span className="bl-vs">×</span>
              <input className={`bl-score-in${aCls}`} aria-label={`Gols de ${m.away}`} inputMode="numeric" maxLength={2}
                disabled={!inWindow} value={valA ?? ''} placeholder="–"
                onChange={(e) => setDraftScore(m.id, 'a', e.target.value.replace(/\D/g, ''))} />
            </div>
            <div className="bl-team"><span className="fl"><Flag team={m.away} /></span><span className="nm">{m.away}</span></div>
          </div>
        ) : (() => {
          const homeColor = TEAM_COLORS[m.home] || 'rgba(255,198,41,.1)';
          const awayColor = TEAM_COLORS[m.away] || 'rgba(255,198,41,.1)';
          return (
            <div style={{
              display: 'flex',
              gap: 0,
              borderRadius: 12,
              overflow: 'hidden',
              border: `2px solid #20301F`,
              background: `linear-gradient(90deg, ${homeColor}1f 0%, ${homeColor}14 45%, transparent 50%, ${awayColor}14 55%, ${awayColor}1f 100%)`,
              borderLeft: `4px solid ${homeColor}`,
              borderRight: `4px solid ${awayColor}`,
              minHeight: 100,
              alignItems: 'center',
              marginTop: 8,
            }}>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 12px', borderRight: `1px solid rgba(255,198,41,.12)` }}>
                <Flag team={m.home} size={32} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tinta)' }}>{m.home}</span>
                <input className={`bl-score-in${hCls}`} aria-label={`Gols de ${m.home}`} inputMode="numeric" maxLength={2}
                  disabled={!inWindow} value={valH ?? ''} placeholder="–"
                  style={{ width: 40, fontSize: 20, fontWeight: 900, textAlign: 'center', padding: '4px 6px' }}
                  onChange={(e) => setDraftScore(m.id, 'h', e.target.value.replace(/\D/g, ''))} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '0 12px', color: 'rgba(255,198,41,.7)', fontSize: 11, fontWeight: 700 }}>
                VS
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 12px', borderLeft: `1px solid rgba(255,198,41,.12)` }}>
                <Flag team={m.away} size={32} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--tinta)' }}>{m.away}</span>
                <input className={`bl-score-in${aCls}`} aria-label={`Gols de ${m.away}`} inputMode="numeric" maxLength={2}
                  disabled={!inWindow} value={valA ?? ''} placeholder="–"
                  style={{ width: 40, fontSize: 20, fontWeight: 900, textAlign: 'center', padding: '4px 6px' }}
                  onChange={(e) => setDraftScore(m.id, 'a', e.target.value.replace(/\D/g, ''))} />
              </div>
            </div>
          );
        })()}

        {m.phase !== 'Grupos' && (() => {
          const draftH = d ? d.h : valH;
          const draftA = d ? d.a : valA;
          const isDraw = draftH != null && draftA != null && draftH === draftA;
          const curQ = d?.qualifier ?? myPicks[m.id]?.qualifier ?? null;
          if (!isDraw) return null;
          const homeColor = TEAM_COLORS[m.home] || 'rgba(255,198,41,.1)';
          const awayColor = TEAM_COLORS[m.away] || 'rgba(255,198,41,.1)';
          return (
            <>
              <div style={{ marginTop: 12, padding: '10px 0', fontSize: 11, color: 'var(--cinza)', textAlign: 'center', marginBottom: -2 }}>🏆 Quem avança?</div>
              <div style={{
                display: 'flex',
                gap: 0,
                marginTop: 8,
                borderRadius: 8,
                overflow: 'hidden',
                border: `2px solid rgba(255,198,41,.2)`,
                background: `linear-gradient(90deg, ${homeColor}12, ${awayColor}12)`,
              }}>
                <button
                  className={`bl-btn${curQ === 'home' ? ' verde' : ''}`}
                  style={{
                    flex: 1,
                    fontSize: 13,
                    padding: '10px 8px',
                    borderRight: `1px solid ${homeColor}40`,
                    background: curQ === 'home' ? `${homeColor}30` : 'transparent',
                    color: curQ === 'home' ? 'var(--bandeira)' : 'var(--tinta)',
                    fontWeight: curQ === 'home' ? 700 : 600,
                  }}
                  disabled={!inWindow}
                  onClick={() => setDraftScore(m.id, 'qualifier', 'home')}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <Flag team={m.home} size={20} /> {m.home}
                  </span>
                </button>
                <button
                  className={`bl-btn${curQ === 'away' ? ' verde' : ''}`}
                  style={{
                    flex: 1,
                    fontSize: 13,
                    padding: '10px 8px',
                    borderLeft: `1px solid ${awayColor}40`,
                    background: curQ === 'away' ? `${awayColor}30` : 'transparent',
                    color: curQ === 'away' ? 'var(--bandeira)' : 'var(--tinta)',
                    fontWeight: curQ === 'away' ? 700 : 600,
                  }}
                  disabled={!inWindow}
                  onClick={() => setDraftScore(m.id, 'qualifier', 'away')}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {m.away} <Flag team={m.away} size={20} />
                  </span>
                </button>
              </div>
            </>
          );
        })()}

        {res && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <span className="bl-final">{res.home} <small>placar<br />final</small> {res.away}</span>
            {m.phase !== 'Grupos' && res.qualifier && (
              <div style={{ fontSize: 11, color: 'var(--cinza)', marginTop: 4 }}>
                avança: <b style={{ color: 'var(--canarinho)' }}>{res.qualifier === 'home' ? m.home : m.away}</b>
              </div>
            )}
          </div>
        )}

        {!res && liveScore && liveScore.status !== 'NS' && liveScore.home != null && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            {isLive && <span className="bl-mi-live" style={{ marginBottom: 6, display: 'inline-flex' }}><span className="dot" />AO VIVO {liveScore.elapsed ? `${liveScore.elapsed}` : ''}</span>}
            <div style={{ fontWeight: 900, fontSize: 22, color: isLive ? 'var(--apito)' : 'var(--tinta)' }}>
              {liveScore.home} × {liveScore.away}
              {!isLive && liveScore.status === 'FT' && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--cinza)', marginLeft: 8 }}>ESPN</span>}
            </div>
          </div>
        )}

        <div className="bl-foot">
          <span>
            {beforeWindow && cdAbre && <>⏳ Abre em <b>{cdAbre}</b></>}
            {inWindow && cdFecha && <>🔓 Fecha em <b>{cdFecha}</b></>}
            {locked && !res && <>🔒 Palpites encerrados</>}
            {res && saved && pts != null && (
              <span className={`bl-pts p${pts}`}>{pts === 3 ? '⭐ +3 pts' : pts === 1 ? '+1 pt' : '0 pt'}</span>
            )}
            {res && !saved && <span className="bl-pts p0">sem palpite</span>}
          </span>
          <span style={{ display: 'flex', gap: 12 }}>
            {isFinished && (
              <button className="bl-mini" onClick={() => setCollapsed(true)}>▴ recolher</button>
            )}
            <button className="bl-mini" onClick={() => setInfoOpen((o) => !o)}>
              {infoOpen ? 'esconder info' : '📊 info do jogo'}
            </button>
            <button className="bl-mini" onClick={() => setOpen((o) => !o)}>
              {open ? 'esconder palpites' : `palpites (${quantos})`}
            </button>
          </span>
        </div>
      </div>

      {infoOpen && <MatchInfo m={m} savedRes={res} />}

      {open && (
        <div className="bl-picks">
          {others.map(({ slug, name, pick }) => {
            const effectiveRes = res || (liveScore && liveScore.home != null && liveScore.away != null ? { home: liveScore.home, away: liveScore.away } : null);
            const isLivePts = !res && effectiveRes;
            const p = effectiveRes && pick ? points(pick, effectiveRes, m.phase !== 'Grupos') : null;
            return (
              <div className={`row ${slug === me?.slug ? 'me' : ''}`} key={slug}>
                <span>{slug === me?.slug ? 'Você' : name}</span>
                <span>
                  {pick ? `${pick.home} × ${pick.away}${m.phase !== 'Grupos' && pick.qualifier ? ` (${pick.qualifier === 'home' ? m.home : m.away} avança)` : ''}` : 'ainda não palpitou'}
                  {p != null && <b style={{ marginLeft: 8, color: isLivePts ? 'var(--verde)' : undefined }}>{p === 3 ? '⭐3' : p >= 1 ? `+${p}` : '0'}</b>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

/* ============================ Info do jogo (ESPN) ============================ */
const EV_ICON = (e) => {
  const t = (e.type || '').toLowerCase(), d = (e.detail || '').toLowerCase();
  if (t === 'goal') return d.includes('own') ? '⚽🔴' : d.includes('penalty') ? '⚽(P)' : '⚽';
  if (t === 'card') return d.includes('yellow') ? '🟨' : '🟥';
  if (t === 'subst') return '🔄';
  return '•';
};

function MatchInfo({ m, savedRes }) {
  const [state, setState] = useState({ loading: true });
  const [sub, setSub] = useState('resumo');

  useEffect(() => {
    let alive = true;
    setState({ loading: true });
    fetchMatchInfo(m.home, m.away, m.kickoff)
      .then((d) => {
        if (!alive) return;
        // Se ESPN não achou mas temos resultado salvo, monta payload mínimo
        if (!d?.found && savedRes) {
          d = { found: true, status: { short: 'FT', long: 'Encerrado' }, goals: { home: savedRes.home, away: savedRes.away },
                teams: { home: { name: m.home }, away: { name: m.away } }, events: [], lineups: [], statistics: [], h2h: [] };
        }
        setState({ loading: false, data: d });
      })
      .catch((e) => {
        if (!alive) return;
        // erro de rede mas temos resultado salvo — usa ele
        if (savedRes) {
          setState({ loading: false, data: { found: true, status: { short: 'FT', long: 'Encerrado' },
            goals: { home: savedRes.home, away: savedRes.away },
            teams: { home: { name: m.home }, away: { name: m.away } }, events: [], lineups: [], statistics: [], h2h: [] } });
        } else {
          setState({ loading: false, error: e.message, kind: e.kind });
        }
      });
    return () => { alive = false; };
  }, [m.home, m.away, m.kickoff]);

  if (state.loading) return <div className="bl-mi"><div className="bl-mi-dim">⌛ Buscando dados do jogo…</div></div>;
  if (state.error) return (
    <div className="bl-mi"><div className="bl-mi-dim">
      {`Não consegui carregar agora. ${state.error}`}
    </div></div>
  );
  const d = state.data;
  if (!d?.found) return <div className="bl-mi"><div className="bl-mi-dim">{d?.message || 'Sem dados oficiais desse jogo ainda.'}</div></div>;

  const live = ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE', 'INT'].includes(d.status?.short);
  const finished = ['FT', 'AET', 'PEN'].includes(d.status?.short);
  const tabs = [['resumo', 'Resumo'], ['escala', 'Escalação'], ['stats', 'Estatísticas'], ['h2h', 'Confrontos']];

  return (
    <div className="bl-mi">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {live && <span className="bl-mi-live"><span className="dot" />AO VIVO {d.status?.elapsed ? `${d.status.elapsed}'` : ''}</span>}
        <span style={{ fontWeight: 900, fontSize: 18 }}>
          {d.teams?.home?.name} <b style={{ color: 'var(--apito)' }}>{d.goals?.home ?? '–'}</b>
          {' × '}
          <b style={{ color: 'var(--apito)' }}>{d.goals?.away ?? '–'}</b> {d.teams?.away?.name}
        </span>
        {!live && <span style={{ fontSize: 12, color: 'var(--cinza)' }}>{finished ? 'Encerrado' : d.status?.long}</span>}
      </div>

      <div className="bl-mi-tabs" style={{ marginTop: 10 }}>
        {tabs.map(([k, l]) => <button key={k} data-on={sub === k ? 1 : 0} onClick={() => setSub(k)}>{l}</button>)}
      </div>

      {sub === 'resumo' && (
        <div>
          {d.events?.length ? d.events.map((e, i) => (
            <div className="ev" key={i}>
              <span className="mn">{e.minute != null ? `${e.minute}${e.extra ? '+' + e.extra : ''}'` : ''}</span>
              <span>{EV_ICON(e)}</span>
              <span><b>{e.player || '—'}</b>{e.assist ? <span style={{ color: 'var(--cinza)' }}> (assist. {e.assist})</span> : ''} · <span style={{ color: 'var(--cinza)' }}>{e.team}</span></span>
            </div>
          )) : <div className="bl-mi-dim">Sem lances registrados ainda.</div>}
          {d.venue?.name && <div className="bl-mi-dim">🏟️ {d.venue.name}{d.venue.city ? ` · ${d.venue.city}` : ''}</div>}
        </div>
      )}

      {sub === 'escala' && (
        <div>
          {d.lineups?.length ? d.lineups.map((l, i) => (
            <div key={i}>
              <h4>{l.team} {l.formation ? <span className="form">· {l.formation}</span> : ''} {l.coach ? <span style={{ color: 'var(--cinza)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· téc. {l.coach}</span> : ''}</h4>
              <div className="xi">
                {l.startXI.map((p, j) => <span className="pl" key={j}><span className="n">{p.number ?? ''}</span>{p.name}</span>)}
              </div>
              {l.subs?.length > 0 && <div className="bl-mi-dim" style={{ marginTop: 4 }}>Banco: {l.subs.map((p) => p.name).join(', ')}</div>}
            </div>
          )) : <div className="bl-mi-dim">Escalações saem perto do início do jogo.</div>}
        </div>
      )}

      {sub === 'stats' && (
        <div>
          {d.statistics?.length === 2 ? (() => {
            const [A, B] = d.statistics;
            const types = A.items.map((x) => x.type);
            return types.map((tp, i) => (
              <div className="st" key={i}>
                <b>{A.items[i]?.value ?? '–'}</b>
                <span className="lbl">{tp}</span>
                <b>{B.items.find((x) => x.type === tp)?.value ?? '–'}</b>
              </div>
            ));
          })() : <div className="bl-mi-dim">Estatísticas aparecem com o jogo em andamento.</div>}
        </div>
      )}

      {sub === 'h2h' && (
        <div>
          {d.h2h?.length ? d.h2h.map((g, i) => (
            <div className="h2h" key={i}>
              <span>{g.home} <b>{g.gh}×{g.ga}</b> {g.away}</span>
              <span style={{ color: 'var(--cinza)' }}>{g.date ? new Date(g.date).getFullYear() : ''} {g.league ? `· ${g.league}` : ''}</span>
            </div>
          )) : <div className="bl-mi-dim">Sem confrontos recentes entre os dois.</div>}
        </div>
      )}
    </div>
  );
}

// Reverse lookup: English ESPN name → Portuguese app name (used in bracket + admin)
const EN_PT = (() => {
  const m = {};
  Object.entries(TEAM_EN).forEach(([pt, ens]) => { ens.forEach(en => { m[norm(en)] = pt; }); });
  return m;
})();
function toPtName(n) {
  if (!n) return n;
  if (FLAG_CODES[n]) return n;
  return EN_PT[norm(n)] || n;
}

/* ============================ Bracket Overlay ============================ */
function BracketOverlay({ onClose, matches = [], results = {}, darkMode = false, t = {} }) {
  const [standings, setStandings] = useState(null);
  useEffect(() => { fetchStandings().then(setStandings).catch(() => {}); }, []);

  const seed32 = useMemo(() => {
    // Always build from official Copa 2026 bracket seeding via standings
    const slotTeams = Array(32).fill(null);
    if (standings?.groups) {
      const grp = {};
      for (const g of standings.groups) {
        const sorted = [...g.rows].sort((a, b) => (b.pts||0)-(a.pts||0) || (b.gd||0)-(a.gd||0) || (b.gf||0)-(a.gf||0));
        grp[g.group] = sorted.map(r => r.team);
      }
      const thirds = Object.entries(grp)
        .filter(([,ts]) => ts.length >= 3)
        .map(([g,ts]) => { const row = standings.groups.find(x=>x.group===g)?.rows.find(r=>r.team===ts[2]); return {team:ts[2],pts:row?.pts||0,gd:row?.gd||0,gf:row?.gf||0}; })
        .sort((a,b) => b.pts-a.pts||b.gd-a.gd||b.gf-a.gf)
        .map(x=>x.team);
      let thirdIdx = 0;
      COPA2026_SEEDS.forEach((seed, i) => {
        if (seed.p === 3) slotTeams[i] = thirds[thirdIdx++] || null;
        else slotTeams[i] = seed.g ? (grp[seed.g]?.[seed.p-1] || null) : null;
      });
    }
    // Augment: fill null slots from DB matches, but KEEP standings PT names (needed for flags)
    const m32 = matches.filter(m => m.phase === '32 avos de final');
    if (m32.length > 0) {
      const used = new Set();
      // teq: fuzzy match between a standings name (PT) and any team name
      const teq = (slotName, dbName) => {
        if (!slotName || !dbName) return false;
        if (slotName === dbName) return true;
        // slotName is PT, dbName could be PT or English
        return matchesTeam(slotName, dbName) || matchesTeam(dbName, slotName);
      };
      for (let s = 0; s < 16; s++) {
        const tA = slotTeams[s*2], tB = slotTeams[s*2+1];
        const m = m32.find(m => !used.has(m.id) && (
          teq(tA, m.home) || teq(tA, m.away) || teq(tB, m.home) || teq(tB, m.away) ||
          (!tA && !tB)
        ));
        if (m) {
          used.add(m.id);
          // Only fill slots that standings couldn't resolve (null); keep PT names otherwise
          if (!tA) {
            // determine which DB team goes here based on the other slot
            slotTeams[s*2] = (tB && teq(tB, m.home)) ? m.away : m.home;
          }
          if (!tB) {
            slotTeams[s*2+1] = (slotTeams[s*2] === m.home) ? m.away : m.home;
          }
        }
      }
      // Remaining unplaced matches → fill first fully-null slot pairs
      const unplaced = m32.filter(m => !used.has(m.id));
      let ni = 0;
      for (let s = 0; s < 16 && ni < unplaced.length; s++) {
        if (!slotTeams[s*2] && !slotTeams[s*2+1]) {
          slotTeams[s*2] = toPtName(unplaced[ni].home);
          slotTeams[s*2+1] = toPtName(unplaced[ni].away);
          ni++;
        }
      }
    }
    return slotTeams;
  }, [matches, standings]);

  const mbp = useMemo(() => {
    const mp = {};
    for (const m of matches.filter(m => PHASES_KO.includes(m.phase))) { if (!mp[m.phase]) mp[m.phase] = []; mp[m.phase].push(m); }
    return mp;
  }, [matches]);

  // SVG bracket layout constants
  const C = 40, R = 20, IG = 6, MS = 104, HL = 16;
  // C=circle diameter, R=radius, IG=inner gap between teams, MS=match spacing, HL=horizontal line half-length
  const step = C + 2 * HL; // 72px between column centers
  // Column X centers: [r32L, r16L, r8L, r4L, fin, r4R, r8R, r16R, r32R]
  const XC = Array.from({length: 9}, (_, i) => R + step * i);
  const SVG_W = XC[8] + R;

  // Y positions computed mathematically so rounds align perfectly
  const mc = ty => ty + C + IG / 2;         // match center Y from topY
  const mt = cy => cy - C - IG / 2;         // match topY from center Y
  const Y1 = Array.from({length: 8}, (_, i) => i * MS);
  const cr = prev => Array.from({length: prev.length / 2}, (_, i) => mt((mc(prev[i*2]) + mc(prev[i*2+1])) / 2));
  const Y2 = cr(Y1), Y3 = cr(Y2), Y4 = cr(Y3);
  const SVG_H = 7 * MS + 2 * C + IG; // 728 + 86 = 814

  const gold = t.gold || '#e7c66b';
  const lc = t.cardBorder || 'rgba(255,255,255,0.18)';
  const lw = 1.5;

  // Get match data (fuzzy name match handles ESPN English names vs standings Portuguese names)
  const teqB = (a, b) => { if (!a || !b) return false; if (a === b) return true; return matchesTeam(a, b) || matchesTeam(b, a); };
  const getR1 = (side, i) => {
    const b = side * 16, home = seed32[b + i*2], away = seed32[b + i*2+1];
    const m = (mbp['32 avos de final']||[]).find(m =>
      (teqB(m.home,home)&&teqB(m.away,away))||(teqB(m.home,away)&&teqB(m.away,home))
    );
    const res = m ? results[m.id] : null;
    const w = res?.qualifier||(res?.home>res?.away?'home':res?.away>res?.home?'away':null);
    // Use DB match names when available (so flags render correctly)
    return { home: m ? (teqB(m.home,home) ? m.home : m.away) : home, away: m ? (teqB(m.home,home) ? m.away : m.home) : away, w };
  };
  const getM = (phase, i) => {
    const m = (mbp[phase]||[])[i];
    if (!m) return {home:null,away:null,w:null};
    const res = results[m.id];
    const w = res?.qualifier||(res?.home>res?.away?'home':res?.away>res?.home?'away':null);
    return {home:m.home, away:m.away, w};
  };

  // SVG circle element — label é exibido quando team é null (ex: '1E', '2A', '3º')
  const svgCircle = (cx, cy, team, isW, id, label) => {
    const flag = team && FLAG_CODES[team];
    const cid = `bpc${id}`;
    return (
      <g key={id}>
        <defs><clipPath id={cid}><circle cx={cx} cy={cy} r={R-2}/></clipPath></defs>
        <circle cx={cx} cy={cy} r={R-1}
          fill={team?(isW?'rgba(231,198,107,.18)':'rgba(255,255,255,.07)'):'rgba(255,255,255,.03)'}
          stroke={isW?gold:lc} strokeWidth={lw}/>
        {team&&flag&&<image href={`https://flagcdn.com/w80/${flag}.png`} x={cx-R+2} y={cy-R+2} width={C-4} height={C-4} clipPath={`url(#${cid})`} preserveAspectRatio="xMidYMid slice"/>}
        {team&&!flag&&<text x={cx} y={cy+4} textAnchor="middle" fill="rgba(255,255,255,.4)" fontSize="10">?</text>}
        {!team&&<text x={cx} y={cy+4} textAnchor="middle" fill="rgba(255,255,255,.28)" fontSize="8" fontFamily="Oswald" fontWeight="600">{label||'–'}</text>}
        {isW&&<><circle cx={cx+R-5} cy={cy-R+5} r={7} fill={gold}/><text x={cx+R-5} y={cy-R+9} textAnchor="middle" fill="#1a1206" fontSize="8" fontWeight="bold">✓</text></>}
      </g>
    );
  };

  // Render a match (2 circles); seedSlot = base index in COPA2026_SEEDS (optional, for labels)
  const svgMatch = (cx, topY, home, away, winner, pfx, seedSlot) => [
    svgCircle(cx, topY+R, home, winner==='home', `${pfx}h`, seedSlot!=null ? COPA2026_SEEDS[seedSlot]?.lbl : null),
    svgCircle(cx, topY+C+IG+R, away, winner==='away', `${pfx}a`, seedSlot!=null ? COPA2026_SEEDS[seedSlot+1]?.lbl : null),
  ];

  // Bracket connector lines: from prevRound to nextRound
  // dir=1 → going right (left half), dir=-1 → going left (right half)
  const connectorLines = (prevY, nextY, prevCX, nextCX, dir, pfx) => {
    const midX = prevCX + dir * (R + HL);
    const x2 = nextCX - dir * R;
    return nextY.flatMap((nTopY, i) => {
      const ya = mc(prevY[i*2]), yb = mc(prevY[i*2+1]), yT = mc(nTopY);
      return [
        <line key={`${pfx}${i}a`} x1={prevCX} y1={ya} x2={midX} y2={ya} stroke={lc} strokeWidth={lw}/>,
        <line key={`${pfx}${i}b`} x1={prevCX} y1={yb} x2={midX} y2={yb} stroke={lc} strokeWidth={lw}/>,
        <line key={`${pfx}${i}v`} x1={midX} y1={ya} x2={midX} y2={yb} stroke={lc} strokeWidth={lw}/>,
        <line key={`${pfx}${i}h`} x1={midX} y1={yT} x2={x2} y2={yT} stroke={lc} strokeWidth={lw}/>,
      ];
    });
  };

  const semiCY = mc(Y4[0]);
  const allLines = [
    // Left side (→)
    ...connectorLines(Y1, Y2, XC[0], XC[1], 1, 'l12'),
    ...connectorLines(Y2, Y3, XC[1], XC[2], 1, 'l23'),
    ...connectorLines(Y3, Y4, XC[2], XC[3], 1, 'l34'),
    <line key="lsf" x1={XC[3]} y1={semiCY} x2={XC[4]-R} y2={semiCY} stroke={lc} strokeWidth={lw}/>,
    // Right side (←)
    ...connectorLines(Y1, Y2, XC[8], XC[7], -1, 'r12'),
    ...connectorLines(Y2, Y3, XC[7], XC[6], -1, 'r23'),
    ...connectorLines(Y3, Y4, XC[6], XC[5], -1, 'r34'),
    <line key="rsf" x1={XC[5]} y1={semiCY} x2={XC[4]+R} y2={semiCY} stroke={lc} strokeWidth={lw}/>,
  ];

  const colLabels = [
    {cx:XC[0],lbl:'32 AVOS'},{cx:XC[1],lbl:'OITAVAS'},{cx:XC[2],lbl:'QUARTAS'},{cx:XC[3],lbl:'SEMI'},
    {cx:XC[4],lbl:'FINAL'},
    {cx:XC[5],lbl:'SEMI'},{cx:XC[6],lbl:'QUARTAS'},{cx:XC[7],lbl:'OITAVAS'},{cx:XC[8],lbl:'32 AVOS'},
  ];

  return (
    <div onClick={onClose} style={{
      position:'fixed',inset:0,background:'rgba(0,0,0,.9)',zIndex:100,backdropFilter:'blur(8px)',
      display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'48px 24px',overflowY:'auto',cursor:'pointer',
    }}>
      <div onClick={e=>e.stopPropagation()} style={{
        position:'relative',background:t.cardBg||'linear-gradient(180deg,#10182b,#0a0e1a)',
        borderRadius:18,padding:'28px 24px 20px',border:`1px solid ${t.cardBorder}`,cursor:'default',
        maxHeight:'calc(100vh - 96px)',overflowY:'auto',
      }}>
        <button onClick={onClose} style={{
          position:'absolute',top:12,right:12,background:'rgba(255,255,255,.12)',border:'none',
          borderRadius:8,width:34,height:34,fontSize:18,cursor:'pointer',color:t.text,lineHeight:1,
        }}>✕</button>

        <h2 style={{fontFamily:'Oswald',fontWeight:700,fontSize:18,letterSpacing:'.16em',color:gold,margin:'0 0 16px',textAlign:'center'}}>
          🏆 CHAVEAMENTO COPA 2026
        </h2>

        <div style={{overflowX:'auto',overflowY:'visible'}}>
          <svg width={SVG_W} height={SVG_H+28} style={{display:'block',minWidth:SVG_W}}>
            {/* Column labels */}
            {colLabels.map(({cx,lbl}) =>
              <text key={cx} x={cx} y={11} textAnchor="middle" fill={gold} fontSize="8" fontFamily="Oswald" fontWeight="700" letterSpacing="0.8">{lbl}</text>
            )}
            <g transform="translate(0,20)">
              {allLines}
              {/* Left 32avos — seed slots 0-15 */}
              {Y1.map((ty,i)=>{ const {home,away,w}=getR1(0,i); return svgMatch(XC[0],ty,home,away,w,`l1${i}`,i*2); })}
              {/* Left oitavas */}
              {Y2.map((ty,i)=>{ const {home,away,w}=getM('Oitavas de final',i); return svgMatch(XC[1],ty,home,away,w,`l2${i}`); })}
              {/* Left quartas */}
              {Y3.map((ty,i)=>{ const {home,away,w}=getM('Quartas de final',i); return svgMatch(XC[2],ty,home,away,w,`l3${i}`); })}
              {/* Left semi */}
              {(()=>{ const {home,away,w}=getM('Semifinal',0); return svgMatch(XC[3],Y4[0],home,away,w,'l4'); })()}
              {/* Final (center) */}
              {(()=>{ const {home,away,w}=getM('Final',0); return svgMatch(XC[4],Y4[0],home,away,w,'fin'); })()}
              {/* Right semi */}
              {(()=>{ const {home,away,w}=getM('Semifinal',1); return svgMatch(XC[5],Y4[0],home,away,w,'r4'); })()}
              {/* Right quartas */}
              {Y3.map((ty,i)=>{ const {home,away,w}=getM('Quartas de final',2+i); return svgMatch(XC[6],ty,home,away,w,`r3${i}`); })}
              {/* Right oitavas */}
              {Y2.map((ty,i)=>{ const {home,away,w}=getM('Oitavas de final',4+i); return svgMatch(XC[7],ty,home,away,w,`r2${i}`); })}
              {/* Right 32avos — seed slots 16-31 */}
              {Y1.map((ty,i)=>{ const {home,away,w}=getR1(1,i); return svgMatch(XC[8],ty,home,away,w,`r1${i}`,16+i*2); })}
            </g>
          </svg>
        </div>

        <div style={{marginTop:12,fontSize:11,color:t.sub,textAlign:'center',fontFamily:'Barlow Semi Condensed'}}>
          Clique fora para fechar
        </div>
      </div>
    </div>
  );
}

/* ============================ Knockout Showcase (Cinema) ============================ */
function KnockoutShowcase({ matches = [], results = {}, draft = {}, myPicks = {}, setDraftScore = () => {}, darkMode = false, savePicks = () => {}, busy = false, users = [], picksAll = {}, me = null }) {
  const [idx, setIdx] = useState(0);
  const [showBracket, setShowBracket] = useState(false);
  const koMatches = useMemo(() => matches.filter((m) => PHASES_KO.includes(m.phase)), [matches]);
  if (koMatches.length === 0) return null;

  const m = koMatches[idx];
  const res = results[m.id];
  const d = draft[m.id] || {};
  const pick = d.qualifier ?? myPicks[m.id]?.qualifier ?? null;

  // Janela de palpite: abre 24h antes, fecha 15min antes (igual fase de grupos)
  const now = Date.now();
  const locked = isLocked(m, now);
  const inWindow = isOpenWindow(m, now);
  const beforeWindow = now < openTime(m);
  const canPick = inWindow && !res;

  const fmtCountdown = (ms) => {
    if (ms <= 0) return null;
    const h = Math.floor(ms / 3600000), mn = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h${mn > 0 ? mn + 'min' : ''}` : `${mn}min`;
  };
  const cdAbre = beforeWindow ? fmtCountdown(openTime(m) - now) : null;
  const cdFecha = inWindow ? fmtCountdown(lockTime(m) - now) : null;

  const scoreA = d.h ?? myPicks[m.id]?.home ?? '';
  const scoreB = d.a ?? myPicks[m.id]?.away ?? '';
  const penA = d.penH ?? '';
  const penB = d.penA ?? '';

  const na = scoreA !== '' ? parseInt(scoreA) : null;
  const nb = scoreB !== '' ? parseInt(scoreB) : null;
  const bothScore = na !== null && nb !== null;
  const draw = bothScore && na === nb;
  const pa = penA !== '' ? parseInt(penA) : null;
  const pb = penB !== '' ? parseInt(penB) : null;
  const bothPen = pa !== null && pb !== null;

  let winner = pick;
  if (!winner) {
    if (bothScore && !draw) winner = na > nb ? 'home' : 'away';
    else if (draw && bothPen && pa !== pb) winner = pa > pb ? 'home' : 'away';
  }

  const t = darkMode ? {
    pageBg: 'radial-gradient(1200px 620px at 50% -8%,#16203a 0%,#090d18 58%,#05070e 100%)',
    cardBg: 'linear-gradient(180deg,#10182b,#0a0e1a)',
    footBg: 'linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.35))',
    text: '#f4f7fc', sub: 'rgba(244,247,252,.55)',
    cardBorder: 'rgba(255,255,255,.10)', innerTop: 'rgba(255,255,255,.06)',
    slabBg: 'rgba(255,255,255,.06)', slabBorder: 'rgba(255,255,255,.14)',
    topGlow: 'rgba(120,150,220,.14)',
    gold: '#e7c66b', goldSoft: 'rgba(231,198,107,.28)',
    phaseBg: 'rgba(231,198,107,.07)', phaseBorder: 'rgba(231,198,107,.28)', phaseShadow: 'rgba(0,0,0,.4)',
    tintAlpha: 0.62, tintAlpha2: 0.12,
  } : {
    pageBg: 'radial-gradient(1200px 620px at 50% -8%,#ffffff 0%,#e8edf6 60%,#dfe5f0 100%)',
    cardBg: 'linear-gradient(180deg,#ffffff,#eef2f9)',
    footBg: 'linear-gradient(180deg,rgba(0,0,0,0),rgba(20,30,55,.04))',
    text: '#0e1626', sub: 'rgba(14,22,38,.55)',
    cardBorder: 'rgba(14,22,38,.12)', innerTop: 'rgba(255,255,255,.8)',
    slabBg: 'rgba(14,22,38,.045)', slabBorder: 'rgba(14,22,38,.16)',
    topGlow: 'rgba(120,150,220,.1)',
    gold: '#b07e1f', goldSoft: 'rgba(176,126,31,.25)',
    phaseBg: 'rgba(176,126,31,.08)', phaseBorder: 'rgba(176,126,31,.3)', phaseShadow: 'rgba(120,90,20,.12)',
    tintAlpha: 0.4, tintAlpha2: 0.09,
  };

  const rgba = (hex, a) => {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  const homeColor = TEAM_COLORS[m.home] || '#FFB81C';
  const awayColor = TEAM_COLORS[m.away] || '#FFB81C';
  const tintA = `linear-gradient(100deg,${rgba(homeColor, t.tintAlpha)} 0%,${rgba(homeColor, t.tintAlpha2)} 46%,rgba(0,0,0,0) 64%)`;
  const tintB = `linear-gradient(260deg,${rgba(awayColor, t.tintAlpha)} 0%,${rgba(awayColor, t.tintAlpha2)} 46%,rgba(0,0,0,0) 64%)`;

  const dim = (side) => winner && winner !== side;
  const flagUrl = (team) => `https://flagcdn.com/w160/${FLAG_CODES[team]}.png`;

  let statusText = 'Aguardando resultado';
  if (winner) statusText = `${winner === 'home' ? m.home : m.away} avança para a próxima fase`;
  else if (draw) statusText = 'Empate — defina os pênaltis';
  else if (bothScore) statusText = 'Resultado registrado';

  return (
    <div style={{
      minHeight: '100vh', width: '100%', background: t.pageBg, fontFamily: 'Barlow,sans-serif',
      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 'clamp(20px,5vw,52px) 18px 60px',
      transition: 'background .4s ease',
    }}>
      {showBracket && <BracketOverlay onClose={() => setShowBracket(false)} matches={matches} results={results} darkMode={darkMode} t={t} />}

      <div style={{ width: '100%', maxWidth: 760, marginBottom: 'clamp(18px,4vw,30px)', textAlign: 'center' }}>
        {/* Bracket button - inline, acima do título */}
        <button
          onClick={() => setShowBracket(true)}
          style={{
            marginBottom: 16, padding: '8px 14px', borderRadius: 8, border: `1px solid ${t.cardBorder}`, background: t.slabBg,
            color: t.text, fontFamily: 'Barlow Semi Condensed', fontWeight: 600, fontSize: 12, letterSpacing: '.08em',
            cursor: 'pointer', transition: 'background .2s',
          }}
          onMouseEnter={(e) => e.target.style.background = `rgba(255,255,255,.1)`}
          onMouseLeave={(e) => e.target.style.background = t.slabBg}
        >
          🏆 BRACKET
        </button>

        <h1 style={{ fontFamily: 'Oswald', fontWeight: 700, fontSize: 'clamp(24px,5vw,28px)', letterSpacing: '.16em', color: t.text, margin: 0, marginBottom: 4 }}>MATA-MATA</h1>
        <div style={{ fontFamily: 'Barlow Semi Condensed', fontWeight: 600, fontSize: 11, letterSpacing: '.22em', color: t.gold }}>COPA 2026</div>
      </div>

      <div style={{
        width: '100%', maxWidth: 760, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 'clamp(16px,3.5vw,26px)',
        animation: 'mm-rise .55s ease both',
      }}>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(90deg,transparent,${t.cardBorder})` }}></div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 11, padding: '9px 20px', borderRadius: 999, border: `1px solid ${t.phaseBorder}`,
          background: t.phaseBg, boxShadow: `0 6px 24px ${t.phaseShadow}}`,
        }}>
          <span style={{ fontFamily: 'Oswald', fontWeight: 600, fontSize: 'clamp(13px,3.4vw,16px)', letterSpacing: '.24em', color: t.gold }}>
            ◆ {m.phase.toUpperCase()} ◆
          </span>
        </div>
        <div style={{ flex: 1, height: 1, background: `linear-gradient(270deg,transparent,${t.cardBorder})` }}></div>
      </div>

      <div style={{
        position: 'relative', width: '100%', maxWidth: 760, borderRadius: 22, overflow: 'hidden', border: `1px solid ${t.cardBorder}`,
        background: t.cardBg, boxShadow: '0 30px 70px -28px rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.06)',
        animation: 'mm-cardIn .7s cubic-bezier(.2,.7,.25,1) both',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: tintA, clipPath: 'polygon(0 0,66% 0,50% 100%,0 100%)' }}></div>
        <div style={{ position: 'absolute', inset: 0, background: tintB, clipPath: 'polygon(34% 0,100% 0,100% 100%,50% 100%)' }}></div>
        <div style={{
          position: 'absolute', inset: 0, background: `radial-gradient(120% 90% at 50% -20%,${t.topGlow},transparent 60%)`,
          pointerEvents: 'none',
        }}></div>
        <div style={{
          position: 'absolute', left: '50%', top: '-8%', height: '116%', width: 2, transform: 'translateX(-50%) skewX(-11deg)',
          background: `linear-gradient(180deg,transparent,${t.gold},transparent)`, boxShadow: `0 0 18px ${t.gold}`, opacity: .5,
          animation: 'mm-seam 3s ease-in-out infinite',
        }}></div>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'stretch', justifyContent: 'space-between', padding: 'clamp(26px,5vw,40px) clamp(14px,3vw,26px) clamp(22px,4vw,32px)' }}>
          {/* Team A */}
          <div onClick={() => canPick && setDraftScore(m.id, 'qualifier', dim('home') ? null : 'home')} style={{
            flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(10px,2vw,14px)',
            cursor: canPick ? 'pointer' : 'default', opacity: dim('home') ? 0.45 : 1, filter: dim('home') ? 'grayscale(.5) saturate(.7)' : 'none',
            transition: 'opacity .4s ease,filter .4s ease',
          }}>
            <div style={{ position: 'relative', width: 'clamp(70px,18vw,104px)', height: 'clamp(70px,18vw,104px)', display: 'grid', placeItems: 'center' }}>
              <div style={{
                position: 'absolute', left: '50%', top: '50%', width: '150%', height: '150%', borderRadius: '50%',
                color: homeColor, background: `radial-gradient(circle,currentColor 0%,transparent 68%)`,
                animation: 'mm-glow 2.6s ease-in-out infinite',
              }}></div>
              <div style={{
                position: 'relative', width: 'clamp(64px,16vw,92px)', aspectRatio: '3/2', borderRadius: 7,
                backgroundImage: `url("${flagUrl(m.home)}")`, backgroundSize: 'cover', backgroundPosition: 'center',
                boxShadow: '0 8px 22px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.18)',
              }}></div>
              {winner === 'home' && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', padding: '3px 10px',
                  borderRadius: 6, background: `linear-gradient(150deg,#f2d889,#caa040)`, color: '#1a1206',
                  fontFamily: 'Oswald', fontWeight: 700, fontSize: 11, letterSpacing: '.12em',
                  boxShadow: '0 6px 16px rgba(202,160,64,.5)', whiteSpace: 'nowrap',
                  animation: 'mm-badge .45s ease both',
                }}>AVANÇA</div>
              )}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Oswald', fontWeight: 600, fontSize: 'clamp(16px,4vw,24px)', letterSpacing: '.04em', lineHeight: 1.05, color: t.text }}>
                {m.home}
              </div>
              <div style={{ fontFamily: 'Barlow Semi Condensed', fontWeight: 600, fontSize: 12, letterSpacing: '.3em', color: homeColor }}>
                {m.home.substring(0, 3).toUpperCase()}
              </div>
            </div>
            <input
              type="text" inputMode="numeric" placeholder="0" value={scoreA}
              disabled={!canPick}
              onChange={(e) => setDraftScore(m.id, 'h', e.target.value.replace(/\D/g, '').slice(0, 2))}
              style={{
                width: 'clamp(62px,16vw,86px)', height: 'clamp(58px,14vw,78px)', textAlign: 'center', borderRadius: 14,
                border: `1px solid ${t.slabBorder}`, background: t.slabBg, backdropFilter: 'blur(6px)', color: t.text,
                fontFamily: 'Oswald', fontWeight: 700, fontSize: 'clamp(34px,9vw,52px)', outline: 'none',
                boxShadow: 'inset 0 2px 10px rgba(0,0,0,.25)', transition: 'border-color .2s,box-shadow .2s',
                opacity: canPick ? 1 : 0.5, cursor: canPick ? 'text' : 'not-allowed',
              }}
              onFocus={(e) => { if(canPick){e.target.style.borderColor = t.gold; e.target.style.boxShadow = `0 0 0 3px ${t.goldSoft},inset 0 2px 10px rgba(0,0,0,.25)`;} }}
              onBlur={(e) => { e.target.style.borderColor = t.slabBorder; e.target.style.boxShadow = 'inset 0 2px 10px rgba(0,0,0,.25)'; }}
            />
            {draw && (
              <input
                type="text" inputMode="numeric" placeholder="–" value={penA}
                onChange={(e) => setDraftScore(m.id, 'penH', e.target.value.replace(/\D/g, '').slice(0, 2))}
                style={{
                  width: 48, height: 30, textAlign: 'center', borderRadius: 8, border: `1px dashed ${t.slabBorder}`,
                  background: 'transparent', color: t.sub, fontFamily: 'Oswald', fontWeight: 600, fontSize: 15, outline: 'none',
                  opacity: draw ? 1 : 0, transition: 'opacity .3s ease',
                }}
              />
            )}
          </div>

          {/* VS Coin */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: 14,
            paddingTop: 'clamp(6px,2vw,16px)', flex: '0 0 auto',
          }}>
            <div style={{
              position: 'relative', width: 'clamp(64px,15vw,88px)', height: 'clamp(64px,15vw,88px)',
              display: 'grid', placeItems: 'center',
            }}>
              <div style={{
                position: 'absolute', inset: '-15%', borderRadius: '50%', border: `2px dashed ${t.goldSoft}`,
                animation: 'mm-ring 14s linear infinite',
              }}></div>
              <div style={{
                width: '100%', height: '100%', borderRadius: '50%',
                background: 'radial-gradient(circle at 36% 30%,#ffe9a8,#d4a13a 56%,#9a6c1d)',
                boxShadow: '0 10px 30px rgba(202,160,64,.5),inset 0 2px 6px rgba(255,255,255,.5),inset 0 -6px 12px rgba(120,80,10,.5)',
                display: 'grid', placeItems: 'center',
              }}>
                <span style={{
                  fontFamily: 'Oswald', fontWeight: 700, fontSize: 'clamp(20px,5vw,28px)',
                  letterSpacing: '.02em', color: '#1c1304', textShadow: '0 1px 0 rgba(255,255,255,.4)',
                }}>VS</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{
                fontFamily: 'Barlow Semi Condensed', fontWeight: 600, fontSize: 'clamp(11px,3vw,13px)',
                letterSpacing: '.18em', color: t.text,
              }}>{fmtTime(m.kickoff).split(' ')[0].toUpperCase()}</div>
              <div style={{ fontFamily: 'Oswald', fontWeight: 600, fontSize: 'clamp(13px,3.4vw,15px)', letterSpacing: '.14em', color: t.gold }}>
                {fmtTime(m.kickoff).split(' ')[1]}
              </div>
            </div>
            {draw && <div style={{
              fontFamily: 'Barlow Semi Condensed', fontWeight: 600, fontSize: 10, letterSpacing: '.2em',
              color: t.sub, textAlign: 'center', height: 14,
            }}>PÊNALTIS</div>}
          </div>

          {/* Team B */}
          <div onClick={() => canPick && setDraftScore(m.id, 'qualifier', dim('away') ? null : 'away')} style={{
            flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'clamp(10px,2vw,14px)',
            cursor: canPick ? 'pointer' : 'default', opacity: dim('away') ? 0.45 : 1, filter: dim('away') ? 'grayscale(.5) saturate(.7)' : 'none',
            transition: 'opacity .4s ease,filter .4s ease',
          }}>
            <div style={{ position: 'relative', width: 'clamp(70px,18vw,104px)', height: 'clamp(70px,18vw,104px)', display: 'grid', placeItems: 'center' }}>
              <div style={{
                position: 'absolute', left: '50%', top: '50%', width: '150%', height: '150%', borderRadius: '50%',
                color: awayColor, background: `radial-gradient(circle,currentColor 0%,transparent 68%)`,
                animation: 'mm-glow 2.6s ease-in-out infinite .4s',
              }}></div>
              <div style={{
                position: 'relative', width: 'clamp(64px,16vw,92px)', aspectRatio: '3/2', borderRadius: 7,
                backgroundImage: `url("${flagUrl(m.away)}")`, backgroundSize: 'cover', backgroundPosition: 'center',
                boxShadow: '0 8px 22px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.18)',
              }}></div>
              {winner === 'away' && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', padding: '3px 10px',
                  borderRadius: 6, background: `linear-gradient(150deg,#f2d889,#caa040)`, color: '#1a1206',
                  fontFamily: 'Oswald', fontWeight: 700, fontSize: 11, letterSpacing: '.12em',
                  boxShadow: '0 6px 16px rgba(202,160,64,.5)', whiteSpace: 'nowrap',
                  animation: 'mm-badge .45s ease both',
                }}>AVANÇA</div>
              )}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'Oswald', fontWeight: 600, fontSize: 'clamp(16px,4vw,24px)', letterSpacing: '.04em', lineHeight: 1.05, color: t.text }}>
                {m.away}
              </div>
              <div style={{ fontFamily: 'Barlow Semi Condensed', fontWeight: 600, fontSize: 12, letterSpacing: '.3em', color: awayColor }}>
                {m.away.substring(0, 3).toUpperCase()}
              </div>
            </div>
            <input
              type="text" inputMode="numeric" placeholder="0" value={scoreB}
              disabled={!canPick}
              onChange={(e) => setDraftScore(m.id, 'a', e.target.value.replace(/\D/g, '').slice(0, 2))}
              style={{
                width: 'clamp(62px,16vw,86px)', height: 'clamp(58px,14vw,78px)', textAlign: 'center', borderRadius: 14,
                border: `1px solid ${t.slabBorder}`, background: t.slabBg, backdropFilter: 'blur(6px)', color: t.text,
                fontFamily: 'Oswald', fontWeight: 700, fontSize: 'clamp(34px,9vw,52px)', outline: 'none',
                boxShadow: 'inset 0 2px 10px rgba(0,0,0,.25)', transition: 'border-color .2s,box-shadow .2s',
                opacity: canPick ? 1 : 0.5, cursor: canPick ? 'text' : 'not-allowed',
              }}
              onFocus={(e) => { if(canPick){e.target.style.borderColor = t.gold; e.target.style.boxShadow = `0 0 0 3px ${t.goldSoft},inset 0 2px 10px rgba(0,0,0,.25)`;} }}
              onBlur={(e) => { e.target.style.borderColor = t.slabBorder; e.target.style.boxShadow = 'inset 0 2px 10px rgba(0,0,0,.25)'; }}
            />
            {draw && (
              <input
                type="text" inputMode="numeric" placeholder="–" value={penB}
                onChange={(e) => setDraftScore(m.id, 'penA', e.target.value.replace(/\D/g, '').slice(0, 2))}
                style={{
                  width: 48, height: 30, textAlign: 'center', borderRadius: 8, border: `1px dashed ${t.slabBorder}`,
                  background: 'transparent', color: t.sub, fontFamily: 'Oswald', fontWeight: 600, fontSize: 15, outline: 'none',
                  opacity: draw ? 1 : 0, transition: 'opacity .3s ease',
                }}
              />
            )}
          </div>
        </div>

        <div style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '13px 20px', borderTop: `1px solid ${t.cardBorder}`, background: t.footBg,
        }}>
          <span style={{ fontFamily: 'Barlow Semi Condensed', fontWeight: 600, fontSize: 12, letterSpacing: '.06em', color: t.sub }}>
            {res ? statusText
              : beforeWindow && cdAbre ? <>⏳ Palpite abre em <b>{cdAbre}</b></>
              : inWindow && cdFecha ? <>🔓 Fecha em <b>{cdFecha}</b> · {statusText}</>
              : locked ? '🔒 Palpites encerrados'
              : statusText}
          </span>
        </div>
      </div>

      <div style={{
        width: '100%', maxWidth: 760, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 22, animation: 'mm-rise2 .6s ease both .1s',
      }}>
        <button
          onClick={() => setIdx((i) => (i - 1 + koMatches.length) % koMatches.length)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 11,
            border: `1px solid ${t.cardBorder}`, background: t.slabBg, color: t.text, fontFamily: 'Barlow Semi Condensed',
            fontWeight: 600, fontSize: 13, letterSpacing: '.08em', cursor: 'pointer',
          }}>‹ ANTERIOR</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: 'Oswald', fontWeight: 600, fontSize: 13, letterSpacing: '.16em', color: t.sub,
          }}>CONFRONTO {idx + 1}/{koMatches.length}</div>
        </div>
        <button
          onClick={() => setIdx((i) => (i + 1) % koMatches.length)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 11,
            border: `1px solid ${t.cardBorder}`, background: t.slabBg, color: t.text, fontFamily: 'Barlow Semi Condensed',
            fontWeight: 600, fontSize: 13, letterSpacing: '.08em', cursor: 'pointer',
          }}>PRÓXIMO ›</button>
      </div>

      {/* Save button — só mostra dentro da janela */}
      {draft[m.id] && inWindow && (
        <div style={{ width: '100%', maxWidth: 760, marginTop: 16 }}>
          <button
            disabled={busy}
            onClick={savePicks}
            style={{
              width: '100%', padding: '14px', borderRadius: 12, border: 'none', cursor: busy ? 'wait' : 'pointer',
              background: `linear-gradient(150deg,#f2d889,#caa040)`, color: '#1a1206',
              fontFamily: 'Oswald', fontWeight: 700, fontSize: 16, letterSpacing: '.1em',
              boxShadow: '0 6px 20px rgba(202,160,64,.4)', transition: 'opacity .2s',
              opacity: busy ? 0.7 : 1,
            }}>
            {busy ? 'SALVANDO…' : '⚽ SALVAR PALPITE'}
          </button>
        </div>
      )}

      {/* Picks table */}
      <div style={{ width: '100%', maxWidth: 760, marginTop: 24 }}>
        <div style={{
          fontFamily: 'Oswald', fontWeight: 600, fontSize: 13, letterSpacing: '.18em', color: t.sub,
          marginBottom: 10, textAlign: 'center',
        }}>PALPITES DA GALERA</div>
        <div style={{
          background: t.slabBg, borderRadius: 14, border: `1px solid ${t.cardBorder}`, overflow: 'hidden',
        }}>
          {users.map((u, i) => {
            const p = picksAll[u.slug]?.[m.id];
            const myOwn = me?.slug === u.slug;
            const pts = p && res ? points(p, res, true) : null;
            return (
              <div key={u.slug} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
                borderBottom: i < users.length - 1 ? `1px solid ${t.cardBorder}` : 'none',
                background: myOwn ? `${t.phaseBg}` : 'transparent',
              }}>
                <Avatar user={u} size={28} />
                <span style={{ flex: 1, fontFamily: 'Barlow Semi Condensed', fontWeight: 600, fontSize: 14, color: t.text }}>
                  {u.name}{myOwn && <span style={{ fontSize: 10, color: t.gold, marginLeft: 6 }}>você</span>}
                </span>
                {p ? (
                  <>
                    <span style={{ fontFamily: 'Oswald', fontWeight: 700, fontSize: 15, color: t.text }}>
                      {p.home ?? '–'} × {p.away ?? '–'}
                    </span>
                    {p.qualifier && (
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                        background: p.qualifier === 'home' ? `${TEAM_COLORS[m.home] || t.gold}33` : `${TEAM_COLORS[m.away] || t.gold}33`,
                        color: p.qualifier === 'home' ? (TEAM_COLORS[m.home] || t.gold) : (TEAM_COLORS[m.away] || t.gold),
                      }}>
                        {p.qualifier === 'home' ? m.home : m.away}
                      </span>
                    )}
                    {pts != null && (
                      <span style={{
                        fontFamily: 'Oswald', fontWeight: 900, fontSize: 13, minWidth: 28, textAlign: 'right',
                        color: pts >= 3 ? '#f2d889' : pts > 0 ? t.text : t.sub,
                      }}>{pts > 0 ? `+${pts}` : '0'}</span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: t.sub, fontStyle: 'italic' }}>sem palpite</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{
        fontFamily: 'Barlow Semi Condensed', fontWeight: 500, fontSize: 12, letterSpacing: '.04em', color: t.sub,
        marginTop: 16, textAlign: 'center',
      }}>Toque em um time para definir quem avança · informe o placar para ver o vencedor</div>
    </div>
  );
}

/* ============================ Tabela (standings da API) ============================ */
function TabelaTab({ matches = [], results = {}, draft = {}, setDraftScore = () => {}, myPicks = {}, darkMode = false, savePicks = () => {}, busy = false, users = [], picksAll = {}, me = null }) {
  const [state, setState] = useState({ loading: true });
  const [groupsCollapsed, setGroupsCollapsed] = useState(false);

  const hasKO = matches.some((m) => PHASES_KO.includes(m.phase));

  const load = useCallback(() => {
    setState({ loading: true });
    fetchStandings()
      .then((d) => setState({ loading: false, data: d }))
      .catch((e) => setState({ loading: false, error: e.message, kind: e.kind }));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Auto-collapse groups when KO has started
  useEffect(() => { if (hasKO) setGroupsCollapsed(true); }, [hasKO]);

  // KO matches grouped by phase order
  const koByPhase = (() => {
    const koMatches = matches.filter((m) => PHASES_KO.includes(m.phase));
    const grouped = {};
    for (const m of koMatches) {
      if (!grouped[m.phase]) grouped[m.phase] = [];
      grouped[m.phase].push(m);
    }
    return PHASES_KO.map((ph) => ({ phase: ph, items: grouped[ph] || [] })).filter((g) => g.items.length > 0);
  })();

  if (hasKO) return <KnockoutShowcase matches={matches} results={results} draft={draft} setDraftScore={setDraftScore} myPicks={myPicks} darkMode={darkMode} savePicks={savePicks} busy={busy} users={users} picksAll={picksAll} me={me} />;

  return (
    <section aria-label="Tabela dos grupos">
      {koByPhase.length > 0 && (
        <div style={{ marginTop: 18, marginBottom: 8 }}>
          <h2 className="bl-display" style={{ margin: '0 0 14px', fontSize: 22, color: 'var(--cal)' }}>🏆 Mata-mata</h2>
          {koByPhase.map(({ phase, items }) => (
            <div key={phase}>
              <div className="bl-ko-phase">{phase}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 14, marginBottom: 16 }}>
                {items.map((m) => {
                  const res = results[m.id];
                  const homeWins = res && (res.qualifier === 'home' || (!res.qualifier && res.home > res.away));
                  const awayWins = res && (res.qualifier === 'away' || (!res.qualifier && res.away > res.home));
                  const homeColor = TEAM_COLORS[m.home] || 'rgba(255,198,41,.1)';
                  const awayColor = TEAM_COLORS[m.away] || 'rgba(255,198,41,.1)';
                  return (
                    <div key={m.id} className="bl-ko-match" style={{
                      background: `linear-gradient(90deg, ${homeColor}1f 0%, ${homeColor}14 45%, transparent 50%, ${awayColor}14 55%, ${awayColor}1f 100%)`,
                      borderLeft: `4px solid ${homeColor}`,
                      borderRight: `4px solid ${awayColor}`,
                    }}>
                      <div className={`bl-ko-team${homeWins ? ' winner' : ''}`} style={{
                        background: homeWins ? `${homeColor}18` : 'transparent',
                        borderBottom: res?.qualifier === 'home' ? `3px solid ${homeColor}` : 'none',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Flag team={m.home} size={32} />
                          <span className="bl-ko-name">{m.home}</span>
                        </div>
                        <span className="bl-ko-score">{res ? res.home : '–'}</span>
                      </div>
                      <div className={`bl-ko-team${awayWins ? ' winner' : ''}`} style={{
                        background: awayWins ? `${awayColor}18` : 'transparent',
                        borderBottom: res?.qualifier === 'away' ? `3px solid ${awayColor}` : 'none',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Flag team={m.away} size={32} />
                          <span className="bl-ko-name">{m.away}</span>
                        </div>
                        <span className="bl-ko-score">{res ? res.away : '–'}</span>
                      </div>
                      <span className="bl-ko-vs">VS</span>
                      {!res && <span className="bl-ko-info">{fmtTime(m.kickoff)}</span>}
                      {res?.qualifier && (
                        <span className="bl-ko-info" style={{ color: 'var(--bandeira)', fontWeight: 700 }}>
                          ✓ {res.qualifier === 'home' ? m.home : m.away}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, color: 'var(--cal)' }}>
        <h2 className="bl-display" style={{ margin: 0, fontSize: 20 }}>{hasKO ? 'Classificação' : 'Tabela dos grupos'}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {hasKO && (
            <button className="bl-f" data-on={groupsCollapsed ? 0 : 1} onClick={() => setGroupsCollapsed((c) => !c)}>
              {groupsCollapsed ? '▸ expandir' : '▴ recolher'}
            </button>
          )}
          <button className="bl-f" data-on={0} onClick={load} disabled={state.loading}>↻ atualizar</button>
        </div>
      </div>

      {!groupsCollapsed && (
        <>
          {state.loading && <div className="bl-grp" style={{ padding: 0 }}><div className="bl-skel" style={{ height: 200, margin: 0, borderRadius: 0 }} /></div>}

          {state.error && (
            <div className="bl-panel" style={{ textAlign: 'center' }}>
              <p style={{ margin: 0 }}>
                {`Não consegui carregar a tabela agora. ${state.error}`}
              </p>
            </div>
          )}

          {state.data && state.data.groups?.length === 0 && (
            <div className="bl-panel" style={{ textAlign: 'center' }}>
              <p style={{ margin: 0 }}>A API ainda não publicou a classificação da Copa.</p>
            </div>
          )}

          {state.data?.groups?.map((g) => (
            <div className="bl-grp" key={g.group}>
              <h3 className="bl-display">{g.group}</h3>
              <table>
                <thead>
                  <tr>
                    <th></th><th className="l">Seleção</th>
                    <th>J</th><th>V</th><th>E</th><th>D</th><th>SG</th><th>Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((t) => (
                    <tr key={t.team} className={t.rank <= 2 ? 'qual' : ''}>
                      <td><span className="pos">{t.rank}</span></td>
                      <td className="tname">{t.logo && <img src={t.logo} alt="" loading="lazy" />}{t.team}</td>
                      <td>{t.played}</td><td>{t.win}</td><td>{t.draw}</td><td>{t.lose}</td>
                      <td>{t.gd}</td><td className="pts">{t.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <p style={{ color: 'rgba(244,240,228,.7)', fontSize: 12, textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
            Dados ao vivo via ESPN · os 2 primeiros de cada grupo (em verde) avançam.
          </p>
        </>
      )}

      {groupsCollapsed && (
        <p style={{ color: 'rgba(244,240,228,.5)', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
          Tabela de grupos recolhida · clique em "expandir" para ver.
        </p>
      )}
    </section>
  );
}

/* ============================ Chuteira de Ouro ============================ */
function BootPickCard({ myPick, bootWinner, onSave, busy, artilhariaData, bootPicks, users }) {
  const [query, setQuery] = useState(myPick || '');
  const [showSug, setShowSug] = useState(false);
  const open = Date.now() < BOOT_DEADLINE;

  const suggestions = useMemo(() => {
    if (!query || query.length < 2 || !artilhariaData) return [];
    const q = query.toLowerCase();
    return artilhariaData.filter(p => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [query, artilhariaData]);

  const leader = artilhariaData?.[0];

  return (
    <div className="bl-champ" style={{ marginBottom: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <img src="/boot.png" alt="chuteira de ouro" style={{ width: 36, height: 36, objectFit: 'contain' }} />
        <h3 className="bl-display" style={{ margin: 0 }}>Chuteira de Ouro <span className="bl-champ-badge">+{BOOT_PTS} pts</span></h3>
      </div>
      <p className="sub">Quem vai ser o artilheiro? Acertar vale <b>{BOOT_PTS} pontos</b>. Fecha em <b>21/06 às 23:59</b>.</p>
      {leader && (
        <div style={{ fontSize: 12, color: 'var(--cinza)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <img src="/boot.png" alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} />
          Líder atual: <b style={{ color: 'var(--tinta)' }}>{leader.name}</b> ({leader.goals} gols)
        </div>
      )}
      {bootWinner && (
        <div style={{ fontSize: 12, background: 'rgba(255,198,41,.15)', borderRadius: 8, padding: '6px 10px', marginBottom: 8 }}>
          🏅 Oficial: <b>{bootWinner}</b>
        </div>
      )}
      {open ? (
        <div style={{ position: 'relative' }}>
          <div className="cur">
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setShowSug(true); }}
              onFocus={() => setShowSug(true)}
              onBlur={() => setTimeout(() => setShowSug(false), 200)}
              placeholder="Buscar jogador…"
              style={{ flex: 1, background: 'var(--campo2)', border: '1.5px solid #20301F', borderRadius: 8, color: 'var(--tinta)', padding: '7px 10px', fontSize: 14, outline: 'none' }}
            />
            <button className="bl-btn amarelo" style={{ flex: 'none', padding: '8px 16px', fontSize: 13 }}
              disabled={busy || !query.trim() || query.trim() === myPick}
              onClick={() => { onSave(query.trim()); setShowSug(false); }}>
              {query.trim() === myPick ? 'Salvo' : 'Salvar'}
            </button>
          </div>
          {showSug && suggestions.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 60, background: 'var(--papel)', border: '1.5px solid #20301F', borderRadius: 8, zIndex: 50, boxShadow: '0 4px 12px rgba(0,0,0,.3)' }}>
              {suggestions.map((p, i) => (
                <div key={i} onMouseDown={() => { setQuery(p.name); setShowSug(false); }}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: i < suggestions.length-1 ? '1px solid rgba(32,48,31,.15)' : 'none' }}>
                  <b>{p.name}</b> <span style={{ color: 'var(--cinza)', fontSize: 11 }}>{p.goals} gols · {p.team}</span>
                </div>
              ))}
            </div>
          )}
          {myPick && (
            <div style={{ fontSize: 12, color: 'var(--cinza)', marginTop: 6 }}>
              Seu palpite atual: <b style={{ color: 'var(--tinta)' }}>{myPick}</b>
            </div>
          )}
        </div>
      ) : (
        <div className="lock">🔒 Palpite de chuteira encerrado.{' '}
          {myPick ? <>Você escolheu <b style={{ color: 'var(--canarinho)' }}>{myPick}</b>.</> : 'Você não chegou a palpitar.'}
        </div>
      )}
      {users && users.some(u => bootPicks[u.slug]) && (
        <div style={{ marginTop: 12, borderTop: '1px solid rgba(32,48,31,.15)', paddingTop: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--cinza)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Palpites da galera</div>
          {users.filter(u => bootPicks[u.slug]).sort((a, b) => a.name.localeCompare(b.name)).map(u => {
            const isLeader = leader && bootPicks[u.slug]?.toLowerCase() === leader.name.toLowerCase();
            const isWinner = bootWinner && bootPicks[u.slug]?.toLowerCase() === bootWinner.toLowerCase();
            return (
              <div key={u.slug} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '6px 8px', borderBottom: '1px solid rgba(32,48,31,.07)', background: isLeader && !bootWinner ? 'rgba(255,198,41,.1)' : 'transparent', borderRadius: 4 }}>
                <span style={{ color: 'var(--cinza)' }}>{u.name}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <b style={{ color: isWinner ? 'var(--canarinho)' : 'var(--tinta)' }}>
                    {bootPicks[u.slug]}{isWinner ? ' ✓' : ''}
                  </b>
                  {isLeader && !bootWinner && <span style={{ fontSize: 10, color: 'var(--canarinho)', fontWeight: 700 }}>+2 PTS</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================ Artilharia ============================ */
function ArtilhariaTab({ me, myBootPick, bootWinner, onSaveBootPick, busy, bootPicks, users, matches, results }) {
  const ART_CACHE_KEY = 'bl_artilharia_cache';
  const ART_TTL = 2 * 3600 * 1000; // 2 horas

  const [state, setState] = useState(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(ART_CACHE_KEY));
      if (cached && Date.now() - cached.ts < ART_TTL) return { loading: false, data: cached.data };
    } catch {}
    return { loading: true };
  });

  const load = useCallback((force = false) => {
    if (!force) {
      try {
        const cached = JSON.parse(localStorage.getItem(ART_CACHE_KEY));
        if (cached && Date.now() - cached.ts < ART_TTL) { setState({ loading: false, data: cached.data }); return; }
      } catch {}
    }
    setState((s) => ({ ...s, loading: true }));
    fetchArtilhariaFromGames(matches, results)
      .then((data) => {
        localStorage.setItem(ART_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
        setState({ loading: false, data });
      })
      .catch((e) => setState({ loading: false, error: e.message }));
  }, [matches, results]);

  useEffect(() => { load(); }, [load]);

  return (
    <section aria-label="Artilharia">
      {me && <BootPickCard myPick={myBootPick} bootWinner={bootWinner} onSave={onSaveBootPick} busy={busy} artilhariaData={state.data || []} bootPicks={bootPicks} users={users} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, color: 'var(--cal)' }}>
        <h2 className="bl-display" style={{ margin: 0, fontSize: 20 }}>⚽ Artilharia</h2>
        <button className="bl-f" data-on={0} onClick={() => load(true)} disabled={state.loading}>↻ atualizar</button>
      </div>

      {state.loading && <div className="bl-grp" style={{ padding: 0 }}><div className="bl-skel" style={{ height: 150, margin: 0, borderRadius: 0 }} /></div>}
      {state.error && <div className="bl-panel" style={{ textAlign: 'center' }}><p style={{ margin: 0 }}>Não consegui carregar agora. {state.error}</p></div>}
      {state.data?.length === 0 && <div className="bl-panel" style={{ textAlign: 'center' }}><p style={{ margin: 0 }}>Nenhum gol marcado ainda.</p></div>}

      {state.data?.length > 0 && (
        <div className="bl-grp">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--cinza)' }}>#</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--cinza)' }}>Jogador</th>
                <th style={{ textAlign: 'center', padding: '8px 8px', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--cinza)' }}>⚽</th>
                <th style={{ textAlign: 'center', padding: '8px 8px', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--cinza)' }}>🅰</th>
                <th style={{ textAlign: 'center', padding: '8px 8px', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--cinza)' }}>J</th>
              </tr>
            </thead>
            <tbody>
              {state.data.map((p, i) => (
                <tr key={i} style={{ borderTop: '1px solid rgba(32,48,31,.15)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--cinza)', width: 32 }}>{i + 1}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--cinza)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Flag team={Object.keys(TEAM_EN).find((k) => TEAM_EN[k]?.some((v) => v.toLowerCase() === p.team.toLowerCase()) || k.toLowerCase() === p.team.toLowerCase()) || ''} size={14} />
                      {p.team}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 900, fontSize: 18 }}>{p.goals}</td>
                  <td style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--cinza)' }}>{p.assists || '—'}</td>
                  <td style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--cinza)' }}>{p.appearances}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ color: 'rgba(244,240,228,.7)', fontSize: 12, textAlign: 'center', marginTop: 12 }}>
        Dados via ESPN · ⚽ gols · 🅰 assistências · J jogos
      </p>
    </section>
  );
}

/* ============================ Ranking ============================ */
const CHART_COLORS = ['#FFC629','#1E9E55','#2447C5','#D7263D','#9B59B6','#E67E22','#1ABC9C','#E91E63'];

function RankHistoryChart({ rankHistory, ranking }) {
  if (rankHistory.length < 2) return null;
  const W = 600, H = 200, PAD = { t: 10, r: 10, b: 28, l: 28 };
  const iW = W - PAD.l - PAD.r, iH = H - PAD.t - PAD.b;
  const maxScore = Math.max(1, ...rankHistory.map((pt) => Math.max(...Object.values(pt.scores))));
  const xStep = iW / (rankHistory.length - 1);
  const yScale = (v) => iH - (v / maxScore) * iH;
  return (
    <div className="bl-chart">
      <h3>Evolução no ranking</h3>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
        {ranking.map((u, i) => {
          const color = CHART_COLORS[i % CHART_COLORS.length];
          const pts = rankHistory.map((pt, xi) => [PAD.l + xi * xStep, PAD.t + yScale(pt.scores[u.slug] || 0)]);
          const d = pts.map((p, pi) => `${pi === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
          return <path key={u.slug} d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />;
        })}
        {rankHistory.map((pt, xi) => (
          <text key={xi} x={PAD.l + xi * xStep} y={H - 6} textAnchor="middle" fontSize="8" fill="rgba(110,122,112,.8)">{pt.matchLabel}</text>
        ))}
      </svg>
      <div className="bl-chart-legend">
        {ranking.map((u, i) => (
          <span key={u.slug}><i style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{u.name}</span>
        ))}
      </div>
    </div>
  );
}

function RankingTab({ ranking, liveRanking, meSlug, results, worldChampion, rankHistory }) {
  const encerrados = Object.keys(results || {}).length;
  const displayRanking = liveRanking || ranking;
  const isLive = !!liveRanking;
  return (
    <section aria-label="Classificação">
      {isLive && <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--verde)', marginBottom: 4, fontWeight: 700 }}>● Pontuação ao vivo (provisória)</p>}
      <div className="bl-rank">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Participante</th>
              <th className="num">Pts</th>
              <th className="num" title="Placares exatos">⭐</th>
              <th className="num" title="Acertou vencedor/empate">✓</th>
              <th className="champ-col" title="Palpite de campeão">🏆</th>
            </tr>
          </thead>
          <tbody>
            {displayRanking.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>Ninguém entrou no bolão ainda.</td></tr>}
            {displayRanking.map((r, i) => {
              const official = ranking.find((x) => x.slug === r.slug);
              const rankCls = i === 0 ? 'rank-gold' : i === 1 ? 'rank-silver' : i === 2 ? 'rank-bronze' : '';
              return (
                <tr key={r.slug} className={rankCls} style={r.slug === meSlug ? { background: 'rgba(255,198,41,.18)' } : undefined}>
                  <td>
                    <div className={`bl-rank-av ${i === 0 ? 'm1' : i === 1 ? 'm2' : i === 2 ? 'm3' : 'mx'}`}>
                      <Avatar user={r} size={30} />
                      <span className="bl-rank-badge">{i + 1}</span>
                    </div>
                  </td>
                  <td style={{ fontWeight: r.slug === meSlug ? 900 : 600 }}>
                    {i === 0 ? <img src="/trophy.png" alt="🏆" style={{ width: 22, height: 22, objectFit: 'contain', verticalAlign: 'middle', marginRight: 4 }} /> : ''}
                    {r.name}{r.slug === meSlug ? ' (você)' : ''}
                  </td>
                  <td className="tot" style={isLive ? { color: 'var(--verde)' } : undefined}>
                    {r.total}
                    {isLive && official && official.total !== r.total && (
                      <span style={{ fontSize: 10, color: 'var(--cinza)', marginLeft: 4 }}>({official.total})</span>
                    )}
                  </td>
                  <td className="num">{r.exatos}</td>
                  <td className="num">{r.vencedores}</td>
                  <td className={`champ-col ${official?.champHit ? 'bl-champ-hit' : ''}`}>
                    {official?.champTeam ? <span title={official.champTeam}><Flag team={official.champTeam} size={18} />{official.champHit ? ' ✓' : ''}</span> : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ color: 'rgba(244,240,228,.75)', fontSize: 12, textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
        {encerrados} jogo{encerrados === 1 ? '' : 's'} com resultado lançado · Acertar o campeão vale +{CHAMPION_PTS} pts{worldChampion ? ` (campeão definido: ${worldChampion})` : ''}.<br />
        Desempate: mais placares exatos, depois mais vencedores.
      </p>
      {rankHistory && <RankHistoryChart rankHistory={rankHistory} ranking={ranking} />}
    </section>
  );
}

//* ============================ Admin ============================ */
function AdminTab({ me, matches, results, users, now, worldChampion, liveScores = {}, onDone, onError, busy, setBusy }) {
  const started = matches.filter((m) => now >= new Date(m.kickoff).getTime() || results[m.id]);
  const [vals, setVals] = useState({});
  const [fetching, setFetching] = useState({});
  const [fase, setFase] = useState(PHASES_KO[0]);
  const [ta, setTa] = useState(''); const [tb, setTb] = useState('');
  const [dt, setDt] = useState(''); const [hr, setHr] = useState('');
  const [pinAlvo, setPinAlvo] = useState(''); const [pinNovo, setPinNovo] = useState('');
  // forçar palpite
  const [fpUser, setFpUser] = useState(''); const [fpMatch, setFpMatch] = useState('');
  const [scanningKo, setScanningKo] = useState(false);
  const [koFound, setKoFound] = useState([]);
  const [fpH, setFpH] = useState(''); const [fpA, setFpA] = useState('');

  async function fetchEspnScore(m) {
    setFetching((f) => ({ ...f, [m.id]: true }));
    try {
      const ev = await findEspnEventForMatch(m.home, m.away, m.kickoff);
      if (!ev) { onError('Jogo não encontrado na ESPN ainda.'); return; }
      const comp = ev.competitions[0];
      const homeComp = comp.competitors.find((c) => c.homeAway === 'home') || comp.competitors[0];
      const awayComp = comp.competitors.find((c) => c.homeAway === 'away') || comp.competitors[1];
      const statusName = comp.status?.type?.name || '';
      if (statusName === 'STATUS_SCHEDULED') { onError('Jogo ainda não começou.'); return; }
      const h = homeComp.score != null ? String(Math.round(Number(homeComp.score))) : '';
      const a = awayComp.score != null ? String(Math.round(Number(awayComp.score))) : '';
      setVals((x) => ({ ...x, [m.id]: { h, a } }));
    } catch (e) { onError('Erro ao buscar placar da ESPN.'); }
    finally { setFetching((f) => ({ ...f, [m.id]: false })); }
  }
  const [syncing, setSyncing] = useState(false);

  async function syncAllEspn() {
    if (started.length === 0) return;
    setSyncing(true);
    let saved = 0, skipped = 0;
    try {
      for (const m of started) {
        // não sobrescreve jogo que o app vê AO VIVO (evita casar com evento errado/antigo da ESPN)
        if (['1H','2H','HT','ET','P','LIVE','INT','BT'].includes(liveScores?.[m.id]?.status)) { skipped++; continue; }
        const ev = await findEspnEventForMatch(m.home, m.away, m.kickoff);
        if (!ev) { skipped++; continue; }
        const comp = ev.competitions[0];
        const statusName = comp?.status?.type?.name || '';
        if (statusName !== 'STATUS_FINAL' && statusName !== 'STATUS_FULL_TIME') { skipped++; continue; }
        const homeComp = comp.competitors.find((c) => c.homeAway === 'home') || comp.competitors[0];
        const awayComp = comp.competitors.find((c) => c.homeAway === 'away') || comp.competitors[1];
        const h = homeComp?.score != null ? Math.round(Number(homeComp.score)) : null;
        const a = awayComp?.score != null ? Math.round(Number(awayComp.score)) : null;
        if (h == null || a == null) { skipped++; continue; }
        try {
          await rpc('set_result', { p_name: me.name, p_pin: me.pin, p_match: m.id, p_home: h, p_away: a });
          saved++;
        } catch { skipped++; }
      }
      await onDone(`ESPN: ${saved} resultado${saved !== 1 ? 's' : ''} salvo${saved !== 1 ? 's' : ''}${skipped ? `, ${skipped} não encontrado${skipped !== 1 ? 's' : ''}` : ''} ✅`);
    } catch (e) { onError('Erro ao sincronizar com a ESPN.'); }
    finally { setSyncing(false); }
  }

  // Busca jogos de mata-mata na ESPN (datas da Copa 2026 KO) e retorna os que não estão no BD
  async function scanKoFromEspn() {
    setScanningKo(true); setKoFound([]);
    try {
      const found = [];
      // 32 avos: 29 jun a 2 jul; oitavas: 5-8 jul; quartas: 11-12 jul; semi: 15-16 jul; final: 19 jul
      const dates = [];
      for (let d = new Date('2026-06-29'); d <= new Date('2026-07-19'); d.setUTCDate(d.getUTCDate()+1))
        dates.push(d.toISOString().slice(0,10).replace(/-/g,''));

      const phaseByRound = {
        'Round of 32':'32 avos de final','Round of 16':'Oitavas de final',
        'Quarterfinals':'Quartas de final','Semifinals':'Semifinal',
        'Third Place':'3º lugar','Final':'Final',
      };

      for (const ds of dates) {
        const events = await espnScoreboard(ds).catch(()=>[]);
        for (const ev of events) {
          const comp = ev.competitions?.[0]; if (!comp) continue;
          const home = comp.competitors?.find(c=>c.homeAway==='home');
          const away = comp.competitors?.find(c=>c.homeAway==='away');
          if (!home || !away) continue;
          const homeName = home.team?.displayName || home.team?.name || '';
          const awayName = away.team?.displayName || away.team?.name || '';
          const round = ev.notes?.[0]?.headline || comp.notes?.[0]?.headline || '';
          const phase = phaseByRound[round] || '32 avos de final';
          const kickoff = comp.startDate || ev.date;
          // Verifica se já existe no BD
          const alreadyIn = matches.some(m =>
            PHASES_KO.includes(m.phase) &&
            ((matchesTeam(homeName, m.home) && matchesTeam(awayName, m.away)) ||
             (matchesTeam(homeName, m.away) && matchesTeam(awayName, m.home)))
          );
          if (!alreadyIn && homeName && awayName) {
            found.push({ homeName, awayName, phase, kickoff, ds });
          }
        }
      }
      setKoFound(found);
      if (found.length === 0) onDone('Nenhum jogo novo de mata-mata encontrado na ESPN.');
    } catch(e) { onError('Erro ao buscar mata-mata na ESPN.'); }
    finally { setScanningKo(false); }
  }

  // campeão oficial
  const [champ, setChamp] = useState(worldChampion || '');
  const [bootWinnerInput, setBootWinnerInput] = useState('');

  const setV = (mid, side, v) => setVals((x) => ({
    ...x,
    [mid]: { ...(x[mid] || {}), [side]: side === 'qualifier' ? v : v.replace(/\D/g, '').slice(0, 2) }
  }));

  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); await onDone(ok); } catch (e) { onError(e.message); } finally { setBusy(false); }
  };

  return (
    <section aria-label="Administração">
      <div className="bl-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <h2 className="bl-display" style={{ margin: 0 }}>Lançar resultados</h2>
          {started.length > 0 && <button className="bl-btn verde" style={{ fontSize: 13, padding: '6px 14px' }} disabled={syncing || busy} onClick={syncAllEspn}>{syncing ? '⏳ Sincronizando…' : '⚽ Sincronizar ESPN'}</button>}
        </div>
        <p className="sub">Aparecem os jogos que já começaram. Placar do tempo normal + prorrogação (sem pênaltis). Deixe vazio e OK para apagar.</p>
        {started.length === 0 && <div className="bl-info">Nenhum jogo começou ainda.</div>}
        {[...started].reverse().map((m) => {
          const r = results[m.id]; const v = vals[m.id] || {};
          return (
            <div className="bl-admin-row" key={m.id}>
              <span className="t"><Flag team={m.home} size={20} /> {m.home} × {m.away} <Flag team={m.away} size={20} /><br />
                <small style={{ color: 'var(--cinza)' }}>{fmtDay(m.kickoff)} · {fmtTime(m.kickoff)}{r ? ` · lançado ${r.home}×${r.away}` : ''}</small>
              </span>
              <button className="bl-okbtn" style={{ background: 'var(--bandeira)', fontSize: 11, padding: '4px 7px' }}
                disabled={busy || fetching[m.id]} onClick={() => fetchEspnScore(m)}>
                {fetching[m.id] ? '…' : '⚽ESPN'}
              </button>
              <input aria-label={`Gols ${m.home}`} inputMode="numeric" value={v.h ?? (r ? String(r.home) : '')} onChange={(e) => setV(m.id, 'h', e.target.value)} />
              <span style={{ textAlign: 'center' }}>×</span>
              <input aria-label={`Gols ${m.away}`} inputMode="numeric" value={v.a ?? (r ? String(r.away) : '')} onChange={(e) => setV(m.id, 'a', e.target.value)} />
              {m.phase !== 'Grupos' && (
                <select value={v.qualifier ?? (r?.qualifier || '')} onChange={(e) => setV(m.id, 'qualifier', e.target.value)}
                  style={{ fontSize: 11, padding: '2px 4px' }}>
                  <option value="">quem avança?</option>
                  <option value="home">{m.home}</option>
                  <option value="away">{m.away}</option>
                </select>
              )}
              <button className="bl-okbtn" disabled={busy} onClick={() => {
                const h = v.h ?? (r ? String(r.home) : ''); const a = v.a ?? (r ? String(r.away) : '');
                if (h === '' && a === '') return run(() => rpc('set_result', { p_name: me.name, p_pin: me.pin, p_match: m.id, p_home: null, p_away: null }), 'Resultado removido');
                if (h === '' || a === '') return;
                run(() => rpc('set_result', { p_name: me.name, p_pin: me.pin, p_match: m.id, p_home: parseInt(h, 10), p_away: parseInt(a, 10), p_qualifier: vals[m.id]?.qualifier || null }), 'Resultado salvo ✅');
              }}>OK</button>
            </div>
          );
        })}
      </div>

      <div className="bl-panel">
        <h2 className="bl-display">Adicionar jogo do mata-mata</h2>
        <p className="sub">Quando os cruzamentos saírem, cadastre aqui — todo mundo já pode palpitar. Horário de Brasília.</p>
        <div className="bl-field">
          <label htmlFor="ad-fase">Fase</label>
          <select id="ad-fase" className="bl-in" value={fase} onChange={(e) => setFase(e.target.value)}>
            {PHASES_KO.map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div className="bl-grid2">
          <div className="bl-field"><label htmlFor="ad-ta">Time 1</label>
            <input id="ad-ta" className="bl-in" list="bl-times" value={ta} onChange={(e) => setTa(e.target.value)} placeholder="ex: Brasil" /></div>
          <div className="bl-field"><label htmlFor="ad-tb">Time 2</label>
            <input id="ad-tb" className="bl-in" list="bl-times" value={tb} onChange={(e) => setTb(e.target.value)} placeholder="ex: Argentina" /></div>
        </div>
        <datalist id="bl-times">{Object.keys(FLAGS).map((t) => <option key={t} value={t} />)}</datalist>
        <div className="bl-grid2">
          <div className="bl-field"><label htmlFor="ad-dt">Data</label>
            <input id="ad-dt" className="bl-in" type="date" value={dt} min="2026-06-28" max="2026-07-19" onChange={(e) => setDt(e.target.value)} /></div>
          <div className="bl-field"><label htmlFor="ad-hr">Hora (Brasília)</label>
            <input id="ad-hr" className="bl-in" type="time" value={hr} onChange={(e) => setHr(e.target.value)} /></div>
        </div>
        <button className="bl-btn verde" style={{ width: '100%' }} disabled={busy || !ta.trim() || !tb.trim() || !dt || !hr}
          onClick={() => run(async () => {
            await rpc('add_match', { p_name: me.name, p_pin: me.pin, p_phase: fase, p_home: ta.trim(), p_away: tb.trim(), p_kickoff: `${dt}T${hr}:00-03:00` });
            setTa(''); setTb(''); setDt(''); setHr('');
          }, 'Jogo do mata-mata adicionado ✅')}>
          Adicionar jogo
        </button>

        <div style={{ marginTop: 12 }}>
          <button className="bl-btn" style={{ width: '100%', background: 'var(--bandeira)', color: '#fff' }}
            disabled={scanningKo || busy} onClick={scanKoFromEspn}>
            {scanningKo ? '⏳ Buscando na ESPN…' : '📡 Buscar jogos mata-mata ESPN'}
          </button>
          {koFound.length > 0 && (
            <div style={{ marginTop: 10, background: 'rgba(32,48,31,.06)', borderRadius: 8, padding: '10px 12px' }}>
              <p className="sub" style={{ marginBottom: 8 }}><b>{koFound.length} jogo(s) novo(s) encontrado(s) na ESPN:</b></p>
              {koFound.map((f, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: i > 0 ? '1px dashed rgba(32,48,31,.2)' : 'none', fontSize: 13 }}>
                  <span><b>{f.phase}</b> · <Flag team={toPtName(f.homeName)} size={16} /> {toPtName(f.homeName)} × {toPtName(f.awayName)} <Flag team={toPtName(f.awayName)} size={16} /><br/>
                    <small style={{ color: 'var(--cinza)' }}>{f.kickoff ? new Date(f.kickoff).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : f.ds}</small>
                  </span>
                  <button className="bl-btn verde" style={{ fontSize: 12, padding: '5px 10px', whiteSpace: 'nowrap' }} disabled={busy}
                    onClick={() => {
                      const ko = new Date(f.kickoff);
                      const pad2 = n => String(n).padStart(2,'0');
                      const dt2 = `${ko.getUTCFullYear()}-${pad2(ko.getUTCMonth()+1)}-${pad2(ko.getUTCDate())}`;
                      const hr2 = `${pad2(ko.getUTCHours())}:${pad2(ko.getUTCMinutes())}`;
                      run(async () => {
                        const ptHome = toPtName(f.homeName), ptAway = toPtName(f.awayName);
                        await rpc('add_match', { p_name: me.name, p_pin: me.pin, p_phase: f.phase, p_home: ptHome, p_away: ptAway, p_kickoff: `${dt2}T${hr2}:00Z` });
                        setKoFound(prev => prev.filter((_,j) => j !== i));
                      }, `${toPtName(f.homeName)} × ${toPtName(f.awayName)} adicionado ✅`);
                    }}>
                    + Adicionar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {matches.filter((x) => !x.is_seed).length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p className="sub" style={{ marginBottom: 6 }}><b>Jogos adicionados:</b></p>
            {matches.filter((x) => !x.is_seed).map((x) => (
              <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderTop: '1px dashed rgba(32,48,31,.2)', fontSize: 13 }}>
                <span><b>{x.phase}</b> · <Flag team={x.home} size={18} /> {x.home} × {x.away} <Flag team={x.away} size={18} /> · {fmtDay(x.kickoff)} {fmtTime(x.kickoff)}</span>
                <button className="bl-mini" style={{ color: 'var(--apito)' }} disabled={busy}
                  onClick={() => { if (window.confirm(`Remover ${x.home} × ${x.away}? Os palpites desse jogo serão apagados.`)) run(() => rpc('delete_match', { p_name: me.name, p_pin: me.pin, p_match: x.id }), 'Jogo removido'); }}>
                  remover
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bl-panel">
        <h2 className="bl-display">Forçar / repor palpite</h2>
        <p className="sub">Lança ou corrige o palpite de <b>qualquer participante</b> em <b>qualquer jogo</b>, ignorando a janela de tempo. Use pra repor palpites perdidos. Deixe os dois placares vazios e clique Salvar para apagar.</p>
        <div className="bl-field"><label htmlFor="fp-user">Participante</label>
          <select id="fp-user" className="bl-in" value={fpUser} onChange={(e) => setFpUser(e.target.value)}>
            <option value="">— escolher —</option>
            {users.map((u) => <option key={u.slug} value={u.name}>{u.name}</option>)}
          </select></div>
        <div className="bl-field"><label htmlFor="fp-match">Jogo</label>
          <select id="fp-match" className="bl-in" value={fpMatch} onChange={(e) => setFpMatch(e.target.value)}>
            <option value="">— escolher —</option>
            {[...matches].map((m) => (
              <option key={m.id} value={m.id}>
                {m.home} × {m.away} · {fmtDay(m.kickoff)} {fmtTime(m.kickoff)}{results[m.id] ? ` (resultado ${results[m.id].home}×${results[m.id].away})` : ''}
              </option>
            ))}
          </select></div>
        <div className="bl-grid2">
          <div className="bl-field"><label htmlFor="fp-h">Gols mandante</label>
            <input id="fp-h" className="bl-in" inputMode="numeric" maxLength={2} value={fpH}
              onChange={(e) => setFpH(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="ex: 2" /></div>
          <div className="bl-field"><label htmlFor="fp-a">Gols visitante</label>
            <input id="fp-a" className="bl-in" inputMode="numeric" maxLength={2} value={fpA}
              onChange={(e) => setFpA(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="ex: 1" /></div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
        <button className="bl-btn verde" style={{ flex: 1 }} disabled={busy || !fpUser || !fpMatch}
          onClick={() => {
            const h = fpH === '' ? null : parseInt(fpH, 10);
            const a = fpA === '' ? null : parseInt(fpA, 10);
            if ((h === null) !== (a === null)) { onError('Preencha os dois placares, ou deixe os dois vazios para apagar.'); return; }
            run(() => rpc('admin_force_pick', { p_name: me.name, p_pin: me.pin, p_target: fpUser, p_match: fpMatch, p_home: h, p_away: a })
              .then(() => { setFpH(''); setFpA(''); }),
              h === null ? 'Palpite apagado' : 'Palpite forçado ✅');
          }}>
          Salvar palpite forçado
        </button>
        <button className="bl-btn" style={{ background: 'var(--apito)', color: '#fff', flex: 0 }} disabled={busy || !fpUser || !fpMatch}
          onClick={() => {
            if (!window.confirm(`Apagar palpite de ${fpUser} no jogo selecionado?`)) return;
            run(() => rpc('admin_force_pick', { p_name: me.name, p_pin: me.pin, p_target: fpUser, p_match: fpMatch, p_home: null, p_away: null })
              .then(() => { setFpH(''); setFpA(''); }),
              'Palpite apagado');
          }}>
          🗑 Apagar
        </button>
        </div>
      </div>

      <div className="bl-panel">
        <h2 className="bl-display">Campeão oficial do mundo</h2>
        <p className="sub">Defina aqui o campeão quando a Copa acabar. Quem tiver palpitado essa seleção ganha <b>+{CHAMPION_PTS} pts</b> no ranking. Deixe em branco e salve para limpar.</p>
        <div className="bl-field"><label htmlFor="ad-champ">Seleção campeã</label>
          <select id="ad-champ" className="bl-in" value={champ} onChange={(e) => setChamp(e.target.value)}>
            <option value="">— nenhum (ainda não definido) —</option>
            {Object.keys(FLAGS).sort((a, b) => a.localeCompare(b)).map((t) => <option key={t} value={t}>{t}</option>)}
          </select></div>
        <button className="bl-btn verde" style={{ width: '100%' }} disabled={busy || champ === (worldChampion || '')}
          onClick={() => run(() => rpc('set_world_champion', { p_name: me.name, p_pin: me.pin, p_team: champ || null }),
            champ ? `Campeão definido: ${champ} 🏆` : 'Campeão limpo')}>
          Salvar campeão oficial
        </button>
      </div>

      <div className="bl-panel">
        <h2 className="bl-display">Chuteira de Ouro oficial</h2>
        <p className="sub">Defina aqui o artilheiro quando a Copa acabar. Quem tiver palpitado esse jogador ganha <b>+{BOOT_PTS} pts</b> no ranking. Deixe em branco e salve para limpar.</p>
        <div className="bl-field"><label htmlFor="ad-boot">Nome do artilheiro</label>
          <input id="ad-boot" className="bl-in" value={bootWinnerInput} onChange={(e) => setBootWinnerInput(e.target.value)} placeholder="ex: Kylian Mbappé" /></div>
        <button className="bl-btn verde" style={{ width: '100%' }} disabled={busy || !bootWinnerInput.trim()}
          onClick={() => run(() => rpc('set_boot_winner', { p_name: me.name, p_pin: me.pin, p_player: bootWinnerInput.trim() || null }),
            bootWinnerInput.trim() ? `Chuteira de Ouro: ${bootWinnerInput.trim()} 👟` : 'Chuteira de Ouro limpa')}>
          Salvar artilheiro oficial
        </button>
      </div>

      <div className="bl-panel">
        <h2 className="bl-display" style={{ fontSize: 16 }}>Resetar PIN de alguém</h2>
        <p className="sub">Pra quando um amigo esquecer o PIN.</p>
        <div className="bl-grid2">
          <div className="bl-field"><label htmlFor="ad-alvo">Nome do participante</label>
            <select id="ad-alvo" className="bl-in" value={pinAlvo} onChange={(e) => setPinAlvo(e.target.value)}>
              <option value="">— escolher —</option>
              {users.filter((u) => u.slug !== me.slug).map((u) => <option key={u.slug} value={u.name}>{u.name}</option>)}
            </select></div>
          <div className="bl-field"><label htmlFor="ad-novopin">Novo PIN</label>
            <input id="ad-novopin" className="bl-in" inputMode="numeric" maxLength={6} value={pinNovo}
              onChange={(e) => setPinNovo(e.target.value.replace(/\D/g, ''))} placeholder="ex: 1234" /></div>
        </div>
        <button className="bl-btn verde" style={{ width: '100%' }} disabled={busy || !pinAlvo || pinNovo.length < 4}
          onClick={() => run(() => rpc('reset_pin', { p_name: me.name, p_pin: me.pin, p_target: pinAlvo, p_new_pin: pinNovo }).then(() => { setPinAlvo(''); setPinNovo(''); }), 'PIN resetado ✅')}>
          Resetar PIN
        </button>
      </div>

      <div className="bl-panel" style={{ borderColor: 'var(--apito)' }}>
        <h2 className="bl-display" style={{ fontSize: 16 }}>Como funciona a proteção</h2>
        <p className="sub" style={{ marginBottom: 0, lineHeight: 1.6 }}>
          Aqui a janela do palpite (abre <b>24h antes</b>, fecha <b>15 min antes</b>) é validada <b>no servidor</b>, com o
          relógio do servidor — não adianta mexer no relógio do celular nem fuçar no código da página: o banco rejeita.
          Resultados só após o início do jogo, e só pelo organizador. PINs são guardados criptografados (bcrypt).
        </p>
      </div>
    </section>
  );
}
