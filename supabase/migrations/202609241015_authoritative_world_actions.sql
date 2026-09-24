-- Server-authoritative world actions for shop, consumables, Dragon Balls,
-- wishes, and the introductory master quest.

create or replace function private.apply_world_action_impl(
  p_character_id uuid,
  p_action text,
  p_arg text,
  p_hp integer,
  p_ki integer,
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
  v_items jsonb;
  v_gear jsonb;
  v_balls jsonb;
  v_flags jsonb;
  v_qty integer;
  v_price integer;
  v_kind text;
  v_threshold bigint;
  v_quest_idx integer;
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

  v_items := coalesce(v_state -> 'items', '{}'::jsonb);
  v_gear := coalesce(v_state -> 'gearOwned', '[]'::jsonb);
  v_balls := coalesce(v_state -> 'balls', '[]'::jsonb);
  v_flags := coalesce(v_state -> 'flags', '{}'::jsonb);
  v_quest_idx := coalesce((v_state ->> 'questIdx')::integer, 0);

  if p_action = 'shop_buy' then
    case p_arg
      when 'sensu' then v_price := 50; v_kind := 'item';
      when 'capsula' then v_price := 80; v_kind := 'item';
      when 'elixir' then v_price := 500; v_kind := 'item';
      when 'bastao' then v_price := 600; v_kind := 'gear';
      when 'armadura' then v_price := 600; v_kind := 'gear';
      when 'scouter' then v_price := 300; v_kind := 'gear';
      when 'espada' then v_price := 4000; v_kind := 'gear';
      when 'manto' then v_price := 3500; v_kind := 'gear';
      else raise exception 'invalid shop item';
    end case;

    if v_gold < v_price then raise exception 'not enough zeni'; end if;

    if v_kind = 'gear' then
      if v_gear @> to_jsonb(array[p_arg]::text[]) then
        raise exception 'gear already owned';
      end if;
      v_gear := v_gear || to_jsonb(p_arg);
      v_state := jsonb_set(v_state, '{gearOwned}', v_gear, true);
    else
      v_qty := coalesce((v_items ->> p_arg)::integer, 0) + 1;
      v_items := jsonb_set(v_items, array[p_arg], to_jsonb(v_qty), true);
      v_state := jsonb_set(v_state, '{items}', v_items, true);
    end if;

    v_gold := v_gold - v_price;

  elsif p_action = 'world_item' then
    if p_arg not in ('sensu','capsula','elixir') then raise exception 'invalid consumable'; end if;
    v_qty := coalesce((v_items ->> p_arg)::integer, 0);
    if v_qty <= 0 then raise exception 'item unavailable'; end if;
    v_items := jsonb_set(v_items, array[p_arg], to_jsonb(v_qty - 1), true);
    v_state := jsonb_set(v_state, '{items}', v_items, true);

  elsif p_action = 'collect_ball' then
    if p_arg not in ('13,28','30,22','25,55','47,50','58,28','90,75','40,16') then
      raise exception 'invalid dragon ball';
    end if;
    if v_balls @> to_jsonb(array[p_arg]::text[]) then raise exception 'dragon ball already collected'; end if;
    v_balls := v_balls || to_jsonb(p_arg);
    v_state := jsonb_set(v_state, '{balls}', v_balls, true);

  elsif p_action = 'wish' then
    if jsonb_array_length(v_balls) < 7 then raise exception 'seven dragon balls required'; end if;
    if p_arg = 'atk' then
      v_state := jsonb_set(v_state, '{baseAtk}', to_jsonb(coalesce((v_state ->> 'baseAtk')::integer, 0) + 30), true);
    elsif p_arg = 'def' then
      v_state := jsonb_set(v_state, '{baseDef}', to_jsonb(coalesce((v_state ->> 'baseDef')::integer, 0) + 30), true);
    elsif p_arg = 'zeni' then
      v_gold := v_gold + 5000;
    else
      raise exception 'invalid wish';
    end if;
    v_state := jsonb_set(v_state, '{balls}', '[]'::jsonb, true);
    v_state := jsonb_set(v_state, '{wishCount}', to_jsonb(coalesce((v_state ->> 'wishCount')::integer, 0) + 1), true);

  elsif p_action = 'master_quest' then
    if v_quest_idx <> 0 then raise exception 'master quest is not active'; end if;
    v_xp := v_xp + 50;
    v_gold := v_gold + 500;
    v_state := jsonb_set(v_state, '{questIdx}', '1'::jsonb, true);
    v_state := jsonb_set(v_state, '{questProgress}', '0'::jsonb, true);
    v_state := jsonb_set(v_state, '{flags}', v_flags || '{"kurin": true}'::jsonb, true);

  else
    raise exception 'invalid world action';
  end if;

  loop
    v_threshold := v_level::bigint * v_level::bigint * 25 + v_level::bigint * 25;
    exit when v_xp < v_threshold;
    v_xp := v_xp - v_threshold;
    v_level := v_level + 1;
  end loop;

  v_state := jsonb_set(v_state, '{lv}', to_jsonb(v_level), true);
  v_state := jsonb_set(v_state, '{exp}', to_jsonb(v_xp), true);
  v_state := jsonb_set(v_state, '{zeni}', to_jsonb(v_gold), true);
  v_state := jsonb_set(v_state, '{hp}', to_jsonb(greatest(1, p_hp)), true);
  v_state := jsonb_set(v_state, '{ki}', to_jsonb(greatest(0, p_ki)), true);

  update public.characters
  set level = v_level, xp = v_xp, gold = v_gold,
      hp = greatest(1, p_hp), ki = greatest(0, p_ki),
      state = v_state, last_played_at = now(), updated_at = now()
  where id = p_character_id;

  return jsonb_build_object(
    'id', p_character_id, 'level', v_level, 'xp', v_xp, 'gold', v_gold,
    'hp', greatest(1, p_hp), 'ki', greatest(0, p_ki), 'state', v_state
  );
end;
$$;

revoke all on function private.apply_world_action_impl(uuid, text, text, integer, integer, text)
from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.apply_world_action_impl(uuid, text, text, integer, integer, text)
to authenticated;

create or replace function public.apply_world_action(
  p_character_id uuid, p_action text, p_arg text,
  p_hp integer, p_ki integer, p_server_secret text
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public, private
as $$
  select private.apply_world_action_impl(
    p_character_id, p_action, p_arg, p_hp, p_ki, p_server_secret
  );
$$;

revoke all on function public.apply_world_action(uuid, text, text, integer, integer, text)
from public, anon;
grant execute on function public.apply_world_action(uuid, text, text, integer, integer, text)
to authenticated;

revoke update(state) on public.characters from authenticated;
