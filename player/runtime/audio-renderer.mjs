/** Runs translated original replay/mixer code, never a replacement module player. */
export class AudioRenderer {
  constructor(port, metadata, sampleRate, { fixture = false } = {}) {
    if (metadata.audio !== 'original-code' && !(fixture && metadata.audio === 'fixture')) {
      throw new Error('Audio requires translated original code and recorded provenance');
    }
    if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('Invalid output sample rate');
    for (const name of ['reset', 'seek', 'render']) {
      if (typeof port?.[name] !== 'function') throw new Error(`Original audio adapter needs ${name}()`);
    }
    this.port = port; this.sampleRate = sampleRate; this.position = 0; this.paused = true;
    port.reset();
  }
  seek(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('Invalid audio seek');
    this.port.seek(seconds); this.position = Math.round(seconds * this.sampleRate);
  }
  process(channels) {
    for (const channel of channels) channel.fill(0);
    if (this.paused || !channels.length) return 0;
    const frames = channels[0].length;
    const written = this.port.render(channels, frames);
    if (!Number.isInteger(written) || written < 0 || written > frames) throw new Error('Audio adapter must report exactly how many samples it generated');
    for (const channel of channels) {
      if (channel.length !== frames) throw new Error('Audio channel lengths disagree');
      for (let i = 0; i < written; i++) if (!Number.isFinite(channel[i])) throw new Error('Audio adapter produced invalid sample data');
    }
    // Unwritten samples remain silent and do not advance the soundtrack clock.
    for (const channel of channels) channel.fill(0, written);
    this.position += written;
    return written;
  }
}
