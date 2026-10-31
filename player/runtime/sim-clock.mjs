/**
 * Replaceable simulation clock for translated scenes.
 *
 * Presentation seconds are the contract.  The clock owns the recovered
 * "demo timing" model and nothing else: it never draws pixels.
 *
 * Two time layers are kept separate on purpose:
 *   - refreshHz    : VGA callback cadence used by scene code (measured timing data)
 *   - MusicTimeline: module order/row position over presentation seconds
 *
 * Step 09 will make original replay the master: call setTimeSource(() => seconds)
 * with the audio-derived position.  Until then the browser's presentation clock
 * drives advanceTo(), and no audible replay is assumed.
 */

/** 25.175 MHz dot clock / (800 visible+pixel dots x 449 scan lines), as in Step 07. */
export const VGA_DOT_CLOCK_HZ = 25.175e6;
export const VGA_REFRESH_HZ = VGA_DOT_CLOCK_HZ / (800 * 449);

const ORDER_ROWS = 64;

/**
 * Measured music position (module order/row) as a function of presentation time.
 * Data comes from the recovered timeline (`player/assets/scene-timeline.json`),
 * fitted to one-per-second captured checkpoints; it is a measurement of the
 * recorded run, not a hardware-tempo claim.
 */
export class MusicTimeline {
  constructor(data) {
    if (!data?.modules || !Array.isArray(data.scenes) || !data.scenes.length) {
      throw new Error('Music timeline needs modules and scenes');
    }
    if (!Number.isFinite(data.duration) || data.duration <= 0) throw new Error('Music timeline needs a measured duration');
    this.data = data;
    this.duration = data.duration;
    this.scenes = [...data.scenes].sort((a, b) => a.start_s - b.start_s);
    for (const module of Object.values(data.modules)) {
      if (!Number.isFinite(module.rows_per_second) || module.rows_per_second <= 0) throw new Error('Invalid module row rate');
      if (!Number.isFinite(module.intercept_rows) || !Number.isFinite(module.start_s) || !Number.isFinite(module.end_s)) {
        throw new Error('Incomplete module timing');
      }
    }
  }

  /** Module active at presentation time `seconds` (attachment-relative). */
  moduleAt(seconds) {
    const clamped = Math.min(this.duration, Math.max(0, seconds));
    const names = Object.keys(this.data.modules);
    for (const name of names) {
      const module = this.data.modules[name];
      if (clamped >= module.start_s && clamped < module.end_s) return name;
    }
    return names[names.length - 1];
  }

  /** Music position at presentation time. `absRow` is monotonic within a module. */
  positionAt(seconds) {
    const clamped = Math.min(this.duration, Math.max(0, seconds));
    const name = this.moduleAt(clamped);
    const module = this.data.modules[name];
    const absRow = module.intercept_rows + module.rows_per_second * clamped;
    const whole = Math.floor(absRow);
    return { module: name, absRow, order: Math.floor(whole / ORDER_ROWS), row: whole % ORDER_ROWS,
      fraction: absRow - whole };
  }

  /** Chronological scene whose start threshold has been reached at `seconds`. */
  sceneAt(seconds) {
    const clamped = Math.min(this.duration, Math.max(0, seconds));
    let active = this.scenes[0];
    for (const scene of this.scenes) if (clamped >= scene.start_s) active = scene;
    return active;
  }

  /** Presentation time recovered for a scene boundary (used by seek/tests). */
  boundaryTimes() {
    return this.scenes.map(scene => ({ key: scene.key, start_s: scene.start_s }));
  }
}

/**
 * Deterministic, replaceable clock.  advanceTo() is pure stepping: the same
 * target always produces the same callback sequence and the same callback hooks.
 */
export class SimulationClock {
  constructor(timeline, { startCallback = 0, refreshHz = VGA_REFRESH_HZ, duration = null } = {}) {
    if (!Number.isFinite(refreshHz) || refreshHz <= 0) throw new Error('Invalid simulation refresh rate');
    if (!Number.isInteger(startCallback) || startCallback < 0) throw new Error('Invalid initial callback counter');
    this.timeline = timeline ?? null;
    this.refreshHz = refreshHz;
    this.startCallback = startCallback;
    this.duration = Number.isFinite(duration) ? duration : (timeline?.duration ?? null);
    this.onCallback = null;
    this.timeSource = null;
    this.reset();
  }

  reset() {
    this.seconds = 0;
    this.callback = this.startCallback;
    this._sourceBase = this.timeSource ? this.timeSource() : 0;
  }

  /**
   * Bind an external master clock (Step 09 audio), or pass null to detach and
   * continue free-running from the current position. Returns the preserved time.
   */
  setTimeSource(source) {
    const current = this.now();
    if (source == null) { this.timeSource = null; this.seconds = current; this._sourceBase = 0; return current; }
    if (typeof source !== 'function') throw new Error('Time source must be a function');
    this.timeSource = source;
    this._sourceBase = source() - current;
    return current;
  }

  /** Presentation seconds: free-running presentation time or the bound master source. */
  now() {
    if (!this.timeSource) return this.seconds;
    return Math.max(0, Math.min(this.duration ?? Infinity, this.timeSource() - this._sourceBase));
  }

  /**
   * Advance to `target` seconds, invoking onCallback once per VGA callback.
   * Backward targets are rejected: use reset() (or seek()) for deterministic replay.
   */
  advanceTo(target) {
    if (!Number.isFinite(target) || target < 0) throw new Error('Simulation time must be finite and nonnegative');
    const clamped = this.duration === null ? target : Math.min(this.duration, target);
    if (clamped < this.seconds) throw new Error('Simulation clock cannot step backward; reset or seek');
    const desired = this.startCallback + Math.floor(clamped * this.refreshHz + (this.phase ?? 0));
    while (this.callback < desired) {
      this.callback++;
      if (this.onCallback) this.onCallback(this.snapshot());
    }
    this.seconds = clamped;
    return this;
  }

  /** Deterministic rewind: reset translated state through the caller's reset adapter. */
  seek(target, resetAdapter) {
    if (typeof resetAdapter !== 'function') throw new Error('Seeking needs the scene reset adapter');
    this.reset();
    resetAdapter();
    return this.advanceTo(target);
  }

  snapshot() {
    const position = this.timeline ? this.timeline.positionAt(this.seconds) : null;
    return { seconds: this.seconds, callback: this.callback, position };
  }

  /** Diagnostics for the player/report layer; no hidden timing adjustment. */
  debugState() {
    return { seconds: this.seconds, callback: this.callback,
      refreshHz: this.refreshHz, startCallback: this.startCallback,
      position: this.timeline ? this.timeline.positionAt(this.seconds) : null };
  }
}
