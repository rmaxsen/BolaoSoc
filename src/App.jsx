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

/* ============================================================ CSS ============================================================ */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=Archivo:wght@400;500;600;700;800&display=swap');
:root{--campo:#0B2A1C;--campo2:#0E3322;--cal:#F4F0E4;--papel:#FBF8EF;--tinta:#15241C;--canarinho:#FFC629;--bandeira:#1E9E55;--royal:#2447C5;--apito:#D7263D;--cinza:#6E7A70;}
*{box-sizing:border-box} html,body,#root{min-height:100%} body{margin:0}
.bl-app{min-height:100vh;font-family:'Archivo',system-ui,-apple-system,sans-serif;color:var(--tinta);
  background:radial-gradient(ellipse 120% 50% at 50% -10%, rgba(255,198,41,.10), transparent 60%),
  repeating-linear-gradient(0deg, var(--campo) 0 90px, var(--campo2) 90px 180px);padding-bottom:96px;}
.bl-display{font-family:'Archivo Black','Archivo',sans-serif;letter-spacing:.5px}
.bl-wrap{max-width:680px;margin:0 auto;padding:0 14px}
.bl-hero{padding:26px 0 14px;text-align:center;color:var(--cal)}
.bl-crest{display:inline-flex;flex-direction:column;align-items:center;gap:2px;border:3px solid var(--canarinho);
  border-radius:18px 18px 50% 50%/18px 18px 40% 40%;padding:14px 26px 18px;background:rgba(0,0,0,.22);box-shadow:0 6px 0 rgba(0,0,0,.25);}
.bl-crest .ano{color:var(--canarinho);font-size:13px;letter-spacing:4px}
.bl-crest h1{margin:0;font-size:clamp(26px,7vw,40px);line-height:1;color:var(--cal);text-shadow:3px 3px 0 rgba(0,0,0,.35)}
.bl-rules{margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;font-size:12px}
.bl-chip{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:5px 12px;color:var(--cal)}
.bl-chip b{color:var(--canarinho)}
.bl-tabs{position:sticky;top:0;z-index:40;background:rgba(11,42,28,.92);backdrop-filter:blur(6px);border-bottom:2px solid rgba(255,198,41,.5)}
.bl-tabs-in{max-width:680px;margin:0 auto;display:flex;gap:4px;padding:8px 10px}
.bl-tab{flex:1;border:0;border-radius:10px;padding:10px 4px;font:inherit;font-weight:800;font-size:13px;color:var(--cal);background:transparent;cursor:pointer;position:relative;transition:background .2s,color .2s}
.bl-tab:hover{background:rgba(255,255,255,.10)}
.bl-tab[data-on="1"]{background:var(--canarinho);color:#241a00}
.bl-tab:focus-visible{outline:3px solid var(--canarinho);outline-offset:-3px}
.bl-badge{position:absolute;top:2px;right:8px;min-width:18px;height:18px;border-radius:9px;background:var(--apito);color:#fff;font-size:11px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;padding:0 5px}
.bl-day{margin:22px 0 10px;display:flex;align-items:center;gap:12px;color:var(--cal)}
.bl-day::before,.bl-day::after{content:"";flex:1;height:2px;background:rgba(244,240,228,.35);border-radius:2px}
.bl-day span{font-weight:800;font-size:13px;text-transform:capitalize;letter-spacing:.5px}
.bl-card{background:var(--papel);border:2px solid #20301F;border-radius:14px;margin-bottom:12px;box-shadow:0 4px 0 rgba(0,0,0,.28);overflow:hidden;position:relative;transition:transform .2s,box-shadow .2s}
.bl-card:hover{transform:translateY(-2px);box-shadow:0 8px 0 rgba(0,0,0,.30)}
.bl-card-inner{border:2px dashed rgba(32,48,31,.25);border-radius:10px;margin:6px;padding:10px 10px 12px}
.bl-meta{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--cinza);font-weight:600;margin-bottom:8px;gap:8px}
.bl-meta .grupo{background:var(--tinta);color:var(--cal);border-radius:6px;padding:2px 8px;font-weight:800;white-space:nowrap}
.bl-teams{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}
.bl-team{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center}
.bl-team .fl{font-size:34px;line-height:1}
.bl-team .nm{font-weight:800;font-size:13px;line-height:1.15}
.bl-x{display:flex;align-items:center;gap:7px}
.bl-score-in{width:48px;height:52px;text-align:center;font:inherit;font-weight:800;font-size:22px;border:2px solid #20301F;border-radius:10px;background:#fff;color:var(--tinta);transition:border-color .2s,background .2s}
.bl-score-in:focus-visible{outline:3px solid var(--royal);outline-offset:1px}
.bl-score-in:disabled{background:#EDE9DC;color:#8a8a7e}
.bl-score-in.draft{border-color:var(--canarinho);background:#FFFBEE}
.bl-vs{font-weight:900;color:var(--cinza)}
.bl-final{display:flex;align-items:center;gap:6px;font-size:26px;font-weight:900}
.bl-final small{font-size:10px;color:var(--cinza);display:block;text-align:center}
.bl-stamp{position:absolute;top:8px;right:10px;transform:rotate(7deg);font-size:10px;font-weight:900;letter-spacing:1.5px;padding:3px 9px;border-radius:6px;border:2px solid currentColor;background:rgba(255,255,255,.85);pointer-events:none;}
.bl-stamp.aberto{color:var(--bandeira)} .bl-stamp.fechado{color:var(--apito)} .bl-stamp.fim{color:var(--royal)} .bl-stamp.breve{color:var(--cinza)}
.bl-foot{margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;color:var(--cinza)}
.bl-mini{border:0;background:none;font:inherit;font-size:12px;font-weight:700;color:var(--royal);cursor:pointer;padding:4px 0;text-decoration:underline}
.bl-mini:focus-visible{outline:2px solid var(--royal);outline-offset:2px;border-radius:4px}
.bl-pts{font-weight:900;border-radius:999px;padding:3px 10px;font-size:12px}
.bl-pts.p3{background:var(--canarinho);color:#241a00} .bl-pts.p1{background:var(--bandeira);color:#fff} .bl-pts.p0{background:#d8d3c4;color:#5c5c52}
.bl-picks{border-top:2px dashed rgba(32,48,31,.25);margin:8px 6px 6px;padding:8px 6px 4px;font-size:13px}
.bl-picks .row{display:flex;justify-content:space-between;padding:4px 4px;border-radius:6px}
.bl-picks .row:nth-child(odd){background:rgba(32,48,31,.05)}
.bl-picks .me{font-weight:800}
.bl-savebar{position:fixed;left:0;right:0;bottom:0;z-index:50;padding:10px 14px 14px;background:linear-gradient(transparent, rgba(11,42,28,.95) 35%)}
.bl-savebar-in{max-width:680px;margin:0 auto;display:flex;gap:10px}
.bl-btn{border:2px solid #20301F;border-radius:12px;padding:13px 18px;font:inherit;font-weight:900;font-size:15px;cursor:pointer;box-shadow:0 4px 0 rgba(0,0,0,.3);transition:transform .08s,box-shadow .15s}
.bl-btn:active{transform:translateY(3px);box-shadow:0 1px 0 rgba(0,0,0,.3)}
.bl-btn:focus-visible{outline:3px solid #fff;outline-offset:2px}
.bl-btn.amarelo{background:var(--canarinho);color:#241a00;flex:1}
.bl-btn.verde{background:var(--bandeira);color:#fff}
.bl-btn:disabled{opacity:.55;cursor:not-allowed}
.bl-filtros{display:flex;gap:6px;overflow-x:auto;padding:12px 2px 2px;scrollbar-width:none}
.bl-filtros::-webkit-scrollbar{display:none}
.bl-f{border:1.5px solid rgba(244,240,228,.45);background:transparent;color:var(--cal);border-radius:999px;padding:6px 13px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;transition:background .18s,color .18s,border-color .18s}
.bl-f[data-on="1"]{background:var(--cal);color:var(--tinta);border-color:var(--cal)}
.bl-f:focus-visible{outline:3px solid var(--canarinho);outline-offset:2px}
.bl-rank{background:var(--papel);border:2px solid #20301F;border-radius:14px;box-shadow:0 4px 0 rgba(0,0,0,.28);overflow:hidden;margin-top:14px}
.bl-rank table{width:100%;border-collapse:collapse;font-size:14px}
.bl-rank th{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--cinza);text-align:left;padding:12px 10px 6px}
.bl-rank td{padding:11px 10px;border-top:1px solid rgba(32,48,31,.12)}
.bl-rank .num{text-align:center;font-variant-numeric:tabular-nums}
.bl-rank .tot{font-weight:900;font-size:17px;text-align:center}
.bl-rank .rank-gold{background:rgba(255,198,41,.13)}
.bl-rank .rank-silver{background:rgba(192,200,208,.11)}
.bl-rank .rank-bronze{background:rgba(181,101,29,.09)}
.bl-rank .rank-gold td:first-child{border-left:3px solid var(--canarinho)}
.bl-rank .rank-silver td:first-child{border-left:3px solid #A0AAB4}
.bl-rank .rank-bronze td:first-child{border-left:3px solid #B5651D}
.bl-rank .rank-gold .tot{font-size:20px}
.bl-medal{display:inline-flex;width:30px;height:30px;border-radius:50%;align-items:center;justify-content:center;font-weight:900;font-size:13px;border:2px solid #20301F;margin-right:4px;transition:transform .2s}
.bl-medal:hover{transform:scale(1.15)}
.bl-medal.m1{background:linear-gradient(135deg,#FFE08A,#E5A50A)} .bl-medal.m2{background:linear-gradient(135deg,#F0F0F0,#B9BDC4)}
.bl-medal.m3{background:linear-gradient(135deg,#F0B98A,#B5651D)} .bl-medal.mx{background:#E8E3D3;font-size:12px}
.bl-panel{background:var(--papel);border:2px solid #20301F;border-radius:16px;box-shadow:0 5px 0 rgba(0,0,0,.3);padding:20px;margin-top:18px}
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
.bl-toast{position:fixed;bottom:84px;left:50%;transform:translateX(-50%);z-index:60;background:var(--tinta);color:var(--cal);border:2px solid var(--canarinho);border-radius:12px;padding:11px 18px;font-weight:800;font-size:14px;box-shadow:0 6px 18px rgba(0,0,0,.4);animation:blpop .2s ease-out;max-width:90vw;text-align:center}
.bl-skel{border-radius:8px;background:linear-gradient(90deg,rgba(32,48,31,.1) 25%,rgba(32,48,31,.2) 50%,rgba(32,48,31,.1) 75%);background-size:200% 100%}
@keyframes blpop{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes bl-shimmer{from{background-position:-200% 0}to{background-position:200% 0}}
@keyframes bl-stamp-in{0%{opacity:0;transform:rotate(22deg) scale(.5)}65%{transform:rotate(5deg) scale(1.08)}100%{opacity:1;transform:rotate(7deg) scale(1)}}
@keyframes bl-pulse-glow{0%,100%{box-shadow:0 4px 0 rgba(0,0,0,.3)}50%{box-shadow:0 4px 22px rgba(255,198,41,.65),0 4px 0 rgba(0,0,0,.3)}}
@keyframes bl-slide-down{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
@keyframes bl-fade-up{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:no-preference){
  .bl-skel{animation:bl-shimmer 1.6s linear infinite}
  .bl-stamp{animation:bl-stamp-in .42s cubic-bezier(.2,.8,.4,1) both}
  .bl-btn.pulse{animation:bl-pulse-glow 2.2s ease-in-out infinite}
  .bl-picks{animation:bl-slide-down .25s ease-out both}
  .bl-hero{animation:bl-fade-up .45s ease-out both}
}
@media(prefers-reduced-motion:reduce){.bl-toast{animation:none}.bl-btn:active{transform:none}.bl-card:hover{transform:none;box-shadow:0 4px 0 rgba(0,0,0,.28)}}
@media(max-width:420px){.bl-team .nm{font-size:12px}.bl-score-in{width:44px}}
@media(max-width:360px){.bl-team .fl{font-size:26px}.bl-card-inner{padding:8px 6px 10px}.bl-score-in{width:40px;height:46px;font-size:18px}.bl-crest{padding:10px 18px 14px}.bl-wrap{padding:0 10px}}
`;

/* ============================================================ App ============================================================ */
function SkeletonCard() {
  return (
    <div className="bl-card" style={{ cursor: 'default' }}>
      <div className="bl-card-inner">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="bl-skel" style={{ height: 20, width: '35%' }} />
          <div className="bl-skel" style={{ height: 14, width: '42%' }} />
        </div>
        <div className="bl-teams">
          <div className="bl-team">
            <div className="bl-skel" style={{ width: 38, height: 38, borderRadius: '50%' }} />
            <div className="bl-skel" style={{ width: 64, height: 13, marginTop: 6 }} />
          </div>
          <div className="bl-x">
            <div className="bl-skel" style={{ width: 48, height: 52, borderRadius: 10 }} />
            <div style={{ width: 14 }} />
            <div className="bl-skel" style={{ width: 48, height: 52, borderRadius: 10 }} />
          </div>
          <div className="bl-team">
            <div className="bl-skel" style={{ width: 38, height: 38, borderRadius: '50%' }} />
            <div className="bl-skel" style={{ width: 64, height: 13, marginTop: 6 }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          <div className="bl-skel" style={{ height: 12, width: '45%' }} />
          <div className="bl-skel" style={{ height: 12, width: '28%' }} />
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
  const [draft, setDraft] = useState({});
  const [tab, setTab] = useState('jogos');
  const [filtro, setFiltro] = useState('todos');
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);

  const say = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(t); }, []);

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

  /* ---------- ranking ---------- */
  const ranking = useMemo(() => {
    const rows = users.map((u) => {
      let total = 0, exatos = 0, vencedores = 0;
      for (const m of matches) {
        const res = results[m.id]; if (!res) continue;
        const p = points(picksAll[u.slug]?.[m.id], res); if (p == null) continue;
        total += p; if (p === 3) exatos++; if (p === 1) vencedores++;
      }
      return { slug: u.slug, name: u.name, total, exatos, vencedores };
    });
    rows.sort((a, b) => b.total - a.total || b.exatos - a.exatos || b.vencedores - a.vencedores || a.name.localeCompare(b.name));
    return rows;
  }, [users, matches, results, picksAll]);

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
            <span className="ano bl-display">★ 2026 ★</span>
            <h1 className="bl-display">BOLÃO DA COPA</h1>
            <span style={{ fontSize: 11, opacity: .85 }}>EUA · México · Canadá</span>
          </div>
        </header>
        <div className="bl-wrap" style={{ paddingTop: 8 }}>
          <div className="bl-day"><span>carregando…</span></div>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="bl-app">
      <style>{CSS}</style>
      <header className="bl-hero">
        <div className="bl-crest">
          <span className="ano bl-display">★ 2026 ★</span>
          <h1 className="bl-display">BOLÃO DA COPA</h1>
          <span style={{ fontSize: 11, opacity: .85 }}>EUA · México · Canadá</span>
        </div>
        <div className="bl-rules">
          <span className="bl-chip">Placar exato <b>3 pts</b></span>
          <span className="bl-chip">Vencedor/empate <b>1 pt</b></span>
          <span className="bl-chip">Abre <b>24h</b> antes · fecha <b>15 min</b> antes</span>
        </div>
        {me && (
          <div style={{ marginTop: 10, fontSize: 13 }}>
            {me.isAdmin ? '👑 ' : '⚽ '}<b>{me.name}</b>
            {' · '}<button className="bl-link" style={{ color: 'var(--canarinho)' }} onClick={refresh}>atualizar</button>
            {' · '}<button className="bl-link" style={{ color: 'var(--canarinho)' }} onClick={logout}>sair</button>
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
              {me.isAdmin && <button className="bl-tab" data-on={tab === 'admin' ? 1 : 0} onClick={() => { setTab('admin'); loadAll().catch(() => {}); }}>Admin</button>}
            </div>
          </nav>

          <main className="bl-wrap">
            {tab === 'jogos' && (
              <JogosTab matches={matches} me={me} users={users} now={now}
                picksAll={picksAll} myPicks={myPicks} draft={draft} results={results}
                filtro={filtro} setFiltro={setFiltro} setDraftScore={setDraftScore} />
            )}
            {tab === 'ranking' && <RankingTab ranking={ranking} meSlug={me.slug} results={results} />}
            {tab === 'admin' && me.isAdmin && (
              <AdminTab me={me} matches={matches} results={results} users={users} now={now}
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

/* ============================ Jogos ============================ */
function JogosTab({ matches, me, users, now, picksAll, myPicks, draft, results, filtro, setFiltro, setDraftScore }) {
  const grupos = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
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

  return (
    <section aria-label="Jogos">
      <div className="bl-filtros" role="tablist" aria-label="Filtrar jogos">
        {[['todos', 'Todos'], ['abertos', 'Abertos'], ['pendentes', 'Sem palpite'], ['mata', 'Mata-mata']].map(([k, l]) => (
          <button key={k} className="bl-f" data-on={filtro === k ? 1 : 0} onClick={() => setFiltro(k)}>{l}</button>
        ))}
        {grupos.map((g) => (
          <button key={g} className="bl-f" data-on={filtro === g ? 1 : 0} onClick={() => setFiltro(g)}>Grupo {g}</button>
        ))}
      </div>

      {byDay.length === 0 && (
        <div className="bl-panel" style={{ textAlign: 'center' }}>
          <p style={{ margin: 0 }}>Nenhum jogo aqui. {filtro === 'mata' ? 'O organizador adiciona o mata-mata quando os cruzamentos saírem.' : 'Mude o filtro acima.'}</p>
        </div>
      )}

      {byDay.map(({ day, items }) => (
        <div key={dayKey(day)}>
          <div className="bl-day"><span>{fmtDay(day)}</span></div>
          {items.map((m) => (
            <MatchCard key={m.id} m={m} me={me} users={users} now={now}
              picksAll={picksAll} myPicks={myPicks} draft={draft} res={results[m.id]}
              setDraftScore={setDraftScore} />
          ))}
        </div>
      ))}
    </section>
  );
}

function MatchCard({ m, me, users, now, picksAll, myPicks, draft, res, setDraftScore }) {
  const [open, setOpen] = useState(false);
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
  const stamp = res ? ['fim', 'ENCERRADO'] : locked ? ['fechado', 'FECHADO'] : beforeWindow ? ['breve', 'EM BREVE'] : ['aberto', 'ABERTO'];

  const others = users
    .map((u) => ({ slug: u.slug, name: u.name, pick: picksAll[u.slug]?.[m.id] }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const quantos = others.filter((o) => o.pick).length;

  return (
    <article className="bl-card">
      <span className={`bl-stamp ${stamp[0]}`}>{stamp[1]}</span>
      <div className="bl-card-inner">
        <div className="bl-meta">
          <span className="grupo">{m.phase === 'Grupos' ? `GRUPO ${m.grp}` : m.phase.toUpperCase()}</span>
          <span>{fmtTime(m.kickoff)} (Brasília){m.city ? ` · ${m.city}` : ''}</span>
        </div>

        <div className="bl-teams">
          <div className="bl-team"><span className="fl" aria-hidden>{flag(m.home)}</span><span className="nm">{m.home}</span></div>
          <div className="bl-x">
            <input className={`bl-score-in${d && d.h != null ? ' draft' : ''}`} aria-label={`Gols de ${m.home}`} inputMode="numeric" maxLength={2}
              disabled={!inWindow} value={valH ?? ''} placeholder="–"
              onChange={(e) => setDraftScore(m.id, 'h', e.target.value.replace(/\D/g, ''))} />
            <span className="bl-vs">×</span>
            <input className={`bl-score-in${d && d.a != null ? ' draft' : ''}`} aria-label={`Gols de ${m.away}`} inputMode="numeric" maxLength={2}
              disabled={!inWindow} value={valA ?? ''} placeholder="–"
              onChange={(e) => setDraftScore(m.id, 'a', e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="bl-team"><span className="fl" aria-hidden>{flag(m.away)}</span><span className="nm">{m.away}</span></div>
        </div>

        {res && (
          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <span className="bl-final">{res.home} <small>placar<br />final</small> {res.away}</span>
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
          <button className="bl-mini" onClick={() => setOpen((o) => !o)}>
            {open ? 'esconder palpites' : `palpites da galera (${quantos})`}
          </button>
        </div>
      </div>

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

/* ============================ Ranking ============================ */
function RankingTab({ ranking, meSlug, results }) {
  const encerrados = Object.keys(results || {}).length;
  return (
    <section aria-label="Classificação">
      <div className="bl-rank">
        <table>
          <thead>
            <tr>
              <th>#</th><th>Participante</th>
              <th className="num" title="Placares exatos">⭐ Exatos</th>
              <th className="num" title="Acertou vencedor/empate">✓ Venc.</th>
              <th className="num">Pts</th>
            </tr>
          </thead>
          <tbody>
            {ranking.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>Ninguém entrou no bolão ainda.</td></tr>}
            {ranking.map((r, i) => {
              const rankCls = i === 0 ? 'rank-gold' : i === 1 ? 'rank-silver' : i === 2 ? 'rank-bronze' : '';
              return (
                <tr key={r.slug} className={rankCls} style={r.slug === meSlug ? { background: 'rgba(255,198,41,.18)' } : undefined}>
                  <td><span className={`bl-medal ${i === 0 ? 'm1' : i === 1 ? 'm2' : i === 2 ? 'm3' : 'mx'}`}>{i + 1}</span></td>
                  <td style={{ fontWeight: r.slug === meSlug ? 900 : 600 }}>{r.name}{r.slug === meSlug ? ' (você)' : ''}</td>
                  <td className="num">{r.exatos}</td>
                  <td className="num">{r.vencedores}</td>
                  <td className="tot">{r.total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ color: 'rgba(244,240,228,.75)', fontSize: 12, textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
        {encerrados} jogo{encerrados === 1 ? '' : 's'} com resultado lançado · Desempate: mais placares exatos, depois mais vencedores.
      </p>
    </section>
  );
}

/* ============================ Admin ============================ */
function AdminTab({ me, matches, results, users, now, onDone, onError, busy, setBusy }) {
  const started = matches.filter((m) => now >= new Date(m.kickoff).getTime());
  const [vals, setVals] = useState({});
  const [fase, setFase] = useState(PHASES_KO[0]);
  const [ta, setTa] = useState(''); const [tb, setTb] = useState('');
  const [dt, setDt] = useState(''); const [hr, setHr] = useState('');
  const [pinAlvo, setPinAlvo] = useState(''); const [pinNovo, setPinNovo] = useState('');

  const setV = (mid, side, v) => setVals((x) => ({ ...x, [mid]: { ...(x[mid] || {}), [side]: v.replace(/\D/g, '').slice(0, 2) } }));

  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); await onDone(ok); } catch (e) { onError(e.message); } finally { setBusy(false); }
  };

  return (
    <section aria-label="Administração">
      <div className="bl-panel">
        <h2 className="bl-display">Lançar resultados</h2>
        <p className="sub">Aparecem os jogos que já começaram. Placar do tempo normal + prorrogação (sem pênaltis). Deixe vazio e OK para apagar.</p>
        {started.length === 0 && <div className="bl-info">Nenhum jogo começou ainda.</div>}
        {[...started].reverse().map((m) => {
          const r = results[m.id]; const v = vals[m.id] || {};
          return (
            <div className="bl-admin-row" key={m.id}>
              <span className="t">{flag(m.home)} {m.home} × {m.away} {flag(m.away)}<br />
                <small style={{ color: 'var(--cinza)' }}>{fmtDay(m.kickoff)} · {fmtTime(m.kickoff)}{r ? ` · lançado ${r.home}×${r.away}` : ''}</small>
              </span>
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
                <span><b>{x.phase}</b> · {flag(x.home)} {x.home} × {x.away} {flag(x.away)} · {fmtDay(x.kickoff)} {fmtTime(x.kickoff)}</span>
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
