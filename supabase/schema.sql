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

-- Public, site-wide discussion board. Anyone may read it; authenticated students
-- may publish and may only remove their own posts. The trigger derives the author
-- from Supabase Auth so browser clients cannot impersonate another username.
create table if not exists public.community_posts (
    id bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
    author_username text not null check (
        char_length(author_username) between 3 and 24
        and author_username ~ '^[A-Za-z0-9_-]+$'
    ),
    category text not null check (category in ('help', 'share', 'feedback')),
    problem_ref text check (
        problem_ref is null
        or (
            char_length(problem_ref) between 1 and 32
            and problem_ref ~ '^[A-Za-z0-9_-]+$'
        )
    ),
    message text not null check (char_length(message) between 1 and 2000),
    code text not null default '' check (char_length(code) <= 20000),
    created_at timestamptz not null default now()
);

create index if not exists community_posts_created_at_idx
    on public.community_posts (created_at desc);

create index if not exists community_posts_user_time_idx
    on public.community_posts (user_id, created_at desc);

create or replace function public.set_community_post_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    resolved_username text;
begin
    if auth.uid() is null then
        raise exception 'Authentication required';
    end if;

    if exists (
        select 1
        from public.community_posts
        where user_id = auth.uid()
          and created_at > now() - interval '10 seconds'
    ) then
        raise exception 'Community post rate limit';
    end if;

    select coalesce(
        nullif(raw_user_meta_data ->> 'username', ''),
        split_part(email, '@', 1)
    )
    into resolved_username
    from auth.users
    where id = auth.uid();

    if resolved_username is null then
        raise exception 'Unable to resolve post author';
    end if;

    new.user_id := auth.uid();
    new.author_username := resolved_username;
    return new;
end;
$$;

drop trigger if exists set_community_post_owner on public.community_posts;
create trigger set_community_post_owner
    before insert on public.community_posts
    for each row execute function public.set_community_post_owner();

alter table public.community_posts enable row level security;

revoke all on table public.community_posts from anon, authenticated;
grant select on table public.community_posts to anon, authenticated;
grant insert, delete on table public.community_posts to authenticated;
grant usage, select on sequence public.community_posts_id_seq to authenticated;

drop policy if exists "Anyone can read community posts" on public.community_posts;
create policy "Anyone can read community posts"
    on public.community_posts
    for select
    to anon, authenticated
    using (true);

drop policy if exists "Students can create community posts" on public.community_posts;
create policy "Students can create community posts"
    on public.community_posts
    for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Students can delete their own community posts" on public.community_posts;
create policy "Students can delete their own community posts"
    on public.community_posts
    for delete
    to authenticated
    using ((select auth.uid()) = user_id);
