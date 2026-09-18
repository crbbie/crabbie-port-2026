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

const assets = [
  {
    slug: 'petal-pack',
    title: 'Petal Pack',
    description: '[ASSET DESCRIPTION FROM CMS]',
    file_type: 'PNG',
    file_path: '',
    availability: 'available',
    published: true,
    sort_order: 0,
    metadata: {
      cat: 'Brushes',
      format: 'PNG',
      icon: '❀',
      version: '[VERSION]',
      date: '[DATE]',
      credit: '[CREDIT REQUIREMENT]',
      license: '[LICENSE CONTENT FROM CMS]',
      update: '[UPDATE NOTE]',
      downloadUrl: '',
      flowerTag: 'NEW',
      filterCat: 'brushes psd-png',
      tags: ['Brushes', 'PNG']
    }
  },
  {
    slug: 'sparkle-stars',
    title: 'Sparkle Stars',
    description: '[ASSET DESCRIPTION FROM CMS]',
    file_type: 'SVG',
    file_path: '',
    availability: 'available',
    published: true,
    sort_order: 1,
    metadata: {
      cat: 'Elements',
      format: 'SVG',
      icon: '★',
      version: '[VERSION]',
      date: '[DATE]',
      credit: '[CREDIT REQUIREMENT]',
      license: '[LICENSE CONTENT FROM CMS]',
      update: '[UPDATE NOTE]',
      downloadUrl: '',
      filterCat: 'icons other stream-assets',
      tags: ['Elements', 'SVG']
    }
  },
  {
    slug: 'candy-hearts',
    title: 'Candy Hearts',
    description: '[ASSET DESCRIPTION FROM CMS]',
    file_type: 'PSD',
    file_path: '',
    availability: 'unavailable',
    published: true,
    sort_order: 2,
    metadata: {
      cat: 'Stickers',
      format: 'PSD',
      icon: '♡',
      version: '[VERSION]',
      date: '[DATE]',
      credit: '[CREDIT REQUIREMENT]',
      license: '[LICENSE CONTENT FROM CMS]',
      update: '[UPDATE NOTE]',
      downloadUrl: '',
      filterCat: 'emotes psd-png',
      tags: ['Stickers', 'PSD']
    }
  },
  {
    slug: 'lilac-frames',
    title: 'Lilac Frames',
    description: '[ASSET DESCRIPTION FROM CMS]',
    file_type: 'PNG',
    file_path: '',
    availability: 'unavailable',
    published: true,
    sort_order: 3,
    metadata: {
      cat: 'Frames',
      format: 'PNG',
      icon: '❁',
      version: '[VERSION]',
      date: '[DATE]',
      credit: '[CREDIT REQUIREMENT]',
      license: '[LICENSE CONTENT FROM CMS]',
      update: '[UPDATE NOTE]',
      downloadUrl: '',
      flowerTag: 'HOT',
      filterCat: 'overlays psd-png',
      tags: ['Frames', 'PNG']
    }
  },
  {
    slug: 'cloud-ribbons',
    title: 'Cloud Ribbons',
    description: '[ASSET DESCRIPTION FROM CMS]',
    file_type: 'AI',
    file_path: '',
    availability: 'unavailable',
    published: true,
    sort_order: 4,
    metadata: {
      cat: 'Vectors',
      format: 'AI',
      icon: '☁',
      version: '[VERSION]',
      date: '[DATE]',
      credit: '[CREDIT REQUIREMENT]',
      license: '[LICENSE CONTENT FROM CMS]',
      update: '[UPDATE NOTE]',
      downloadUrl: '',
      filterCat: 'stream-assets overlays other',
      tags: ['Vectors', 'AI']
    }
  },
  {
    slug: 'pastel-gradients',
    title: 'Pastel Gradients',
    description: '[ASSET DESCRIPTION FROM CMS]',
    file_type: 'PNG',
    file_path: '',
    availability: 'unavailable',
    published: true,
    sort_order: 5,
    metadata: {
      cat: 'Textures',
      format: 'PNG',
      icon: '❖',
      version: '[VERSION]',
      date: '[DATE]',
      credit: '[CREDIT REQUIREMENT]',
      license: '[LICENSE CONTENT FROM CMS]',
      update: '[UPDATE NOTE]',
      downloadUrl: '',
      filterCat: 'wallpapers psd-png',
      tags: ['Textures', 'PNG']
    }
  },
  {
    slug: 'cute-sfx',
    title: 'Cute SFX',
    description: '[ASSET DESCRIPTION FROM CMS]',
    file_type: 'WAV',
    file_path: '',
    availability: 'unavailable',
    published: true,
    sort_order: 6,
    metadata: {
      cat: 'Audio',
      format: 'WAV',
      icon: '♪',
      version: '[VERSION]',
      date: '[DATE]',
      credit: '[CREDIT REQUIREMENT]',
      license: '[LICENSE CONTENT FROM CMS]',
      update: '[UPDATE NOTE]',
      downloadUrl: '',
      filterCat: 'other',
      tags: ['Audio', 'WAV']
    }
  },
  {
    slug: 'soft-liner',
    title: 'Soft Liner',
    description: '[ASSET DESCRIPTION FROM CMS]',
    file_type: 'BRUSH',
    file_path: '',
    availability: 'unavailable',
    published: true,
    sort_order: 7,
    metadata: {
      cat: 'Brushes',
      format: 'BRUSH',
      icon: '✎',
      version: '[VERSION]',
      date: '[DATE]',
      credit: '[CREDIT REQUIREMENT]',
      license: '[LICENSE CONTENT FROM CMS]',
      update: '[UPDATE NOTE]',
      downloadUrl: '',
      filterCat: 'brushes',
      tags: ['Brushes', 'BRUSH']
    }
  }
];

const headers = { apikey: secret, Authorization: `Bearer ${secret}`, 'User-Agent': 'CrabbieAssetSeeder/1.0' };
const current = await fetch(`${url}/rest/v1/free_assets?select=slug`, { headers });
if (!current.ok) throw new Error(`Cannot read free_assets records: ${await current.text()}`);

const existing = new Set((await current.json()).map((row) => row.slug));
const missing = assets.filter((a) => !existing.has(a.slug));

if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({ existing: existing.size, toInsert: missing.map((a) => a.slug) }));
} else if (missing.length) {
  const response = await fetch(`${url}/rest/v1/free_assets`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal', 'Content-Type': 'application/json' },
    body: JSON.stringify(missing)
  });
  if (!response.ok) throw new Error(`Free assets import failed: ${await response.text()}`);
  console.log(JSON.stringify({ inserted: missing.length, skipped: assets.length - missing.length }));
} else {
  console.log(JSON.stringify({ inserted: 0, skipped: assets.length }));
}
