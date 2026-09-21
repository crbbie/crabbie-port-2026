import { supabase, isConfigured } from './supabase-client.js';
import {
  validateCommissionRequest,
  formatCommissionRequestPayload,
  formatRequestRowForAdmin,
  mapAdminStatusToDbStatus,
  isConfirmedCommissionSubmission,
  toPublicRequestError
} from './commission-requests-core.js';

export async function submitCommissionRequest(formData = {}) {
  const check = validateCommissionRequest({
    client_name: formData.name,
    client_email: formData.email,
    terms_accepted: formData.termsAccepted
  });

  if (!check.valid) {
    const firstMsg = Object.values(check.errors)[0] || 'Please complete the required fields.';
    const validationError = new Error(firstMsg);
    validationError.code = 'validation';
    validationError.userError = true;
    throw validationError;
  }

  if (!isConfigured || !supabase) {
    throw new Error('Commission service is temporarily unavailable. Please try again later.');
  }

  // Look up matching service or form id by slug if possible
  let serviceId = null;
  let formId = null;

  try {
    if (formData.selectedServiceSlug) {
      const { data: srv } = await supabase
        .from('commission_services')
        .select('id')
        .eq('slug', formData.selectedServiceSlug)
        .maybeSingle();
      if (srv && srv.id) serviceId = srv.id;
    }
    if (formData.activeTab) {
      const { data: frm } = await supabase
        .from('commission_forms')
        .select('id')
        .eq('slug', formData.activeTab)
        .maybeSingle();
      if (frm && frm.id) formId = frm.id;
    }
  } catch (_) {
    // Tolerant lookup failure
  }

  const payload = formatCommissionRequestPayload({
    name: formData.name,
    email: formData.email,
    contact: formData.contact,
    selectedService: formData.selectedService,
    activeTab: formData.activeTab,
    fields: formData.fields,
    serviceId,
    formId
  });

  const { error } = await supabase
    .from('commission_requests')
    .insert(payload);

  if (error) {
    const internal = new Error('Commission request insert failed.');
    internal.detail = String(error.message || error);
    internal.code = String(error.code || 'database_error');
    const pub = toPublicRequestError(internal);
    const friendly = new Error(pub.message);
    friendly.userError = false;
    friendly.detail = pub.detail;
    friendly.code = 'submit_failed';
    throw friendly;
  }

  return { success: true };
}

export async function fetchAdminCommissionRequests(options = {}) {
  if (!isConfigured || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  // Prompt 4: one page per call. The whole request table is never downloaded.
  const crud = typeof window !== 'undefined' ? window.CrabbieAdminCrud : null;
  if (!crud || typeof crud.loadRequestPage !== 'function') {
    throw new Error('Admin request paging is unavailable.');
  }

  const page = await crud.loadRequestPage({
    page: options.page,
    pageSize: options.pageSize,
    status: options.status,
    commission: options.commission,
    search: options.search
  });

  return page.items;
}

export async function updateCommissionRequestStatus(id, status, notes = '') {
  if (!isConfigured || !supabase || !id) return { success: false };

  try {
    const dbStatus = mapAdminStatusToDbStatus(status);
    const { error } = await supabase
      .from('commission_requests')
      .update({
        status: dbStatus,
        admin_notes: notes
      })
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (err) {
    console.warn(`Failed to update request ${id}:`, err.message);
    return { success: false, error: err.message };
  }
}

if (typeof window !== 'undefined') {
  window.CrabbieCommissionRequests = {
    submitCommissionRequest,
    fetchAdminCommissionRequests,
    updateCommissionRequestStatus,
    validateCommissionRequest,
    formatCommissionRequestPayload,
    formatRequestRowForAdmin,
    mapAdminStatusToDbStatus,
    isConfirmedCommissionSubmission,
    toPublicRequestError
  };
}
