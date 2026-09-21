import { readFile } from 'node:fs/promises';

const env = Object.fromEntries(
  (await readFile('.env.local', 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'))
    .map((line) => line.split(/=(.*)/s))
    .filter(([key, value]) => key && value)
);

const url = env.SUPABASE_URL;
const secret = env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required in .env.local.');

const headers = { apikey: secret, Authorization: `Bearer ${secret}`, 'User-Agent': 'CrabbieSiteContentSeeder/1.0' };

// 1. Pages
const pages = [
  {
    slug: 'about',
    title: 'About',
    content: "I'm Crabbie, an illustrator creating sweet anime and chibi artwork.",
    published: true,
    data: {
      name: 'Crabbie',
      bio: "I'm Crabbie, an illustrator creating sweet anime and chibi artwork, character art, VTuber assets, emotes, merch, comics, and little visual worlds filled with color and personality.",
      experience: [
        { id: 'e1', title: 'Amelodious', body: 'Created 4koma comics for Amelodious, a Hatsune Miku fan event in Vietnam.', tag: 'AMELODIOUS' },
        { id: 'e2', title: 'Amelodios Merch Table', body: 'Designed fan merch and showcased it at Amelodious, an offline Miku fan event.', tag: 'MERCH TABLE' },
        { id: 'e3', title: 'Color Fiesta', body: 'Created fanmade merch and ran a booth at Color Fiesta Festival.', tag: 'COLOR FIESTA' },
        { id: 'e4', title: 'Amazon Coloring Book', body: 'Took a coloring book commission that was published and sold on Amazon under the name April Amber.', tag: 'AMAZON' },
        { id: 'e5', title: 'Nijien Vtuber Project', body: 'Created illustration work for the Nijien Vtuber Project.', tag: 'VTUBER' },
        { id: 'e6', title: 'Lya Korone', body: 'Worked with animator Lya Korone on animation projects.', tag: 'ANIMATION' },
        { id: 'e7', title: 'Moshie Studio', body: 'Was part of Moshie Studio for a long period and developed as an artist there.', tag: 'STUDIO' },
        { id: 'e8', title: '2DMV', body: 'Interested in participating in a 2DMV project in the future.', tag: 'FUTURE' },
        { id: 'e9', title: 'Print products', body: 'Open to working as an artist on print-product projects where communication is clear and respectful.', tag: 'OPEN TO' }
      ],
      skills: ['Illustration', 'Chibi', 'Character Art', 'VTuber Assets', 'Emotes & Badges', 'Animated Alerts', 'Twitch Panels', 'Merch', 'Comics', 'Visual Storytelling'],
      links: [{ label: 'Email', url: 'crabbie.art@gmail.com' }, { label: 'Twitter / X', url: 'https://x.com/crbbie' }]
    }
  },
  {
    slug: 'terms',
    title: 'Terms of Service',
    content: "# 1. Contact & Work Process\n\nI only accept commissions through Twitter DMs or Gmail: crabbie.art@gmail.com\n\n# 2. Payment & Refund Policy\n\n100% upfront payment is required.\n\n# 3. Edits & Feedback\n\nRough sketch — Unlimited changes.\n\n# 4. Turnaround Time & Deadlines\n\nChibi: 2–3 weeks. Anime: ~1.5 months.\n\n# 5. Files & Formats\n\nTransparent PNG · PNG w/ background · PSD\n\n# 6. What I Don't Draw\n\nDecided case by case.\n\n# 7. Copyright & Usage Rights\n\nPersonal use only. Commercial requires x2.\n\n# 8. Artist Rights\n\nPortfolio use unless private commission.\n\n— Crabbie",
    published: true,
    data: {}
  }
];

// 2. Navigation
const navItems = [
  { title: 'Home', url: '#home', published: true, sort_order: 0 },
  { title: 'Portfolio', url: '#portfolio', published: true, sort_order: 1 },
  { title: 'Free Assets', url: '#free-assets', published: true, sort_order: 2 },
  { title: 'Commissions', url: '#commissions', published: true, sort_order: 3 },
  { title: 'About', url: '#about', published: true, sort_order: 4 },
  { title: 'Terms', url: '#terms', published: true, sort_order: 5 },
  { title: 'Contact', url: '#contact', published: true, sort_order: 6 }
];

// 3. Settings
const settings = [
  { key: 'branding', value: { title: 'CRABBIE', tagline: 'Art made with candy, petals, and the sparkliest of hearts', alternateTagline: '', intro: '', logo: '', heroMedia: '' } },
  { key: 'typography', value: { headingFont: 'Fredoka', bodyFont: 'Nunito', accentFont: 'Gochi Hand' } },
  { key: 'theme', value: { background: '#fffafc', pink: '#ffa0c8', lavender: '#b48aff', ink: '#7a3d6e', displayColor: '#7a3d6e', accentColor: '#ff5c9a', bodyColor: '#7a3d6e', decorativeColor: '#ff5c9a', mutedColor: '#a87098', backgroundImage: '', backgroundSize: 'cover', backgroundPosition: 'center', backgroundOverlay: 0.55, palettes: [] } },
  { key: 'motion', value: { decorations: true, fallingCandy: false, candyDensity: 'normal', animation: true, pet: { enabled: false, maxDesktop: 5, dialogues: [] } } },
  { key: 'music', value: { enabled: false, url: '', title: '', volume: 60, loop: true, autoplay: true } },
  { key: 'language', value: { defaultLanguage: 'en' } },
  { key: 'seo', value: { title: 'CRABBIE', description: 'Sweet little illustrations, dreamy characters, and a sprinkle of heart.', socialImage: '' } },
  { key: 'footer', value: { footer: 'a little candy shop of art' } },
  { key: 'contact', value: { email: 'crabbie.art@gmail.com', twitter: 'https://x.com/crbbie' } }
];

// Check existing
const curPages = await (await fetch(`${url}/rest/v1/cms_pages?select=slug`, { headers })).json();
const existingPages = new Set(curPages.map(p => p.slug));
const missingPages = pages.filter(p => !existingPages.has(p.slug));

const curNav = await (await fetch(`${url}/rest/v1/cms_navigation?select=url`, { headers })).json();
const existingNav = new Set(curNav.map(n => n.url));
const missingNav = navItems.filter(n => !existingNav.has(n.url));

const curSettings = await (await fetch(`${url}/rest/v1/site_settings?select=key`, { headers })).json();
const existingSettings = new Set(curSettings.map(s => s.key));
const missingSettings = settings.filter(s => !existingSettings.has(s.key));

if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({
    pages: { existing: existingPages.size, toInsert: missingPages.map(p => p.slug) },
    nav: { existing: existingNav.size, toInsert: missingNav.map(n => n.url) },
    settings: { existing: existingSettings.size, toInsert: missingSettings.map(s => s.key) }
  }));
} else {
  let pIns = 0, nIns = 0, sIns = 0;
  if (missingPages.length) {
    const res = await fetch(`${url}/rest/v1/cms_pages`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify(missingPages)
    });
    if (!res.ok) throw new Error(`Pages insert failed: ${await res.text()}`);
    pIns = missingPages.length;
  }
  if (missingNav.length) {
    const res = await fetch(`${url}/rest/v1/cms_navigation`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify(missingNav)
    });
    if (!res.ok) throw new Error(`Nav insert failed: ${await res.text()}`);
    nIns = missingNav.length;
  }
  if (missingSettings.length) {
    const res = await fetch(`${url}/rest/v1/site_settings`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify(missingSettings)
    });
    if (!res.ok) throw new Error(`Settings insert failed: ${await res.text()}`);
    sIns = missingSettings.length;
  }
  console.log(JSON.stringify({
    pages: { inserted: pIns, skipped: pages.length - pIns },
    nav: { inserted: nIns, skipped: navItems.length - nIns },
    settings: { inserted: sIns, skipped: settings.length - sIns }
  }));
}
