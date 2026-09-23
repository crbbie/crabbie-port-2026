import { hydratePortfolio } from './portfolio-cms.js';
import { hydrateFreeAssets } from './free-assets-cms.js';
import { hydrateCommissions } from './commissions-cms.js';
import { hydrateSiteContent } from './site-content-cms.js';
import { hydratePeople } from './people-cms.js';

export async function refreshPublicCms(scope) {
  if (scope === 'people' || scope === 'portfolioThanks' || scope === 'projectPeople') {
    const results = await Promise.allSettled([hydratePeople(), hydratePortfolio(), hydrateSiteContent()]);
    return results.every((r) => r.status === 'fulfilled' && r.value !== false);
  }
  const refresh = scope === 'portfolio' || scope === 'portfolioCategories' ? hydratePortfolio
    : scope === 'assets' || scope === 'assetCategories' ? hydrateFreeAssets
    : scope === 'commissions' || scope === 'forms' ? hydrateCommissions
    : scope === 'pages.about' || scope === 'pages.terms' || scope === 'navigation' || scope === 'settings' ? hydrateSiteContent
    : null;
  if (!refresh) return true;
  return refresh();
}

if (typeof window !== 'undefined') window.CrabbiePublicCmsRefresh = { refresh: refreshPublicCms };
