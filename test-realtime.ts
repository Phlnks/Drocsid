import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "");

const pushChannel = supabaseAdmin.channel('backend-test');

pushChannel
.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dm_messages' }, (payload) => {
    console.log("DM INSERTED:", payload.new.id);
})
.subscribe((status, err) => {
    console.log("Status:", status);
    if(status === 'SUBSCRIBED') {
        supabaseAdmin.from('dm_messages').select('id, dm_id, author_id, content').limit(1).then(({data}) => {
            if(data && data[0]) {
                const msg = data[0];
                supabaseAdmin.from('dm_messages').insert({
                    dm_id: msg.dm_id,
                    author_id: msg.author_id,
                    content: "Test RT"
                }).then((res) => console.log("Insert result:", res.error || "Ok"));
            } else {
                console.log("No DM found to clone");
            }
        });
    }
});

setTimeout(() => process.exit(0), 5000);
