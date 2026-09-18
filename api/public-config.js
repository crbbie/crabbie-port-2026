/** Returns only public Supabase configuration; it never reads a service-role key. */
export default function handler(request, response) {
  const config = { url: process.env.SUPABASE_URL || '', key: process.env.SUPABASE_PUBLISHABLE_KEY || '' };
  response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  response.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  response.status(200).send(`window.__CRABBIE_SUPABASE_CONFIG__=${JSON.stringify(config)};`);
}
