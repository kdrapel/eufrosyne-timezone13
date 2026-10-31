/**
 * Optional source-driven voice / channel diagnostics; not a sound engine.
 *
 * Visualizes live audio waveforms and channel note events
 * in the "Stats for nerds" overlay panel.
 */
export class TrackerView {
  constructor(canvas, channels = []) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.channels = channels.map(channel => ({ name: channel.name, note: channel.note ?? '',
      volume: channel.volume ?? 0, maxVolume: channel.maxVolume ?? 1,
      wave: new Float32Array(channel.waveLength ?? 64) }));
    this.animId = null;
    this.render();
  }

  updateChannel(channelIndex, note, volume, waveSamples) {
    if (this.channels[channelIndex]) {
      const ch = this.channels[channelIndex];
      if (note) ch.note = note;
      if (volume !== undefined) ch.volume = volume;
      if (waveSamples) ch.wave.set(waveSamples.subarray(0, ch.wave.length));
    }
  }

  render() {
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    ctx.fillStyle = '#08090d';
    ctx.fillRect(0, 0, width, height);

    const chWidth = width / Math.max(1, this.channels.length);

    this.channels.forEach((ch, idx) => {
      const x = idx * chWidth;

      // Channel divider
      ctx.strokeStyle = '#1e2230';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, 0, chWidth, height);

      // Label and Note
      ctx.font = '11px monospace';
      ctx.fillStyle = '#e5a93b';
      ctx.fillText(`${ch.name}: ${ch.note}`, x + 8, 18);

      // Volume bar
      ctx.fillStyle = '#2a3246';
      ctx.fillRect(x + 8, 26, chWidth - 16, 4);
      ctx.fillStyle = '#48bb78';
      ctx.fillRect(x + 8, 26, (chWidth - 16) * (ch.volume / ch.maxVolume), 4);

      // Oscilloscope waveform
      ctx.beginPath();
      ctx.strokeStyle = '#63b3ed';
      ctx.lineWidth = 1.5;
      const waveY = height * 0.65;
      const step = (chWidth - 16) / ch.wave.length;

      for (let i = 0; i < ch.wave.length; i++) {
        const px = x + 8 + i * step;
        const py = waveY + ch.wave[i] * 24;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });

    this.animId = requestAnimationFrame(() => this.render());
  }

  destroy() {
    if (this.animId) cancelAnimationFrame(this.animId);
  }
}
