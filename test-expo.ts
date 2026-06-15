import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

async function main() {
  const { data: tokens, error: tokensError } = await supabase.from('expo_push_tokens').select('*');
  console.log("Tokens:", tokens, tokensError);
  
  if (tokens && tokens.length > 0) {
      const messages = tokens.map(row => ({
        to: row.token,
        sound: 'default',
        title: "Test de notifications AISTUDIO",
        body: "Corps de notification",
        data: { url: "/channels/@me" }
      }));
      
      console.log("Sending to Expo:", messages);
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(messages),
      });
      const data = await res.text();
      console.log("Response from Expo:", data);
  }
}
main();
