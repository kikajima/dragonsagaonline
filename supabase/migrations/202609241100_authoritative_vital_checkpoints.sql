-- Server-authoritative vital checkpoints.
// Persists HP/Ki and defeat/respawn position, and removes direct browser HP/Ki writes.

create or replace function private.apply_vital_checkpoint_impl(
  p_character_id uuid,
  p_action text,
  p_hp integer,
  p_ki integer,
  p_x double precision,
  p_y double precision,
  p_server_secret text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_secret text;
  v_user_id uuid;
  v_level integer;
  v_xp bigint;
  v_gold bigint;
  v_state jsonb;
  v_hp integer;
  v_ki integer;
begin
  select value into v_secret
  from private.game_server_config
  where key = 'pve_server_secret';

  if v_secret is null or p_server_secret is null or p_server_secret <> v_secret then
    raise exception 'invalid server credential' using errcode = '42501';
  end if;

  select user_id, level, xp, gold, coalesce(state, '{}'::jsonb)
  into v_user_id, v_level, v_xp, v_gold, v_state
  from public.characters
  where id = p_character_id
  for update;

  if v_user_id is null or v_user_id <> auth.uid() then
    raise exception 'character not owned by authenticated user' using errcode = '42501';
  end if;

  if p_action not in ('checkpoint','fountain_heal','pve_defeat','pvp_respawn') then
    raise exception 'invalid vital action';
  end if;

  v_hp := greatest(1, p_hp);
  v_ki := greatest(0, p_ki);

  if p_action = 'pve_defeat' then
    v_gold := floor(v_gold / 2.0);
  end if;

  v_state := jsonb_set(v_state, '{lv}', to_jsonb(v_level), true);
  v_state := jsonb_set(v_state, '{exp}', to_jsonb(v_xp), true);
  v_state := jsonb_set(v_state, '{zeni}', to_jsonb(v_gold), true);
  v_state := jsonb_set(v_state, '{hp}', to_jsonb(v_hp), true);
  v_state := jsonb_set(v_state, '{ki}', to_jsonb(v_ki), true);
  v_state := jsonb_set(v_state, '{x}', to_jsonb(p_x), true);
  v_state := jsonb_set(v_state, '{y}', to_jsonb(p_y), true);

  update public.characters
  set hp = v_hp, ki = v_ki, gold = v_gold, x = p_x, y = p_y,
      state = v_state, last_played_at = now(), updated_at = now()
  where id = p_character_id;

  return jsonb_build_object(
    'id', p_character_id, 'level', v_level, 'xp', v_xp, 'gold', v_gold,
    'hp', v_hp, 'ki', v_ki, 'x', p_x, 'y', p_y, 'state', v_state
  );
end;
$$;

revoke all on function private.apply_vital_checkpoint_impl(
  uuid, text, integer, integer, double precision, double precision, text
) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.apply_vital_checkpoint_impl(
  uuid, text, integer, integer, double precision, double precision, text
) to authenticated;

create or replace function public.apply_vital_checkpoint(
  p_character_id uuid, p_action text, p_hp integer, p_ki integer,
  p_x double precision, p_y double precision, p_server_secret text
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public, private
as $$
  select private.apply_vital_checkpoint_impl(
    p_character_id, p_action, p_hp, p_ki, p_x, p_y, p_server_secret
  );
$$;

revoke all on function public.apply_vital_checkpoint(
  uuid, text, integer, integer, double precision, double precision, text
) from public, anon;
grant execute on function public.apply_vital_checkpoint(
  uuid, text, integer, integer, double precision, double precision, text
) to authenticated;

revoke update(hp, ki) on public.characters from authenticated;
