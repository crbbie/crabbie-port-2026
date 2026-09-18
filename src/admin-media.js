import { supabase, isConfigured } from './supabase-client.js';
import {
  sanitizeStorageFileName,
  formatFileSize,
  getMediaType,
  formatMediaItem,
  validateUploadFile
} from './admin-media-core.js';

export async function uploadMediaFile(file, altText = '') {
  if (!isConfigured || !supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const check = validateUploadFile(file);
  if (!check.valid) {
    throw new Error(check.error);
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('You must be signed in as admin to upload files.');
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
    throw new Error(`Storage upload failed: ${uploadErr.message}`);
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
    throw new Error(`Media record creation failed: ${dbErr.message}`);
  }

  return formatMediaItem(mediaRow, () => publicUrl);
}

export async function deleteMediaFile(id, storagePath) {
  if (!isConfigured || !supabase) return { success: false, error: 'Not configured' };

  try {
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
      await supabase.storage.from('media').remove([path]);
    }

    if (id) {
      await supabase.from('media').delete().eq('id', id);
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

    if (error || !Array.isArray(data)) return [];

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
