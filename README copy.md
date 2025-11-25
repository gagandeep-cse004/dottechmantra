Dot TechMantra - Supabase migration

This project was migrated from a local SQLite backend to Supabase (Postgres) for cloud-hosted storage.

Quick setup

1. Create a Supabase project and a table for each of: `contacts`, `offers`, `newsletters`.

SQL examples (run in Supabase SQL editor):

CREATE TABLE contacts (
  id bigserial primary key,
  name text,
  email text,
  phone text,
  service text,
  message text,
  created_at timestamptz default now()
);

CREATE TABLE offers (
  id bigserial primary key,
  email text,
  phone text,
  created_at timestamptz default now()
);

CREATE TABLE newsletters (
  id bigserial primary key,
  email text,
  created_at timestamptz default now()
);

2. Copy `.env.example` to `.env` and set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE` (use the Service Role key for server-side scripts).

3. Install deps and run:

    npm install
    npm start

Notes

- The API endpoints remain the same: `/api/contact`, `/api/offer`, `/api/newsletter`, and admin dump at `/admin/dump?token=...`.
- Keep your Service Role key secret. For production, store it in a secure secrets manager.

Security & Row Level Security (RLS)
----------------------------------

Your Supabase tables in this project have RLS enabled, which is why anonymous (anon) inserts were rejected by the check script.
You have two safe options:

1) Recommended — server-side writes with a Service Role key:
   - In Supabase settings → API, create or copy the `service_role` key.
   - On your server (or host), set the environment variable `SUPABASE_SERVICE_ROLE` to that key. For local testing you can set it in PowerShell:

     $env:SUPABASE_SERVICE_ROLE = 'your-service-role-key'
     npm start

   - The server will then use the service role key and can bypass RLS for trusted operations. Do NOT expose this key in client-side code or commit it.

2) Quick (less secure) — allow anon inserts via a policy (use only if you accept public writes):
   - Open Supabase dashboard → SQL Editor and run the following for each table you want to allow anon inserts on.

     -- Allow anon role to insert into info_submissions
     CREATE POLICY "Allow anon insert info_submissions" ON public.info_submissions
     FOR INSERT USING (auth.role() = 'anon');

     -- Allow anon role to insert into subscribers
     CREATE POLICY "Allow anon insert subscribers" ON public.subscribers
     FOR INSERT USING (auth.role() = 'anon');

   - You can also allow read (SELECT) for anon if desired:

     CREATE POLICY "Allow anon select info_submissions" ON public.info_submissions
     FOR SELECT USING (true);

After adding policies or setting the service role, re-run `node tools/check_supabase.js` to confirm inserts succeed.

If you'd like, I can prepare a migration SQL file for the schema you prefer or script the policy creation for you — tell me which and I'll add it to the repo.

Environment variables used by this project:

- SUPABASE_URL - your Supabase project URL
- SUPABASE_SERVICE_ROLE - service_role key for server-side writes (keep secret)
- ADMIN_TOKEN - token used to protect the `/admin/dump` endpoint

See `.env.example` for a template.
