-- Atomic player-to-player item trades with idempotency logging.

create table if not exists private.player_trade_log (
  trade_id uuid primary key,
  character_a uuid not null references public.characters(id) on delete cascade,
  character_b uuid not null references public.characters(id) on delete cascade,
  item_a text not null,
  quantity_a integer not null check (quantity_a > 0),
  item_b text not null,
  quantity_b integer not null check (quantity_b > 0),
  created_at timestamptz not null default now()
);

revoke all on private.player_trade_log from public, anon, authenticated;

create index if not exists player_trade_log_character_a_idx
  on private.player_trade_log(character_a);
create index if not exists player_trade_log_character_b_idx
  on private.player_trade_log(character_b);

create or replace function private.execute_item_trade_impl(
  p_trade_id uuid,
  p_character_a uuid,
  p_character_b uuid,
  p_item_a text,
  p_quantity_a integer,
  p_item_b text,
  p_quantity_b integer,
  p_server_secret text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_secret text;
  v_user_a uuid;
  v_user_b uuid;
  v_state_a jsonb;
  v_state_b jsonb;
  v_items_a jsonb;
  v_items_b jsonb;
  v_gear_a jsonb;
  v_gear_b jsonb;
  v_is_gear_a boolean;
  v_is_gear_b boolean;
  v_qty integer;
  v_row_a public.characters;
  v_row_b public.characters;
begin
  select value into v_secret
  from private.game_server_config
  where key = 'pve_server_secret';

  if v_secret is null or p_server_secret is null or p_server_secret <> v_secret then
    raise exception 'invalid server credential' using errcode = '42501';
  end if;

  if p_trade_id is null or p_character_a = p_character_b then
    raise exception 'invalid trade';
  end if;

  if p_quantity_a < 1 or p_quantity_a > 99 or p_quantity_b < 1 or p_quantity_b > 99 then
    raise exception 'invalid trade quantity';
  end if;

  if p_item_a not in ('sensu','capsula','elixir','bastao','armadura','scouter','espada','manto')
     or p_item_b not in ('sensu','capsula','elixir','bastao','armadura','scouter','espada','manto') then
    raise exception 'invalid trade item';
  end if;

  perform 1
  from public.characters
  where id in (p_character_a, p_character_b)
  order by id
  for update;

  select user_id, coalesce(state, '{}'::jsonb)
    into v_user_a, v_state_a
  from public.characters
  where id = p_character_a;

  select user_id, coalesce(state, '{}'::jsonb)
    into v_user_b, v_state_b
  from public.characters
  where id = p_character_b;

  if v_user_a is null or v_user_b is null then
    raise exception 'trade character missing';
  end if;

  if v_user_a <> auth.uid() then
    raise exception 'trade initiator not owned by authenticated user' using errcode = '42501';
  end if;

  v_items_a := coalesce(v_state_a -> 'items', '{}'::jsonb);
  v_items_b := coalesce(v_state_b -> 'items', '{}'::jsonb);
  v_gear_a := coalesce(v_state_a -> 'gearOwned', '[]'::jsonb);
  v_gear_b := coalesce(v_state_b -> 'gearOwned', '[]'::jsonb);
  v_is_gear_a := p_item_a in ('bastao','armadura','scouter','espada','manto');
  v_is_gear_b := p_item_b in ('bastao','armadura','scouter','espada','manto');

  if v_is_gear_a then
    if p_quantity_a <> 1 or not (v_gear_a @> to_jsonb(array[p_item_a]::text[])) then
      raise exception 'first trade item unavailable';
    end if;
    if v_gear_b @> to_jsonb(array[p_item_a]::text[]) then
      raise exception 'second character already owns first gear';
    end if;
  else
    if coalesce((v_items_a ->> p_item_a)::integer, 0) < p_quantity_a then
      raise exception 'first trade item unavailable';
    end if;
  end if;

  if v_is_gear_b then
    if p_quantity_b <> 1 or not (v_gear_b @> to_jsonb(array[p_item_b]::text[])) then
      raise exception 'second trade item unavailable';
    end if;
    if v_gear_a @> to_jsonb(array[p_item_b]::text[]) then
      raise exception 'first character already owns second gear';
    end if;
  else
    if coalesce((v_items_b ->> p_item_b)::integer, 0) < p_quantity_b then
      raise exception 'second trade item unavailable';
    end if;
  end if;

  insert into private.player_trade_log(
    trade_id, character_a, character_b, item_a, quantity_a, item_b, quantity_b
  )
  values (
    p_trade_id, p_character_a, p_character_b, p_item_a, p_quantity_a, p_item_b, p_quantity_b
  );

  if v_is_gear_a then
    select coalesce(jsonb_agg(value), '[]'::jsonb)
      into v_gear_a
    from jsonb_array_elements(v_gear_a)
    where value <> to_jsonb(p_item_a);
    v_gear_b := v_gear_b || to_jsonb(array[p_item_a]::text[]);
  else
    v_qty := coalesce((v_items_a ->> p_item_a)::integer, 0) - p_quantity_a;
    v_items_a := jsonb_set(v_items_a, array[p_item_a], to_jsonb(v_qty), true);
    v_qty := coalesce((v_items_b ->> p_item_a)::integer, 0) + p_quantity_a;
    v_items_b := jsonb_set(v_items_b, array[p_item_a], to_jsonb(v_qty), true);
  end if;

  if v_is_gear_b then
    select coalesce(jsonb_agg(value), '[]'::jsonb)
      into v_gear_b
    from jsonb_array_elements(v_gear_b)
    where value <> to_jsonb(p_item_b);
    v_gear_a := v_gear_a || to_jsonb(array[p_item_b]::text[]);
  else
    v_qty := coalesce((v_items_b ->> p_item_b)::integer, 0) - p_quantity_b;
    v_items_b := jsonb_set(v_items_b, array[p_item_b], to_jsonb(v_qty), true);
    v_qty := coalesce((v_items_a ->> p_item_b)::integer, 0) + p_quantity_b;
    v_items_a := jsonb_set(v_items_a, array[p_item_b], to_jsonb(v_qty), true);
  end if;

  v_state_a := jsonb_set(v_state_a, '{items}', v_items_a, true);
  v_state_a := jsonb_set(v_state_a, '{gearOwned}', v_gear_a, true);
  v_state_b := jsonb_set(v_state_b, '{items}', v_items_b, true);
  v_state_b := jsonb_set(v_state_b, '{gearOwned}', v_gear_b, true);

  update public.characters
  set state = v_state_a, updated_at = now(), last_played_at = now()
  where id = p_character_a
  returning * into v_row_a;

  update public.characters
  set state = v_state_b, updated_at = now(), last_played_at = now()
  where id = p_character_b
  returning * into v_row_b;

  return jsonb_build_object(
    'trade_id', p_trade_id,
    'character_a', to_jsonb(v_row_a),
    'character_b', to_jsonb(v_row_b)
  );
exception
  when unique_violation then
    raise exception 'trade already executed' using errcode = '23505';
end;
$$;

revoke all on function private.execute_item_trade_impl(
  uuid, uuid, uuid, text, integer, text, integer, text
) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.execute_item_trade_impl(
  uuid, uuid, uuid, text, integer, text, integer, text
) to authenticated;

create or replace function public.execute_item_trade(
  p_trade_id uuid,
  p_character_a uuid,
  p_character_b uuid,
  p_item_a text,
  p_quantity_a integer,
  p_item_b text,
  p_quantity_b integer,
  p_server_secret text
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public, private
as $$
  select private.execute_item_trade_impl(
    p_trade_id, p_character_a, p_character_b,
    p_item_a, p_quantity_a, p_item_b, p_quantity_b, p_server_secret
  );
$$;

revoke all on function public.execute_item_trade(
  uuid, uuid, uuid, text, integer, text, integer, text
) from public, anon;
grant execute on function public.execute_item_trade(
  uuid, uuid, uuid, text, integer, text, integer, text
) to authenticated;
