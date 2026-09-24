-- Restrict browser writes to character progression.
-- Sensitive progression columns are controlled by server-authoritative RPCs.

create or replace function private.create_character_client_impl(
  p_name text,
  p_class_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_hp integer;
  v_ki integer;
  v_row public.characters;
  v_state jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if char_length(v_name) < 2 or char_length(v_name) > 12 then
    raise exception 'character name must have 2 to 12 characters';
  end if;

  case p_class_id
    when 'saiya' then v_hp := 120; v_ki := 40;
    when 'humano' then v_hp := 100; v_ki := 45;
    when 'nameko' then v_hp := 110; v_ki := 55;
    when 'lutadora' then v_hp := 95; v_ki := 50;
    else raise exception 'invalid class';
  end case;

  v_state := jsonb_build_object(
    'name', v_name,
    'classId', p_class_id,
    'lv', 1,
    'exp', 0,
    'hp', v_hp,
    'ki', v_ki,
    'zeni', 300,
    'baseAtk', 0,
    'baseDef', 0,
    'items', jsonb_build_object('sensu', 3, 'capsula', 2),
    'gearOwned', '[]'::jsonb,
    'balls', '[]'::jsonb,
    'questIdx', 0,
    'questProgress', 0,
    'flags', '{}'::jsonb,
    'x', 312,
    'y', 696
  );

  insert into public.characters(
    user_id, name, class_id, level, xp, hp, ki, gold,
    map_id, x, y, state, last_played_at
  )
  values (
    v_user_id, v_name, p_class_id, 1, 0, v_hp, v_ki, 300,
    'world', 312, 696, v_state, now()
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function private.create_character_client_impl(text, text)
from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.create_character_client_impl(text, text)
to authenticated;

create or replace function public.create_character_client(
  p_name text,
  p_class_id text
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public, private
as $$
  select private.create_character_client_impl(p_name, p_class_id);
$$;

revoke all on function public.create_character_client(text, text)
from public, anon;
grant execute on function public.create_character_client(text, text)
to authenticated;

revoke insert on public.characters from authenticated;
revoke update on public.characters from authenticated;

grant update (
  hp,
  ki,
  map_id,
  x,
  y,
  state,
  last_played_at
) on public.characters to authenticated;
