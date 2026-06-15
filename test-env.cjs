require('dotenv').config();
console.log("URL:", process.env.VITE_SUPABASE_URL ? "OK" : "NO");
console.log("KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "NO");
