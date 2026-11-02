(function () {
  "use strict";

  const EOCD_SIGNATURE = 0x06054b50;
  const CENTRAL_SIGNATURE = 0x02014b50;
  const LOCAL_SIGNATURE = 0x04034b50;
  const MAX_ENTRIES = 500;
  const MAX_TOTAL_UNCOMPRESSED = 250 * 1024 * 1024;
  const MAX_SINGLE_UNCOMPRESSED = 100 * 1024 * 1024;
  const MAX_ARCHIVE_BYTES = 300 * 1024 * 1024;

  function u16(view, offset) { return view.getUint16(offset, true); }
  function u32(view, offset) { return view.getUint32(offset, true); }

  function requireRange(view, offset, size, label) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) ||
        offset < 0 || size < 0 || offset > view.byteLength || size > view.byteLength - offset) {
      throw new Error("Invalid ZIP: " + label + " extends beyond the archive.");
    }
  }

  function findEndOfCentralDirectory(view) {
    if (view.byteLength < 22) throw new Error("Invalid ZIP: archive is too short.");
    const start = Math.max(0, view.byteLength - 22 - 0xffff);
    for (let i = view.byteLength - 22; i >= start; i -= 1) {
      if (u32(view, i) === EOCD_SIGNATURE &&
          i + 22 + u16(view, i + 20) === view.byteLength) return i;
    }
    throw new Error("Invalid ZIP: central directory not found.");
  }

  // CRC-32 confirms the actual extracted bytes match the ZIP directory.
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
    crcTable[n] = value >>> 0;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 255];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  async function inflateRaw(bytes, maxBytes) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("This browser cannot decompress ZIP files locally. Use a current Chrome, Edge, Firefox or Safari build.");
    }
    let stream;
    try {
      stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    } catch {
      throw new Error("This browser does not support raw DEFLATE ZIP decompression.");
    }

    const reader = stream.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        // Validate each chunk before storing it; ZIP size fields are untrusted.
        if (value.byteLength > maxBytes - total) {
          throw new Error("ZIP entry expands beyond its declared size or safety limit.");
        }
        total += value.byteLength;
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    const output = new Uint8Array(total);
    let cursor = 0;
    for (const chunk of chunks) {
      output.set(chunk, cursor);
      cursor += chunk.byteLength;
    }
    return output;
  }

  async function extract(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    if (view.byteLength > MAX_ARCHIVE_BYTES) {
      throw new Error("ZIP archive exceeds the 300 MB compressed-size safety limit.");
    }

    const eocd = findEndOfCentralDirectory(view);
    const disk = u16(view, eocd + 4);
    const centralDisk = u16(view, eocd + 6);
    const diskCount = u16(view, eocd + 8);
    const entryCount = u16(view, eocd + 10);
    const centralSize = u32(view, eocd + 12);
    const centralOffset = u32(view, eocd + 16);

    if (disk || centralDisk || diskCount !== entryCount) {
      throw new Error("Multi-disk ZIP archives are not supported.");
    }
    if (entryCount > MAX_ENTRIES) {
      throw new Error("ZIP contains too many entries; the safety limit is " + MAX_ENTRIES + ".");
    }
    if (centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      throw new Error("ZIP64 archives are not supported.");
    }
    requireRange(view, centralOffset, centralSize, "central directory");
    const centralEnd = centralOffset + centralSize;
    if (centralEnd > eocd) throw new Error("Invalid ZIP: central directory overlaps its end record.");

    const decoder = new TextDecoder("utf-8", { fatal: false });
    const entries = [];
    let cursor = centralOffset;
    let totalUncompressed = 0;

    for (let i = 0; i < entryCount; i += 1) {
      if (cursor + 46 > centralEnd || u32(view, cursor) !== CENTRAL_SIGNATURE) {
        throw new Error("Invalid ZIP central directory.");
      }
      const flags = u16(view, cursor + 8);
      const method = u16(view, cursor + 10);
      const expectedCrc = u32(view, cursor + 16);
      const compressedSize = u32(view, cursor + 20);
      const uncompressedSize = u32(view, cursor + 24);
      const fileNameLength = u16(view, cursor + 28);
      const extraLength = u16(view, cursor + 30);
      const commentLength = u16(view, cursor + 32);
      const localDisk = u16(view, cursor + 34);
      const localOffset = u32(view, cursor + 42);
      const recordSize = 46 + fileNameLength + extraLength + commentLength;
      if (cursor + recordSize > centralEnd) {
        throw new Error("Invalid ZIP: truncated central directory entry.");
      }
      const fileNameBytes = bytes.subarray(cursor + 46, cursor + 46 + fileNameLength);
      const name = decoder.decode(fileNameBytes);
      cursor += recordSize;

      if (localDisk || localOffset === 0xffffffff) {
        throw new Error("Multi-disk and ZIP64 entries are not supported.");
      }
      if (flags & 0x41) throw new Error("Encrypted ZIP entry is not supported: " + name);
      if (![0, 8].includes(method)) {
        throw new Error("Unsupported ZIP compression method " + method + ": " + name);
      }
      if (!name || /[\u0000-\u001f\u007f]/.test(name) ||
          /^(?:[/\\]|[a-zA-Z]:[/\\])/.test(name) ||
          /(?:^|[/\\])\.\.(?:[/\\]|$)/.test(name)) {
        throw new Error("Invalid or unsafe ZIP entry name.");
      }
      if (uncompressedSize > MAX_SINGLE_UNCOMPRESSED) {
        throw new Error("ZIP entry is too large: " + name);
      }
      if (method === 0 && compressedSize !== uncompressedSize) {
        throw new Error("Invalid stored ZIP entry size: " + name);
      }
      if (name.endsWith("/")) continue;

      totalUncompressed += uncompressedSize;
      if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) {
        throw new Error("ZIP expands beyond the 250 MB safety limit.");
      }

      requireRange(view, localOffset, 30, "local header for " + name);
      if (u32(view, localOffset) !== LOCAL_SIGNATURE) {
        throw new Error("Invalid local ZIP header: " + name);
      }
      const localFlags = u16(view, localOffset + 6);
      const localMethod = u16(view, localOffset + 8);
      const localNameLength = u16(view, localOffset + 26);
      const localExtraLength = u16(view, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      if (localFlags !== flags || localMethod !== method ||
          localNameLength !== fileNameLength) {
        throw new Error("Inconsistent ZIP headers for " + name);
      }
      requireRange(view, localOffset + 30, localNameLength + localExtraLength, "local filename for " + name);
      for (let j = 0; j < fileNameLength; j += 1) {
        if (bytes[localOffset + 30 + j] !== fileNameBytes[j]) {
          throw new Error("Mismatched ZIP entry name: " + name);
        }
      }
      if (!(flags & 0x8) &&
          (u32(view, localOffset + 14) !== expectedCrc ||
           u32(view, localOffset + 18) !== compressedSize ||
           u32(view, localOffset + 22) !== uncompressedSize)) {
        throw new Error("Inconsistent ZIP entry metadata: " + name);
      }
      if (dataStart > centralOffset || compressedSize > centralOffset - dataStart) {
        throw new Error("Invalid ZIP compressed data range: " + name);
      }

      const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
      const data = method === 0 ? compressed.slice() : await inflateRaw(compressed, uncompressedSize);
      if (data.byteLength !== uncompressedSize) throw new Error("ZIP entry size mismatch: " + name);
      if (crc32(data) !== expectedCrc) throw new Error("ZIP entry checksum mismatch: " + name);
      entries.push({ name, data });
    }

    if (cursor !== centralEnd) throw new Error("Invalid ZIP: unexpected central directory records.");
    return entries;
  }

  window.SignalDockZip = { extract };
}());