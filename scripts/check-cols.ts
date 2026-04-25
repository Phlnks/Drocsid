import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function check() {
  const { error } = await supabase.from('messages').select('is_pinned').limit(1);
  console.log('essages.is_pinned error:', error?.message || 'none');
  
  const { error: e2 } = await supabase.from('dm_messages').select('is_pinned').limit(1);
  console.log('dm_messages.is_pinned error:', e2?.message || 'none');
}
check();
