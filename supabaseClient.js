require('dotenv').config();
// Ensure fetch is available globally
const fetch = require('cross-fetch');
global.fetch = fetch;
const { createClient } = require('@supabase/supabase-js');

// Prefer environment variables, but fall back to the provided project info so
// the app works immediately. WARNING: embedding anon keys in source is fine
// for public anon keys but never commit service_role keys.
const DEFAULT_SUPABASE_URL = 'https://tbyjgukgadxehdouioom.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRieWpndWtnYWR4ZWhkb3Vpb29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAzOTg1NjMsImV4cCI6MjA3NTk3NDU2M30.4nhRq4EoUXrOnZ3VbSCqggf4rdcMWOVYRVG_lH0BAEY';

const SUPABASE_URL = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
// Prefer an explicit service role env var for server-side trusted operations.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY || DEFAULT_SUPABASE_KEY;

const usingServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('Supabase URL or Key not configured; client will not work.');
  module.exports = {
    usingServiceRole: false,
    from() { throw new Error('Supabase not configured'); }
  };
} else {
  // Initialize supabase client. If SUPABASE_SERVICE_ROLE is set, this client will use it
  // (service role bypasses RLS and must never be exposed to browser clients).
  if (usingServiceRole) {
    console.warn('SUPABASE_SERVICE_ROLE detected in environment. This client will perform privileged server-side operations. Do NOT expose this key to browsers or clients.');
  } else {
    console.warn('SUPABASE_SERVICE_ROLE not set. The server client will use an anon/public key if available. This is not recommended for production.');
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  // export the client plus a helper flag so server code can verify whether it's running
  // with a service role key before performing sensitive actions.
  module.exports = Object.assign(supabase, { usingServiceRole });
}

