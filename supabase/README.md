# Supabase setup

Butterfly Judger uses Supabase only for optional student accounts and practice
history. Judging still runs locally in Pyodide, so the stored result is a
self-reported learning record rather than a graded result.

## One-time setup

1. Create a Supabase project.
2. Open **SQL Editor** and run `schema.sql` from this directory.
3. In **Authentication → Sign In / Providers → Email**, enable email/password
   sign-in and disable **Confirm email**. The UI converts usernames to internal,
   non-deliverable email identifiers, so confirmation mail cannot be received.
4. In **Project Settings → API Keys**, copy the Project URL and the browser-safe
   publishable key.
5. Put those two public values in `frontend/supabase-config.js`.

Do not put a secret key or legacy `service_role` key in the frontend. Those keys
bypass Row Level Security and must never be committed to a public website.

## Username mapping

The browser normalizes a username to lowercase and maps it deterministically:

```text
butterfly_01 → butterfly_01@users.butterfly.invalid
```

Students never see or use this internal email. Account and password recovery are
intentionally unsupported; a student can create a new account if either is lost.

If Supabase rejects the reserved `.invalid` domain for your project, change
`authEmailDomain` in `frontend/supabase-config.js` to a subdomain you own. No
mailbox is needed because email confirmation remains disabled.

## Security boundary

The publishable key is expected to be visible in the browser. The SQL policies
are the security boundary: authenticated students can select and insert rows
only when `user_id` equals their Supabase Auth user ID. They cannot update or
delete history through the public client.
