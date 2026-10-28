-- Run in a NEW dedicated Supabase project. Disable public auth sign-ups.
create table public.organizers (user_id uuid primary key references auth.users(id));
create table public.events (
 id uuid primary key, organizer uuid not null references public.organizers(user_id),
 status text not null default 'draft' check(status in ('draft','locked','complete')),
 entries jsonb not null default '[]', prizes jsonb not null default '["","",""]',
 branch_draw boolean not null default false,
 snapshot_hash text, created_at timestamptz not null default now()
);
create table public.results (
 event_id uuid not null references public.events(id), rank int not null check(rank between 1 and 3),
 branch text not null default '',
 entry_id text not null, winner jsonb not null, idempotency_key uuid not null,
 eligible_count int not null, organizer uuid not null, drawn_at timestamptz not null default now(),
 acknowledged boolean not null default false,
 primary key(event_id,branch,rank), unique(event_id,entry_id), unique(event_id,idempotency_key)
);
create table public.audit (
 id bigint generated always as identity primary key,event_id uuid not null references public.events(id),
 organizer uuid not null, action text not null, details jsonb not null default '{}',at timestamptz not null default now()
);
alter table public.organizers enable row level security;
alter table public.events enable row level security;
alter table public.results enable row level security;
alter table public.audit enable row level security;
-- No browser-access policies: all data flows through authorized server routes.
create function public.protect_event() returns trigger language plpgsql as $$
begin
 if old.status <> 'draft' and (new.branch_draw is distinct from old.branch_draw or new.entries is distinct from old.entries or new.prizes is distinct from old.prizes or new.snapshot_hash is distinct from old.snapshot_hash or new.status='draft') then raise exception 'Locked snapshot is immutable'; end if;
 return new;
end $$;
create trigger immutable_snapshot before update on public.events for each row execute function public.protect_event();
create function public.protect_result() returns trigger language plpgsql as $$
begin
 if TG_OP='DELETE' then raise exception 'Results cannot be deleted'; end if;
 if (to_jsonb(new)-'acknowledged') is distinct from (to_jsonb(old)-'acknowledged') or (old.acknowledged and not new.acknowledged) then raise exception 'Results are immutable'; end if;
 return new;
end $$;
create trigger immutable_result before update or delete on public.results for each row execute function public.protect_result();
create function public.protect_audit() returns trigger language plpgsql as $$ begin raise exception 'Audit records are immutable'; end $$;
create trigger immutable_audit before update or delete on public.audit for each row execute function public.protect_audit();
