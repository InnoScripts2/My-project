// Supabase client initialization for browser (ESM)
// Safe to embed anon key if RLS policies are enforced on tables/views
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://fwwtvexgsieacnlaeson.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3d3R2ZXhnc2llYWNubGFlc29uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzNDUzMjYsImV4cCI6MjA3NDkyMTMyNn0.BflyTqJB5SSyXXFQUOTMMAggx1uU7_A6Z4WvAaE2UO0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// expose globally for the kiosk UI scripts
window.supabase = supabase;
window.supabaseConfig = { url: SUPABASE_URL };
