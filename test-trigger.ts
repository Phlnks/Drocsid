import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");
async function main() {
  const { data: tokens } = await supabaseAdmin.from('expo_push_tokens').select('*');
  if (tokens && tokens.length > 0) {
      console.log("Tokens in DB:", tokens);
      for (const t of tokens) {
         try {
            console.log("Testing user:", t.user_id);
            const res = await fetch(`http://localhost:3000/api/push/test?userId=${t.user_id}`);
            const text = await res.text();
            console.log("Response:", text);
         } catch(e) {
            console.log("Error:", e);
         }
      }
  } else {
     console.log("No expo tokens in DB found");
  }
}
main();
