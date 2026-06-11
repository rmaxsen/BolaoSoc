# ⚽ Bolão da Copa 2026 — site definitivo

Bolão entre amigos com os 72 jogos da fase de grupos já cadastrados, mata-mata pelo painel do organizador, ranking automático e **trava de palpites validada no servidor** (abre 24h antes, fecha 15 min antes — impossível burlar pelo navegador).

**Stack:** React + Vite (front, hospedado no Vercel) · Supabase (banco Postgres). Tudo no plano gratuito.

---

## Passo a passo do deploy (±30 min)

### 1) Criar o banco no Supabase (~10 min)

1. Acesse **supabase.com** → login (pode usar a conta GitHub) → **New project**
2. Preencha: nome `bolao-copa-2026`, uma senha forte de banco (guarde, mas não vai usar no dia a dia), região **South America (São Paulo)** → **Create**
3. Espere o projeto provisionar (~2 min)
4. No menu lateral, abra **SQL Editor** → **New query** → cole o conteúdo INTEIRO do arquivo `supabase/schema.sql` → **Run**
   - Deve terminar com "Success". Isso cria as tabelas, as regras de segurança e já insere os 72 jogos
5. Ainda no Supabase: **Project Settings (engrenagem) → API**. Anote dois valores:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - **anon public key** (um texto longo começando com `eyJ...`)

### 2) Subir o código no GitHub (~5 min)

1. Crie um repositório novo na sua conta (ex: `bolao-copa-2026`), privado ou público
2. Suba todos os arquivos desta pasta (pode arrastar pelo site do GitHub: **Add file → Upload files**)
   - ⚠️ NÃO suba arquivo `.env` com chaves (o `.gitignore` já protege)

### 3) Publicar no Vercel (~10 min)

1. Acesse **vercel.com** → login com GitHub → **Add New → Project**
2. **Import** o repositório `bolao-copa-2026`
3. O Vercel detecta Vite sozinho. Antes de clicar em Deploy, abra **Environment Variables** e adicione:
   - `VITE_SUPABASE_URL` = o Project URL do passo 1.5
   - `VITE_SUPABASE_ANON_KEY` = a anon public key do passo 1.5
4. **Deploy** → em ~1 min você ganha um link fixo tipo `bolao-copa-2026.vercel.app`

### 4) Estreia

1. Abra o link, **crie sua conta primeiro** — o primeiro cadastrado vira o organizador 👑 (lança resultados, cadastra mata-mata, reseta PIN de quem esquecer)
2. Mande o link no grupo. Esse link **nunca muda**, mesmo se você atualizar o código depois

---

## Perguntas frequentes

**É seguro mesmo?** A janela do palpite e as permissões do organizador são verificadas pelo banco de dados, com o relógio do servidor. Mexer no relógio do celular ou no código da página não engana o banco. PINs são guardados com hash bcrypt (nem você consegue ler o PIN de alguém — só resetar).

**Quanto custa?** Nada, nos planos gratuitos de Vercel e Supabase. Obs.: no plano free o Supabase pausa projetos sem uso por ~1 semana; durante a Copa ele será usado todo dia, então não pausa. Depois da final, se quiser manter o histórico no ar, basta abrir o site de vez em quando ou reativar no painel.

**Como atualizo o site depois?** Edite os arquivos no GitHub (ou peça o código novo pro Claude e substitua) → o Vercel redeploya sozinho a cada commit → mesmo link, dados intactos.

**A anon key pode ficar exposta no site?** Pode — ela é pública por design. O que protege os dados são as policies (RLS) e as funções do banco criadas pelo `schema.sql`.

**Mata-mata:** quando os cruzamentos saírem, cadastre os jogos em Admin → "Adicionar jogo do mata-mata" com data/hora de Brasília. Vale placar do tempo normal + prorrogação (sem pênaltis) — combine isso com o grupo.

**Rodando local (opcional):** `npm install` → crie `.env` baseado no `.env.example` → `npm run dev`.
