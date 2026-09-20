import { supabase, isConfigured } from './supabase-client.js';
import {
  sanitizeStorageFileName,
  formatFileSize,
  getMediaType,
  formatMediaItem,
  validateUploadFile
} from './admin-media-core.js';

// Media upload/delete are admin database writes: when the CRUD boundary is
// available they must pass the same readiness gate as every other mutation.
function assertMediaMutationReady() {
  const crud = typeof window !== 'undefined' ? window.CrabbieAdminCrud : null;
  if (crud && typeof crud.assertAdminReadyForMutation === 'function') {
    crud.assertAdminReadyForMutation();
  }
}

export async function uploadMediaFile(file, altText = '') {
  assertMediaMutationReady();
  if (!isConfigured || !supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const check = validateUploadFile(file);
  if (!check.valid) {
    throw new Error(check.error);
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not signed in. You must be signed in as admin to upload files.');
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    throw new Error('Your session has expired. Please sign in again.');
  }
  if (userData.user.app_metadata?.role !== 'admin') {
    throw new Error('Access denied. Admin privileges are required to upload media.');
  }

  const storagePath = `uploads/${sanitizeStorageFileName(file.name)}`;

  const { error: uploadErr } = await supabase.storage
    .from('media')
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream'
    });

  if (uploadErr) {
    const isRls = uploadErr.message?.toLowerCase().includes('row-level security') ||
                  uploadErr.message?.toLowerCase().includes('policy') ||
                  uploadErr.message?.toLowerCase().includes('unauthorized') ||
                  uploadErr.statusCode === 403 ||
                  uploadErr.statusCode === '403';
    const prefix = isRls ? 'Storage upload failed (RLS / access denied)' : 'Storage upload failed';
    throw new Error(`${prefix}: ${uploadErr.message}`);
  }

  const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(storagePath);

  const { data: mediaRow, error: dbErr } = await supabase
    .from('media')
    .insert({
      bucket_id: 'media',
      storage_path: storagePath,
      original_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      alt_text: altText || file.name
    })
    .select()
    .single();

  if (dbErr) {
    // Clean up uploaded object if database row insertion fails
    try {
      await supabase.storage.from('media').remove([storagePath]);
    } catch (_) {}
    const isRls = dbErr.message?.toLowerCase().includes('row-level security') ||
                  dbErr.message?.toLowerCase().includes('policy') ||
                  dbErr.code === '42501';
    const prefix = isRls ? 'Media record creation failed (RLS / access denied)' : 'Media record creation failed';
    throw new Error(`${prefix}: ${dbErr.message}`);
  }

  return formatMediaItem(mediaRow, (p) => supabase.storage.from('media').getPublicUrl(p).data.publicUrl);
}

export async function deleteMediaFile(id, storagePath) {
  assertMediaMutationReady();
  if (!isConfigured || !supabase) return { success: false, error: 'Not configured' };

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'Not signed in. You must be signed in as admin to delete media.' };
    }
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user || userData.user.app_metadata?.role !== 'admin') {
      return { success: false, error: 'Access denied. Admin privileges are required to delete media.' };
    }

    let path = storagePath;
    if (!path && id) {
      const { data: row } = await supabase
        .from('media')
        .select('storage_path')
        .eq('id', id)
        .maybeSingle();
      if (row && row.storage_path) {
        path = row.storage_path;
      }
    }

    if (path) {
      const { error: storageErr } = await supabase.storage.from('media').remove([path]);
      if (storageErr) {
        throw new Error(`Storage delete failed: ${storageErr.message}`);
      }
    }

    if (id) {
      const { error: rowErr } = await supabase.from('media').delete().eq('id', id);
      if (rowErr) {
        throw new Error(`Media record delete failed: ${rowErr.message}`);
      }
    }

    return { success: true };
  } catch (err) {
    console.warn('Failed to delete media file:', err.message);
    return { success: false, error: err.message };
  }
}

export async function listMediaFiles() {
  if (!isConfigured || !supabase) return [];

  try {
    const { data, error } = await supabase
      .from('media')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Media list failed: ${error.message}`);
    }
    if (!Array.isArray(data)) return [];

    return data.map((row) =>
      formatMediaItem(row, (p) => supabase.storage.from('media').getPublicUrl(p).data.publicUrl)
    );
  } catch (err) {
    console.warn('Failed to list media files:', err.message);
    return [];
  }
}

if (typeof window !== 'undefined') {
  window.CrabbieAdminMedia = {
    uploadMediaFile,
    deleteMediaFile,
    listMediaFiles,
    formatMediaItem,
    formatFileSize,
    getMediaType,
    sanitizeStorageFileName
  };
}
