import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

async function main() {
  const { data: tokens, error: tokenError } = await supabase.from('expo_push_tokens').select('*');
  console.log("Tokens in DB:", tokens);
  console.log("Tokens Error:", tokenError);
}
main();

