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

function fld(id, type, label, placeholder, help, required, contactRole, extra) {
  const f = { id, type, label, placeholder: placeholder || '', help: help || '', required: !!required, contactRole: contactRole || 'none' };
  if (extra) Object.assign(f, extra);
  return f;
}

const forms = [
  {
    slug: 'emotes',
    title: 'Emotes / Badges',
    description: 'Form for emotes and badges.',
    published: true,
    fields: [
      fld('name', 'text', 'Name/Nickname', 'Your name', '', true, 'name'),
      fld('email', 'email', 'Email', 'you@example.com', '', true, 'email'),
      fld('social', 'text', 'Twitter/Discord', '@yourhandle', '', false, 'contact'),
      fld('quantity', 'text', 'How many emotes/badges do you need?', '15', '', false, 'none'),
      fld('description', 'textarea', 'Name + description for each emote/badge', 'Write your list here…', '', false, 'none'),
      fld('references', 'text', 'Reference images', 'Paste a link…', '', false, 'none'),
      fld('samples', 'text', 'Sample emotes/badges', 'Paste a link…', '', false, 'none'),
      fld('deadline', 'text', 'Do you need it urgently?', 'No / deadline…', '', false, 'none'),
      fld('uncropped', 'radio', 'Would you like the uncropped/full version?', '', '', false, 'none', { options: ['Yes', 'No'] }),
      fld('usage', 'radio', 'Usage', '', '', false, 'none', { options: ['Personal', 'Commercial'] }),
      fld('notes', 'textarea', 'Additional notes', '…', '', false, 'none')
    ]
  },
  {
    slug: 'panels',
    title: 'Twitch Panels',
    description: 'Form for Twitch panels.',
    published: true,
    fields: [
      fld('name', 'text', 'Name/Nickname', 'Your name', '', true, 'name'),
      fld('email', 'email', 'Email', 'you@example.com', '', true, 'email'),
      fld('social', 'text', 'Twitter/Discord', '@yourhandle', '', false, 'contact'),
      fld('quantity', 'text', 'How many panels do you need?', '4', '', false, 'none'),
      fld('description', 'textarea', 'Panel names and descriptions', 'Write your list here…', '', false, 'none'),
      fld('background', 'radio', 'Background designs?', '', '', false, 'none', { options: ['Yes', 'No'] }),
      fld('references', 'text', 'Reference images', 'Paste a link…', '', false, 'none'),
      fld('deadline', 'text', 'Urgent deadline?', 'No / deadline…', '', false, 'none'),
      fld('usage', 'radio', 'Usage', '', '', false, 'none', { options: ['Personal', 'Commercial'] }),
      fld('notes', 'textarea', 'Additional notes', '…', '', false, 'none')
    ]
  },
  {
    slug: 'alerts',
    title: 'Animated Alerts',
    description: 'Form for animated alerts.',
    published: true,
    fields: [
      fld('name', 'text', 'Name/Nickname', 'Your name', '', true, 'name'),
      fld('email', 'email', 'Email', 'you@example.com', '', true, 'email'),
      fld('social', 'text', 'Twitter/Discord', '@yourhandle', '', false, 'contact'),
      fld('quantity', 'text', 'How many alerts do you need?', '3 alerts', '', false, 'none'),
      fld('references', 'text', 'Reference images', 'Paste a link…', '', false, 'none'),
      fld('description', 'textarea', 'Description for each alert', 'Write your list here…', '', false, 'none'),
      fld('outputFormat', 'select', 'Output format', '', '', false, 'none', { options: ['WebM', 'MP4', 'gif'] }),
      fld('deadline', 'text', 'Urgent deadline?', 'No / deadline…', '', false, 'none'),
      fld('usage', 'radio', 'Usage', '', '', false, 'none', { options: ['Personal', 'Commercial'] }),
      fld('notes', 'textarea', 'Additional notes', '…', '', false, 'none')
    ]
  },
  {
    slug: 'illustration',
    title: 'Normal / Chibi Illustration',
    description: 'Form for illustrations.',
    published: true,
    fields: [
      fld('name', 'text', 'Name/Nickname', 'Your name', '', true, 'name'),
      fld('email', 'email', 'Email', 'you@example.com', '', true, 'email'),
      fld('social', 'text', 'Twitter/Discord', '@yourhandle', '', false, 'contact'),
      fld('description', 'textarea', 'Tell me your idea', 'Describe your idea…', '', false, 'none'),
      fld('background', 'textarea', 'Background?', 'Describe the background…', '', false, 'none'),
      fld('references', 'text', 'Reference images', 'Paste a link…', '', false, 'none'),
      fld('canvas', 'text', 'Canvas size / layout', 'Vertical / horizontal / not sure', '', false, 'none'),
      fld('usage', 'radio', 'Usage', '', '', false, 'none', { options: ['Personal', 'Commercial'] }),
      fld('deadline', 'text', 'Urgent deadline?', 'No / deadline…', '', false, 'none'),
      fld('notes', 'textarea', 'Additional notes', '…', '', false, 'none')
    ]
  }
];

const services = [
  {
    slug: 'bust-up',
    title: 'Bust Up',
    description: 'Normal / Anime style bust-up illustration.',
    price: 70,
    currency: 'USD',
    availability: 'open',
    form_slug: 'illustration',
    sort_order: 0,
    published: true,
    details: {
      isOtherService: false,
      priceFormatted: '$70',
      alternatePrice: '500,000',
      alternateCurrency: 'VND',
      priceNote: '',
      deliveryEstimate: 'around 1.5 months',
      includedFiles: 'Transparent PNG · PNG w/ background',
      canvas: 'A4 size or larger',
      commercialRule: 'Commercial use (USD source): x2 where applicable',
      extraCharacter: '+50% where applicable',
      backgroundRule: 'varies by commission type',
      tax: '5%',
      rush: '+20%',
      privateFee: '+20%',
      previewLabel: 'BUST UP PREVIEW',
      previewVariant: ''
    }
  },
  {
    slug: 'half-body',
    title: 'Half Body',
    description: 'Normal / Anime style half-body illustration.',
    price: 100,
    currency: 'USD',
    availability: 'open',
    form_slug: 'illustration',
    sort_order: 1,
    published: true,
    details: {
      isOtherService: false,
      priceFormatted: '$100',
      alternatePrice: '750,000',
      alternateCurrency: 'VND',
      priceNote: 'per character · 750,000 VND',
      deliveryEstimate: 'around 1.5 months',
      includedFiles: 'Transparent PNG · PNG w/ background',
      canvas: 'A4 size or larger',
      commercialRule: 'Commercial use (USD source): x2 where applicable',
      extraCharacter: '+50% where applicable',
      backgroundRule: 'varies by commission type',
      tax: '5%',
      rush: '+20%',
      privateFee: '+20%',
      previewLabel: 'HALF BODY PREVIEW',
      previewVariant: 'v2'
    }
  },
  {
    slug: 'full-body',
    title: 'Full Body',
    description: 'Normal / Anime style full-body illustration.',
    price: 150,
    currency: 'USD',
    availability: 'waitlist',
    form_slug: 'illustration',
    sort_order: 2,
    published: true,
    details: {
      isOtherService: false,
      priceFormatted: '$150',
      alternatePrice: '1,100,000',
      alternateCurrency: 'VND',
      priceNote: 'per character · 1,100,000 VND',
      deliveryEstimate: 'around 1.5 months',
      includedFiles: 'Transparent PNG · PNG w/ background',
      canvas: 'A4 size or larger',
      commercialRule: 'Commercial use (USD source): x2 where applicable',
      extraCharacter: '+50% where applicable',
      backgroundRule: 'varies by commission type',
      tax: '5%',
      rush: '+20%',
      privateFee: '+20%',
      previewLabel: 'FULL BODY PREVIEW',
      previewVariant: 'v3'
    }
  },
  {
    slug: 'chibi-full-body',
    title: 'Chibi Full Body',
    description: 'Chibi style full-body illustration.',
    price: 380000,
    currency: 'VND',
    availability: 'open',
    form_slug: 'illustration',
    sort_order: 3,
    published: true,
    details: {
      isOtherService: false,
      priceFormatted: '380,000 VND',
      alternatePrice: '',
      alternateCurrency: '',
      priceNote: 'per character',
      deliveryEstimate: '2–3 weeks',
      includedFiles: 'Transparent PNG · PNG w/ background',
      canvas: 'based on layout',
      commercialRule: 'Commercial use (newer VND source): +50% base price',
      extraCharacter: '+50% where applicable',
      backgroundRule: 'varies by commission type',
      tax: '5%',
      rush: '+20%',
      privateFee: '+20%',
      previewLabel: 'CHIBI FULL BODY PREVIEW',
      previewVariant: 'v4'
    }
  },
  {
    slug: 'static-emote',
    title: 'Static Emote / Badge',
    description: 'Cute static emotes or badges created for your character.',
    price: 25,
    currency: 'USD',
    availability: 'open',
    form_slug: 'emotes',
    sort_order: 4,
    published: true,
    details: {
      isOtherService: true,
      formType: 'emotes',
      formLabel: 'Emotes / Badges',
      priceFormatted: '$25',
      priceNote: 'each',
      previewLabel: 'STATIC EMOTE / BADGE PREVIEW',
      previewVariant: '',
      chips: ['Static', 'Emote / Badge', 'Each'],
      deliveryEstimate: '2–3 weeks',
      includedFiles: 'Transparent PNG · PNG w/ background',
      canvas: '1167px, then resized for Twitch/Discord',
      commercialRule: 'Uses the existing commercial-use rules.',
      extraCharacter: 'N/A for emotes',
      backgroundRule: 'Simple background included',
      tax: '5%',
      rush: '+20%',
      privateFee: '+20%',
      extraNotes: ''
    }
  },
  {
    slug: 'animated-emote',
    title: 'Animated Emote',
    description: 'Artwork prepared for an animated emote.',
    price: 30,
    currency: 'USD',
    availability: 'open',
    form_slug: 'emotes',
    sort_order: 5,
    published: true,
    details: {
      isOtherService: true,
      formType: 'emotes',
      formLabel: 'Emotes / Badges',
      priceFormatted: '$30',
      priceNote: 'each · PSD only',
      previewLabel: 'ANIMATED EMOTE PREVIEW',
      previewVariant: 'g2',
      chips: ['Animated', 'PSD only', 'Each'],
      deliveryEstimate: '2–3 weeks',
      includedFiles: 'Layered PSD prepared for animation',
      canvas: '1167px, then resized for Twitch/Discord',
      commercialRule: 'Uses the existing commercial-use rules.',
      extraCharacter: 'N/A for emotes',
      backgroundRule: 'Simple background included',
      tax: '5%',
      rush: '+20%',
      privateFee: '+20%',
      extraNotes: 'Animation itself is handled separately.'
    }
  },
  {
    slug: 'emote-bundle',
    title: 'Emote Bundle',
    description: 'A bundle of 15 emotes for a coordinated expression set.',
    price: 281,
    currency: 'USD',
    availability: 'open',
    form_slug: 'emotes',
    sort_order: 6,
    published: true,
    details: {
      isOtherService: true,
      formType: 'emotes',
      formLabel: 'Emotes / Badges',
      priceFormatted: '$281',
      priceNote: '15 pieces',
      previewLabel: '15 EMOTE BUNDLE PREVIEW',
      previewVariant: 'g3',
      chips: ['Bundle', '15 pieces', 'Emotes'],
      deliveryEstimate: '2–3 weeks',
      includedFiles: '15 emote files · transparent PNG',
      canvas: '1167px, then resized for Twitch/Discord',
      commercialRule: 'Uses the existing commercial-use rules.',
      extraCharacter: 'N/A for emotes',
      backgroundRule: 'Simple background included',
      tax: '5%',
      rush: '+20%',
      privateFee: '+20%',
      extraNotes: 'Quantity: 15 pieces.'
    }
  },
  {
    slug: 'alert-halfbody',
    title: 'Animated Alert — Chibi Halfbody',
    description: 'Chibi halfbody artwork prepared for an animated stream alert.',
    price: 45,
    currency: 'USD',
    availability: 'open',
    form_slug: 'alerts',
    sort_order: 7,
    published: true,
    details: {
      isOtherService: true,
      formType: 'alerts',
      formLabel: 'Animated Alerts',
      priceFormatted: '$45',
      priceNote: 'each',
      previewLabel: 'CHIBI HALFBODY ALERT PREVIEW',
      previewVariant: 'g4',
      chips: ['Alert', 'Chibi Halfbody', 'Animated'],
      deliveryEstimate: '2–3 weeks',
      includedFiles: 'Alert artwork prepared for the animator',
      canvas: '1680px',
      commercialRule: 'Uses the existing commercial-use rules.',
      extraCharacter: 'N/A',
      backgroundRule: 'Simple background included',
      tax: '5%',
      rush: '+20%',
      privateFee: '+20%',
      extraNotes: ''
    }
  },
  {
    slug: 'alert-fullbody',
    title: 'Animated Alert — Chibi Fullbody',
    description: 'Chibi fullbody artwork prepared for an animated stream alert.',
    price: 55,
    currency: 'USD',
    availability: 'open',
    form_slug: 'alerts',
    sort_order: 8,
    published: true,
    details: {
      isOtherService: true,
      formType: 'alerts',
      formLabel: 'Animated Alerts',
      priceFormatted: '$55',
      priceNote: 'each',
      previewLabel: 'CHIBI FULLBODY ALERT PREVIEW',
      previewVariant: '',
      chips: ['Alert', 'Chibi Fullbody', 'Animated'],
      deliveryEstimate: '2–3 weeks',
      includedFiles: 'Alert artwork prepared for the animator',
      canvas: '1680px',
      commercialRule: 'Uses the existing commercial-use rules.',
      extraCharacter: 'N/A',
      backgroundRule: 'Simple background included',
      tax: '5%',
      rush: '+20%',
      privateFee: '+20%',
      extraNotes: ''
    }
  },
  {
    slug: 'chibi-panels',
    title: 'Chibi Panels',
    description: 'Chibi Twitch panels designed as a matching stream set.',
    price: 40,
    currency: 'USD',
    availability: 'open',
    form_slug: 'panels',
    sort_order: 9,
    published: true,
    details: {
      isOtherService: true,
      formType: 'panels',
      formLabel: 'Twitch Panels',
      priceFormatted: '$40',
      priceNote: 'each · minimum 4 panels',
      previewLabel: 'CHIBI PANEL PREVIEW',
      previewVariant: 'g2',
      chips: ['Panels', 'Minimum 4', 'Chibi'],
      deliveryEstimate: '2–3 weeks',
      includedFiles: 'Transparent PNG per panel',
      canvas: '~920px',
      commercialRule: 'Uses the existing commercial-use rules.',
      extraCharacter: 'N/A',
      backgroundRule: 'Optional background: +$5 per panel',
      tax: '5%',
      rush: '+20%',
      privateFee: '+20%',
      extraNotes: 'Minimum 4 panels per order.'
    }
  }
];

const headers = { apikey: secret, Authorization: `Bearer ${secret}`, 'User-Agent': 'CrabbieCommissionsSeeder/1.0' };

// 1. Seed Forms
const currentForms = await fetch(`${url}/rest/v1/commission_forms?select=slug`, { headers });
if (!currentForms.ok) throw new Error(`Cannot read commission_forms: ${await currentForms.text()}`);
const existingForms = new Set((await currentForms.json()).map((r) => r.slug));
const missingForms = forms.filter((f) => !existingForms.has(f.slug));

// 2. Seed Services
const currentServices = await fetch(`${url}/rest/v1/commission_services?select=slug`, { headers });
if (!currentServices.ok) throw new Error(`Cannot read commission_services: ${await currentServices.text()}`);
const existingServices = new Set((await currentServices.json()).map((r) => r.slug));
const missingServices = services.filter((s) => !existingServices.has(s.slug));

if (process.argv.includes('--dry-run')) {
  console.log(JSON.stringify({
    forms: { existing: existingForms.size, toInsert: missingForms.map((f) => f.slug) },
    services: { existing: existingServices.size, toInsert: missingServices.map((s) => s.slug) }
  }));
} else {
  let formsInserted = 0;
  if (missingForms.length) {
    const res = await fetch(`${url}/rest/v1/commission_forms`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify(missingForms)
    });
    if (!res.ok) throw new Error(`Commission forms import failed: ${await res.text()}`);
    formsInserted = missingForms.length;
  }
  let servicesInserted = 0;
  if (missingServices.length) {
    const res = await fetch(`${url}/rest/v1/commission_services`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify(missingServices)
    });
    if (!res.ok) throw new Error(`Commission services import failed: ${await res.text()}`);
    servicesInserted = missingServices.length;
  }
  console.log(JSON.stringify({
    forms: { inserted: formsInserted, skipped: forms.length - formsInserted },
    services: { inserted: servicesInserted, skipped: services.length - servicesInserted }
  }));
}
