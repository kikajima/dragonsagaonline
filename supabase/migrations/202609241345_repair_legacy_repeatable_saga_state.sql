-- Repair characters that completed the saga before repeatable cycles existed.
-- Legacy clients stored questIdx = 6 after q5, which is outside the current QUESTS array.

update public.characters
set
  state = jsonb_set(
    jsonb_set(
      jsonb_set(
        coalesce(state, '{}'::jsonb),
        '{questIdx}',
        '0'::jsonb,
        true
      ),
      '{questProgress}',
      '0'::jsonb,
      true
    ),
    '{sagaCycle}',
    to_jsonb(greatest(coalesce((state ->> 'sagaCycle')::integer, 0), 1)),
    true
  ),
  updated_at = now()
where coalesce((state ->> 'questIdx')::integer, 0) >= 6;
