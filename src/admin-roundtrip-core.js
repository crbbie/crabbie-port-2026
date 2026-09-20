// Only the contact roles this repository actually authors (seed + defaults).
export const CONTACT_ROLES = Object.freeze(['none', 'name', 'email']);

export function createAssetDraft(values = {}) {
  return {
    ...values,
    availability: values.availability || 'available'
  };
}

export function formRelationshipOptions(forms = []) {
  return forms
    .filter((form) => form && form.slug)
    .map((form) => ({
      value: form.slug,
      label: form.title || form.slug
    }));
}

/**
 * The Form writer preserves every supported authored property, keeps authored
 * option order and never invents a contact role.
 */
export function normalizeRequestFormFields(fields = []) {
  return fields.map((field) => {
    const role = typeof field.contactRole === 'string' && field.contactRole.trim()
      ? field.contactRole.trim()
      : 'none';
    const normalized = { ...field, contactRole: role };
    if (Array.isArray(field.options)) {
      normalized.options = field.options.map((option) => String(option).trim()).filter(Boolean);
    }
    return normalized;
  });
}

export function formattedCommissionPrice({ price, currency }) {
  const canonicalPrice = String(price ?? '').trim();
  if (!canonicalPrice) return '';
  return currency === 'VND' ? `${canonicalPrice} VND` : `$${canonicalPrice}`;
}
