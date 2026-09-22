import { supabase, isConfigured } from './supabase-client.js';
import { uploadLeasePayload, isLeaseActive } from './media-purge-core.js';

/**
 * media-upload-leases.js
 * Minimal upload-lease coordination so a manual purge can prove "no active
 * upload" for a storage path. The upload pipeline takes a lease before the
 * transfer starts and releases it once the media row exists. A failed or
 * cancelled transfer keeps its lease until expiry (orphan protection):
 * leases die on their own, nothing reaps them.
 */

const LEASE_TABLE = 'media_upload_leases';

/** Best-effort lease take: a lease failure must never break an upload. */
export async function takeUploadLease(storagePath, createdBy = null) {
  try {
    if (!isConfigured || !supabase || !storagePath) return { ok: false, error: 'unavailable' };
    const payload = uploadLeasePayload({ storagePath, createdBy });
    const { error } = await supabase.from(LEASE_TABLE).upsert(payload, { onConflict: 'storage_path' });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) };
  }
}

/** Best-effort lease release; expiry is the backstop. */
export async function releaseUploadLease(storagePath) {
  try {
    if (!isConfigured || !supabase || !storagePath) return { ok: false };
    await supabase.from(LEASE_TABLE).delete().eq('storage_path', storagePath);
    return { ok: true };
  } catch (_) {
    return { ok: false };
  }
}

/** Active leases keyed by storage path (expired ones never block). */
export async function fetchActiveUploadLeases(nowMs = null) {
  const now = nowMs === null || nowMs === undefined ? Date.now() : Number(nowMs);
  if (!isConfigured || !supabase) return { leasesByPath: {}, complete: false, error: 'not configured' };
  try {
    const { data, error } = await supabase.from(LEASE_TABLE).select('storage_path,started_at,expires_at,created_by');
    if (error) throw new Error(error.message);
    const leasesByPath = {};
    (Array.isArray(data) ? data : []).forEach((lease) => {
      if (lease && lease.storage_path && isLeaseActive(lease, now)) leasesByPath[lease.storage_path] = lease;
    });
    return { leasesByPath, complete: true, error: null };
  } catch (err) {
    return { leasesByPath: {}, complete: false, error: (err && err.message) || String(err) };
  }
}
