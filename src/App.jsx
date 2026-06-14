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

/* Campeão: palpite extra (5 pts), fecha em 21/06/2026 23:59 Brasília. */
const CHAMPION_PTS = 5;
const CHAMPION_DEADLINE = new Date('2026-06-21T23:59:59-03:00').getTime();

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

function points(pick, res) {
  if (!pick || !res) return null;
  if (pick.home === res.home && pick.away === res.away) return 3;
  return Math.sign(pick.home - pick.away) === Math.sign(res.home - res.away) ? 1 : 0;
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
  const r = await fetch(url.toString());
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
          points: stats.points,
          played: stats.gamesPlayed,
          win: stats.wins,
          draw: stats.ties,
          lose: stats.losses,
          gf: stats.pointsFor,
          ga: stats.pointsAgainst,
          gd: stats.pointDifferential,
          desc: e.note?.description || '',
        };
      }),
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

async function fetchArtilharia() {
  const data = await espnGet(ESPN_BASE, '/statistics');
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
        for (const m of matches) {
          const hNames = espnTeamNames(homeComp); const aNames = espnTeamNames(awayComp);
          if (hNames.some((n) => matchesTeam(m.home, n)) && aNames.some((n) => matchesTeam(m.away, n))) {
            const short = espnStatus(comp);
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
@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;600;700;800&display=swap');
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
  border-bottom:1px solid rgba(255,198,41,.2);pointer-events:none}
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
.bl-tabs-in{max-width:680px;margin:0 auto;display:flex;gap:4px;padding:8px 10px}
.bl-tab{flex:1;border:0;border-radius:10px;padding:10px 4px;font:inherit;font-weight:800;font-size:13px;color:rgba(244,240,228,.6);background:transparent;cursor:pointer;position:relative;transition:background .2s,color .2s}
.bl-tab:hover{background:rgba(255,255,255,.07);color:rgba(244,240,228,.9)}
.bl-tab[data-on="1"]{background:var(--canarinho);color:#241a00}
.bl-tab:focus-visible{outline:3px solid var(--canarinho);outline-offset:-3px}

/* ── PWA: barra de navegação no rodapé ── */
@media(display-mode:standalone){
  .bl-tabs{position:fixed;top:auto;bottom:0;left:0;right:0;border-bottom:none;border-top:1px solid rgba(255,198,41,.3);padding-bottom:env(safe-area-inset-bottom)}
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
.bl-collapsed-inner{display:flex;align-items:center;gap:10px;padding:8px 14px;flex-wrap:nowrap;overflow:hidden}
.bl-collapsed-date{font-size:11px;color:var(--cinza);white-space:nowrap;min-width:36px}
.bl-collapsed-teams{display:flex;align-items:center;gap:5px;flex:1;min-width:0}
.bl-collapsed-teams .bl-collapsed-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
    const [cq, tq] = await Promise.all([
      supabase.from('champion_picks').select('*'),
      supabase.from('tournament').select('champion').eq('id', 1).maybeSingle(),
    ]);
    if (!cq.error) {
      const cp = {};
      (cq.data || []).forEach((c) => { cp[c.user_slug] = c.team; });
      setChampPicks(cp);
    }
    if (!tq.error) setWorldChampion(tq.data?.champion ?? null);
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
    const n = val === '' ? null : Math.max(0, Math.min(99, parseInt(val, 10)));
    setDraft((d) => {
      const cur = d[mid] || { h: myPicks[mid]?.home ?? null, a: myPicks[mid]?.away ?? null };
      return { ...d, [mid]: { ...cur, [side]: Number.isNaN(n) ? null : n } };
    });
  };

  const pendingDraft = useMemo(() => Object.entries(draft).filter(([mid, p]) => {
    const m = matches.find((x) => x.id === mid);
    if (!m || !isOpenWindow(m, now)) return false;
    return p.h != null && p.a != null && (myPicks[mid]?.home !== p.h || myPicks[mid]?.away !== p.a);
  }), [draft, matches, now, myPicks]);

  async function savePicks() {
    if (!me || pendingDraft.length === 0) return;
    setBusy(true);
    try {
      const payload = pendingDraft.map(([id, p]) => ({ id, h: p.h, a: p.a }));
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

  /* ---------- ranking ---------- */
  const ranking = useMemo(() => {
    const rows = users.map((u) => {
      let total = 0, exatos = 0, vencedores = 0;
      for (const m of matches) {
        const res = results[m.id]; if (!res) continue;
        const p = points(picksAll[u.slug]?.[m.id], res); if (p == null) continue;
        total += p; if (p === 3) exatos++; if (p === 1) vencedores++;
      }
      const champTeam = champPicks[u.slug] || null;
      const champHit = worldChampion && champTeam === worldChampion;
      if (champHit) total += CHAMPION_PTS;
      return { slug: u.slug, name: u.name, total, exatos, vencedores, champTeam, champHit };
    });
    rows.sort((a, b) => b.total - a.total || b.exatos - a.exatos || b.vencedores - a.vencedores || a.name.localeCompare(b.name));
    return rows;
  }, [users, matches, results, picksAll, champPicks, worldChampion]);

  const rankHistory = useMemo(() => {
    const sorted = [...matches].sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
    const cumulative = {};
    users.forEach((u) => { cumulative[u.slug] = 0; });
    const history = [];
    for (const m of sorted) {
      const res = results[m.id];
      if (!res) continue;
      for (const u of users) {
        const p = points(picksAll[u.slug]?.[m.id], res);
        if (p != null) cumulative[u.slug] = (cumulative[u.slug] || 0) + p;
      }
      history.push({ matchLabel: `${m.home.slice(0,3)}×${m.away.slice(0,3)}`, scores: { ...cumulative } });
    }
    return history;
  }, [matches, results, users, picksAll]);

  const liveScores = useLiveScores(matches, me, rpc);

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

  return (
    <div className="bl-app" data-theme={darkMode ? 'dark' : undefined}>
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
              <button className="bl-tab" data-on={tab === 'ranking' ? 1 : 0} onClick={() => { setTab('ranking'); loadAll().catch(() => {}); }}>Ranking</button>
              <button className="bl-tab" data-on={tab === 'tabela' ? 1 : 0} onClick={() => setTab('tabela')}>Tabela</button>
              <button className="bl-tab" data-on={tab === 'artilharia' ? 1 : 0} onClick={() => setTab('artilharia')}>⚽ Art.</button>
              {me.isAdmin && <button className="bl-tab" data-on={tab === 'admin' ? 1 : 0} onClick={() => { setTab('admin'); loadAll().catch(() => {}); }}>Admin</button>}
            </div>
          </nav>

          <main className="bl-wrap">
            {tab === 'jogos' && (
              <JogosTab matches={matches} me={me} users={users} now={now}
                picksAll={picksAll} myPicks={myPicks} draft={draft} results={results}
                filtro={filtro} setFiltro={setFiltro} setDraftScore={setDraftScore}
                myChampion={champPicks[me.slug] || null} onSaveChampion={saveChampion} busy={busy}
                liveScores={liveScores} />
            )}
            {tab === 'ranking' && <RankingTab ranking={ranking} meSlug={me.slug} results={results} worldChampion={worldChampion} rankHistory={rankHistory} picksAll={picksAll} />}
            {tab === 'tabela' && <TabelaTab active={tab === 'tabela'} />}
            {tab === 'artilharia' && <ArtilhariaTab />}
            {tab === 'admin' && me.isAdmin && (
              <AdminTab me={me} matches={matches} results={results} users={users} now={now}
                worldChampion={worldChampion}
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
function JogosTab({ matches, me, users, now, picksAll, myPicks, draft, results, filtro, setFiltro, setDraftScore, myChampion, onSaveChampion, busy, liveScores }) {
  const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  const [hideFinished, setHideFinished] = useState(() => localStorage.getItem('hideFinished') === '1');
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
      const p = points(pick, res);
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

      {byDay.map(({ day, items }) => {
        const visible = hideFinished ? items.filter((m) => !results[m.id]) : items;
        if (!visible.length) return null;
        return (
          <div key={dayKey(day)}>
            <div className="bl-day"><span>{fmtDay(day)}</span></div>
            {visible.map((m) => (
              <MatchCard key={m.id} m={m} me={me} users={users} now={now}
                picksAll={picksAll} myPicks={myPicks} draft={draft} res={results[m.id]}
                setDraftScore={setDraftScore} liveScore={liveScores?.[m.id]} />
            ))}
          </div>
        );
      })}
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
  const pts = res && saved ? points(saved, res) : null;
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
            <Flag team={m.home} /><span className="bl-collapsed-name">{m.home}</span>
          </div>
          <div className="bl-collapsed-score">
            <span>{res.home}</span><span className="bl-collapsed-x">×</span><span>{res.away}</span>
          </div>
          <div className="bl-collapsed-teams">
            <span className="bl-collapsed-name">{m.away}</span><Flag team={m.away} />
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

        {res && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <span className="bl-final">{res.home} <small>placar<br />final</small> {res.away}</span>
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
            const p = res && pick ? points(pick, res) : null;
            return (
              <div className={`row ${slug === me?.slug ? 'me' : ''}`} key={slug}>
                <span>{slug === me?.slug ? 'Você' : name}</span>
                <span>
                  {pick ? `${pick.home} × ${pick.away}` : 'ainda não palpitou'}
                  {p != null && <b style={{ marginLeft: 8 }}>{p === 3 ? '⭐3' : p === 1 ? '+1' : '0'}</b>}
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

/* ============================ Tabela (standings da API) ============================ */
function TabelaTab() {
  const [state, setState] = useState({ loading: true });

  const load = useCallback(() => {
    setState({ loading: true });
    fetchStandings()
      .then((d) => setState({ loading: false, data: d }))
      .catch((e) => setState({ loading: false, error: e.message, kind: e.kind }));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <section aria-label="Tabela dos grupos">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, color: 'var(--cal)' }}>
        <h2 className="bl-display" style={{ margin: 0, fontSize: 20 }}>Tabela dos grupos</h2>
        <button className="bl-f" data-on={0} onClick={load} disabled={state.loading}>↻ atualizar</button>
      </div>

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
    </section>
  );
}

/* ============================ Artilharia ============================ */
function ArtilhariaTab() {
  const [state, setState] = useState({ loading: true });
  const load = useCallback(() => {
    setState({ loading: true });
    fetchArtilharia()
      .then((data) => setState({ loading: false, data }))
      .catch((e) => setState({ loading: false, error: e.message }));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <section aria-label="Artilharia">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, color: 'var(--cal)' }}>
        <h2 className="bl-display" style={{ margin: 0, fontSize: 20 }}>⚽ Artilharia</h2>
        <button className="bl-f" data-on={0} onClick={load} disabled={state.loading}>↻ atualizar</button>
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

function RankingTab({ ranking, meSlug, results, worldChampion, rankHistory }) {
  const encerrados = Object.keys(results || {}).length;
  return (
    <section aria-label="Classificação">
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
            {ranking.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>Ninguém entrou no bolão ainda.</td></tr>}
            {ranking.map((r, i) => {
              const rankCls = i === 0 ? 'rank-gold' : i === 1 ? 'rank-silver' : i === 2 ? 'rank-bronze' : '';
              return (
                <tr key={r.slug} className={rankCls} style={r.slug === meSlug ? { background: 'rgba(255,198,41,.18)' } : undefined}>
                  <td><span className={`bl-medal ${i === 0 ? 'm1' : i === 1 ? 'm2' : i === 2 ? 'm3' : 'mx'}`}>{i + 1}</span></td>
                  <td style={{ fontWeight: r.slug === meSlug ? 900 : 600 }}>{i === 0 ? '👑 ' : ''}{r.name}{r.slug === meSlug ? ' (você)' : ''}</td>
                  <td className="tot">{r.total}</td>
                  <td className="num">{r.exatos}</td>
                  <td className="num">{r.vencedores}</td>
                  <td className={`champ-col ${r.champHit ? 'bl-champ-hit' : ''}`}>
                    {r.champTeam ? <span title={r.champTeam}><Flag team={r.champTeam} size={18} />{r.champHit ? ' ✓' : ''}</span> : '—'}
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

/* ============================ Admin ============================ */
function AdminTab({ me, matches, results, users, now, worldChampion, onDone, onError, busy, setBusy }) {
  const started = matches.filter((m) => now >= new Date(m.kickoff).getTime());
  const [vals, setVals] = useState({});
  const [fetching, setFetching] = useState({});
  const [fase, setFase] = useState(PHASES_KO[0]);
  const [ta, setTa] = useState(''); const [tb, setTb] = useState('');
  const [dt, setDt] = useState(''); const [hr, setHr] = useState('');
  const [pinAlvo, setPinAlvo] = useState(''); const [pinNovo, setPinNovo] = useState('');
  // forçar palpite
  const [fpUser, setFpUser] = useState(''); const [fpMatch, setFpMatch] = useState('');
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
        const ev = await findEspnEventForMatch(m.home, m.away, m.kickoff);
        if (!ev) { skipped++; continue; }
        const comp = ev.competitions[0];
        const statusName = comp?.status?.type?.name || '';
        if (statusName === 'STATUS_SCHEDULED') { skipped++; continue; }
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

  // campeão oficial
  const [champ, setChamp] = useState(worldChampion || '');

  const setV = (mid, side, v) => setVals((x) => ({ ...x, [mid]: { ...(x[mid] || {}), [side]: v.replace(/\D/g, '').slice(0, 2) } }));

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
              <button className="bl-okbtn" disabled={busy} onClick={() => {
                const h = v.h ?? (r ? String(r.home) : ''); const a = v.a ?? (r ? String(r.away) : '');
                if (h === '' && a === '') return run(() => rpc('set_result', { p_name: me.name, p_pin: me.pin, p_match: m.id, p_home: null, p_away: null }), 'Resultado removido');
                if (h === '' || a === '') return;
                run(() => rpc('set_result', { p_name: me.name, p_pin: me.pin, p_match: m.id, p_home: parseInt(h, 10), p_away: parseInt(a, 10) }), 'Resultado salvo ✅');
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
