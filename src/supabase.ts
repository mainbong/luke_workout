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
  workout_type: "pushup" | "pullup" | "recovery_pushup";
  target_total: number;
  total_reps: number;
  set_count: number | null;
  set_reps: number[] | null;
  created_at: string;
};

export type RoutineCompletion = {
  id: string;
  workout_date: string;
  routine_id: string;
  completed_at: string;
};

export type AdminDailyRecord = {
  user_id: string;
  user_email: string;
  workout_date?: string;
  record_kind: "workout_session" | "routine_completion";
  routine_id: string | null;
  workout_type: "pushup" | "pullup" | "recovery_pushup" | null;
  target_total: number | null;
  total_reps: number | null;
  set_count: number | null;
  set_reps?: number[] | null;
  recorded_at: string;
};

export type AdminRoutineHistoryRecord = AdminDailyRecord & {
  workout_date: string;
};
