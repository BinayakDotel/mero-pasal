// Object URLs for photos kept on the phone. Every read from IndexedDB returns a new Blob for the
// same photo; making a fresh URL (and revoking the old one) on each re-render made Safari show a
// broken "?" image. One URL per photo, kept until the cache is full.

const MAX_URLS = 200;
const urls = new Map<string, { url: string; size: number; type: string }>();

/** A steady object URL for this photo (`key` names it, e.g. the bill's list key). */
export function blobUrlFor(key: string, blob: Blob): string {
  const known = urls.get(key);
  if (known && known.size === blob.size && known.type === blob.type) {
    urls.delete(key);
    urls.set(key, known); // most recently used last
    return known.url;
  }
  const url = URL.createObjectURL(blob);
  urls.set(key, { url, size: blob.size, type: blob.type });
  while (urls.size > MAX_URLS) {
    const [oldest] = urls.keys();
    if (oldest === undefined) break;
    URL.revokeObjectURL(urls.get(oldest)?.url ?? "");
    urls.delete(oldest);
  }
  return url;
}

/** Tests only. */
export function forgetBlobUrls(): void {
  urls.clear();
}
