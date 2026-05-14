import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('profiles').update({ is_banned: true }).eq('username', 'notexist');
  console.log('Error:', error);
}
run();
