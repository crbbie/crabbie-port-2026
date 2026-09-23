/**
 * people-core.js
 * Pure People / Clients rules: normalization, HTTPS URL validation,
 * visibility (published vs thank-you), ordered UUID reference resolution,
 * credit-label defaults, project credit strip model, thank-you eligibility.
 *
 * No DOM, no Supabase access.
 */

export const PEOPLE_KINDS = Object.freeze(['client', 'collaborator', 'artist', 'studio', 'creator', 'other']);

export const PEOPLE_PAGE_SIZE = 30;

export const PEOPLE_CREDIT_LABEL_DEFAULT = 'With';
export const PEOPLE_CREDIT_LABEL_MAX = 80;
export const PEOPLE_NAME_MAX = 120;
export const PEOPLE_ALT_MAX = 240;

export const PEOPLE_THANKS_DEFAULTS = Object.freeze({
  enabled: true,
  heading: 'Made with lovely people ♡',
  body: 'To everyone who shared their ideas and trusted me to bring them to life — thank you. ♡'
});

/**
 * HTTPS-only public profile URL normalizer, compatible with safePublicUrl
 * security conventions. Blank permitted. Rejects http, javascript:, data:,
 * blob:, protocol-relative, relative, hash, mailto:, embedded credentials,
 * and malformed URLs.
 */
export function normalizePersonProfileUrl(value) {
  if (value == null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  if (raw.length > 2048) return '';
  const lower = raw.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('#') ||
    lower.startsWith('/') ||
    lower.startsWith('.')
  ) return '';
  let parsed = null;
  try {
    parsed = new URL(raw);
  } catch {
    return '';
  }
  if (parsed.protocol !== 'https:') return '';
  if (!parsed.hostname || parsed.username || parsed.password) return '';
  if (/\s/.test(raw)) return '';
  return parsed.toString();
}

export function isValidPersonProfileUrl(value) {
  if (value == null) return true;
  if (String(value).trim() === '') return true;
  return normalizePersonProfileUrl(value) !== '';
}

export function normalizePersonKind(kind) {
  const k = String(kind || '').trim().toLowerCase();
  return PEOPLE_KINDS.includes(k) ? k : 'other';
}

export function normalizePerson(row) {
  const source = row && typeof row === 'object' ? row : {};
  const displayName = String(source.display_name ?? source.displayName ?? source.title ?? source.name ?? '').trim().slice(0, PEOPLE_NAME_MAX);
  return {
    id: typeof source.id === 'string' ? source.id : (source.id != null ? String(source.id) : ''),
    dbId: typeof source.dbId === 'string' ? source.dbId : (typeof source.id === 'string' ? source.id : ''),
    displayName,
    display_name: displayName,
    avatar: typeof source.avatar_path === 'string' ? source.avatar_path : (typeof source.avatar === 'string' ? source.avatar : ''),
    avatar_path: typeof source.avatar_path === 'string' ? source.avatar_path : (typeof source.avatar === 'string' ? source.avatar : ''),
    avatarAlt: String(source.avatar_alt ?? source.avatarAlt ?? ''),
    avatar_alt: String(source.avatar_alt ?? source.avatarAlt ?? ''),
    profileUrl: normalizePersonProfileUrl(source.profile_url ?? source.profileUrl ?? ''),
    profile_url: normalizePersonProfileUrl(source.profile_url ?? source.profileUrl ?? ''),
    kind: normalizePersonKind(source.kind),
    published: !!source.published,
    showInThankYou: !!(source.show_in_thank_you ?? source.showInThankYou),
    show_in_thank_you: !!(source.show_in_thank_you ?? source.showInThankYou),
    sortOrder: Number.isFinite(Number(source.sort_order ?? source.sortOrder)) ? Number(source.sort_order ?? source.sortOrder) : 0,
    sort_order: Number.isFinite(Number(source.sort_order ?? source.sortOrder)) ? Number(source.sort_order ?? source.sortOrder) : 0,
    originalUpdatedAt: typeof source.originalUpdatedAt === 'string' ? source.originalUpdatedAt : (typeof source.updated_at === 'string' ? source.updated_at : null),
    updated_at: typeof source.updated_at === 'string' ? source.updated_at : (typeof source.originalUpdatedAt === 'string' ? source.originalUpdatedAt : null)
  };
}

export function validatePersonForSave(person) {
  const errors = {};
  const p = normalizePerson(person || {});
  if (!p.displayName) errors.display_name = 'Enter a display name.';
  else if (p.displayName.length > PEOPLE_NAME_MAX) errors.display_name = `Keep the name under ${PEOPLE_NAME_MAX} characters.`;
  if (String(p.avatarAlt || '').length > PEOPLE_ALT_MAX) errors.avatar_alt = `Keep avatar alt under ${PEOPLE_ALT_MAX} characters.`;
  const rawUrl = person && (person.profile_url ?? person.profileUrl);
  if (rawUrl != null && String(rawUrl).trim() !== '' && !normalizePersonProfileUrl(rawUrl)) {
    errors.profile_url = 'Profile URL must be a valid https:// link, or left blank.';
  }
  if (!PEOPLE_KINDS.includes(p.kind)) errors.kind = 'Choose a valid type.';
  if (p.published && p.showInThankYou && !String(p.avatar || '').trim()) {
    errors.show_in_thank_you = 'An avatar is required to show this person in the thank-you section.';
  }
  return { person: p, errors, ok: Object.keys(errors).length === 0 };
}

/** Published Person may appear in project credits (thank-you flag irrelevant). */
export function isCreditVisiblePerson(person) {
  const p = person && typeof person === 'object' ? person : {};
  const name = String(p.displayName ?? p.display_name ?? '').trim();
  return !!p.published && !!name;
}

/** Thank-you eligibility: published + opted in + usable avatar. */
export function isThankYouPerson(person) {
  const p = person && typeof person === 'object' ? person : {};
  const name = String(p.displayName ?? p.display_name ?? '').trim();
  const avatar = String(p.avatar ?? p.avatar_path ?? '').trim();
  return !!p.published && !!(p.showInThankYou ?? p.show_in_thank_you) && !!name && !!avatar;
}

/**
 * Ordered UUID references: trim, drop empties, dedupe preserving first-seen
 * order. Empty selection => [] (removes all associations).
 */
export function normalizePeopleIds(ids) {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const out = [];
  ids.forEach((entry) => {
    const id = String(entry ?? '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  });
  return out;
}

/**
 * Resolve ordered references against a People map. Drops missing/unpublished
 * ids; never falls back to copied text.
 */
export function resolveProjectPeople(peopleIds, peopleById) {
  const ids = normalizePeopleIds(peopleIds);
  const map = peopleById && typeof peopleById === 'object' ? peopleById : {};
  const out = [];
  ids.forEach((id) => {
    const person = map[id];
    if (!person) return;
    if (!isCreditVisiblePerson(person)) return;
    out.push(person);
  });
  return out;
}

export function normalizeCreditLabel(value) {
  const text = value == null ? '' : String(value).trim().slice(0, PEOPLE_CREDIT_LABEL_MAX);
  return text;
}

export function creditLabelForProject(content) {
  const label = normalizeCreditLabel(content && (content.peopleCreditLabel ?? content.people_credit_label));
  return label || PEOPLE_CREDIT_LABEL_DEFAULT;
}

/**
 * Credit strip view-model: ordered visible people + label. Returns null when
 * nothing public resolves (no visible strip).
 */
export function projectCreditStrip(project, peopleById) {
  const content = (project && project.content && typeof project.content === 'object')
    ? project.content
    : project || {};
  const ids = normalizePeopleIds(
    project?.peopleIds ?? project?.people_ids ?? content?.peopleIds ?? project?.people_ids
  );
  // Also support junction rows passed directly.
  const direct = Array.isArray(project?.people) ? project.people.filter(isCreditVisiblePerson) : null;
  const people = direct && direct.length ? direct : resolveProjectPeople(ids, peopleById);
  if (!people.length) return null;
  return { label: creditLabelForProject(content), people };
}

/** "A", "A & B", "A, B & C" joining for display names. */
export function joinCreditNames(names) {
  const list = (Array.isArray(names) ? names : []).map((n) => String(n ?? '').trim()).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} & ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} & ${list[list.length - 1]}`;
}

export function normalizeThanksSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    enabled: source.enabled !== false,
    heading: typeof source.heading === 'string' ? source.heading : PEOPLE_THANKS_DEFAULTS.heading,
    body: typeof source.body === 'string' ? source.body : PEOPLE_THANKS_DEFAULTS.body
  };
}

export function validateThanksSettings(value) {
  const normalized = normalizeThanksSettings(value);
  const errors = {};
  if (normalized.enabled && !String(normalized.heading || '').trim()) {
    errors.heading = 'Add a heading while the thank-you section is enabled.';
  }
  return { settings: normalized, errors, ok: Object.keys(errors).length === 0 };
}

/** Thank-you list: eligible only, deterministic sort_order,id order. */
export function thankYouList(people) {
  return (Array.isArray(people) ? people : [])
    .map(normalizePerson)
    .filter(isThankYouPerson)
    .sort((a, b) => (a.sortOrder - b.sortOrder) || (String(a.id) < String(b.id) ? -1 : 1));
}

/** 0 | 1-5 static | 6+ marquee-capable. Pure state decision for rendering. */
export function thankYouPresentation(count, capabilities = {}) {
  const total = Number(count) || 0;
  if (total <= 0) return 'hidden';
  if (total < 6) return 'static';
  if (capabilities.reducedMotion || capabilities.coarsePointer || capabilities.noHover) return 'static-scroll';
  return 'marquee';
}

export function initialsForName(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '♡';
  const first = words[0];
  // Non-Latin safe: first grapheme cluster-ish (code-point aware).
  const chars = Array.from(first);
  const second = words.length > 1 ? Array.from(words[1])[0] || '' : '';
  return (chars[0] + second).toUpperCase().slice(0, 2) || '♡';
}

export function formatPersonRow(record, sortOrder = 0) {
  const { person, errors, ok } = validatePersonForSave(record || {});
  if (!ok) {
    const first = Object.values(errors)[0] || 'Invalid person.';
    throw new Error(first);
  }
  return {
    display_name: person.displayName,
    avatar_path: person.avatar ? person.avatar : null,
    avatar_alt: String(person.avatarAlt || '').slice(0, PEOPLE_ALT_MAX),
    profile_url: person.profileUrl ? person.profileUrl : null,
    kind: person.kind,
    published: !!person.published,
    show_in_thank_you: !!person.showInThankYou,
    sort_order: Number.isInteger(sortOrder) ? sortOrder : person.sortOrder
  };
}

export function mapPersonRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    dbId: row.id,
    originalUpdatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
    displayName: String(row.display_name ?? '').trim(),
    avatar: row.avatar_path || '',
    avatarAlt: row.avatar_alt || '',
    profileUrl: normalizePersonProfileUrl(row.profile_url || ''),
    kind: normalizePersonKind(row.kind),
    published: !!row.published,
    showInThankYou: !!row.show_in_thank_you,
    sortOrder: Number(row.sort_order) || 0
  };
}
