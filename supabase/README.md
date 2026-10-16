# Supabase setup

Butterfly Judger uses Supabase for optional student accounts, practice history,
and the global community board. Judging still runs locally in Pyodide, so the
stored result is a self-reported learning record rather than a graded result.

## One-time setup

1. Create a Supabase project.
2. Open **SQL Editor** and run `schema.sql` from this directory.
3. In **Authentication → Sign In / Providers → Email**, enable email/password
   sign-in and disable **Confirm email**. The UI converts usernames to internal,
   non-deliverable email identifiers, so confirmation mail cannot be received.
4. In **Project Settings → API Keys**, copy the Project URL and the browser-safe
   publishable key.
5. Put those two public values in `frontend/supabase-config.js`.

If the project was configured before the community board was added, run the
current `schema.sql` again. The migration is idempotent: it creates the new
`community_posts` table and recreates its policies without deleting existing
submission history.

Do not put a secret key or legacy `service_role` key in the frontend. Those keys
bypass Row Level Security and must never be committed to a public website.

## Username mapping

The browser normalizes a username to lowercase and maps it deterministically:

```text
butterfly_01 → butterfly_01@students.danny-owo.github.io
```

Students never see or use this internal email. Account and password recovery are
intentionally unsupported; a student can create a new account if either is lost.

No mailbox is needed for the internal address because email confirmation is
disabled. Keep the configured domain stable: changing it later changes the
derived login identifier for every username.

## Security boundary

The publishable key is expected to be visible in the browser. The SQL policies
are the security boundary: submission history remains private to its student;
community posts are publicly readable, but only authenticated students can
publish and they can delete only their own posts. A database trigger derives the
displayed username from Supabase Auth so clients cannot impersonate classmates.
