import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export type WorkoutSession = {
  id: string;
  workout_date: string;
  workout_type: "pushup" | "pullup";
  target_total: number;
  total_reps: number;
  set_count: number | null;
  created_at: string;
};
