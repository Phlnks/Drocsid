import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

async function main() {
   const { data, error } = await supabaseAdmin.rpc('get_policies');
   if (error) {
       console.error("RPC failed, trying query:", error);
       // Query pg_policies
       const { data: dbData, error: dbError } = await supabaseAdmin
           .from('pg_policies')
           .select('*')
           .eq('tablename', 'notifications');
       console.log("Policies:", dbData, dbError);
   } else {
       console.log(data);
   }
}
main();
