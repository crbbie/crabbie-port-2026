/* Admin UX visual QA harness.
 *
 * Renders the real SPA (`crabbie-port26.html`) admin shell against a synthetic
 * Supabase boundary, then captures one screenshot per module and viewport so a
 * human reviewer can judge the visual language. It is a presentation harness
 * only: it never touches the database, the repo data or the shipped UI code.
 *
 *   node scripts/admin-ux-screenshots.mjs [--label=before] [--modules=...] [--widths=...]
 *
 * Output: artifacts/<label>/admin-<module>-<width>.png (+ typography specimen).
 */
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const arg = (name, fallback) => {
  const hit = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const label = arg('label', 'current');
const modules = arg('modules', 'settings:Appearance,assets,terms,portfolio,commissions').split(',').map((entry) => entry.trim()).filter(Boolean);
const widths = arg('widths', '1440,1024,768,390').split(',').map((entry) => Number(entry.trim())).filter(Boolean);
const outDir = resolve(root, 'artifacts', label);
const measure = process.argv.includes('--measure');

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const rewrites = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8')).rewrites;
const server = createServer(async (request, response) => {
  try {
    let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const rewrite = rewrites.find(({ source }) => source === path || (source.endsWith('/:path*') && path.startsWith(source.slice(0, -7) + '/')));
    if (rewrite) path = rewrite.destination;
    if (path === '/api/public-config.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' });
      response.end('window.__CRABBIE_SUPABASE_CONFIG__={"url":"https://visual-qa.supabase.co","key":"sb_publishable_visual_qa"};');
      return;
    }
    const file = resolve(root, '.' + path);
    const ext = extname(file).toLowerCase();
    if (!file.startsWith(root + sep) || !Object.prototype.hasOwnProperty.call(mime, ext)) {
      response.writeHead(404).end();
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[ext] });
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

/* Synthetic Supabase boundary: auth events, a PostgREST-ish read chain and the
   storage URL helper. Rows come from window.__shotRows so each capture seeds
   realistic content without a live project. */
const sdkStub = `
const rowsFor = (table) => ((window.__shotRows = window.__shotRows || {})[table] = window.__shotRows[table] || []);
export function createClient(){
  const subs = [];
  const emit = (event, withSession) => subs.forEach((fn) => { try { fn(event, withSession === false ? null : session); } catch (err) {} });
  let idSeq = 500;
  const nextId = () => '00000000-0000-4000-8000-' + String(idSeq++).padStart(12, '0');
  const adminUser = {
    id: '00000000-0000-4000-8000-00000000ad11',
    email: 'admin@example.test',
    app_metadata: { role: 'admin', provider: 'email' },
    user_metadata: {},
    aud: 'authenticated',
    role: 'authenticated',
    created_at: '2026-01-01T00:00:00Z'
  };
  let session = null;
  const makeSession = () => ({
    access_token: 'visual-qa-access-token',
    refresh_token: 'visual-qa-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: adminUser
  });
  const matches = (row, filters) => filters.every(([column, op, value]) => {
    const target = column.includes('->>') ? (row[column.split('->>')[0]] || {})[column.split('->>')[1]] : row[column];
    if (op === 'in') return (Array.isArray(value) ? value : [value]).some((entry) => target === entry);
    if (op === 'is') return value === null ? (target === null || target === undefined) : target === value;
    if (op === 'not') return target !== value;
    return target === value;
  });
  const query = (table) => {
    const state = { op: 'select', payload: null, filters: [], head: false, single: false };
    const finish = () => {
      const tableRows = rowsFor(table);
      const scoped = tableRows.filter((row) => matches(row, state.filters));
      if (state.op === 'insert' || state.op === 'upsert') {
        const payload = Array.isArray(state.payload) ? state.payload : [state.payload];
        payload.forEach((entry) => tableRows.push(Object.assign({ id: nextId(), created_at: new Date().toISOString() }, entry)));
        return state.single ? { data: tableRows[tableRows.length - 1], error: null, count: 1 } : { data: payload, error: null, count: payload.length };
      }
      if (state.op === 'update') {
        scoped.forEach((row) => Object.assign(row, state.payload));
        return state.single ? { data: scoped[0] || null, error: null, count: scoped.length } : { data: scoped, error: null, count: scoped.length };
      }
      if (state.op === 'delete') {
        const removed = scoped.slice();
        removed.forEach((row) => tableRows.splice(tableRows.indexOf(row), 1));
        return { data: removed, error: null, count: removed.length };
      }
      if (state.head) return { data: null, error: null, count: scoped.length };
      if (state.single) return { data: scoped[0] || null, error: null, count: scoped.length };
      return { data: scoped, error: null, count: scoped.length };
    };
    const api = {
      select: () => api,
      insert: (payload) => { state.op = 'insert'; state.payload = payload; return api; },
      update: (payload) => { state.op = 'update'; state.payload = payload; return api; },
      upsert: (payload) => { state.op = 'upsert'; state.payload = payload; return api; },
      delete: () => { state.op = 'delete'; return api; },
      eq: (column, value) => { state.filters.push([column, 'eq', value]); return api; },
      neq: (column, value) => { state.filters.push([column, 'neq', value]); return api; },
      gt: () => api, lt: () => api, gte: () => api, lte: () => api,
      like: () => api, ilike: () => api, or: () => api, match: () => api,
      is: (column, value) => { state.filters.push([column, 'is', value]); return api; },
      not: (column, _op, value) => { state.filters.push([column, 'not', value]); return api; },
      in: (column, value) => { state.filters.push([column, 'in', value]); return api; },
      order: () => api, limit: () => api, range: () => api, abortSignal: () => api,
      single: () => { state.single = true; return api; },
      maybeSingle: () => { state.single = true; return api; },
      then: (resolve, reject) => Promise.resolve().then(finish).then(resolve, reject)
    };
    return api;
  };
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session ? session.user : null }, error: null }),
      refreshSession: async () => ({ data: { session }, error: null }),
      setSession: async () => ({ data: { session }, error: null }),
      signInWithPassword: async () => { session = makeSession(); emit('SIGNED_IN'); return { data: { session, user: adminUser }, error: null }; },
      signOut: async () => { session = null; emit('SIGNED_OUT', false); return { error: null }; },
      onAuthStateChange: (fn) => { subs.push(fn); return { data: { subscription: { unsubscribe() { subs.splice(subs.indexOf(fn), 1); } } } }; }
    },
    from: (table) => query(table),
    rpc: async () => ({ data: null, error: null }),
    storage: {
      from: () => ({
        getPublicUrl: (path) => ({ data: { publicUrl: 'https://visual-qa.supabase.co/storage/v1/object/public/media/' + path } }),
        createSignedUrl: async (path) => ({ data: { signedUrl: 'https://visual-qa.supabase.co/storage/v1/object/sign/media/' + path }, error: null }),
        list: async () => ({ data: [], error: null }),
        upload: async () => ({ data: { path: 'uploaded' }, error: null }),
        remove: async () => ({ data: [], error: null }),
        download: async () => ({ data: null, error: null })
      })
    }
  };
}
`;


/* Realistic, self-contained admin content (no live project, no storage). */
const fixture = () => ({
  site_settings: [
    { key: 'branding', value: { title: 'CRABBIE', tagline: 'a little candy shop of art' }, updated_at: '2026-01-10T00:00:00Z' },
    { key: 'contact', value: { email: 'crabbie.art@gmail.com', twitter: 'https://x.com/crbbie' }, updated_at: '2026-01-10T00:00:00Z' },
    { key: 'seo', value: { title: 'Crabbie — minh hoạ & commission', description: 'Tranh vẽ tay, tài nguyên miễn phí và commission.' }, updated_at: '2026-01-10T00:00:00Z' },
    {
      key: 'theme',
      value: {
        paletteNames: ['blush', 'berry'],
        colors: { berry: '#7a3054', 'pink-hot': '#ff5fb0', 'pink-light': '#ffb8dd', 'pink-soft': '#fff0f8', lavender: '#e9dcff' },
        displayColor: '#7a3054',
        accentColor: '#ff5fb0'
      },
      updated_at: '2026-01-10T00:00:00Z'
    }
  ],
  portfolio_projects: [
    {
      id: '00000000-0000-4000-8000-000000000001', slug: 'color-fiesta', title: 'Color Fiesta',
      description: 'Một bộ tranh minh hoạ ngọt ngào cho mùa hè.', tags: ['illustration', 'character'],
      thumbnail_path: '', cover_path: '', content: { categorySlug: 'illustration', blocks: [] },
      featured: true, published: true, sort_order: 0, updated_at: '2026-01-01T00:00:00Z'
    },
    {
      id: '00000000-0000-4000-8000-000000000002', slug: 'petal-parade', title: 'Petal Parade',
      description: 'Chibi trong vườn hoa pastel.', tags: ['chibi'],
      thumbnail_path: '', cover_path: '', content: { categorySlug: 'chibi', blocks: [] },
      featured: false, published: true, sort_order: 1, updated_at: '2026-01-02T00:00:00Z'
    }
  ],
  free_assets: [
    {
      id: '00000000-0000-4000-8000-000000000011', slug: 'petal-pack', title: 'Petal brush pack',
      description: 'Bộ cọ vẽ cánh hoa cho Procreate.', tags: ['brush', 'candy'], thumbnail_path: '',
      file_path: 'https://example.test/seed.zip', file_type: 'ZIP', availability: 'available',
      metadata: {}, featured: false, published: true, sort_order: 0, updated_at: '2026-01-02T00:00:00Z'
    },
    {
      id: '00000000-0000-4000-8000-000000000012', slug: 'sweet-lines', title: 'Sweet line pack',
      description: 'Line art miễn phí cho luyện tập.', tags: ['lineart'], thumbnail_path: '',
      file_path: 'https://example.test/lines.zip', file_type: 'ZIP', availability: 'waiting',
      metadata: {}, featured: false, published: true, sort_order: 1, updated_at: '2026-01-03T00:00:00Z'
    }
  ],
  commission_services: [
    {
      id: '00000000-0000-4000-8000-000000000021', slug: 'bust-up', title: 'Bust up',
      description: 'Tranh bán thân màu nước.', price: 70, currency: 'USD', availability: 'open',
      form_slug: 'emails', thumbnail_path: '', featured: true, published: true,
      details: { deliveryEstimate: '2 tuần', isOtherService: false }, sort_order: 0, updated_at: '2026-01-03T00:00:00Z'
    },
    {
      id: '00000000-0000-4000-8000-000000000022', slug: 'full-body', title: 'Full body',
      description: 'Tranh toàn thân kèm nền đơn giản.', price: 140, currency: 'USD', availability: 'waiting',
      form_slug: 'emails', thumbnail_path: '', featured: false, published: true,
      details: { deliveryEstimate: '4 tuần', isOtherService: false }, sort_order: 1, updated_at: '2026-01-04T00:00:00Z'
    }
  ],
  commission_forms: [
    {
      id: '00000000-0000-4000-8000-000000000031', slug: 'emails', title: 'Form commission',
      description: 'Form đặt commission.', published: true,
      fields: [{ id: 'f1', label: 'Email liên hệ', type: 'email', required: true }],
      updated_at: '2026-01-04T00:00:00Z'
    }
  ],
  cms_categories: [
    { id: '00000000-0000-4000-8000-000000000041', slug: 'illustration', title: 'Illustration', kind: 'portfolio', sort_order: 0, published: true, updated_at: '2026-01-01T00:00:00Z' },
    { id: '00000000-0000-4000-8000-000000000042', slug: 'chibi', title: 'Chibi', kind: 'portfolio', sort_order: 1, published: true, updated_at: '2026-01-01T00:00:00Z' }
  ],
  cms_pages: [
    {
      id: '00000000-0000-4000-8000-000000000051', slug: 'about', title: 'Giới thiệu',
      content: 'Xin chào, mình là Crabbie.', published: true,
      data: { name: 'Crabbie', bio: 'Mình vẽ minh hoạ pastel.', skills: [], experience: [], links: [] },
      updated_at: '2026-01-05T00:00:00Z'
    },
    {
      id: '00000000-0000-4000-8000-000000000052', slug: 'terms', title: 'Điều khoản dịch vụ',
      content: '## 1. Liên hệ\n\nVui lòng gửi email trước khi đặt commission.\n\n## 2. Thanh toán\n\nThanh toán 50% trước khi bắt đầu.',
      published: true, data: {}, updated_at: '2026-01-06T00:00:00Z'
    }
  ],
  cms_navigation: [
    { id: '00000000-0000-4000-8000-000000000061', title: 'Portfolio', url: '#portfolio', published: true, sort_order: 0, updated_at: '2026-01-07T00:00:00Z' },
    { id: '00000000-0000-4000-8000-000000000062', title: 'Tài nguyên miễn phí', url: '#free-assets', published: true, sort_order: 1, updated_at: '2026-01-07T00:00:00Z' }
  ],
  people: [
    { id: '00000000-0000-4000-8000-000000000071', name: 'Crabbie', role: 'artist', sort_order: 0, updated_at: '2026-01-01T00:00:00Z' }
  ],
  portfolio_project_people: [],
  commission_requests: [],
  media: []
});

/* Objective QA probe: resolved fonts, measured contrast ratios, control sizes and
   horizontal overflow for the module currently on screen. Gradient surfaces are
   reported with the resolved background colour of the element behind them, so the
   ratio is a conservative lower-bound estimate. */
const measurePage = () => {
  const parseRgb = (value) => {
    const nums = String(value).match(/[\d.]+/g);
    if (!nums || nums.length < 3) return null;
    return { r: Number(nums[0]) / 255, g: Number(nums[1]) / 255, b: Number(nums[2]) / 255, a: nums.length > 3 ? Number(nums[3]) : 1 };
  };
  const luminance = ({ r, g, b }) => {
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const effectiveBackground = (el) => {
    let node = el;
    let stack = [];
    while (node && node !== document.documentElement) {
      const own = parseRgb(getComputedStyle(node).backgroundColor);
      if (own && own.a > 0) stack.push(own);
      node = node.parentElement;
    }
    stack.push({ r: 1, g: 1, b: 1, a: 1 });
    let base = stack[stack.length - 1];
    for (let i = stack.length - 2; i >= 0; i -= 1) base = blend(stack[i], base);
    return base;
  };
  const ratio = (fgColor, el) => {
    const fg = parseRgb(fgColor);
    if (!fg) return null;
    const bg = effectiveBackground(el);
    const solid = fg.a < 1 ? blend(fg, bg) : fg;
    const l1 = luminance(solid);
    const l2 = luminance(bg);
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };
  const describe = (selector, extra) => {
    const el = document.querySelector(selector);
    if (!el) return { selector, missing: true };
    const css = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return Object.assign({
      selector,
      fontFamily: css.fontFamily,
      fontSize: parseFloat(css.fontSize),
      fontWeight: css.fontWeight,
      textTransform: css.textTransform,
      color: css.color,
      background: css.backgroundColor,
      gradient: css.backgroundImage === 'none' ? null : css.backgroundImage.slice(0, 120),
      contrast: ratio(css.color, el),
      width: Math.round(box.width),
      height: Math.round(box.height)
    }, extra || {});
  };
  const surfaces = (list) => list.map(([name, selector, pseudo]) => {
    const el = document.querySelector(selector);
    if (!el) return { name, selector, missing: true };
    const css = getComputedStyle(el, pseudo || null);
    return {
      name,
      background: css.backgroundColor,
      gradient: css.backgroundImage === 'none' ? null : css.backgroundImage.replace(/\s+/g, ' ').slice(0, 110),
      text: css.color,
      border: css.borderTopColor + ' ' + css.borderTopWidth,
      shadow: css.boxShadow === 'none' ? null : css.boxShadow.replace(/\s+/g, ' ')
    };
  });
  const content = document.getElementById('adminContent');
  const topbar = document.querySelector('.admin-topbar');
  const firstRow = content.querySelector('.adm-row');
  const colourField = content.querySelector('.adm-field[data-adm-color-field]');
  const colourInputs = colourField ? Array.from(colourField.querySelectorAll('input')) : [];
  return {
    tokenContrast: (() => {
      const root = getComputedStyle(document.documentElement);
      const token = (name) => root.getPropertyValue(name).trim();
      const hex = (value) => {
        const clean = value.replace('#', '');
        return { r: parseInt(clean.slice(0, 2), 16) / 255, g: parseInt(clean.slice(2, 4), 16) / 255, b: parseInt(clean.slice(4, 6), 16) / 255, a: 1 };
      };
      const pair = (fgHex, bgHex) => {
        const l1 = luminance(hex(fgHex));
        const l2 = luminance(hex(bgHex));
        const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
        return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
      };
      return {
        'text on canvas': pair(token('--admin-text'), token('--admin-canvas')),
        'text-secondary on canvas': pair(token('--admin-text-secondary'), token('--admin-canvas')),
        'text on blush surface': pair(token('--admin-text'), token('--admin-surface-blush')),
        'text-secondary on blush surface': pair(token('--admin-text-secondary'), token('--admin-surface-blush')),
        'text-lavender on surface': pair(token('--admin-text-lavender'), token('--admin-surface')),
        'primary on surface': pair(token('--admin-primary'), token('--admin-surface')),
        'primary on selected': pair(token('--admin-primary'), token('--admin-primary-soft')),
        'primary on canvas': pair(token('--admin-primary'), token('--admin-canvas')),
        'white on primary': pair('#ffffff', token('--admin-primary')),
        'white on primary gradient top stop': pair('#ffffff', token('--admin-primary-deep')),
        'white on primary gradient deeper (hover)': pair('#ffffff', token('--admin-primary-strong')),
        'control border on surface': pair(token('--admin-control-border'), token('--admin-surface')),
        'candy border on surface (decorative)': pair(token('--admin-candy-border'), token('--admin-surface')),
        'danger on danger-soft': pair(token('--admin-danger'), token('--admin-danger-soft'))
      };
    })(),
    surfaces: surfaces([
      ['canvas', '.admin-shell'],
      ['sidebar', '.admin-sidebar'],
      ['identity block', '.admin-brand'],
      ['topbar', '.admin-topbar'],
      ['selected navigation', '.admin-nav button[aria-current="page"]'],
      ['nav group label', '.admin-nav .an-group'],
      ['editor surface', '#adminContent .adm-editor'],
      ['section marker', '#adminContent .adm-section h4', '::before'],
      ['section heading', '#adminContent .adm-section h4'],
      ['primary action', '#adminContent .adm-btn-sm.primary, #adminTopSave'],
      ['secondary action', '#adminContent .adm-btn-sm.purple, #adminContent .adm-btn-sm'],
      ['tab track', '#adminContent .adm-settings-subnav'],
      ['selected tab', '#adminContent .adm-settings-subnav button[aria-pressed="true"]'],
      ['unselected tab', '#adminContent .adm-settings-subnav button[aria-pressed="false"]'],
      ['record list', '#adminContent .adm-list'],
      ['selected record', '#adminContent .adm-record[aria-selected="true"]'],
      ['colour swatch', '.adm-field[data-adm-color-field] input[type="color"]'],
      ['burger', '.adm-burger']
    ]),
    fonts: [
      describe('.admin-topbar h1'),
      describe('.admin-topbar .at-eyebrow'),
      describe('.admin-topbar .at-desc'),
      describe('#adminContent .adm-editor h2'),
      describe('#adminContent .adm-section h4'),
      describe('#adminContent .adm-field .af-label'),
      describe('#adminContent .adm-field input[type="text"]'),
      describe('#adminContent .af-hint'),
      describe('#adminContent .adm-list .adm-record .ar-title'),
      describe('#adminContent .adm-meta'),
      describe('#adminContent .mb-meta'),
      describe('#adminContent .adm-btn-sm.primary'),
      describe('#adminContent .adm-btn-sm:not(.primary):not(.purple):not(.danger):not(.tertiary)'),
      describe('#adminContent .adm-btn-sm.purple'),
      describe('.admin-nav button[aria-current="page"]'),
      describe('#adminContent .adm-settings-subnav button[aria-pressed="true"]'),
      describe('#adminContent .adm-settings-subnav button[aria-pressed="false"]'),
      describe('.admin-brand .ab-name'),
      describe('.admin-brand .ab-name small')
    ],
    metrics: {
      topbarHeight: topbar ? Math.round(topbar.getBoundingClientRect().height) : null,
      burgerVisible: Boolean(document.querySelector('.adm-burger') && document.querySelector('.adm-burger').offsetParent),
      sidebarVisible: Boolean(document.querySelector('.admin-sidebar') && document.querySelector('.admin-sidebar').offsetParent),
      topbarZones: (() => {
        const left = document.querySelector('.admin-topbar .at-left');
        const right = document.querySelector('.admin-topbar .at-right');
        if (!left || !right) return null;
        const l = left.getBoundingClientRect();
        const r = right.getBoundingClientRect();
        const sameRow = Math.abs(l.top - r.top) < 8;
        return sameRow ? { sameRow, gap: Math.round(r.left - l.right) } : { sameRow, gap: null };
      })(),
      saveVisible: Boolean(document.getElementById('adminTopSave') && document.getElementById('adminTopSave').offsetParent),
      colourFieldCount: document.querySelectorAll('[data-adm-color-field]').length,
      appearanceControls: Boolean(document.querySelector('#adminContent .adm-appearance-controls')),
      settingsGroupPressed: (document.querySelector('#adminContent [data-adm-settings-group][aria-pressed="true"]') || {}).textContent || null,
      contentOverflow: content ? content.scrollWidth - content.clientWidth : null,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      controlHeight: (() => {
        const control = content.querySelector('.adm-field input[type="text"], .adm-field select, .adm-field textarea');
        return control ? Math.round(control.getBoundingClientRect().height) : null;
      })(),
      rowColumns: firstRow ? getComputedStyle(firstRow).gridTemplateColumns.split(' ').length : null,
      stackedFieldWidth: (() => {
        const field = firstRow ? firstRow.querySelector('.adm-field') : null;
        return field ? Math.round(field.getBoundingClientRect().width) : null;
      })(),
      colourField: colourField ? {
        present: true,
        stacked: colourInputs.length === 2 ? Math.abs(colourInputs[0].getBoundingClientRect().top - colourInputs[1].getBoundingClientRect().top) > 4 : null,
        swatchWidth: colourInputs[0] ? Math.round(colourInputs[0].getBoundingClientRect().width) : null,
        hexWidth: colourInputs[1] ? Math.round(colourInputs[1].getBoundingClientRect().width) : null
      } : { present: false }
    }
  };
};

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const reports = [];
let captured = 0;

for (const width of widths) {
  const height = Math.min(1100, Math.max(760, Math.round(width * 0.72)));
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await context.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ contentType: 'text/javascript', body: sdkStub }));
  const page = await context.newPage();
  page.on('pageerror', (err) => errors.push(`${width}: ${err.message}`));
  await page.addInitScript((rows) => { window.__shotRows = rows; }, fixture());
  await page.goto(origin + '/admin', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.CrabbieAuthService && window.CrabbieAdminCrud));
  await page.locator('#adminEmail').fill('admin@example.test');
  await page.locator('#adminPassword').fill('visual-qa-password');
  await page.locator('#adminLoginBtn').click();
  await page.locator('#adminRealShell').waitFor({ state: 'visible' });
  await page.waitForFunction(() => window.CrabbieAdminCrud.getAdminLoadState() === 'ready');
  await page.evaluate(() => document.fonts.ready);

  for (const spec of modules) {
    const [moduleName, groupName] = spec.split(':');
    const viewName = groupName ? groupName.toLowerCase() : moduleName;
    await page.evaluate((name) => { location.hash = '#admin/' + name; }, moduleName);
    await page.locator(`#adminNav [data-admin-module="${moduleName}"][aria-current="page"]`).waitFor({ state: 'visible' });
    if (groupName) {
      await page.locator(`#adminContent [data-adm-settings-group="${groupName}"]`).click();
      await page.waitForFunction((name) => Boolean(document.querySelector(`#adminContent [data-adm-settings-group="${name}"][aria-pressed="true"]`)), groupName);
    }
    await page.waitForFunction(() => Boolean(document.querySelector('#adminContent .adm-editor, #adminContent .adm-split')));
    await page.evaluate(() => { window.scrollTo(0, 0); });
    await page.waitForTimeout(250);
    const file = resolve(outDir, `admin-${viewName}-${width}.png`);
    await page.screenshot({ path: file });
    await page.screenshot({ path: resolve(outDir, `admin-${viewName}-${width}-full.png`), fullPage: true });
    captured += 2;
    if (measure) reports.push({ label, module: spec, width, ...(await page.evaluate(measurePage)) });
    console.log(`${label} ${spec} @${width} -> ${file}`);
  }

  /* Typography specimen: brand faces vs the functional stack, at a size a human
     can judge Vietnamese diacritics on. */
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'shotSpecimen';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#fff;padding:28px;color:#302735;overflow:auto;font-family:var(--admin-font);';
    const rows = [
      ['--font-display-public · DFVN Starshines', 'Cài đặt website — Tài nguyên miễn phí', 'var(--font-display-public)', '34px'],
      ['--font-decorative-public · iCiel Be Cool', 'ATELIER CMS · THẾ GIỚI NHỎ XINH', 'var(--font-decorative-public)', '26px'],
      ['--admin-font · system stack', 'Cài đặt website — Tài nguyên miễn phí', 'var(--admin-font)', '26px'],
      ['--admin-font · editable value role', 'https://example.test/tệp-tin-rất-dài_2026.psd', 'var(--admin-font)', '16px']
    ];
    host.innerHTML = rows.map(([head, sample, family, size]) => '<div style="margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid #e7e1ea;">' +
      '<div style="font:600 12px var(--admin-font);color:#665b6d;margin-bottom:6px;">' + head + '</div>' +
      '<div style="font-family:' + family + ';font-size:' + size + ';line-height:1.25;">' + sample + '</div></div>').join('');
    document.body.appendChild(host);
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  const specimen = resolve(outDir, `admin-typography-specimen-${width}.png`);
  await page.screenshot({ path: specimen });
  captured += 1;
  console.log(`${label} typography-specimen @${width} -> ${specimen}`);

  await context.close();
}

await browser.close();
server.close();
console.log(`Captured ${captured} screenshot(s) in ${outDir}`);
if (reports.length) console.log('MEASUREMENTS ' + JSON.stringify(reports));
if (errors.length) {
  console.log('Page errors:');
  for (const entry of errors) console.log('  ' + entry);
  process.exitCode = 1;
}
