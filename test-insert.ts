import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

async function main() {
   // Fetch a user and a DM to insert
   const { data: dm } = await supabaseAdmin.from('dms').select('*').limit(1).single();
   const { data: user } = await supabaseAdmin.from('profiles').select('id').limit(1).single();

   if (!dm || !user) {
       console.log("No DM or User found");
       return;
   }

   console.log("Inserting message in DM:", dm.id, "as user:", user.id);
   const { data, error } = await supabaseAdmin.from('dm_messages').insert({
       dm_id: dm.id,
       author_id: user.id,
       content: "Test message from script"
   });

   console.log("Insert result:", error ? error : "Success", data);
}

main();
