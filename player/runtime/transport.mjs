/** Presentation time is independent of render cadence; pause and seek are exact. */
export class PlaybackClock {
  constructor(duration, timeSource = () => performance.now() / 1000) {
    if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) throw new Error('Use a measured duration or explicit null for an open-ended production');
    this.duration = duration === null ? Infinity : duration;
    this.source = timeSource;
    this.position = 0;
    this.anchor = this.source();
    this.paused = true;
  }
  now() { return Math.min(this.duration, Math.max(0, this.position + (this.paused ? 0 : this.source() - this.anchor))); }
  play() { if (this.paused) { this.anchor = this.source(); this.paused = false; } }
  pause() { this.position = this.now(); this.anchor = this.source(); this.paused = true; }
  seek(seconds) {
    if (!Number.isFinite(seconds)) throw new Error('Seek time must be finite');
    this.position = Math.min(this.duration, Math.max(0, seconds));
    this.anchor = this.source();
  }
  setSource(source) { const position = this.now(); this.source = source; this.position = position; this.anchor = source(); }
}
