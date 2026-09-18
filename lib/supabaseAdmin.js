// This is the Supabase client used ONLY on the server (inside pages/api/*
// and getServerSideProps). It uses the SECRET service role key, which can
// bypass Row Level Security — so this file must never be imported by any
// component that runs in the browser.
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
