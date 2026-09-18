// This is the Supabase client used in the BROWSER.
// It only uses the public "anon" key, which is safe to expose — it has no
// write access (see supabase/schema.sql for the RLS policies).
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
