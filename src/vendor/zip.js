(function () {
  "use strict";

  const EOCD_SIGNATURE = 0x06054b50;
  const CENTRAL_SIGNATURE = 0x02014b50;
  const LOCAL_SIGNATURE = 0x04034b50;
  const MAX_ENTRIES = 500;
  const MAX_TOTAL_UNCOMPRESSED = 250 * 1024 * 1024;
  const MAX_SINGLE_UNCOMPRESSED = 100 * 1024 * 1024;

  function u16(view, offset) { return view.getUint16(offset, true); }
  function u32(view, offset) { return view.getUint32(offset, true); }

  function findEndOfCentralDirectory(view) {
    const minimum = 22;
    const maximumComment = 0xffff;
    const start = Math.max(0, view.byteLength - minimum - maximumComment);
    for (let i = view.byteLength - minimum; i >= start; i -= 1) {
      if (u32(view, i) === EOCD_SIGNATURE) return i;
    }
    throw new Error("Invalid ZIP: central directory not found.");
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("This browser cannot decompress ZIP files locally. Use a current Chrome, Edge, Firefox or Safari build.");
    }
    let stream;
    try {
      stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    } catch {
      throw new Error("This browser does not support raw DEFLATE ZIP decompression.");
    }
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function extract(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const eocd = findEndOfCentralDirectory(view);
    const entryCount = u16(view, eocd + 10);
    const centralOffset = u32(view, eocd + 16);

    if (entryCount > MAX_ENTRIES) throw new Error(`ZIP contains ${entryCount} entries; the safety limit is ${MAX_ENTRIES}.`);

    const decoder = new TextDecoder("utf-8", { fatal: false });
    const entries = [];
    let cursor = centralOffset;
    let totalUncompressed = 0;

    for (let i = 0; i < entryCount; i += 1) {
      if (u32(view, cursor) !== CENTRAL_SIGNATURE) throw new Error("Invalid ZIP central directory.");

      const flags = u16(view, cursor + 8);
      const method = u16(view, cursor + 10);
      const compressedSize = u32(view, cursor + 20);
      const uncompressedSize = u32(view, cursor + 24);
      const fileNameLength = u16(view, cursor + 28);
      const extraLength = u16(view, cursor + 30);
      const commentLength = u16(view, cursor + 32);
      const localOffset = u32(view, cursor + 42);
      const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + fileNameLength));
      cursor += 46 + fileNameLength + extraLength + commentLength;

      if (name.endsWith("/")) continue;
      if (flags & 0x1) throw new Error(`Encrypted ZIP entry is not supported: ${name}`);
      if (![0, 8].includes(method)) throw new Error(`Unsupported ZIP compression method ${method}: ${name}`);
      if (uncompressedSize > MAX_SINGLE_UNCOMPRESSED) throw new Error(`ZIP entry is too large: ${name}`);

      totalUncompressed += uncompressedSize;
      if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED) throw new Error("ZIP expands beyond the 250 MB safety limit.");

      if (u32(view, localOffset) !== LOCAL_SIGNATURE) throw new Error(`Invalid local ZIP header: ${name}`);
      const localNameLength = u16(view, localOffset + 26);
      const localExtraLength = u16(view, localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
      const data = method === 0 ? compressed.slice() : await inflateRaw(compressed);
      entries.push({ name, data });
    }

    return entries;
  }

  window.SignalDockZip = { extract };
}());
