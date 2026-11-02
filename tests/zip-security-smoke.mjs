import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { deflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(path.join(root, "src/vendor/zip.js"), "utf8"), {
  filename: "src/vendor/zip.js"
});

function crc32(input) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(name, body, options = {}) {
  const fileName = Buffer.from(name, "utf8");
  const data = Buffer.from(body);
  const method = options.method ?? 8;
  const compressed = method === 8 ? deflateRawSync(data) : data;
  const claimedSize = options.claimedSize ?? data.length;
  const checksum = options.checksum ?? crc32(data);
  const flags = options.flags ?? 0x800;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(flags, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(claimedSize, 22);
  local.writeUInt16LE(fileName.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(flags, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(claimedSize, 24);
  central.writeUInt16LE(fileName.length, 28);
  const offset = local.length + fileName.length + compressed.length;

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + fileName.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([local, fileName, compressed, central, fileName, end]);
}

function archive(buffer) {
  return Uint8Array.from(buffer).buffer;
}

async function reject(buffer, error) {
  await assert.rejects(globalThis.SignalDockZip.extract(archive(buffer)), error);
}

const stored = makeZip("logs/stored.log", "2026-01-01 INFO stored", { method: 0 });
const storedEntries = await globalThis.SignalDockZip.extract(archive(stored));
assert.equal(storedEntries.length, 1);
assert.equal(storedEntries[0].name, "logs/stored.log");
assert.equal(new TextDecoder().decode(storedEntries[0].data), "2026-01-01 INFO stored");

const deflated = makeZip("logs/deflated.ndjson", "x".repeat(5000));
const deflatedEntries = await globalThis.SignalDockZip.extract(archive(deflated));
assert.equal(new TextDecoder().decode(deflatedEntries[0].data), "x".repeat(5000));

await reject(makeZip("bad.log", "a".repeat(32768), { claimedSize: 10 }), /expands beyond/);
await reject(makeZip("bad.log", "small", { claimedSize: 200 }), /size mismatch/);
await reject(makeZip("bad.log", "corrupt", { checksum: 123 }), /checksum mismatch/);
await reject(makeZip("../private.log", "bad"), /unsafe ZIP entry name/);
await reject(makeZip("/absolute.log", "bad"), /unsafe ZIP entry name/);
await reject(makeZip("C:\\temp\\bad.log", "bad"), /unsafe ZIP entry name/);
await reject(makeZip("bad.log", "bad", { flags: 0x801 }), /Encrypted ZIP entry/);
await reject(makeZip("large.log", "a", { claimedSize: 101 * 1024 * 1024 }), /too large/);
await reject(Buffer.from("not a ZIP"), /Invalid ZIP/);

const mismatchedMethod = makeZip("bad.log", "compressed");
mismatchedMethod.writeUInt16LE(0, 8);
await reject(mismatchedMethod, /Inconsistent ZIP headers/);

const mismatchedName = makeZip("name.log", "data");
mismatchedName[30] = 0x58;
await reject(mismatchedName, /Mismatched ZIP entry name/);

const missingPayload = makeZip("bad.log", "data");
const centralOffset = missingPayload.readUInt32LE(missingPayload.length - 22 + 16);
missingPayload.writeUInt32LE(999, 18);
missingPayload.writeUInt32LE(999, centralOffset + 20);
await reject(missingPayload, /compressed data range/);

const invalidCentral = makeZip("bad.log", "data");
invalidCentral.writeUInt32LE(0xffffffff, invalidCentral.length - 22 + 16);
await reject(invalidCentral, /ZIP64/);

const fakeCount = makeZip("bad.log", "data");
fakeCount.writeUInt16LE(501, fakeCount.length - 22 + 8);
fakeCount.writeUInt16LE(501, fakeCount.length - 22 + 10);
await reject(fakeCount, /too many entries/);

console.log("PASS ZIP extraction: stored, deflate, size budget, CRC, safe paths, metadata and bounds");
