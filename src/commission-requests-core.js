/**
 * commission-requests-core.js
 * Pure validation, payload formatting, and admin display mapping for commission requests.
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const CONTACT_ROLE_KEYS = Object.freeze(['name', 'email']);

/* Schema (Admin) is the source of truth for the public request form:
 * schema -> renderer -> validation -> collection -> payload.
 * The stable field id is the identity everywhere; labels are display-only
 * and must never be used as answer keys (duplicate labels would overwrite). */

export function requestFieldId(field, index) {
  const raw = field && typeof field.id === 'string' ? field.id.trim() : '';
  if (raw) return raw;
  return 'field-' + index;
}

export function normalizeRequestSchemaFields(fields = []) {
  if (!Array.isArray(fields)) return [];
  return fields.map((field, index) => {
    const source = field && typeof field === 'object' ? field : {};
    const role = typeof source.contactRole === 'string' && source.contactRole.trim()
      ? source.contactRole.trim()
      : 'none';
    return {
      id: requestFieldId(source, index),
      type: typeof source.type === 'string' && source.type ? String(source.type).toLowerCase() : 'text',
      label: typeof source.label === 'string' ? source.label : '',
      required: Boolean(source.required),
      contactRole: role,
      options: Array.isArray(source.options) ? source.options.map((opt) => String(opt)) : []
    };
  });
}

function schemaValuePresent(field, value) {
  if (field.type === 'checkbox') {
    if (Array.isArray(value)) return value.length > 0;
    return value === true || (typeof value === 'string' && value.trim() !== '');
  }
  if (value === null || value === undefined) return false;
  return String(value).trim() !== '';
}

export function validateSchemaAnswers(valuesById = {}, fields = []) {
  const schema = normalizeRequestSchemaFields(fields);
  const values = valuesById && typeof valuesById === 'object' ? valuesById : {};
  const errors = {};
  schema.forEach((field) => {
    const value = values[field.id];
    if (field.required && !schemaValuePresent(field, value)) {
      errors[field.id] = 'Please complete “' + (field.label || field.id) + '”.';
      return;
    }
    if (!schemaValuePresent(field, value)) return;
    if (field.type === 'email' || field.contactRole === 'email') {
      const text = String(value).trim();
      if (!EMAIL_REGEX.test(text)) errors[field.id] = 'That email looks a little off — mind checking it?';
    }
  });
  return { valid: Object.keys(errors).length === 0, errors };
}

export function serializeSchemaAnswers(valuesById = {}, fields = []) {
  const schema = normalizeRequestSchemaFields(fields);
  const values = valuesById && typeof valuesById === 'object' ? valuesById : {};
  const answers = {};
  schema.forEach((field) => {
    const raw = values[field.id];
    if (field.type === 'checkbox') {
      if (Array.isArray(raw)) {
        answers[field.id] = raw.map((entry) => String(entry).trim()).filter(Boolean);
      } else if (raw === true || raw === 'true') {
        answers[field.id] = true;
      } else if (typeof raw === 'string' && raw.trim() !== '') {
        answers[field.id] = raw.trim();
      } else {
        answers[field.id] = false;
      }
      return;
    }
    if (Array.isArray(raw)) {
      answers[field.id] = raw.map((entry) => String(entry).trim()).filter(Boolean);
      return;
    }
    if (typeof raw === 'boolean') {
      answers[field.id] = raw;
      return;
    }
    answers[field.id] = raw === null || raw === undefined ? '' : String(raw).trim();
  });
  return answers;
}

/* contactRole decides the contact fields. Legacy fallback (no schema role):
 * a field whose id/key is `name`, or an email-typed field, keeps old forms working. */
export function resolveSchemaContact(valuesById = {}, fields = []) {
  const schema = normalizeRequestSchemaFields(fields);
  const values = valuesById && typeof valuesById === 'object' ? valuesById : {};
  let name = '';
  let email = '';
  let contact = '';
  const textOf = (value) => (value === null || value === undefined ? '' : String(value).trim());

  schema.forEach((field) => {
    const text = textOf(values[field.id]);
    if (field.contactRole === 'name' && !name && text) name = text;
    if (field.contactRole === 'email' && !email && text) email = text;
  });
  if ((!name || !email) && schema.length) {
    schema.forEach((field) => {
      const text = textOf(values[field.id]);
      if (!text) return;
      const key = field.id.toLowerCase();
      if (!name && (field.contactRole === 'name' || key === 'name' || key.endsWith('.name'))) name = text;
      if (!email && (field.contactRole === 'email' || field.type === 'email' || key === 'email' || key.endsWith('.email'))) email = text;
    });
  }
  if (values && typeof values === 'object') {
    const socialKeys = Object.keys(values).filter((key) => /(^|\.)social$/i.test(key) || key === 'contact');
    for (const key of socialKeys) {
      const text = textOf(values[key]);
      if (text && !contact) contact = text;
    }
  }
  void CONTACT_ROLE_KEYS;
  return { name, email, contact };
}

/* Public errors stay friendly/generic. Database/schema/RLS detail is kept as
 * `detail` for internal logging only and must never be rendered publicly. */
export function toPublicRequestError(error) {
  if (error && (error.code === 'validation' || error.userError === true)) {
    return { message: String(error.message || 'Please complete the required fields.'), detail: '', userError: true };
  }
  const detail = String((error && (error.detail || error.message)) || 'unknown error');
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn('Commission request failed (internal detail):', detail);
  }
  return {
    message: 'Could not send your request right now. Please check your connection and try again.',
    detail,
    userError: false
  };
}

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

export function isConfirmedCommissionSubmission(result) {
  return Boolean(result && result.success === true && result.offline !== true);
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
