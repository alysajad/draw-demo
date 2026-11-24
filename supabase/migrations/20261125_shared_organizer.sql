-- Replace per-account access with one shared organizer, keeping saved events/results.
begin;
alter table public.organizers drop constraint if exists organizers_user_id_fkey;
insert into public.organizers values ('00000000-0000-4000-8000-000000000001') on conflict do nothing;
update public.events set organizer = '00000000-0000-4000-8000-000000000001';
-- Historical result/audit organizer IDs are immutable and remain unchanged.
commit;
