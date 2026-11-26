-- A reset is scoped to one event and the current transaction. Normal writes
-- still cannot change a locked snapshot or delete a winner.
create or replace function public.protect_event() returns trigger language plpgsql as $$
begin
 if current_setting('app.reset_event_id', true) = old.id::text
    and new.entries = '[]'::jsonb and new.status = 'draft'
    and new.snapshot_hash is null and not new.branch_draw
    and new.prizes = old.prizes then return new; end if;
 if old.status <> 'draft' and (new.branch_draw is distinct from old.branch_draw or new.entries is distinct from old.entries or new.prizes is distinct from old.prizes or new.snapshot_hash is distinct from old.snapshot_hash or new.status='draft') then raise exception 'Locked snapshot is immutable'; end if;
 return new;
end $$;
create or replace function public.protect_result() returns trigger language plpgsql as $$
begin
 if TG_OP='DELETE' then
   if current_setting('app.reset_event_id', true) = old.event_id::text then return old; end if;
   raise exception 'Results cannot be deleted';
 end if;
 if (to_jsonb(new)-'acknowledged') is distinct from (to_jsonb(old)-'acknowledged') or (old.acknowledged and not new.acknowledged) then raise exception 'Results are immutable'; end if;
 return new;
end $$;
