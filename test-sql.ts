import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");
async function main() {
  const { data, error } = await supabase.from('messages').select('id').limit(1);
  console.log("Check auth:", data ? "OK" : error);
}
main();
