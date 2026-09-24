-- Authoritative PvE reward persistence for Dragon Saga Online.
-- PVE_SERVER_SECRET must be provisioned separately in Railway and inserted into
-- private.game_server_config. Never commit the secret to source control.

create schema if not exists private;

create table if not exists private.game_server_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

create table if not exists private.pve_reward_claims (
  claim_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  enemy_id text not null,
  created_at timestamptz not null default now()
);

revoke all on private.game_server_config from public, anon, authenticated;
revoke all on private.pve_reward_claims from public, anon, authenticated;

create or replace function private.apply_pve_reward_impl(
  p_character_id uuid,
  p_claim_id uuid,
  p_enemy_id text,
  p_exp integer,
  p_zeni integer,
  p_drop text,
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
  v_threshold bigint;
  v_qty integer;
  v_quest_idx integer;
  v_progress integer;
  v_target text;
  v_count integer;
  v_reward_exp integer;
  v_reward_zeni integer;
  v_quest_completed boolean := false;
begin
  select value into v_secret
  from private.game_server_config
  where key = 'pve_server_secret';

  if v_secret is null or p_server_secret is null or p_server_secret <> v_secret then
    raise exception 'invalid server credential' using errcode = '42501';
  end if;

  if p_claim_id is null or p_enemy_id is null or length(p_enemy_id) > 40 then
    raise exception 'invalid reward claim';
  end if;

  if p_exp < 0 or p_exp > 100000 or p_zeni < 0 or p_zeni > 1000000 then
    raise exception 'invalid reward values';
  end if;

  select user_id, level, xp, gold, coalesce(state, '{}'::jsonb)
  into v_user_id, v_level, v_xp, v_gold, v_state
  from public.characters
  where id = p_character_id
  for update;

  if v_user_id is null or v_user_id <> auth.uid() then
    raise exception 'character not owned by authenticated user' using errcode = '42501';
  end if;

  insert into private.pve_reward_claims(claim_id, user_id, character_id, enemy_id)
  values (p_claim_id, auth.uid(), p_character_id, p_enemy_id);

  v_level := greatest(1, v_level);
  v_xp := greatest(0, v_xp) + p_exp;
  v_gold := greatest(0, v_gold) + p_zeni;
  v_quest_idx := coalesce((v_state ->> 'questIdx')::integer, 0);
  v_progress := coalesce((v_state ->> 'questProgress')::integer, 0);

  v_target := null;
  v_count := 0;
  v_reward_exp := 0;
  v_reward_zeni := 0;

  case v_quest_idx
    when 1 then
      v_target := 'saiba'; v_count := 3; v_reward_exp := 120; v_reward_zeni := 300;
    when 2 then
      v_target := 'soldado'; v_count := 3; v_reward_exp := 250; v_reward_zeni := 600;
    when 3 then
      v_target := 'radix'; v_count := 1; v_reward_exp := 500; v_reward_zeni := 1000;
    when 4 then
      v_target := 'nappos'; v_count := 1; v_reward_exp := 900; v_reward_zeni := 1500;
    when 5 then
      v_target := 'vegar'; v_count := 1; v_reward_exp := 2000; v_reward_zeni := 3000;
    else
      null;
  end case;

  if v_target is not null and p_enemy_id = v_target then
    v_progress := v_progress + 1;

    if v_progress >= v_count then
      v_xp := v_xp + v_reward_exp;
      v_gold := v_gold + v_reward_zeni;
      v_quest_idx := v_quest_idx + 1;
      v_progress := 0;
      v_quest_completed := true;

      if v_target = 'saiba' then
        v_state := jsonb_set(
          v_state,
          '{flags}',
          coalesce(v_state -> 'flags', '{}'::jsonb) || '{"kurin": true}'::jsonb,
          true
        );
      elsif v_target = 'soldado' then
        v_state := jsonb_set(
          v_state,
          '{flags}',
          coalesce(v_state -> 'flags', '{}'::jsonb) || '{"nailo": true}'::jsonb,
          true
        );
      end if;
    end if;
  end if;

  loop
    v_threshold := v_level::bigint * v_level::bigint * 25 + v_level::bigint * 25;
    exit when v_xp < v_threshold;
    v_xp := v_xp - v_threshold;
    v_level := v_level + 1;
  end loop;

  v_state := jsonb_set(v_state, '{items}', coalesce(v_state -> 'items', '{}'::jsonb), true);

  if p_drop is not null and p_drop <> '' then
    v_qty := coalesce((v_state #>> array['items', p_drop])::integer, 0) + 1;
    v_state := jsonb_set(v_state, array['items', p_drop], to_jsonb(v_qty), true);
  end if;

  v_state := jsonb_set(v_state, '{lv}', to_jsonb(v_level), true);
  v_state := jsonb_set(v_state, '{exp}', to_jsonb(v_xp), true);
  v_state := jsonb_set(v_state, '{zeni}', to_jsonb(v_gold), true);
  v_state := jsonb_set(v_state, '{hp}', to_jsonb(greatest(1, p_hp)), true);
  v_state := jsonb_set(v_state, '{ki}', to_jsonb(greatest(0, p_ki)), true);
  v_state := jsonb_set(v_state, '{questIdx}', to_jsonb(v_quest_idx), true);
  v_state := jsonb_set(v_state, '{questProgress}', to_jsonb(v_progress), true);

  if v_level >= 12 then
    v_state := jsonb_set(
      v_state,
      '{flags}',
      coalesce(v_state -> 'flags', '{}'::jsonb) || '{"super": true}'::jsonb,
      true
    );
  end if;

  update public.characters
  set
    level = v_level,
    xp = v_xp,
    gold = v_gold,
    hp = greatest(1, p_hp),
    ki = greatest(0, p_ki),
    state = v_state,
    last_played_at = now(),
    updated_at = now()
  where id = p_character_id;

  return jsonb_build_object(
    'id', p_character_id,
    'level', v_level,
    'xp', v_xp,
    'gold', v_gold,
    'hp', greatest(1, p_hp),
    'ki', greatest(0, p_ki),
    'state', v_state,
    'quest_completed', v_quest_completed
  );
exception
  when unique_violation then
    raise exception 'reward claim already used' using errcode = '23505';
end;
$$;

revoke all on function private.apply_pve_reward_impl(
  uuid, uuid, text, integer, integer, text, integer, integer, text
) from public, anon;

grant usage on schema private to authenticated;
grant execute on function private.apply_pve_reward_impl(
  uuid, uuid, text, integer, integer, text, integer, integer, text
) to authenticated;

create or replace function public.apply_pve_reward(
  p_character_id uuid,
  p_claim_id uuid,
  p_enemy_id text,
  p_exp integer,
  p_zeni integer,
  p_drop text,
  p_hp integer,
  p_ki integer,
  p_server_secret text
)
returns jsonb
language sql
security invoker
set search_path = pg_catalog, public, private
as $$
  select private.apply_pve_reward_impl(
    p_character_id,
    p_claim_id,
    p_enemy_id,
    p_exp,
    p_zeni,
    p_drop,
    p_hp,
    p_ki,
    p_server_secret
  );
$$;

revoke all on function public.apply_pve_reward(
  uuid, uuid, text, integer, integer, text, integer, integer, text
) from public, anon;

grant execute on function public.apply_pve_reward(
  uuid, uuid, text, integer, integer, text, integer, integer, text
) to authenticated;
