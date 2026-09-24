// Photos kept on the phone are stored as bytes, not Blobs (iPhone fix): Safari saves Blobs in
// IndexedDB as separate files and sometimes can't read them back ("The photo on this phone can't
// be read"), while plain bytes come back reliably. Blobs are made from the bytes only where a
// photo is used (upload, thumbnail, detail). Rows saved before this may still hold Blobs.

export type StoredPhoto = { bytes: ArrayBuffer; type: string };
export type Photo = Blob | StoredPhoto;

export const EMPTY_PHOTO: StoredPhoto = { bytes: new ArrayBuffer(0), type: "image/jpeg" };

/** The photo can't be read back from the phone (a local problem, not the network). */
export class PhotoUnreadableError extends Error {
  constructor(cause: unknown) {
    super("The photo on this phone can't be read", { cause });
    this.name = "PhotoUnreadableError";
  }
}

const isBlob = (photo: Photo): photo is Blob =>
  typeof Blob !== "undefined" && photo instanceof Blob;

/** Read a photo into bytes for storing. Call before opening a transaction (this awaits). */
export async function storable(photo: Photo): Promise<StoredPhoto> {
  if (!isBlob(photo)) return photo;
  try {
    return { bytes: await photo.arrayBuffer(), type: photo.type || "image/jpeg" };
  } catch (error) {
    throw new PhotoUnreadableError(error);
  }
}

/** A Blob to show or send (in memory for stored bytes, so always readable). */
export function asBlob(photo: Photo): Blob {
  return isBlob(photo) ? photo : new Blob([photo.bytes], { type: photo.type });
}

export function photoSize(photo: Photo): number {
  return isBlob(photo) ? photo.size : photo.bytes.byteLength;
}
