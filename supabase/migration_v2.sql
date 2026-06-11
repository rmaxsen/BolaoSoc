-- ============================================================
-- BOLÃO DA COPA 2026 — MIGRAÇÃO v2
-- Cole este arquivo INTEIRO no SQL Editor do Supabase e clique RUN.
-- Adiciona: palpite de campeão (5 pts), campeão oficial do torneio,
-- e a função do admin forçar/repor palpite de qualquer um.
-- É seguro rodar mais de uma vez (idempotente).
-- ============================================================

-- ---------- CONFIG DO TORNEIO (campeão oficial, para pontuar o bônus) ----------
create table if not exists public.tournament (
  id int primary key default 1,
  champion text,
  updated_at timestamptz not null default now(),
  constraint tournament_singleton check (id = 1)
);
insert into public.tournament (id, champion) values (1, null) on conflict (id) do nothing;

alter table public.tournament enable row level security;
drop policy if exists "tournament_read" on public.tournament;
create policy "tournament_read" on public.tournament for select using (true);

-- ---------- PALPITE DE CAMPEÃO (cada um escolhe 1 seleção, vale 5 pts) ----------
create table if not exists public.champion_picks (
  user_slug text primary key references public.users(slug) on delete cascade,
  team text not null,
  saved_at timestamptz not null default now()
);
alter table public.champion_picks enable row level security;
drop policy if exists "champion_picks_read" on public.champion_picks;
create policy "champion_picks_read" on public.champion_picks for select using (true);

-- Salva/atualiza o palpite de campeão. Fecha em 21/06/2026 23:59 (Brasília).
create or replace function public.set_champion(p_name text, p_pin text, p_team text)
returns void language plpgsql security definer set search_path = public as $$
declare u users;
begin
  u := _auth(p_name, p_pin);
  if length(trim(coalesce(p_team, ''))) < 2 then raise exception 'Escolha um time.'; end if;
  if now() >= timestamptz '2026-06-21 23:59:59-03' then
    raise exception 'O palpite de campeão já fechou (fechou em 21/06).';
  end if;
  insert into champion_picks (user_slug, team, saved_at)
  values (u.slug, trim(p_team), now())
  on conflict (user_slug) do update set team = excluded.team, saved_at = now();
end $$;

-- Organizador define o campeão oficial do mundo (para pontuar os 5 pts no fim).
create or replace function public.set_world_champion(p_name text, p_pin text, p_team text)
returns void language plpgsql security definer set search_path = public as $$
declare u users;
begin
  u := _auth(p_name, p_pin);
  if not u.is_admin then raise exception 'Só o organizador pode definir o campeão.'; end if;
  update tournament set champion = nullif(trim(coalesce(p_team, '')), ''), updated_at = now() where id = 1;
end $$;

-- Organizador FORÇA o palpite de QUALQUER participante em QUALQUER jogo,
-- ignorando a janela de tempo (para repor palpites perdidos / corrigir).
-- null/null apaga o palpite daquele participante naquele jogo.
create or replace function public.admin_force_pick(p_name text, p_pin text, p_target text, p_match text, p_home int, p_away int)
returns void language plpgsql security definer set search_path = public as $$
declare u users; t users; m matches;
begin
  u := _auth(p_name, p_pin);
  if not u.is_admin then raise exception 'Só o organizador pode forçar palpites.'; end if;
  select * into t from users where slug = _slugify(p_target);
  if not found then raise exception 'Participante não encontrado.'; end if;
  select * into m from matches where id = p_match;
  if not found then raise exception 'Jogo não encontrado.'; end if;
  if p_home is null or p_away is null then
    delete from picks where user_slug = t.slug and match_id = m.id;
    return;
  end if;
  if p_home < 0 or p_away < 0 or p_home > 99 or p_away > 99 then raise exception 'Placar inválido.'; end if;
  insert into picks (user_slug, match_id, home, away, saved_at)
  values (t.slug, m.id, p_home, p_away, now())
  on conflict (user_slug, match_id) do update set home = excluded.home, away = excluded.away, saved_at = now();
end $$;

grant execute on function
  public.set_champion(text, text, text),
  public.set_world_champion(text, text, text),
  public.admin_force_pick(text, text, text, text, int, int)
to anon, authenticated;
