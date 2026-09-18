import assert from 'node:assert/strict';
import {
  validateCommissionRequest,
  formatCommissionRequestPayload,
  formatRequestRowForAdmin,
  mapAdminStatusToDbStatus,
  isConfirmedCommissionSubmission
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

console.log('Commission requests core tests passed.');
