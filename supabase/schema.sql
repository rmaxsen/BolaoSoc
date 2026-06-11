-- ============================================================
-- BOLÃO DA COPA 2026 — banco de dados (Supabase / Postgres)
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique RUN.
-- Regras: placar exato 3 pts | vencedor/empate 1 pt
-- Palpite abre 24h antes e fecha 15 min antes — VALIDADO NO SERVIDOR.
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists unaccent;

-- ---------- TABELAS ----------
create table if not exists public.users (
  slug text primary key,
  name text not null,
  pin_hash text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id text primary key,
  grp text,
  home text not null,
  away text not null,
  kickoff timestamptz not null,
  city text,
  phase text not null default 'Grupos',
  is_seed boolean not null default true
);

create table if not exists public.picks (
  user_slug text not null references public.users(slug) on delete cascade,
  match_id text not null references public.matches(id) on delete cascade,
  home int not null check (home between 0 and 99),
  away int not null check (away between 0 and 99),
  saved_at timestamptz not null default now(),
  primary key (user_slug, match_id)
);

create table if not exists public.results (
  match_id text primary key references public.matches(id) on delete cascade,
  home int not null check (home between 0 and 99),
  away int not null check (away between 0 and 99),
  updated_at timestamptz not null default now()
);

-- ---------- SEGURANÇA (RLS) ----------
-- Leitura pública de jogos, palpites e resultados; escrita SÓ pelas funções abaixo.
alter table public.users enable row level security;
alter table public.matches enable row level security;
alter table public.picks enable row level security;
alter table public.results enable row level security;

drop policy if exists "matches_read" on public.matches;
create policy "matches_read" on public.matches for select using (true);
drop policy if exists "picks_read" on public.picks;
create policy "picks_read" on public.picks for select using (true);
drop policy if exists "results_read" on public.results;
create policy "results_read" on public.results for select using (true);
-- users: nenhuma policy de select => tabela invisível (protege o hash do PIN).

-- Visão pública dos participantes (sem o hash do PIN)
create or replace view public.participants as
  select slug, name, is_admin, created_at from public.users;
grant select on public.participants to anon, authenticated;

-- ---------- FUNÇÕES AUXILIARES ----------
create or replace function public._slugify(p text)
returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(unaccent(p)), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function public._auth(p_name text, p_pin text)
returns public.users
language plpgsql security definer set search_path = public as $$
declare u public.users;
begin
  select * into u from users where slug = _slugify(p_name);
  if not found then raise exception 'Conta não encontrada. Confira o nome.'; end if;
  if u.pin_hash <> crypt(p_pin, u.pin_hash) then raise exception 'PIN incorreto.'; end if;
  return u;
end $$;

-- ---------- FUNÇÕES PÚBLICAS (RPC) ----------
create or replace function public.register_user(p_name text, p_pin text)
returns json language plpgsql security definer set search_path = public as $$
declare v_slug text; v_admin boolean;
begin
  if length(trim(p_name)) < 2 then raise exception 'Digite seu nome (mínimo 2 letras).'; end if;
  if p_pin !~ '^[0-9]{4,6}$' then raise exception 'O PIN deve ter de 4 a 6 números.'; end if;
  v_slug := _slugify(p_name);
  if v_slug = '' then raise exception 'Nome inválido.'; end if;
  if exists (select 1 from users where slug = v_slug) then
    raise exception 'Esse nome já está no bolão. Se for você, use Entrar.';
  end if;
  v_admin := not exists (select 1 from users);
  insert into users (slug, name, pin_hash, is_admin)
  values (v_slug, trim(p_name), crypt(p_pin, gen_salt('bf')), v_admin);
  return json_build_object('slug', v_slug, 'name', trim(p_name), 'is_admin', v_admin);
end $$;

create or replace function public.login_user(p_name text, p_pin text)
returns json language plpgsql security definer set search_path = public as $$
declare u users;
begin
  u := _auth(p_name, p_pin);
  return json_build_object('slug', u.slug, 'name', u.name, 'is_admin', u.is_admin);
end $$;

-- Salva vários palpites de uma vez. A JANELA É VALIDADA AQUI, COM O RELÓGIO DO SERVIDOR.
create or replace function public.save_picks(p_name text, p_pin text, p_picks jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare u users; item jsonb; m matches; v_h int; v_a int; v_count int := 0;
begin
  u := _auth(p_name, p_pin);
  for item in select * from jsonb_array_elements(p_picks) loop
    select * into m from matches where id = item->>'id';
    if not found then continue; end if;
    if now() < m.kickoff - interval '24 hours' then
      raise exception 'O palpite de % x % ainda não abriu (abre 24h antes).', m.home, m.away;
    end if;
    if now() >= m.kickoff - interval '15 minutes' then
      raise exception 'O palpite de % x % já fechou (fecha 15 min antes).', m.home, m.away;
    end if;
    v_h := (item->>'h')::int; v_a := (item->>'a')::int;
    if v_h is null or v_a is null or v_h < 0 or v_a < 0 or v_h > 99 or v_a > 99 then
      raise exception 'Placar inválido.';
    end if;
    insert into picks (user_slug, match_id, home, away, saved_at)
    values (u.slug, m.id, v_h, v_a, now())
    on conflict (user_slug, match_id)
    do update set home = excluded.home, away = excluded.away, saved_at = now();
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- Organizador lança (ou apaga, passando null) o resultado. Só após o jogo começar.
create or replace function public.set_result(p_name text, p_pin text, p_match text, p_home int, p_away int)
returns void language plpgsql security definer set search_path = public as $$
declare u users; m matches;
begin
  u := _auth(p_name, p_pin);
  if not u.is_admin then raise exception 'Só o organizador pode lançar resultados.'; end if;
  select * into m from matches where id = p_match;
  if not found then raise exception 'Jogo não encontrado.'; end if;
  if now() < m.kickoff then raise exception 'Esse jogo ainda não começou.'; end if;
  if p_home is null or p_away is null then
    delete from results where match_id = p_match;
  else
    insert into results (match_id, home, away) values (p_match, p_home, p_away)
    on conflict (match_id) do update set home = excluded.home, away = excluded.away, updated_at = now();
  end if;
end $$;

-- Organizador cadastra jogos do mata-mata
create or replace function public.add_match(p_name text, p_pin text, p_phase text, p_home text, p_away text, p_kickoff timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare u users; v_id text;
begin
  u := _auth(p_name, p_pin);
  if not u.is_admin then raise exception 'Só o organizador pode cadastrar jogos.'; end if;
  if length(trim(p_home)) < 2 or length(trim(p_away)) < 2 then raise exception 'Informe os dois times.'; end if;
  v_id := 'x' || floor(extract(epoch from clock_timestamp()) * 1000)::text;
  insert into matches (id, grp, home, away, kickoff, city, phase, is_seed)
  values (v_id, '', trim(p_home), trim(p_away), p_kickoff, '', p_phase, false);
  return v_id;
end $$;

create or replace function public.delete_match(p_name text, p_pin text, p_match text)
returns void language plpgsql security definer set search_path = public as $$
declare u users;
begin
  u := _auth(p_name, p_pin);
  if not u.is_admin then raise exception 'Só o organizador pode remover jogos.'; end if;
  delete from matches where id = p_match and is_seed = false;
end $$;

-- Organizador reseta o PIN de quem esqueceu
create or replace function public.reset_pin(p_name text, p_pin text, p_target text, p_new_pin text)
returns void language plpgsql security definer set search_path = public as $$
declare u users;
begin
  u := _auth(p_name, p_pin);
  if not u.is_admin then raise exception 'Só o organizador pode resetar PIN.'; end if;
  if p_new_pin !~ '^[0-9]{4,6}$' then raise exception 'O novo PIN deve ter de 4 a 6 números.'; end if;
  update users set pin_hash = crypt(p_new_pin, gen_salt('bf')) where slug = _slugify(p_target);
  if not found then raise exception 'Participante não encontrado.'; end if;
end $$;

grant execute on function
  public.register_user(text, text),
  public.login_user(text, text),
  public.save_picks(text, text, jsonb),
  public.set_result(text, text, text, int, int),
  public.add_match(text, text, text, text, text, timestamptz),
  public.delete_match(text, text, text),
  public.reset_pin(text, text, text, text)
to anon, authenticated;

-- ============================================================
-- TABELA OFICIAL — fase de grupos (horários de Brasília, UTC-3)
-- ============================================================
insert into public.matches (id, grp, home, away, kickoff, city) values
('m01','A','México','África do Sul','2026-06-11 16:00:00-03','Cidade do México'),
('m02','A','Coreia do Sul','Rep. Tcheca','2026-06-11 23:00:00-03','Guadalajara'),
('m03','B','Canadá','Bósnia e Herzegovina','2026-06-12 16:00:00-03','Toronto'),
('m04','D','Estados Unidos','Paraguai','2026-06-12 22:00:00-03','Los Angeles'),
('m05','D','Austrália','Turquia','2026-06-13 01:00:00-03','Vancouver'),
('m06','B','Catar','Suíça','2026-06-13 16:00:00-03','San Francisco'),
('m07','C','Brasil','Marrocos','2026-06-13 19:00:00-03','Nova York/NJ'),
('m08','C','Haiti','Escócia','2026-06-13 22:00:00-03','Boston'),
('m09','E','Alemanha','Curaçao','2026-06-14 14:00:00-03','Houston'),
('m10','F','Holanda','Japão','2026-06-14 17:00:00-03','Dallas'),
('m11','E','Costa do Marfim','Equador','2026-06-14 20:00:00-03','Filadélfia'),
('m12','F','Suécia','Tunísia','2026-06-14 23:00:00-03','Monterrey'),
('m13','H','Espanha','Cabo Verde','2026-06-15 13:00:00-03','Atlanta'),
('m14','G','Bélgica','Egito','2026-06-15 16:00:00-03','Seattle'),
('m15','H','Arábia Saudita','Uruguai','2026-06-15 19:00:00-03','Miami'),
('m16','G','Irã','Nova Zelândia','2026-06-15 22:00:00-03','Los Angeles'),
('m17','J','Argentina','Argélia','2026-06-16 14:00:00-03','Kansas City'),
('m18','I','França','Senegal','2026-06-16 16:00:00-03','Nova York/NJ'),
('m19','I','Iraque','Noruega','2026-06-16 19:00:00-03','Boston'),
('m20','J','Áustria','Jordânia','2026-06-17 01:00:00-03','San Francisco'),
('m21','K','Portugal','RD Congo','2026-06-17 14:00:00-03','Houston'),
('m22','L','Inglaterra','Croácia','2026-06-17 17:00:00-03','Dallas'),
('m23','L','Gana','Panamá','2026-06-17 20:00:00-03','Toronto'),
('m24','K','Uzbequistão','Colômbia','2026-06-17 23:00:00-03','Cidade do México'),
('m25','A','Rep. Tcheca','África do Sul','2026-06-18 13:00:00-03','Atlanta'),
('m26','B','Suíça','Bósnia e Herzegovina','2026-06-18 16:00:00-03','Los Angeles'),
('m27','B','Canadá','Catar','2026-06-18 19:00:00-03','Vancouver'),
('m28','A','México','Coreia do Sul','2026-06-18 22:00:00-03','Guadalajara'),
('m29','D','Turquia','Paraguai','2026-06-19 01:00:00-03','San Francisco'),
('m30','D','Estados Unidos','Austrália','2026-06-19 16:00:00-03','Seattle'),
('m31','C','Escócia','Marrocos','2026-06-19 19:00:00-03','Boston'),
('m32','C','Brasil','Haiti','2026-06-19 22:00:00-03','Filadélfia'),
('m33','F','Holanda','Suécia','2026-06-20 14:00:00-03','Houston'),
('m34','E','Alemanha','Costa do Marfim','2026-06-20 17:00:00-03','Toronto'),
('m35','E','Equador','Curaçao','2026-06-20 21:00:00-03','Kansas City'),
('m36','F','Tunísia','Japão','2026-06-21 01:00:00-03','Monterrey'),
('m37','H','Espanha','Arábia Saudita','2026-06-21 13:00:00-03','Atlanta'),
('m38','G','Bélgica','Irã','2026-06-21 16:00:00-03','Los Angeles'),
('m39','H','Uruguai','Cabo Verde','2026-06-21 19:00:00-03','Miami'),
('m40','G','Nova Zelândia','Egito','2026-06-21 22:00:00-03','Vancouver'),
('m41','J','Argentina','Áustria','2026-06-22 14:00:00-03','Dallas'),
('m42','I','França','Iraque','2026-06-22 18:00:00-03','Filadélfia'),
('m43','I','Noruega','Senegal','2026-06-22 21:00:00-03','Nova York/NJ'),
('m44','J','Jordânia','Argélia','2026-06-23 00:00:00-03','San Francisco'),
('m45','K','Portugal','Uzbequistão','2026-06-23 14:00:00-03','Houston'),
('m46','L','Inglaterra','Gana','2026-06-23 17:00:00-03','Boston'),
('m47','L','Panamá','Croácia','2026-06-23 20:00:00-03','Toronto'),
('m48','K','Colômbia','RD Congo','2026-06-23 23:00:00-03','Guadalajara'),
('m49','B','Suíça','Canadá','2026-06-24 16:00:00-03','Vancouver'),
('m50','B','Bósnia e Herzegovina','Catar','2026-06-24 16:00:00-03','Seattle'),
('m51','C','Escócia','Brasil','2026-06-24 19:00:00-03','Miami'),
('m52','C','Marrocos','Haiti','2026-06-24 19:00:00-03','Atlanta'),
('m53','A','Rep. Tcheca','México','2026-06-24 22:00:00-03','Cidade do México'),
('m54','A','África do Sul','Coreia do Sul','2026-06-24 22:00:00-03','Monterrey'),
('m55','E','Equador','Alemanha','2026-06-25 17:00:00-03','Nova York/NJ'),
('m56','E','Curaçao','Costa do Marfim','2026-06-25 17:00:00-03','Filadélfia'),
('m57','F','Japão','Suécia','2026-06-25 20:00:00-03','Dallas'),
('m58','F','Tunísia','Holanda','2026-06-25 20:00:00-03','Kansas City'),
('m59','D','Turquia','Estados Unidos','2026-06-25 23:00:00-03','Los Angeles'),
('m60','D','Paraguai','Austrália','2026-06-25 23:00:00-03','San Francisco'),
('m61','I','Noruega','França','2026-06-26 16:00:00-03','Boston'),
('m62','I','Senegal','Iraque','2026-06-26 16:00:00-03','Toronto'),
('m63','H','Cabo Verde','Arábia Saudita','2026-06-26 21:00:00-03','Houston'),
('m64','H','Uruguai','Espanha','2026-06-26 21:00:00-03','Guadalajara'),
('m65','G','Egito','Irã','2026-06-27 00:00:00-03','Seattle'),
('m66','G','Nova Zelândia','Bélgica','2026-06-27 00:00:00-03','Vancouver'),
('m67','L','Panamá','Inglaterra','2026-06-27 18:00:00-03','Nova York/NJ'),
('m68','L','Croácia','Gana','2026-06-27 18:00:00-03','Filadélfia'),
('m69','K','Colômbia','Portugal','2026-06-27 20:30:00-03','Miami'),
('m70','K','RD Congo','Uzbequistão','2026-06-27 20:30:00-03','Atlanta'),
('m71','J','Argélia','Áustria','2026-06-27 23:00:00-03','Kansas City'),
('m72','J','Jordânia','Argentina','2026-06-27 23:00:00-03','Dallas')
on conflict (id) do nothing;
