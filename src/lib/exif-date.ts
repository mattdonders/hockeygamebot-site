// Read a photo's capture DATE (EXIF DateTimeOriginal) entirely client-side — the
// bytes never leave the device; only the resulting YYYY-MM-DD string is used to
// look up NHL games. Deliberately tiny + dependency-free (CSP-safe for the
// artifact/worker environment): it walks the JPEG APP1/TIFF structure for one tag.
//
// iPhone note: iOS Safari transcodes HEIC→JPEG when you pick from the photo library
// via a file input, so iPhone photos generally arrive here as parseable JPEGs. A
// file with no readable EXIF date (screenshots, downloads, some HEIC paths) returns
// null and is surfaced honestly as "couldn't read a date" rather than guessed.

const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME = 0x0132; // fallback (file/modify time)
const TAG_EXIF_IFD_POINTER = 0x8769;

/** Walk one IFD, invoking cb(tag, type, count, valueOffset) per entry. */
function eachTag(
  view: DataView,
  ifdStart: number,
  little: boolean,
  cb: (tag: number, type: number, count: number, valueOffset: number) => void,
): void {
  if (ifdStart + 2 > view.byteLength) return;
  const entries = view.getUint16(ifdStart, little);
  for (let i = 0; i < entries; i++) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > view.byteLength) return;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const count = view.getUint32(entry + 4, little);
    cb(tag, type, count, entry + 8);
  }
}

/** Read an ASCII EXIF value (inline if ≤4 bytes, else at the pointed offset). */
function readAscii(
  view: DataView,
  tiffStart: number,
  count: number,
  valueOffset: number,
  little: boolean,
): string | null {
  const strOffset = count <= 4 ? valueOffset : tiffStart + view.getUint32(valueOffset, little);
  let out = '';
  for (let j = 0; j < count - 1; j++) {
    const p = strOffset + j;
    if (p >= view.byteLength) break;
    const c = view.getUint8(p);
    if (c === 0) break;
    out += String.fromCharCode(c);
  }
  return out || null;
}

/** Parse the TIFF block (at tiffStart) for a capture date, preferring
 *  DateTimeOriginal over the plain DateTime fallback. */
function parseTiff(view: DataView, tiffStart: number): string | null {
  if (tiffStart + 8 > view.byteLength) return null;
  const byteOrder = view.getUint16(tiffStart, false);
  const little = byteOrder === 0x4949; // "II" little-endian; "MM" (0x4d4d) big-endian
  if (!little && byteOrder !== 0x4d4d) return null;
  if (view.getUint16(tiffStart + 2, little) !== 0x002a) return null;

  const ifd0 = tiffStart + view.getUint32(tiffStart + 4, little);

  // Collect the IFDs worth searching: IFD0, plus the ExifIFD it points to
  // (DateTimeOriginal lives in the ExifIFD).
  const ifds: number[] = [ifd0];
  eachTag(view, ifd0, little, (tag, _type, _count, valueOffset) => {
    if (tag === TAG_EXIF_IFD_POINTER) ifds.push(tiffStart + view.getUint32(valueOffset, little));
  });

  let original: string | null = null;
  let fallback: string | null = null;
  for (const ifd of ifds) {
    eachTag(view, ifd, little, (tag, type, count, valueOffset) => {
      if (type !== 2) return; // ASCII only
      if (tag === TAG_DATETIME_ORIGINAL) original ??= readAscii(view, tiffStart, count, valueOffset, little);
      else if (tag === TAG_DATETIME) fallback ??= readAscii(view, tiffStart, count, valueOffset, little);
    });
  }

  const raw = original ?? fallback;
  if (!raw) return null;
  // EXIF datetime is "YYYY:MM:DD HH:MM:SS" (camera-local); we only want the date.
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Locate the EXIF APP1 segment in a JPEG and parse its date. Returns YYYY-MM-DD
 *  or null. Pure over the bytes — exported for unit testing with a crafted buffer. */
export function readExifDateFromBuffer(buf: ArrayBuffer): string | null {
  try {
    const view = new DataView(buf);
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null; // not a JPEG (SOI)
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset, false);
      if ((marker & 0xff00) !== 0xff00) break; // desync — not a marker
      if (marker === 0xffda) break; // start of scan — no metadata past here
      const size = view.getUint16(offset + 2, false);
      if (size < 2) break;
      if (marker === 0xffe1) {
        // APP1 — is it "Exif\0\0"?
        const app1 = offset + 4;
        if (
          app1 + 6 <= view.byteLength &&
          view.getUint32(app1, false) === 0x45786966 && // "Exif"
          view.getUint16(app1 + 4, false) === 0x0000
        ) {
          const date = parseTiff(view, app1 + 6);
          if (date) return date;
        }
      }
      offset += 2 + size;
    }
    return null;
  } catch {
    return null;
  }
}

/** Read a photo File's capture date, entirely in-browser. Never uploads. */
export async function readPhotoDate(file: File): Promise<string | null> {
  try {
    // EXIF lives in the first tens of KB; reading a slice keeps big photos cheap.
    const head = file.slice(0, 256 * 1024);
    return readExifDateFromBuffer(await head.arrayBuffer());
  } catch {
    return null;
  }
}
