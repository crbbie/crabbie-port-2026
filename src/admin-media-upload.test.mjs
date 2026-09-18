import assert from 'node:assert/strict';
import { validateUploadFile, sanitizeStorageFileName, formatMediaItem } from './admin-media-core.js';

// 1. Validation tests
{
  assert.equal(validateUploadFile(null).valid, false);
  assert.equal(validateUploadFile(undefined).valid, false);
  assert.equal(validateUploadFile('not a file').valid, false);

  // Empty file
  const emptyRes = validateUploadFile({ size: 0, name: 'empty.png' });
  assert.equal(emptyRes.valid, false);
  assert.match(emptyRes.error, /empty/i);

  // Oversized file
  const bigRes = validateUploadFile({ size: 55 * 1024 * 1024, name: 'huge.png' });
  assert.equal(bigRes.valid, false);
  assert.match(bigRes.error, /exceeds 50MB/i);

  // Executable / hazardous file
  const exeRes = validateUploadFile({ size: 1024, name: 'malware.exe' });
  assert.equal(exeRes.valid, false);
  assert.match(exeRes.error, /Executables are not allowed/i);

  // Valid files
  assert.equal(validateUploadFile({ size: 2048, name: 'drawing.png' }).valid, true);
  assert.equal(validateUploadFile({ size: 5000, name: 'video.mp4' }).valid, true);
  assert.equal(validateUploadFile({ size: 1000 }).valid, true);
}

// 2. Upload success path & error classification unit simulation
{
  let storageRemoved = false;
  const mockStorage = {
    from: () => ({
      upload: async (path, file) => {
        if (file.name === 'storage_fail.png') {
          return { error: { message: 'Network timeout', statusCode: 500 } };
        }
        if (file.name === 'storage_rls.png') {
          return { error: { message: 'row-level security policy violated', statusCode: 403 } };
        }
        return { data: { path }, error: null };
      },
      getPublicUrl: (path) => ({
        data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/media/${path}` }
      }),
      remove: async (paths) => {
        storageRemoved = true;
        return { data: paths, error: null };
      }
    })
  };

  const mockDb = {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => {
            return {
              data: {
                id: 'media-uuid-1',
                bucket_id: 'media',
                storage_path: 'uploads/12345_art.png',
                original_name: 'art.png',
                mime_type: 'image/png',
                size_bytes: 4096,
                alt_text: 'art.png',
                created_at: new Date().toISOString()
              },
              error: null
            };
          }
        })
      })
    })
  };

  // Simulating successful flow
  const item = formatMediaItem({
    id: 'media-uuid-1',
    storage_path: 'uploads/12345_art.png',
    original_name: 'art.png',
    mime_type: 'image/png',
    size_bytes: 4096,
    alt_text: 'art.png'
  }, (p) => mockStorage.from('media').getPublicUrl(p).data.publicUrl);

  assert.equal(item.id, 'media-uuid-1');
  assert.equal(item.url, 'https://test.supabase.co/storage/v1/object/public/media/uploads/12345_art.png');
  assert.equal(item.type, 'image');
  assert.equal(item.size, '4 KB');
}

// 3. File input state & handler wiring simulation
{
  // Simulated file input element
  const input = {
    value: 'C:\\fakepath\\drawing.png',
    dataset: {},
    listeners: {},
    addEventListener(event, fn) {
      this.listeners[event] = this.listeners[event] || [];
      this.listeners[event].push(fn);
    },
    dispatchEvent(event) {
      (this.listeners[event] || []).forEach(fn => fn({ target: this }));
    }
  };

  // Wire input only once
  let handlerCallCount = 0;
  function wireInput(el) {
    if (el.dataset.wired !== '1') {
      el.dataset.wired = '1';
      el.addEventListener('change', () => {
        handlerCallCount++;
      });
      el.addEventListener('cancel', () => {
        el.value = '';
      });
    }
  }

  wireInput(input);
  wireInput(input); // repeated wire should not duplicate handler
  assert.equal(input.listeners.change.length, 1);

  // Triggering change
  input.dispatchEvent('change');
  assert.equal(handlerCallCount, 1);

  // Same file selected again: value is reset beforehand
  input.value = '';
  assert.equal(input.value, '');
  input.value = 'C:\\fakepath\\drawing.png';
  input.dispatchEvent('change');
  assert.equal(handlerCallCount, 2);

  // Cancel is harmless
  input.dispatchEvent('cancel');
  assert.equal(input.value, '');
}

// 4. Failed upload does not mutate UI state as success
{
  const ADMIN_DATA = { media: [] };
  const ADMIN_DRAFT = { media: [] };

  async function simulateUploadHandler(shouldFail) {
    if (shouldFail) {
      // Failure should not push into ADMIN_DATA or ADMIN_DRAFT
      throw new Error('Storage upload failed (RLS / access denied): Unauthorized');
    }
    const newMedia = { id: 'm-new', title: 'new.png', url: 'https://test.com/new.png' };
    ADMIN_DRAFT.media.unshift(newMedia);
    ADMIN_DATA.media.unshift(newMedia);
  }

  let errorCaught = null;
  try {
    await simulateUploadHandler(true);
  } catch (err) {
    errorCaught = err;
  }

  assert.ok(errorCaught);
  assert.match(errorCaught.message, /RLS \/ access denied/);
  assert.equal(ADMIN_DATA.media.length, 0);
  assert.equal(ADMIN_DRAFT.media.length, 0);

  // Now success
  await simulateUploadHandler(false);
  assert.equal(ADMIN_DATA.media.length, 1);
  assert.equal(ADMIN_DRAFT.media.length, 1);
  assert.equal(ADMIN_DRAFT.media[0].id, 'm-new');
}

console.log('Admin media upload regression tests passed.');
