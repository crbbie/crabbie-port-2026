import { supabase, isConfigured } from './supabase-client.js';
import {
  validateCommissionRequest,
  formatCommissionRequestPayload,
  formatRequestRowForAdmin,
  mapAdminStatusToDbStatus
} from './commission-requests-core.js';

export async function submitCommissionRequest(formData = {}) {
  const check = validateCommissionRequest({
    client_name: formData.name,
    client_email: formData.email,
    terms_accepted: formData.termsAccepted
  });

  if (!check.valid) {
    const firstMsg = Object.values(check.errors)[0] || 'Please complete the required fields.';
    throw new Error(firstMsg);
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
    throw new Error(`Failed to submit request: ${error.message}`);
  }

  return { success: true };
}

export async function fetchAdminCommissionRequests() {
  if (!isConfigured || !supabase) return [];

  try {
    const { data, error } = await supabase
      .from('commission_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !Array.isArray(data)) return [];

    return data.map(formatRequestRowForAdmin);
  } catch (err) {
    console.warn('Failed to fetch commission requests:', err.message);
    return [];
  }
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
    mapAdminStatusToDbStatus
  };
}
