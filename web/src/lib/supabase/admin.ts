import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://tyghcaaemyttafwrdrhv.supabase.co";
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "sb_secret_7JR8SDMSIy_LuEExYqRv8A_LP_Ozd1v";

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
