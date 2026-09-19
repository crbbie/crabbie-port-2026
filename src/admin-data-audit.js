/**
 * admin-data-audit.js
 * Browser binding for the pure audit engine (admin-data-audit-core.js).
 * Exposes the audits to the Admin inline app so list badges, editor
 * checklists, publish warnings and the dashboard health panel all read
 * from one shared implementation.
 */
import {
  findPlaceholders,
  hasPlaceholderText,
  auditPortfolioRecord,
  auditAssetRecord,
  auditCommissionRecord,
  auditPageRecord,
  auditSettingsRecord,
  auditSiteData
} from './admin-data-audit-core.js';

if (typeof window !== 'undefined') {
  window.CrabbieAdminDataAudit = {
    findPlaceholders,
    hasPlaceholderText,
    auditPortfolioRecord,
    auditAssetRecord,
    auditCommissionRecord,
    auditPageRecord,
    auditSettingsRecord,
    auditSiteData
  };
}
