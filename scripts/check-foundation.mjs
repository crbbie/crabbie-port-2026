import { readFile } from 'node:fs/promises';
const files = ['.env.example','vercel.json','api/public-config.js','src/supabase-client.js','supabase/migrations/202609180001_foundation.sql'];
for (const file of files) await readFile(file, 'utf8');
const client = await readFile('src/supabase-client.js', 'utf8');
if (!client.includes('@supabase/supabase-js') || !client.includes('createClient')) throw new Error('Supabase client missing.');
console.log(`Foundation check passed (${files.length} required files).`);
