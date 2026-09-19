import { hydratePortfolio } from './portfolio-cms.js';
import { hydrateFreeAssets } from './free-assets-cms.js';
import { hydrateCommissions } from './commissions-cms.js';
import { hydrateSiteContent } from './site-content-cms.js';

export async function refreshPublicCms(scope) {
  const refresh = scope === 'portfolio' || scope === 'portfolioCategories' ? hydratePortfolio
    : scope === 'assets' || scope === 'assetCategories' ? hydrateFreeAssets
    : scope === 'commissions' || scope === 'forms' ? hydrateCommissions
    : scope === 'pages.about' || scope === 'pages.terms' || scope === 'navigation' || scope === 'settings' ? hydrateSiteContent
    : null;
  if (!refresh) return true;
  return refresh();
}

if (typeof window !== 'undefined') window.CrabbiePublicCmsRefresh = { refresh: refreshPublicCms };
