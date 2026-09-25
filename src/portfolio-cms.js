import { supabase, isConfigured } from './supabase-client.js';
import { mapPortfolioProject } from './portfolio-cms-core.js';
import { normalizePerson, isCreditVisiblePerson } from './people-core.js';

async function fetchProjectPeopleMap() {
  try {
    const links = [];
    let page = 0;
    for (;;) {
      const from = page * 200;
      const res = await supabase.from('portfolio_project_people')
        .select('project_id,person_id,sort_order')
        .order('project_id', { ascending: true })
        .order('sort_order', { ascending: true })
        .range(from, from + 199);
      if (res.error) return {};
      const rows = res.data || [];
      links.push(...rows);
      if (rows.length < 200) break;
      page += 1;
      if (page > 50) break;
    }
    if (!links.length) return {};
    // Resolve person ids to published people in as few queries as possible.
    const personIds = Array.from(new Set(links.map((l) => String(l.person_id)).filter(Boolean)));
    const peopleById = {};
    for (let i = 0; i < personIds.length; i += 100) {
      const chunk = personIds.slice(i, i + 100);
      const res = await supabase.from('people')
        .select('id,display_name,avatar_path,avatar_alt,profile_url,kind,published,show_in_thank_you,sort_order,updated_at')
        .in('id', chunk)
        .eq('published', true);
      if (res.error) return {};
      (res.data || []).forEach((row) => {
        const person = normalizePerson({
          id: row.id, display_name: row.display_name, avatar_path: row.avatar_path,
          avatar_alt: row.avatar_alt, profile_url: row.profile_url, kind: row.kind,
          published: row.published, show_in_thank_you: row.show_in_thank_you,
          sort_order: row.sort_order, updated_at: row.updated_at
        });
        if (isCreditVisiblePerson(person)) peopleById[person.id] = person;
      });
    }
    // Map project slug -> ordered visible people via project ids.
    return { links, peopleById };
  } catch {
    return {};
  }
}

/* Latest-request ownership: startup hydration and an explicit CMS refresh can
   overlap, so only the newest request may apply or settle public state. */
let generation = 0;

export async function hydratePortfolio() {
  const gen = ++generation;
  try {
    if (!isConfigured || !supabase || !window.CrabbiePortfolio) return false;
    const { data, error } = await supabase.from('portfolio_projects').select('id,slug,title,description,tags,thumbnail_path,cover_path,featured,published,content,sort_order').eq('published', true).order('sort_order', { ascending: true });
    if (error) { console.error('Portfolio CMS query failed:', error.message); return false; }
    let assoc = {};
    try {
      assoc = await fetchProjectPeopleMap();
    } catch { assoc = {}; }
    /* The association fetch is a second round trip. A superseded snapshot must
       not come back when it is the slower one, so ownership is re-checked after
       it settles and before anything is published. */
    if (gen !== generation) return true;
    const idToSlug = {};
    (data || []).forEach((row) => { if (row.id) idToSlug[String(row.id)] = row.slug; });
    const grouped = {};
    if (assoc && Array.isArray(assoc.links)) {
      assoc.links.forEach((link) => {
        const slug = idToSlug[String(link.project_id)];
        const person = assoc.peopleById ? assoc.peopleById[String(link.person_id)] : null;
        if (!slug || !person) return;
        if (!grouped[slug]) grouped[slug] = [];
        grouped[slug].push(person);
      });
    }
    window.CrabbiePortfolio.apply((data || []).map((row) => {
      const mapped = mapPortfolioProject(row);
      mapped.dbId = row.id || null;
      if (grouped[row.slug]) mapped.people = grouped[row.slug];
      return mapped;
    }));
    // People hydration runs in parallel (people-cms.js); re-render credits when it settles.
    try {
      if (window.CrabbiePeople && window.CrabbiePeople.settled && window.CrabbiePortfolio.renderPeople) {
        window.CrabbiePortfolio.renderPeople();
      }
    } catch { /* artwork stays intact */ }
    return true;
  } finally {
    /* Settled either way: a pending detail route must resolve (record, real
       404, or prototype fallback) instead of waiting forever. Only the newest
       request settles, so a superseded response can never mark a newer pending
       hydration as ready. */
    if (gen === generation) {
      window.__CRABBIE_PORTFOLIO_HYDRATED__ = true;
      if (window.CrabbiePortfolio && window.CrabbiePortfolio.settled) window.CrabbiePortfolio.settled();
    }
  }
}
hydratePortfolio();
