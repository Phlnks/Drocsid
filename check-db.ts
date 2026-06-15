import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");
async function main() {
  const { data: tokens } = await supabase.from('expo_push_tokens').select('*').limit(5);
  console.log("Tokens:", tokens);
  
  const { data: notifications } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(5);
  console.log("Latest notifications:", notifications);
  
  const { data: messages } = await supabase.from('dm_messages').select('*').order('created_at', { ascending: false }).limit(2);
  console.log("Latest dm_messages:", messages);
}
main();
