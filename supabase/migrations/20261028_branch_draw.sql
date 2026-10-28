-- Apply once to an existing installation; new installations use schema.sql.
begin;
alter table public.events add column branch_draw boolean not null default false;
alter table public.results add column branch text not null default '';
alter table public.results drop constraint results_pkey;
alter table public.results add primary key(event_id,branch,rank);
create or replace function public.protect_event() returns trigger language plpgsql as $$
begin
 if old.status <> 'draft' and (new.branch_draw is distinct from old.branch_draw or new.entries is distinct from old.entries or new.prizes is distinct from old.prizes or new.snapshot_hash is distinct from old.snapshot_hash or new.status='draft') then raise exception 'Locked snapshot is immutable'; end if;
 return new;
end $$;
commit;
