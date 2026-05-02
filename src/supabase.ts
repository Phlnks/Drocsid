import { createClient } from '@supabase/supabase-js';

// Load initial config from localStorage to support instance switching
export const resetInstanceConfig = () => {
  localStorage.removeItem('drocsid-current-instance-id');
  localStorage.setItem('drocsid-current-instance-id', 'default');
  window.location.reload();
};

const getInitialConfig = () => {
  const currentId = localStorage.getItem('drocsid-current-instance-id') || 'default';
  const instancesRaw = localStorage.getItem('drocsid-instances');
  
  if (instancesRaw) {
    try {
      const instances = JSON.parse(instancesRaw);
      const current = instances.find((i: any) => i.id === currentId);
      if (current) {
        return {
          url: current.supabaseUrl,
          key: current.supabaseAnonKey
        };
      }
    } catch (e) {
      console.error('Failed to parse instances for supabase initialization', e);
    }
  }

  return {
    url: import.meta.env.VITE_SUPABASE_URL || '',
    key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
  };
};

const config = getInitialConfig();
const supabaseUrl = config.url;
const supabaseAnonKey = config.key;

// Generate a unique storage key based on the project reference to avoid session conflicts between instances
const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] || 'default';
const storageKey = `sb-${projectRef}-auth-token`;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Anon Key is missing. Please check your environment variables or instance settings.');
} else {
  console.log(`Supabase initialized for project: ${projectRef.substring(0, 4)}...`);
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    storageKey: storageKey,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});
