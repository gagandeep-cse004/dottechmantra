-- Migration: allow anon inserts/selects on info_submissions and subscribers
-- WARNING: This opens these tables to anonymous writes. Use only if you accept public inserts.

-- Drop existing policies if present (safe to run multiple times)
DROP POLICY IF EXISTS "Allow anon insert info_submissions" ON public.info_submissions;
DROP POLICY IF EXISTS "Allow anon select info_submissions" ON public.info_submissions;
DROP POLICY IF EXISTS "Allow anon insert subscribers" ON public.subscribers;
DROP POLICY IF EXISTS "Allow anon select subscribers" ON public.subscribers;

-- Allow anonymous (anon) role to INSERT into info_submissions
CREATE POLICY "Allow anon insert info_submissions" ON public.info_submissions
  FOR INSERT
  WITH CHECK (auth.role() = 'anon');

-- Optionally allow anonymous SELECT on info_submissions (remove if you want to keep reads restricted)
CREATE POLICY "Allow anon select info_submissions" ON public.info_submissions
  FOR SELECT
  USING (true);

-- Allow anonymous (anon) role to INSERT into subscribers
CREATE POLICY "Allow anon insert subscribers" ON public.subscribers
  FOR INSERT
  WITH CHECK (auth.role() = 'anon');

-- Allow anonymous SELECT on subscribers (common for public subscriber lists)
CREATE POLICY "Allow anon select subscribers" ON public.subscribers
  FOR SELECT
  USING (true);

-- End migration
