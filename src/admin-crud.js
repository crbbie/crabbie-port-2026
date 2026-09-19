import { supabase, isConfigured } from './supabase-client.js';
import {
  formatPortfolioRow,
  formatAssetRow,
  formatCommissionRow,
  formatNavigationRow,
  formatPageRow,
  formatSettingRow
} from './admin-crud-core.js';
import { formatMediaItem } from './admin-media-core.js';
import { deleteMediaFile } from './admin-media.js';
import { formatRequestRowForAdmin, mapAdminStatusToDbStatus } from './commission-requests-core.js';

function assertSupabaseResult(result, label) {
  if (result && result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result;
}

export async function loadAllAdminDataFromSupabase() {
  if (!isConfigured || !supabase) return null;

  try {
    const [
      pRes,
      aRes,
      categoriesRes,
      cRes,
      fRes,
      pagesRes,
      navRes,
      settingsRes,
      reqRes,
      mediaRes
    ] = await Promise.all([
      supabase.from('portfolio_projects').select('*, category:cms_categories(slug,title)').order('sort_order', { ascending: true }),
      supabase.from('free_assets').select('*, category:cms_categories(slug,title)').order('sort_order', { ascending: true }),
      supabase.from('cms_categories').select('*').order('kind', { ascending: true }).order('sort_order', { ascending: true }),
      supabase.from('commission_services').select('*').order('sort_order', { ascending: true }),
      supabase.from('commission_forms').select('*'),
      supabase.from('cms_pages').select('*'),
      supabase.from('cms_navigation').select('*').order('sort_order', { ascending: true }),
      supabase.from('site_settings').select('*'),
      supabase.from('commission_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('media').select('*').order('created_at', { ascending: false })
    ]);

    [
      [pRes, 'Portfolio load failed'],
      [aRes, 'Free Assets load failed'],
      [categoriesRes, 'Categories load failed'],
      [cRes, 'Commission Services load failed'],
      [fRes, 'Commission Forms load failed'],
      [pagesRes, 'CMS Pages load failed'],
      [navRes, 'Navigation load failed'],
      [settingsRes, 'Site Settings load failed'],
      [reqRes, 'Commission Requests load failed'],
      [mediaRes, 'Media load failed']
    ].forEach(([res, label]) => assertSupabaseResult(res, label));

    const result = {};

    if (pRes.data && pRes.data.length) {
      result.portfolio = pRes.data.map((row) => {
        const content = row.content || {};
        return {
          id: row.slug,
          slug: row.slug,
          title: row.title,
          description: row.description || '',
          category: content.categorySlug || (row.category && row.category.slug) || content.cat || 'illustration',
          tags: Array.isArray(row.tags) ? row.tags : [],
          thumbnail: row.thumbnail_path || '',
          cover: row.cover_path || '',
          featured: !!row.featured,
          published: !!row.published,
          placeholder: !!content.placeholder,
          viState: 'pending',
          externalLinks: content.externalLinks || [],
          blocks: content.blocks || [],
          credits: content.credits || '',
          year: content.year || '',
          intro: content.intro || '',
          sketch: content.sketch || '',
          process: content.process || '',
          body: content.body || '',
          quote: content.quote || '',
          link: content.link || '',
          linkLabel: content.linkLabel || '',
          titleCopy: { en: row.title, vi: '', viOverride: false },
          descriptionCopy: { en: row.description || '', vi: '', viOverride: false }
        };
      });
    }

    if (aRes.data && aRes.data.length) {
      result.assets = aRes.data.map((row) => {
        const m = row.metadata || {};
        return {
          id: row.slug,
          slug: row.slug,
          title: row.title,
          description: row.description || '',
          category: m.categorySlug || (row.category && row.category.slug) || (m.cat || 'other').toLowerCase(),
          tags: Array.isArray(m.tags) ? m.tags : [],
          assetType: (m.cat || 'other').toLowerCase(),
          icon: m.icon || '★',
          flowerTag: m.flowerTag || null,
          filterCat: m.filterCat || '',
          thumbnail: row.thumbnail_path || '',
          media: row.file_path || '',
          mediaType: 'image',
          downloadUrl: row.file_path || m.downloadUrl || '',
          fileFormat: row.file_type || m.format || 'PNG',
          license: m.license || '[LICENSE CONTENT FROM CMS]',
          credit: m.credit || '[CREDIT REQUIREMENT]',
          version: m.version || '[VERSION]',
          updateNote: m.update || '[UPDATE NOTE]',
          dateAdded: m.date || '[DATE]',
          featured: !!row.featured,
          published: !!row.published,
          placeholder: true,
          availability: row.availability || 'available',
          titleCopy: { en: row.title, vi: '', viOverride: false },
          descriptionCopy: { en: row.description || '', vi: '', viOverride: false }
        };
      });
    }

    if (categoriesRes.data && categoriesRes.data.length) {
      const mapCategory = (row) => ({
        id: row.slug,
        dbId: row.id,
        slug: row.slug,
        title: row.title,
        published: !!row.published,
        sortOrder: row.sort_order || 0,
        titleCopy: { en: row.title, vi: '', viOverride: false }
      });
      result.portfolioCategories = categoriesRes.data
        .filter((row) => row.kind === 'portfolio')
        .map(mapCategory);
      result.assetCategories = categoriesRes.data
        .filter((row) => row.kind === 'asset')
        .map(mapCategory);
    }

    if (cRes.data && cRes.data.length) {
      result.commissions = cRes.data.map((row) => {
        const d = row.details || {};
        const avail = row.availability === 'waitlist' ? 'inquiry' : row.availability;
        return {
          id: row.slug,
          slug: row.slug,
          title: row.title,
          description: row.description || '',
          price: d.priceFormatted ? d.priceFormatted.replace('$', '') : String(row.price || ''),
          currency: row.currency || 'USD',
          availability: avail,
          form: row.form_slug || d.formType || 'illustration',
          featured: !!row.featured,
          published: !!row.published,
          formLabel: d.formLabel || '',
          priceFormatted: d.priceFormatted || '',
          priceNote: d.priceNote || '',
          previewLabel: d.previewLabel || '',
          previewVariant: d.previewVariant || '',
          chips: Array.isArray(d.chips) ? d.chips : [],
          commercialRule: d.commercialRule || '',
          extraCharacterFee: d.extraCharacter || '',
          backgroundFee: d.backgroundRule || '',
          rushFee: d.rush || '+20%',
          privateFee: d.privateFee || '+20%',
          tax: d.tax || '5%',
          delivery: d.deliveryEstimate || '',
          includedFiles: d.includedFiles || '',
          canvas: d.canvas || '',
          extraNotes: d.extraNotes || '',
          alternatePrice: d.alternatePrice || '',
          alternateCurrency: d.alternateCurrency || '',
          isOtherService: d.isOtherService !== undefined ? d.isOtherService : true,
          addons: [],
          customFields: [],
          thumbnail: row.thumbnail_path || '',
          titleCopy: { en: row.title, vi: '', viOverride: false },
          descriptionCopy: { en: row.description || '', vi: '', viOverride: false }
        };
      });
    }

    if (fRes.data && fRes.data.length) {
      result.forms = fRes.data.map((row) => ({
        id: row.slug,
        slug: row.slug,
        title: row.title,
        description: row.description || '',
        published: !!row.published,
        fields: Array.isArray(row.fields) ? row.fields : [],
        titleCopy: { en: row.title, vi: '', viOverride: false },
        descriptionCopy: { en: row.description || '', vi: '', viOverride: false }
      }));
    }

    if (pagesRes.data && pagesRes.data.length) {
      result.pages = {};
      pagesRes.data.forEach((row) => {
        const d = row.data || {};
        if (row.slug === 'about') {
          result.pages.about = {
            title: row.title,
            content: row.content,
            published: !!row.published,
            profileImage: d.profileImage || '',
            name: d.name || 'Crabbie',
            bio: d.bio || '',
            experience: d.experience || [],
            skills: d.skills || [],
            links: d.links || [],
            titleCopy: { en: row.title, vi: '', viOverride: false },
            contentCopy: { en: row.content, vi: '', viOverride: false }
          };
        } else if (row.slug === 'terms') {
          result.pages.terms = {
            title: row.title,
            content: row.content,
            published: !!row.published,
            titleCopy: { en: row.title, vi: '', viOverride: false },
            contentCopy: { en: row.content, vi: '', viOverride: false }
          };
        }
      });
    }

    if (navRes.data && navRes.data.length) {
      result.navigation = navRes.data.map((row) => ({
        id: row.id,
        title: row.title,
        url: row.url,
        published: !!row.published
      }));
    }

    if (settingsRes.data && settingsRes.data.length) {
      result.settings = {};
      settingsRes.data.forEach((row) => {
        result.settings[row.key] = row.value || {};
      });
    }

    if (reqRes.data) {
      result.requests = reqRes.data.map(formatRequestRowForAdmin);
    }

    if (mediaRes.data) {
      result.media = mediaRes.data.map((row) =>
        formatMediaItem(row, (p) => supabase.storage.from('media').getPublicUrl(p).data.publicUrl)
      );
    }

    return result;
  } catch (err) {
    console.error('Error loading admin data from Supabase:', err);
    return null;
  }
}

export async function persistAdminDataToSupabase(draft, scope = 'all') {
  if (!isConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  const save = (name) => scope === 'all' || scope === name;
  const categoryIds = { portfolio: new Map(), asset: new Map() };
  (draft.portfolioCategories || []).forEach((rec) => { if (rec.dbId) categoryIds.portfolio.set(rec.slug || rec.id, rec.dbId); });
  (draft.assetCategories || []).forEach((rec) => { if (rec.dbId) categoryIds.asset.set(rec.slug || rec.id, rec.dbId); });
  const persistCategoryList = async (kind, list) => {
    if (!Array.isArray(list)) return;
    for (let idx = 0; idx < list.length; idx++) {
      const rec = list[idx];
      const payload = {
        kind,
        slug: rec.slug || rec.id,
        title: rec.title || 'Untitled category',
        published: !!rec.published,
        sort_order: idx
      };
      let categoryRes;
      if (rec.dbId && String(rec.dbId).length > 30) {
        categoryRes = await supabase
          .from('cms_categories')
          .update(payload)
          .eq('id', rec.dbId)
          .select('id,slug')
          .single();
      } else {
        categoryRes = await supabase
          .from('cms_categories')
          .upsert(payload, { onConflict: 'kind,slug' })
          .select('id,slug')
          .single();
      }
      assertSupabaseResult(categoryRes, `${kind} category save failed`);
      if (!categoryRes.data || !categoryRes.data.id) {
        throw new Error(`${kind} category save failed: no id returned.`);
      }
      rec.dbId = categoryRes.data.id;
      rec.slug = categoryRes.data.slug;
      rec.id = categoryRes.data.slug;
      categoryIds[kind].set(rec.slug, rec.dbId);
    }
  };

  if (save('portfolioCategories')) await persistCategoryList('portfolio', draft.portfolioCategories);
  if (save('assetCategories')) await persistCategoryList('asset', draft.assetCategories);

  // 1. Portfolio Projects
  if (save('portfolio') && Array.isArray(draft.portfolio)) {
    const portfolioRows = draft.portfolio.map((p, idx) => {
      const category = (draft.portfolioCategories || []).find((cat) => (cat.slug || cat.id) === p.category);
      const row = formatPortfolioRow({ ...p, category: category ? category.title : p.category }, idx);
      row.category_id = categoryIds.portfolio.get(p.category) || null;
      row.content = { ...(row.content || {}), categorySlug: p.category || '' };
      return row;
    });
    const { error: pErr } = await supabase.from('portfolio_projects').upsert(portfolioRows, { onConflict: 'slug' });
    if (pErr) throw new Error(`Portfolio save failed: ${pErr.message}`);
  }

  // 2. Free Assets
  if (save('assets') && Array.isArray(draft.assets)) {
    const assetRows = draft.assets.map((a, idx) => {
      const category = (draft.assetCategories || []).find((cat) => (cat.slug || cat.id) === a.category);
      const row = formatAssetRow({ ...a, category: category ? category.title : a.category }, idx);
      row.category_id = categoryIds.asset.get(a.category) || null;
      row.metadata = { ...(row.metadata || {}), categorySlug: a.category || '' };
      return row;
    });
    const { error: aErr } = await supabase.from('free_assets').upsert(assetRows, { onConflict: 'slug' });
    if (aErr) throw new Error(`Assets save failed: ${aErr.message}`);
  }

  // 3. Commission Services
  if (save('commissions') && Array.isArray(draft.commissions)) {
    const commRows = draft.commissions.map((c, idx) => formatCommissionRow(c, idx));
    const { error: cErr } = await supabase.from('commission_services').upsert(commRows, { onConflict: 'slug' });
    if (cErr) throw new Error(`Commissions save failed: ${cErr.message}`);
  }

  // 4. Commission Forms
  if (save('forms') && Array.isArray(draft.forms)) {
    const formRows = draft.forms.map((f) => ({
      slug: f.slug || f.id,
      title: f.title,
      description: f.description || '',
      fields: f.fields || [],
      published: !!f.published
    }));
    const { error: fErr } = await supabase.from('commission_forms').upsert(formRows, { onConflict: 'slug' });
    if (fErr) throw new Error(`Forms save failed: ${fErr.message}`);
  }

  // 5. Pages
  if (draft.pages && (save('pages.about') || save('pages.terms'))) {
    if (save('pages.about') && draft.pages.about) {
      const { error: abErr } = await supabase.from('cms_pages').upsert([formatPageRow('about', draft.pages.about)], { onConflict: 'slug' });
      if (abErr) throw new Error(`About page save failed: ${abErr.message}`);
    }
    if (save('pages.terms') && draft.pages.terms) {
      const { error: tmErr } = await supabase.from('cms_pages').upsert([formatPageRow('terms', draft.pages.terms)], { onConflict: 'slug' });
      if (tmErr) throw new Error(`Terms page save failed: ${tmErr.message}`);
    }
  }

  // 6. Navigation
  if (save('navigation') && Array.isArray(draft.navigation)) {
    for (let idx = 0; idx < draft.navigation.length; idx++) {
      const n = draft.navigation[idx];
      const isUUID = n.id && n.id.length > 30;
      if (isUUID) {
        const navRes = await supabase
          .from('cms_navigation')
          .upsert([{ id: n.id, title: n.title, url: n.url, published: !!n.published, sort_order: idx }], { onConflict: 'id' });
        assertSupabaseResult(navRes, 'Navigation save failed');
      } else {
        const navRes = await supabase
          .from('cms_navigation')
          .insert([{ title: n.title, url: n.url, published: !!n.published, sort_order: idx }])
          .select('id');
        assertSupabaseResult(navRes, 'Navigation insert failed');
        const inserted = navRes.data;
        if (!inserted || !inserted[0] || !inserted[0].id) {
          throw new Error('Navigation insert failed: no id returned.');
        }
        n.id = inserted[0].id;
      }
    }
  }

  // 7. Settings
  if (save('settings') && draft.settings) {
    const settingKeys = Object.keys(draft.settings);
    const settingRows = settingKeys.map((k) => formatSettingRow(k, draft.settings[k]));
    const { error: sErr } = await supabase.from('site_settings').upsert(settingRows, { onConflict: 'key' });
    if (sErr) throw new Error(`Settings save failed: ${sErr.message}`);
  }

  // 8. Requests notes / status
  if (save('requests') && Array.isArray(draft.requests)) {
    for (const r of draft.requests) {
      if (r.id && r.id.length > 30) {
        const requestRes = await supabase.from('commission_requests').update({
          status: mapAdminStatusToDbStatus(r.status),
          admin_notes: r.notes || ''
        }).eq('id', r.id);
        assertSupabaseResult(requestRes, `Request save failed (${r.id})`);
      }
    }
  }

  return { success: true };
}

export async function deleteAdminRecord(listKey, id) {
  if (!isConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }
  if (!id) {
    throw new Error('Cannot delete a record without an id.');
  }

  const isUUID = id.length > 30;
  let result = null;

  if (listKey === 'portfolio') {
    result = isUUID
      ? await supabase.from('portfolio_projects').delete().eq('id', id)
      : await supabase.from('portfolio_projects').delete().eq('slug', id);
  } else if (listKey === 'assets') {
    result = isUUID
      ? await supabase.from('free_assets').delete().eq('id', id)
      : await supabase.from('free_assets').delete().eq('slug', id);
  } else if (listKey === 'commissions') {
    result = isUUID
      ? await supabase.from('commission_services').delete().eq('id', id)
      : await supabase.from('commission_services').delete().eq('slug', id);
  } else if (listKey === 'forms') {
    result = isUUID
      ? await supabase.from('commission_forms').delete().eq('id', id)
      : await supabase.from('commission_forms').delete().eq('slug', id);
  } else if (listKey === 'navigation') {
    result = isUUID
      ? await supabase.from('cms_navigation').delete().eq('id', id)
      : await supabase.from('cms_navigation').delete().eq('url', id);
  } else if (listKey === 'media') {
    const mediaResult = await deleteMediaFile(id);
    if (!mediaResult || !mediaResult.success) {
      throw new Error(mediaResult && mediaResult.error ? mediaResult.error : 'Media delete failed.');
    }
    return { success: true };
  } else if (listKey === 'requests') {
    result = await supabase.from('commission_requests').delete().eq('id', id);
  } else {
    throw new Error(`Unsupported delete target: ${listKey}`);
  }

  assertSupabaseResult(result, `Delete failed (${listKey})`);
  return { success: true };
}

window.CrabbieAdminCrud = {
  loadAllAdminData: loadAllAdminDataFromSupabase,
  persistAdminData: persistAdminDataToSupabase,
  deleteRecord: deleteAdminRecord
};
