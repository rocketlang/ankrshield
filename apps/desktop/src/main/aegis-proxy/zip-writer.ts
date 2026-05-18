// SPDX-License-Identifier: AGPL-3.0-only
// ankrshield-desktop / aegis-proxy — minimal ZIP writer (ASD-T-029)
//
// Vendored zero-dependency ZIP writer using the STORE method (no
// compression). Justified by use case: audit export only zips per-day
// dirs whose prior-day .json files are already gzipped by T-028, and
// today's plain JSON is small. STORE keeps the writer ~200 lines and
// produces a valid ZIP every common unzip tool (macOS Archive Utility,
// Windows Explorer, 7-Zip, unzip(1)) understands.
//
// ZIP layout (per APPNOTE.TXT v6.3.10):
//   per entry: Local File Header (LFH) + file data
//   after all entries: Central Directory File Headers (CDFHs) + EOCD record
//
// Streaming via async iterator + write callback so we never buffer the
// whole archive in RAM — important for years-of-audit exports.
//
// CRC-32 computed inline (tiny standard implementation; node:zlib doesn't
// expose crc32 from JS surface area before Node 22).

import { Buffer } from 'node:buffer';

export interface ZipEntry {
  /** Forward-slash relative path inside the archive. */
  path: string;
  /** Raw bytes to store. STORE method, no compression applied. */
  data: Buffer;
  /** File mtime; embedded into the DOS date/time fields. Default: now. */
  mtime?: Date;
}

export interface ZipWriterOptions {
  /** Receives ZIP bytes as they're produced. May be called many times. */
  write: (chunk: Buffer) => void;
}

interface CentralDirEntry {
  path: string;
  crc32: number;
  size: number;
  dosTime: number;
  dosDate: number;
  offset: number;
}

const SIG_LFH = 0x04034b50;
const SIG_CDFH = 0x02014b50;
const SIG_EOCD = 0x06054b50;

/** Streaming ZIP writer; one instance per archive. */
export class ZipWriter {
  private readonly write: (chunk: Buffer) => void;
  private offset = 0;
  private readonly entries: CentralDirEntry[] = [];
  private closed = false;

  constructor(opts: ZipWriterOptions) {
    this.write = opts.write;
  }

  /** Append one entry. */
  add(entry: ZipEntry): void {
    if (this.closed) throw new Error('ZipWriter is closed');
    const pathBytes = Buffer.from(entry.path, 'utf8');
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const { dosTime, dosDate } = toDosTime(entry.mtime ?? new Date());

    // Local File Header: 30 + path bytes.
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(SIG_LFH, 0);
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0x0800, 6); // general purpose: bit 11 = UTF-8 filename
    lfh.writeUInt16LE(0, 8); // method = STORE
    lfh.writeUInt16LE(dosTime, 10);
    lfh.writeUInt16LE(dosDate, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(size, 18); // compressed size = uncompressed (STORE)
    lfh.writeUInt32LE(size, 22);
    lfh.writeUInt16LE(pathBytes.length, 26);
    lfh.writeUInt16LE(0, 28); // extra field length

    this.write(lfh);
    this.write(pathBytes);
    this.write(entry.data);

    this.entries.push({
      path: entry.path,
      crc32: crc,
      size,
      dosTime,
      dosDate,
      offset: this.offset,
    });
    this.offset += 30 + pathBytes.length + size;
  }

  /** Close — writes Central Directory + EOCD. */
  end(): void {
    if (this.closed) return;
    this.closed = true;

    const cdStart = this.offset;
    for (const e of this.entries) {
      const pathBytes = Buffer.from(e.path, 'utf8');
      const cdfh = Buffer.alloc(46);
      cdfh.writeUInt32LE(SIG_CDFH, 0);
      cdfh.writeUInt16LE(20, 4); // version made by
      cdfh.writeUInt16LE(20, 6); // version needed
      cdfh.writeUInt16LE(0x0800, 8); // UTF-8 filename
      cdfh.writeUInt16LE(0, 10); // method = STORE
      cdfh.writeUInt16LE(e.dosTime, 12);
      cdfh.writeUInt16LE(e.dosDate, 14);
      cdfh.writeUInt32LE(e.crc32, 16);
      cdfh.writeUInt32LE(e.size, 20);
      cdfh.writeUInt32LE(e.size, 24);
      cdfh.writeUInt16LE(pathBytes.length, 28);
      cdfh.writeUInt16LE(0, 30); // extra
      cdfh.writeUInt16LE(0, 32); // comment
      cdfh.writeUInt16LE(0, 34); // disk number
      cdfh.writeUInt16LE(0, 36); // internal attrs
      cdfh.writeUInt32LE(0, 38); // external attrs
      cdfh.writeUInt32LE(e.offset, 42);
      this.write(cdfh);
      this.write(pathBytes);
      this.offset += 46 + pathBytes.length;
    }

    const cdSize = this.offset - cdStart;
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(SIG_EOCD, 0);
    eocd.writeUInt16LE(0, 4); // disk number
    eocd.writeUInt16LE(0, 6); // central dir disk
    eocd.writeUInt16LE(this.entries.length, 8); // entries on this disk
    eocd.writeUInt16LE(this.entries.length, 10); // total entries
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdStart, 16);
    eocd.writeUInt16LE(0, 20); // comment length
    this.write(eocd);
    this.offset += 22;
  }

  /** Total bytes written so far. */
  byteLength(): number {
    return this.offset;
  }

  entryCount(): number {
    return this.entries.length;
  }
}

// ─── CRC-32 (IEEE 802.3) ──────────────────────────────────────────────────────

let CRC_TABLE: Uint32Array | null = null;

function ensureCrcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}

export function crc32(buf: Buffer): number {
  const table = ensureCrcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (table[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ─── DOS date/time ────────────────────────────────────────────────────────────

export function toDosTime(d: Date): { dosTime: number; dosDate: number } {
  // DOS format: 16 bits each.
  // dosTime: bits 0-4 second/2 (0-29), 5-10 minute (0-59), 11-15 hour (0-23)
  // dosDate: bits 0-4 day (1-31), 5-8 month (1-12), 9-15 year-1980
  const seconds = Math.floor(d.getSeconds() / 2);
  const dosTime = (seconds & 0x1f) | ((d.getMinutes() & 0x3f) << 5) | ((d.getHours() & 0x1f) << 11);
  const dosDate =
    (d.getDate() & 0x1f) |
    (((d.getMonth() + 1) & 0x0f) << 5) |
    ((Math.max(0, d.getFullYear() - 1980) & 0x7f) << 9);
  return { dosTime, dosDate };
}

export const __internals = { crc32, toDosTime };
