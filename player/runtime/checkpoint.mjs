/**
 * Differential Sparse-Page Checkpoint Engine for Timeline Seeking.
 *
 * Encodes only the 4KB pages modified relative to the startup baseline memory,
 * plus CPU registers and explicitly supplied JSON state. Device/audio/FPU state
 * must be serialized by the production adapter; it is not inferred here.
 */
import { DemoMachine } from './machine.mjs';

const PAGE_SIZE = 4096;

/**
 * Encodes an uncompressed sparse checkpoint relative to base memory.
 * @param {Uint8Array} baseMemory - Startup baseline memory array.
 * @param {DemoMachine} machine - Current active DemoMachine.
 * @param {Object} demoState - High-level scene, timer, and tracker state variables.
 * @returns {Uint8Array} Binary checkpoint blob.
 */
export function encodeCheckpoint(baseMemory, machine, demoState = {}, baselineSha256 = null) {
  if (baseMemory.length !== machine.memory.length) throw new Error('Checkpoint memory length changed');
  const dirtyPages = [];
  const totalPages = Math.ceil(baseMemory.length / PAGE_SIZE);

  for (let page = 0; page < totalPages; page++) {
    const start = page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, baseMemory.length);
    for (let i = start; i < end; i++) {
      if (baseMemory[i] !== machine.memory[i]) {
        dirtyPages.push(page);
        break;
      }
    }
  }

  const metaJson = JSON.stringify({
    schema: 2,
    baselineBytes: baseMemory.length,
    baselineSha256,
    registers: machine.r,
    state: demoState
  });
  const metadataBytes = new TextEncoder().encode(metaJson);

  // Layout: [u32 meta_len][u32 dirty_page_count][metadata_bytes...][(u32 page_idx, 4096 bytes data)...]
  const totalLength = 8 + metadataBytes.length + dirtyPages.length * (4 + PAGE_SIZE);
  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);

  view.setUint32(0, metadataBytes.length, true);
  view.setUint32(4, dirtyPages.length, true);
  output.set(metadataBytes, 8);

  let offset = 8 + metadataBytes.length;
  for (const page of dirtyPages) {
    view.setUint32(offset, page, true);
    offset += 4;
    output.set(machine.memory.subarray(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), offset);
    offset += PAGE_SIZE;
  }

  return output;
}

/**
 * Restores a DemoMachine and state from a checkpoint.
 * @param {Uint8Array} baseMemory - Startup baseline memory array.
 * @param {Uint8Array} checkpointBytes - Binary checkpoint blob.
 * @returns {{ machine: DemoMachine, state: Object }} Restored machine and demo state.
 */
export function restoreCheckpoint(baseMemory, checkpointBytes) {
  if (checkpointBytes.byteLength < 8) throw new Error('Truncated checkpoint');
  const view = new DataView(checkpointBytes.buffer, checkpointBytes.byteOffset, checkpointBytes.byteLength);
  const metaLength = view.getUint32(0, true);
  const pageCount = view.getUint32(4, true);

  const expectedLength = 8 + metaLength + pageCount * (4 + PAGE_SIZE);
  if (checkpointBytes.length !== expectedLength) {
    throw new Error(`Corrupted checkpoint: expected length ${expectedLength}, got ${checkpointBytes.length}`);
  }

  const metaString = new TextDecoder().decode(checkpointBytes.subarray(8, 8 + metaLength));
  const metadata = JSON.parse(metaString);

  if (metadata.schema !== 2) {
    throw new Error(`Unsupported checkpoint schema version: ${metadata.schema}`);
  }
  if (metadata.baselineBytes !== baseMemory.length) throw new Error('Wrong checkpoint baseline length');

  // Clone base memory and patch with dirty pages
  const memory = baseMemory.slice();
  let offset = 8 + metaLength;
  const seen = new Set();
  for (let i = 0; i < pageCount; i++) {
    const page = view.getUint32(offset, true);
    offset += 4;
    if (seen.has(page) || page * PAGE_SIZE >= memory.length) throw new Error('Invalid checkpoint page');
    seen.add(page);
    const count = Math.min(PAGE_SIZE, memory.length - page * PAGE_SIZE);
    memory.set(checkpointBytes.subarray(offset, offset + count), page * PAGE_SIZE);
    offset += PAGE_SIZE;
  }

  const machine = new DemoMachine(memory, { ...metadata.registers });
  return {
    machine,
    state: metadata.state || {}
  };
}

async function baselineDigest(memory) {
  const digest = await crypto.subtle.digest('SHA-256', memory);
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}

export async function encodeVerifiedCheckpoint(baseMemory, machine, serializedState = {}) {
  return encodeCheckpoint(baseMemory, machine, serializedState, await baselineDigest(baseMemory));
}

export async function restoreVerifiedCheckpoint(baseMemory, checkpointBytes) {
  const restored = restoreCheckpoint(baseMemory, checkpointBytes);
  const view = new DataView(checkpointBytes.buffer, checkpointBytes.byteOffset, checkpointBytes.byteLength);
  const metadata = JSON.parse(new TextDecoder().decode(checkpointBytes.subarray(8, 8 + view.getUint32(0, true))));
  if (!metadata.baselineSha256 || metadata.baselineSha256 !== await baselineDigest(baseMemory)) {
    throw new Error('Wrong or unverified checkpoint baseline');
  }
  return restored;
}
