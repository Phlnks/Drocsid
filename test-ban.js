import { createClient } from "@supabase/supabase-js";
const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
console.log(Object.keys(supabaseAdmin.auth.admin));
