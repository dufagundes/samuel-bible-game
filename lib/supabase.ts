import { createClient } from "@supabase/supabase-js";

// These are public values (the publishable key only works together with Row Level Security).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://tnqnjlpdoihxgjlpqizs.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_BzREvjdOmRXvx-y5rT5Pqw_aWF5I49j";

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true }
});
