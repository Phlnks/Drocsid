import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function run() {
  const { data, error } = await supabase.from('servers').select('*').limit(1);
  console.log(JSON.stringify(data?.[0]));
}
run();
