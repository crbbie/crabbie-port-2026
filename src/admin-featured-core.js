/**
 * Keeps authored Home membership within its fixed visual slot count.
 * Input order is the authoritative admin/sort order. The newly enabled
 * record is never a victim; the last older featured record is removed first.
 */
export function enforceFeaturedLimit(records = [], newlyFeaturedId, limit) {
  const next = Array.isArray(records) ? records.map((record) => ({ ...record })) : [];
  const newlyFeaturedIndex = next.findIndex((record) => record && record.id === newlyFeaturedId);
  if (newlyFeaturedIndex === -1 || !Number.isFinite(limit) || limit < 1) {
    return { records: next, evictedId: null };
  }

  next[newlyFeaturedIndex] = { ...next[newlyFeaturedIndex], featured: true };
  const olderFeatured = next.filter((record) => record.featured && record.id !== newlyFeaturedId);
  if (olderFeatured.length + 1 <= limit) return { records: next, evictedId: null };

  const victim = olderFeatured[olderFeatured.length - 1];
  const victimIndex = next.findIndex((record) => record.id === victim.id);
  next[victimIndex] = { ...next[victimIndex], featured: false };
  return { records: next, evictedId: victim.id };
}
