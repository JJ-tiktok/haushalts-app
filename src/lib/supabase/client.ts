"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/database.types";

export function createClient() {
  const { url, anonKey } = supabaseConfig();

  return createBrowserClient<Database>(url, anonKey);
}
