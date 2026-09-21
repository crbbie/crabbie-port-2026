import assert from 'node:assert/strict';
import {
  validateCommissionRequest,
  formatCommissionRequestPayload,
  formatRequestRowForAdmin,
  mapAdminStatusToDbStatus,
  isConfirmedCommissionSubmission,
  requestFieldId,
  normalizeRequestSchemaFields,
  validateSchemaAnswers,
  serializeSchemaAnswers,
  resolveSchemaContact,
  toPublicRequestError
} from './commission-requests-core.js';

// 1. validateCommissionRequest
{
  const invalidEmpty = validateCommissionRequest({});
  assert.equal(invalidEmpty.valid, false);
  assert.ok(invalidEmpty.errors.client_name);
  assert.ok(invalidEmpty.errors.client_email);
  assert.ok(invalidEmpty.errors.terms_accepted);

  const invalidEmail = validateCommissionRequest({
    client_name: 'Alice',
    client_email: 'not-an-email',
    terms_accepted: true
  });
  assert.equal(invalidEmail.valid, false);
  assert.ok(invalidEmail.errors.client_email);

  const valid = validateCommissionRequest({
    client_name: 'Alice',
    client_email: 'alice@example.com',
    terms_accepted: true
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, {});
}

// 2. formatCommissionRequestPayload
{
  const payload = formatCommissionRequestPayload({
    name: '  Bob Smith  ',
    email: 'Bob@Example.COM ',
    contact: ' @bob_discord ',
    selectedService: 'Chibi Full Body',
    activeTab: 'illustration',
    fields: { quantity: '2', canvas: 'Square' },
    serviceId: 'srv-123',
    formId: 'form-456'
  });

  assert.equal(payload.client_name, 'Bob Smith');
  assert.equal(payload.client_email, 'bob@example.com');
  assert.equal(payload.contact, '@bob_discord');
  assert.equal(payload.service_id, 'srv-123');
  assert.equal(payload.form_id, 'form-456');
  assert.equal(payload.terms_accepted, true);
  assert.equal(payload.status, 'new');
  assert.equal(payload.admin_notes, '');
  assert.equal(payload.answers.service, 'Chibi Full Body');
  assert.equal(payload.answers.form, 'illustration');
  assert.equal(payload.answers.quantity, '2');
  assert.equal(payload.answers.canvas, 'Square');
}

// 3. formatRequestRowForAdmin & mapAdminStatusToDbStatus
{
  const dbRow = {
    id: 'req-999',
    client_name: 'Charlie',
    client_email: 'charlie@example.com',
    contact: '@charlie_art',
    status: 'closed',
    admin_notes: 'Finished invoice #102',
    terms_accepted: true,
    created_at: '2026-09-18T15:30:00.000Z',
    answers: {
      service: 'Emote Pack',
      form: 'emotes',
      quantity: '5 emotes'
    }
  };

  const adminItem = formatRequestRowForAdmin(dbRow);
  assert.equal(adminItem.id, 'req-999');
  assert.equal(adminItem.clientName, 'Charlie');
  assert.equal(adminItem.commission, 'Emote Pack');
  assert.equal(adminItem.status, 'Completed');
  assert.equal(adminItem.notes, 'Finished invoice #102');
  assert.equal(adminItem.termsAccepted, true);
  assert.deepEqual(adminItem.answers, [['quantity', '5 emotes']]);

  // mapAdminStatusToDbStatus
  assert.equal(mapAdminStatusToDbStatus('Completed'), 'closed');
  assert.equal(mapAdminStatusToDbStatus('Reviewing'), 'reviewing');
  assert.equal(mapAdminStatusToDbStatus('new'), 'new');
  assert.equal(mapAdminStatusToDbStatus('invalid_status'), 'new');
}

// A missing service, offline response, or unsuccessful insert must not show success.
{
  assert.equal(isConfirmedCommissionSubmission(null), false);
  assert.equal(isConfirmedCommissionSubmission(undefined), false);
  assert.equal(isConfirmedCommissionSubmission({ success: false }), false);
  assert.equal(isConfirmedCommissionSubmission({ success: true, offline: true }), false);
  assert.equal(isConfirmedCommissionSubmission({ success: true }), true);
}

// Batch 2: schema is the source of truth, stable field id is the identity.
{
  assert.equal(requestFieldId({ id: 'idea' }, 0), 'idea');
  assert.equal(requestFieldId({}, 3), 'field-3');
  const schema = normalizeRequestSchemaFields([
    { id: 'idea', type: 'textarea', label: 'Idea', required: true, contactRole: 'none' },
    { id: 'agree', type: 'checkbox', label: 'Agree', required: true, contactRole: 'none' },
    { id: 'mail', type: 'text', label: 'Mail', required: true, contactRole: 'email' }
  ]);
  assert.equal(schema[0].id, 'idea');
  // Required textarea must not submit empty.
  assert.equal(validateSchemaAnswers({ idea: '   ', agree: true, mail: 'a@b.co' }, schema).valid, false);
  // Checkbox serializes as boolean, never dropped silently.
  assert.deepEqual(serializeSchemaAnswers({ idea: 'x', agree: false, mail: 'a@b.co' }, schema).agree, false);
  assert.deepEqual(serializeSchemaAnswers({ idea: 'x', agree: true, mail: 'a@b.co' }, schema).agree, true);
  // Email validated by type/contactRole, not by DOM input type.
  assert.ok(validateSchemaAnswers({ idea: 'x', agree: true, mail: 'not-an-email' }, schema).errors.mail);
  // contactRole decides the contact fields.
  assert.deepEqual(resolveSchemaContact({ idea: 'x', mail: 'a@b.co' }, schema).email, 'a@b.co');
  // Duplicate labels never overwrite: answers are keyed by id.
  const dup = serializeSchemaAnswers(
    { q1: 'first', q2: 'second' },
    [{ id: 'q1', type: 'text', label: 'Same' }, { id: 'q2', type: 'text', label: 'Same' }]
  );
  assert.equal(dup.q1, 'first');
  assert.equal(dup.q2, 'second');
  // Legacy fallback: key `name` and email-typed field still resolve.
  const legacy = resolveSchemaContact(
    { name: 'Aya', email: 'aya@example.test' },
    [{ id: 'name', type: 'text', label: 'Name' }, { id: 'email', type: 'email', label: 'Email' }]
  );
  assert.equal(legacy.name, 'Aya');
  assert.equal(legacy.email, 'aya@example.test');
}

// Batch 2 (P2-09): public errors stay friendly, detail is internal-only.
{
  const pub = toPublicRequestError({ message: 'relation "x" does not exist', code: '42P01' });
  assert.equal(pub.userError, false);
  assert.ok(/Could not send your request/.test(pub.message));
  assert.ok(/relation/.test(pub.detail), 'raw detail is preserved for internal logging');
  const validation = toPublicRequestError({ message: 'Need a name', code: 'validation' });
  assert.equal(validation.userError, true);
  assert.equal(validation.message, 'Need a name');
}

console.log('Commission requests core tests passed.');
