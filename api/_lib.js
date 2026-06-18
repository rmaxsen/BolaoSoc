// ============================================================
// Helpers do proxy da API-Football (rodam no servidor da Vercel).
// A chave fica em process.env.API_FOOTBALL_KEY (NUNCA exposta ao navegador).
// Arquivos começando com "_" não viram rota na Vercel.
// ============================================================

export const API_BASE = 'https://v3.football.api-sports.io';
export const WC_LEAGUE = 1;      // World Cup
export const WC_SEASON = 2026;

// Nome em PT (como está no nosso banco) -> nome(s) em inglês usados pela API-Football.
// A primeira opção é a principal; as demais são apelidos pra casar com variações.
export const TEAM_EN = {
  'México': ['Mexico'], 'África do Sul': ['South Africa'], 'Coreia do Sul': ['South Korea', 'Korea Republic'],
  'Rep. Tcheca': ['Czech Republic', 'Czechia'], 'Canadá': ['Canada'], 'Bósnia e Herzegovina': ['Bosnia and Herzegovina', 'Bosnia'],
  'Catar': ['Qatar'], 'Suíça': ['Switzerland'], 'Brasil': ['Brazil'], 'Marrocos': ['Morocco'], 'Haiti': ['Haiti'],
  'Escócia': ['Scotland'], 'Estados Unidos': ['USA', 'United States'], 'Paraguai': ['Paraguay'], 'Austrália': ['Australia'],
  'Turquia': ['Turkey', 'Turkiye', 'Türkiye'], 'Alemanha': ['Germany'], 'Curaçao': ['Curacao'],
  'Costa do Marfim': ['Ivory Coast', 'Cote d\'Ivoire'], 'Equador': ['Ecuador'], 'Holanda': ['Netherlands'],
  'Japão': ['Japan'], 'Suécia': ['Sweden'], 'Tunísia': ['Tunisia'], 'Bélgica': ['Belgium'], 'Egito': ['Egypt'],
  'Irã': ['Iran'], 'Nova Zelândia': ['New Zealand'], 'Espanha': ['Spain'], 'Cabo Verde': ['Cape Verde Islands', 'Cape Verde'],
  'Arábia Saudita': ['Saudi Arabia'], 'Uruguai': ['Uruguay'], 'França': ['France'], 'Senegal': ['Senegal'],
  'Iraque': ['Iraq'], 'Noruega': ['Norway'], 'Argentina': ['Argentina'], 'Argélia': ['Algeria'], 'Áustria': ['Austria'],
  'Jordânia': ['Jordan'], 'Portugal': ['Portugal'], 'RD Congo': ['DR Congo', 'Congo DR'], 'Uzbequistão': ['Uzbekistan'],
  'Colômbia': ['Colombia'], 'Inglaterra': ['England'], 'Croácia': ['Croatia'], 'Panamá': ['Panama'], 'Gana': ['Ghana'],
};

export const norm = (s) => (s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

// Casa o nome de um time vindo da API (inglês) com nosso nome em PT.
export function matchesTeam(ptName, apiName) {
  const a = norm(apiName);
  if (!a) return false;
  const cands = [ptName, ...(TEAM_EN[ptName] || [])].map(norm);
  return cands.some((c) => c && (c === a || a.includes(c) || c.includes(a)));
}

// Chamada à API-Football. Retorna o array `response` ou lança erro claro.
export async function apiGet(path, params = {}) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) { const e = new Error('NO_KEY'); e.code = 'NO_KEY'; throw e; }
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.set(k, v); });
  const r = await fetch(url, { headers: { 'x-apisports-key': key } });
  if (!r.ok) { const e = new Error(`API ${r.status}`); e.code = 'API_ERR'; throw e; }
  const j = await r.json();
  if (j.errors && Object.keys(j.errors).length) {
    const e = new Error(JSON.stringify(j.errors)); e.code = 'API_ERR'; throw e;
  }
  return j.response || [];
}

// Resposta de erro padronizada pro front saber o que dizer.
export function sendErr(res, err) {
  if (err.code === 'NO_KEY') {
    return res.status(503).json({ error: 'no_key', message: 'A chave da API ainda não foi configurada na Vercel.' });
  }
  return res.status(502).json({ error: 'api', message: 'Não consegui falar com a API de dados agora.' });
}
