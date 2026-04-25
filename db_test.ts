import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");
async function main() {
  const { data, error } = await supabase.rpc('exec_sql', { sql: "ALTER TABLE channels ADD COLUMN permission_overrides JSONB DEFAULT '{}'::jsonb;" });
  console.log("RPC Error:", error);
}
main();
