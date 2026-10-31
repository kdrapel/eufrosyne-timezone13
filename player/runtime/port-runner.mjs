/** Independent of CPU, sound format, video mode, tick rate, and scene count. */
export class PortRunner {
  constructor(port, metadata) {
    for (const name of ['reset', 'advanceTo', 'render']) {
      if (typeof port?.[name] !== 'function') throw new Error(`Translated port needs ${name}()`);
    }
    if (metadata.duration !== null && (!Number.isFinite(metadata.duration) || metadata.duration <= 0)) throw new Error('Declare a measured duration or explicit null for an open-ended production');
    if (!['none', 'pending', 'original-code', 'fixture'].includes(metadata.audio)) throw new Error('Declare original-code audio, verified silence, or pending sound');
    this.port = port;
    this.metadata = metadata;
    this.duration = metadata.duration === null ? Infinity : metadata.duration;
    this.time = 0;
    this.metrics = { frames: 0, advanceMaxMs: 0, renderMaxMs: 0, advances: [] };
    port.reset();
  }
  advanceTo(seconds) {
    if (!Number.isFinite(seconds)) throw new Error('Presentation time must be finite');
    const target = Math.min(this.duration, Math.max(0, seconds));
    const start = performance.now();
    if (target < this.time) this.port.reset();
    this.port.advanceTo(target);
    this.time = target;
    const elapsed = performance.now() - start;
    this.metrics.advanceMaxMs = Math.max(this.metrics.advanceMaxMs, elapsed);
    this.metrics.advances.push(elapsed);
    if (this.metrics.advances.length > 120) this.metrics.advances.shift();
  }
  seek(seconds) {
    // An adapter may use verified checkpoints. Otherwise replay translated code.
    if (typeof this.port.seek === 'function') {
      const target = Math.min(this.duration, Math.max(0, seconds));
      if (!Number.isFinite(target)) throw new Error('Seek time must be finite');
      this.port.seek(target); this.time = target;
    } else {
      this.port.reset(); this.time = 0; this.advanceTo(seconds);
    }
  }
  render() {
    const start = performance.now();
    const frame = this.port.render();
    if (!Number.isInteger(frame?.width) || frame.width <= 0 || !Number.isInteger(frame.height) || frame.height <= 0 ||
        !(frame.rgba instanceof Uint8Array || frame.rgba instanceof Uint8ClampedArray) || frame.rgba.length !== frame.width * frame.height * 4) {
      throw new Error('Port must return width, height and exact live RGBA bytes');
    }
    this.metrics.renderMaxMs = Math.max(this.metrics.renderMaxMs, performance.now() - start);
    this.metrics.frames++;
    return frame;
  }
  stats() {
    const values = [...this.metrics.advances].sort((a, b) => a - b);
    return { frames: this.metrics.frames, advanceMaxMs: this.metrics.advanceMaxMs,
      renderMaxMs: this.metrics.renderMaxMs, advanceP95Ms: values[Math.max(0, Math.ceil(values.length * .95) - 1)] ?? 0 };
  }
}

/** Scene transitions inherit state produced by the preceding translated scene. */
export class SceneSequence {
  constructor(scenes) {
    if (!scenes.length || scenes.some(s => !Number.isFinite(s.duration) || s.duration <= 0 || typeof s.create !== 'function')) {
      throw new Error('Each scene needs a measured duration and translated factory');
    }
    this.scenes = scenes;
    this.duration = scenes.reduce((sum, scene) => sum + scene.duration, 0);
    this.reset();
  }
  reset() { this.index = 0; this.start = 0; this.time = 0; this.active = this.scenes[0].create({ handoff: null }); this.active.reset(); }
  advanceTo(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Scene time must be finite and nonnegative');
    if (seconds < this.time) this.reset();
    while (this.index < this.scenes.length - 1 && seconds >= this.start + this.scenes[this.index].duration) {
      const scene = this.scenes[this.index];
      this.active.advanceTo(scene.duration);
      const handoff = this.active.handoff?.() ?? null;
      this.start += scene.duration;
      this.index++;
      this.active = this.scenes[this.index].create({ handoff: structuredClone(handoff) });
      this.active.reset();
    }
    this.active.advanceTo(Math.min(this.scenes[this.index].duration, seconds - this.start));
    this.time = seconds;
  }
  render() { return this.active.render(); }
}

export async function frameDigest(frame) {
  const bytes = new Uint8Array(frame.rgba.byteLength + 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, frame.width, true); view.setUint32(4, frame.height, true);
  bytes.set(frame.rgba, 8);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}
