-- ============================================================
-- BOLÃO DA COPA 2026 — corrigir horário de um jogo
-- Cole no SQL Editor do Supabase e RUN. Seguro rodar mais de uma vez.
-- Permite ao organizador ajustar o kickoff de um jogo já cadastrado
-- (ex.: jogo do mata-mata cadastrado com horário errado, que por isso
-- não deixa lançar resultado nem trava o palpite corretamente).
-- ============================================================
create or replace function public.set_match_kickoff(p_name text, p_pin text, p_match text, p_kickoff timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare u users;
begin
  u := _auth(p_name, p_pin);
  if not u.is_admin then raise exception 'Só o organizador pode ajustar o horário.'; end if;
  update matches set kickoff = p_kickoff where id = p_match;
  if not found then raise exception 'Jogo não encontrado.'; end if;
end $$;

grant execute on function public.set_match_kickoff(text, text, text, timestamptz) to anon, authenticated;
