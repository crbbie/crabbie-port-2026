import { supabase, isConfigured } from './supabase-client.js';
import {
  normalizePerson,
  isCreditVisiblePerson,
  normalizePeopleIds,
  PEOPLE_PAGE_SIZE
} from './people-core.js';

const PEOPLE_COLUMNS = 'id,display_name,avatar_path,avatar_alt,profile_url,kind,published,show_in_thank_you,sort_order,updated_at';
const LINK_COLUMNS = 'project_id,person_id,sort_order';
const PROJECT_ID_COLUMNS = 'id,slug,published';

let generation = 0;
let peopleById = {};
let peopleOrder = [];
let thanksPeople = [];
let lastError = null;
let settled = false;

function bridge() {
  return {
    byId: { ...peopleById },
    order: [...peopleOrder],
    thanks: [...thanksPeople],
    settled,
    error: lastError ? String(lastError) : null
  };
}

function publish(gen, next) {
  if (gen !== generation) return false;
  peopleById = next.byId;
  peopleOrder = next.order;
  thanksPeople = next.thanks;
  lastError = next.error || null;
  settled = true;
  if (typeof window !== 'undefined') {
    window.CrabbiePeople = {
      byId: { ...peopleById },
      order: [...peopleOrder],
      thanks: [...thanksPeople],
      settled: true,
      error: lastError
    };
    try {
      window.dispatchEvent(new CustomEvent('crabbie:people-settled', { detail: bridge() }));
    } catch { /* non-fatal */ }
    if (window.CrabbiePortfolio && typeof window.CrabbiePortfolio.renderPeople === 'function') {
      try { window.CrabbiePortfolio.renderPeople(); } catch { /* keep artwork intact */ }
    }
  }
  return true;
}

async function collectAllPages(fetchPage, pageSize) {
  const rows = [];
  let page = 0;
  for (;;) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const chunk = await fetchPage(from, to);
    if (!chunk || !Array.isArray(chunk.rows)) throw new Error('People query returned an unexpected shape.');
    rows.push(...chunk.rows);
    if (chunk.rows.length < pageSize) break;
    page += 1;
    if (page > 200) break;
  }
  return rows;
}

/**
 * Public People hydration. Paginates to completion; a partial/failed fetch
 * never publishes a truncated authoritative snapshot (presentation hides).
 */
export async function hydratePeople() {
  const gen = ++generation;
  if (!isConfigured || !supabase) {
    publish(gen, { byId: {}, order: [], thanks: [], error: 'unconfigured' });
    return false;
  }
  try {
    const rows = await collectAllPages(async (from, to) => {
      const res = await supabase.from('people')
        .select(PEOPLE_COLUMNS)
        .eq('published', true)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);
      if (res.error) throw new Error(res.error.message);
      return { rows: res.data || [] };
    }, PEOPLE_PAGE_SIZE > 100 ? PEOPLE_PAGE_SIZE : 100);
    const byId = {};
    const order = [];
    const thanks = [];
    rows.forEach((row) => {
      const person = normalizePerson({
        id: row.id,
        display_name: row.display_name,
        avatar_path: row.avatar_path,
        avatar_alt: row.avatar_alt,
        profile_url: row.profile_url,
        kind: row.kind,
        published: row.published,
        show_in_thank_you: row.show_in_thank_you,
        sort_order: row.sort_order,
        updated_at: row.updated_at,
        dbId: row.id
      });
      if (!isCreditVisiblePerson(person)) return;
      byId[person.id] = person;
      order.push(person.id);
      if (person.showInThankYou && String(person.avatar || '').trim()) thanks.push(person);
    });
    publish(gen, { byId, order, thanks, error: null });
    return true;
  } catch (err) {
    // Hide People presentation on failure rather than claiming stale data is current.
    publish(gen, { byId: {}, order: [], thanks: [], error: err && err.message ? err.message : 'People load failed' });
    return false;
  }
}

/**
 * Public project->people associations. Returns { projectId: [personIds...] }
 * for published projects only. Paginated; never truncated at the API default.
 */
export async function hydrateProjectPeople(projectIds) {
  const ids = normalizePeopleIds(projectIds);
  if (!isConfigured || !supabase) return {};
  try {
    const links = await collectAllPages(async (from, to) => {
      let query = supabase.from('portfolio_project_people')
        .select(LINK_COLUMNS)
        .order('project_id', { ascending: true })
        .order('sort_order', { ascending: true })
        .range(from, to);
      const res = await query;
      if (res.error) throw new Error(res.error.message);
      return { rows: res.data || [] };
    }, 200);
    const grouped = {};
    links.forEach((link) => {
      const pid = String(link.project_id || '');
      const personId = String(link.person_id || '');
      if (!pid || !personId) return;
      if (ids.length && !ids.includes(pid)) return;
      if (!grouped[pid]) grouped[pid] = [];
      if (!grouped[pid].includes(personId)) grouped[pid].push(personId);
    });
    return grouped;
  } catch {
    return {};
  }
}

export function getPeopleSnapshot() {
  return bridge();
}

export function getPerson(id) {
  return peopleById[String(id)] || null;
}

if (typeof window !== 'undefined') {
  window.CrabbiePeople = window.CrabbiePeople || { byId: {}, order: [], thanks: [], settled: false, error: null };
}

hydratePeople();
