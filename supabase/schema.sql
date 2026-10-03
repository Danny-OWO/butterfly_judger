-- Run this file once in the Supabase SQL Editor.
-- Authentication itself is managed by Supabase Auth; this table stores practice history only.

create table if not exists public.submissions (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    problem_id text not null check (
        char_length(problem_id) between 1 and 64
        and problem_id ~ '^[A-Za-z0-9_-]+$'
    ),
    code text not null check (char_length(code) between 1 and 50000),
    status text not null check (status in ('AC', 'WA', 'RE', 'TLE')),
    passed integer not null check (passed >= 0),
    total integer not null check (total > 0 and passed <= total),
    submitted_at timestamptz not null default now()
);

create index if not exists submissions_user_problem_time_idx
    on public.submissions (user_id, problem_id, submitted_at desc);

alter table public.submissions enable row level security;

revoke all on table public.submissions from anon;
grant select, insert on table public.submissions to authenticated;
grant usage, select on sequence public.submissions_id_seq to authenticated;

drop policy if exists "Students can read their own submissions" on public.submissions;
create policy "Students can read their own submissions"
    on public.submissions
    for select
    to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Students can create their own submissions" on public.submissions;
create policy "Students can create their own submissions"
    on public.submissions
    for insert
    to authenticated
    with check ((select auth.uid()) = user_id);
