/**
 * commission-requests-core.js
 * Pure validation, payload formatting, and admin display mapping for commission requests.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateCommissionRequest(data = {}) {
  const errors = {};
  const name = typeof data.client_name === 'string' ? data.client_name.trim() : '';
  const email = typeof data.client_email === 'string' ? data.client_email.trim() : '';
  const terms = Boolean(data.terms_accepted);

  if (!name || name.length < 1 || name.length > 160) {
    errors.client_name = 'Please enter your name (1 to 160 characters).';
  }

  if (!email || email.length < 3 || email.length > 320 || !EMAIL_REGEX.test(email)) {
    errors.client_email = 'Please provide a valid email address.';
  }

  if (!terms) {
    errors.terms_accepted = 'You must agree to the Terms of Service to submit.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

export function formatCommissionRequestPayload({
  name = '',
  email = '',
  contact = '',
  selectedService = '',
  activeTab = 'illustration',
  fields = {},
  serviceId = null,
  formId = null
} = {}) {
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanContact = String(contact || '').trim();

  return {
    client_name: cleanName,
    client_email: cleanEmail,
    contact: cleanContact,
    service_id: serviceId || null,
    form_id: formId || null,
    answers: {
      service: selectedService || activeTab || 'Commission',
      form: activeTab,
      ...fields
    },
    terms_accepted: true,
    status: 'new',
    admin_notes: ''
  };
}

export function formatRequestRowForAdmin(row = {}) {
  const rawStatus = (row.status || 'new').toLowerCase();
  const statusDisplay = rawStatus === 'closed'
    ? 'Completed'
    : rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);

  let received = '';
  if (row.created_at) {
    try {
      received = new Date(row.created_at).toISOString().slice(0, 16).replace('T', ' ');
    } catch (_) {
      received = String(row.created_at);
    }
  }

  const answersObj = row.answers && typeof row.answers === 'object' ? row.answers : {};
  const answerEntries = Object.entries(answersObj).filter(
    ([k]) => k !== 'service' && k !== 'form'
  );

  return {
    id: row.id,
    clientName: row.client_name || 'Anonymous',
    clientEmail: row.client_email || '',
    contact: row.contact || '',
    received,
    commission: answersObj.service || 'Commission',
    status: statusDisplay,
    notes: row.admin_notes || '',
    termsAccepted: Boolean(row.terms_accepted),
    answers: answerEntries
  };
}

export function mapAdminStatusToDbStatus(status = 'New') {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'completed') return 'closed';
  if (['new', 'reviewing', 'contacted', 'accepted', 'declined', 'closed'].includes(s)) {
    return s;
  }
  return 'new';
}
