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

// All offsets below are bounded by `limit` — the END of the APP1/EXIF segment, NOT
// the whole file. A malformed IFD/value pointer can otherwise point past the
// segment into unrelated JPEG bytes and get misread as EXIF (data-integrity bug).

/** Walk one IFD, invoking cb(tag, type, count, valueOffset) per entry. */
function eachTag(
  view: DataView,
  ifdStart: number,
  little: boolean,
  limit: number,
  cb: (tag: number, type: number, count: number, valueOffset: number) => void,
): void {
  if (ifdStart < 0 || ifdStart + 2 > limit) return;
  const entries = view.getUint16(ifdStart, little);
  for (let i = 0; i < entries; i++) {
    const entry = ifdStart + 2 + i * 12;
    if (entry + 12 > limit) return;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const count = view.getUint32(entry + 4, little);
    cb(tag, type, count, entry + 8);
  }
}

/** Read an ASCII EXIF value (inline if ≤4 bytes, else at the pointed offset).
 *  Rejects a pointer that lands outside [tiffStart, limit). */
function readAscii(
  view: DataView,
  tiffStart: number,
  count: number,
  valueOffset: number,
  little: boolean,
  limit: number,
): string | null {
  const strOffset = count <= 4 ? valueOffset : tiffStart + view.getUint32(valueOffset, little);
  if (strOffset < tiffStart || strOffset >= limit) return null;
  let out = '';
  for (let j = 0; j < count - 1; j++) {
    const p = strOffset + j;
    if (p >= limit) break;
    const c = view.getUint8(p);
    if (c === 0) break;
    out += String.fromCharCode(c);
  }
  return out || null;
}

/** UTC round-trip: reject an impossible calendar date (e.g. 2026:02:30), matching
 *  the paste path's validation. */
function validExifDate(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${y}-${p(mo)}-${p(d)}`;
}

/** Parse the TIFF block (at tiffStart, bounded by `limit`) for a capture date,
 *  preferring DateTimeOriginal over the plain DateTime fallback. */
function parseTiff(view: DataView, tiffStart: number, limit: number): string | null {
  if (tiffStart + 8 > limit) return null;
  const byteOrder = view.getUint16(tiffStart, false);
  const little = byteOrder === 0x4949; // "II" little-endian; "MM" (0x4d4d) big-endian
  if (!little && byteOrder !== 0x4d4d) return null;
  if (view.getUint16(tiffStart + 2, little) !== 0x002a) return null;

  const ifd0 = tiffStart + view.getUint32(tiffStart + 4, little);

  // Collect the IFDs worth searching: IFD0, plus the ExifIFD it points to
  // (DateTimeOriginal lives in the ExifIFD). Reject an ExifIFD pointer that lands
  // outside the segment.
  const ifds: number[] = [ifd0];
  eachTag(view, ifd0, little, limit, (tag, _type, _count, valueOffset) => {
    if (tag === TAG_EXIF_IFD_POINTER) {
      const p = tiffStart + view.getUint32(valueOffset, little);
      if (p >= tiffStart && p < limit) ifds.push(p);
    }
  });

  let original: string | null = null;
  let fallback: string | null = null;
  for (const ifd of ifds) {
    eachTag(view, ifd, little, limit, (tag, type, count, valueOffset) => {
      if (type !== 2) return; // ASCII only
      if (tag === TAG_DATETIME_ORIGINAL) original ??= readAscii(view, tiffStart, count, valueOffset, little, limit);
      else if (tag === TAG_DATETIME) fallback ??= readAscii(view, tiffStart, count, valueOffset, little, limit);
    });
  }

  const raw = original ?? fallback;
  if (!raw) return null;
  // EXIF datetime is "YYYY:MM:DD HH:MM:SS" (camera-local); we only want the date.
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2})/);
  return m ? validExifDate(+m[1], +m[2], +m[3]) : null;
}

/** Find the EXIF APP1/TIFF block in a JPEG and run `fn(view, tiffStart, limit)`,
 *  where `limit` is the END of that segment (all reads must stay under it).
 *  Returns fn's first non-null result, or null. Shared by the date + GPS readers. */
function withExifTiff<T>(
  buf: ArrayBuffer,
  fn: (view: DataView, tiffStart: number, limit: number) => T | null,
): T | null {
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
        const segEnd = Math.min(offset + 2 + size, view.byteLength);
        if (
          app1 + 6 <= view.byteLength &&
          view.getUint32(app1, false) === 0x45786966 && // "Exif"
          view.getUint16(app1 + 4, false) === 0x0000
        ) {
          const r = fn(view, app1 + 6, segEnd);
          if (r != null) return r;
        }
      }
      offset += 2 + size;
    }
    return null;
  } catch {
    return null;
  }
}

/** Locate the EXIF APP1 segment in a JPEG and parse its date. Returns YYYY-MM-DD
 *  or null. Pure over the bytes — exported for unit testing with a crafted buffer. */
export function readExifDateFromBuffer(buf: ArrayBuffer): string | null {
  return withExifTiff(buf, parseTiff);
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

// ── GPS (spike) ──────────────────────────────────────────────────────────────────
// Decimal lat/lon read from the photo's EXIF GPS IFD, entirely client-side. This is
// the de-risking spike for arena auto-detection: iOS keeps the capture DATE through
// its HEIC→JPEG transcode, but may STRIP location for privacy — this tells us on a
// real device whether GPS survives a web file-pick at all.

const TAG_GPS_IFD_POINTER = 0x8825;

export type GpsCoord = { lat: number; lon: number };

/** Read `count` RATIONALs (u32 num / u32 den, 8 bytes each) from the pointed offset. */
function readRationals(
  view: DataView,
  tiffStart: number,
  count: number,
  valueOffset: number,
  little: boolean,
  limit: number,
): number[] | null {
  const off = tiffStart + view.getUint32(valueOffset, little); // >4 bytes ⇒ always a pointer
  if (off < tiffStart || off + count * 8 > limit) return null;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const num = view.getUint32(off + i * 8, little);
    const den = view.getUint32(off + i * 8 + 4, little);
    if (den === 0) return null; // malformed rational — reject the whole value
    out.push(num / den);
  }
  return out;
}

/** Follow IFD0 → GPS IFD and decode lat/lon (DMS rationals + N/S/E/W refs). */
function parseGps(view: DataView, tiffStart: number, limit: number): GpsCoord | null {
  if (tiffStart + 8 > limit) return null;
  const byteOrder = view.getUint16(tiffStart, false);
  const little = byteOrder === 0x4949;
  if (!little && byteOrder !== 0x4d4d) return null;
  if (view.getUint16(tiffStart + 2, little) !== 0x002a) return null;

  const ifd0 = tiffStart + view.getUint32(tiffStart + 4, little);
  const box: { gps?: number } = {};
  eachTag(view, ifd0, little, limit, (tag, _type, _count, valOff) => {
    if (tag === TAG_GPS_IFD_POINTER) {
      const p = tiffStart + view.getUint32(valOff, little);
      if (p >= tiffStart && p < limit) box.gps = p;
    }
  });
  if (box.gps == null) return null;

  const g: { latRef?: string | null; lonRef?: string | null; lat?: number[] | null; lon?: number[] | null } = {};
  eachTag(view, box.gps, little, limit, (tag, type, count, valOff) => {
    if (tag === 0x0001 && type === 2) g.latRef = readAscii(view, tiffStart, count, valOff, little, limit);
    else if (tag === 0x0003 && type === 2) g.lonRef = readAscii(view, tiffStart, count, valOff, little, limit);
    else if (tag === 0x0002 && type === 5 && count === 3) g.lat = readRationals(view, tiffStart, count, valOff, little, limit);
    else if (tag === 0x0004 && type === 5 && count === 3) g.lon = readRationals(view, tiffStart, count, valOff, little, limit);
  });
  if (!g.lat || !g.lon) return null;

  const dms = (a: number[]) => a[0] + a[1] / 60 + a[2] / 3600;
  let lat = dms(g.lat);
  let lon = dms(g.lon);
  if (g.latRef && g.latRef.toUpperCase().startsWith('S')) lat = -lat;
  if (g.lonRef && g.lonRef.toUpperCase().startsWith('W')) lon = -lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null; // impossible coord — reject
  if (lat === 0 && lon === 0) return null; // null-island (unset) sentinel
  return { lat, lon };
}

/** GPS from raw bytes (exported for unit testing with a crafted buffer). */
export function readExifGpsFromBuffer(buf: ArrayBuffer): GpsCoord | null {
  return withExifTiff(buf, parseGps);
}

/** Read a photo File's GPS coordinate, entirely in-browser. Never uploads. */
export async function readPhotoGps(file: File): Promise<GpsCoord | null> {
  try {
    const head = file.slice(0, 256 * 1024);
    return readExifGpsFromBuffer(await head.arrayBuffer());
  } catch {
    return null;
  }
}
