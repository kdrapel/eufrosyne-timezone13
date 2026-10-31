import { AudioRenderer } from './audio-renderer.mjs';
export function registerOriginalAudioProcessor(adapter, { fixture = false } = {}) {
class OriginalAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.renderer = null; this.epoch = 0; this.sinceReport = 0;
    this.processing={blocks:0,totalMs:0,maxMs:0,overBudget:0};
    this.port.onmessage = async ({ data }) => {
      try {
        if (data.type === 'init') {
          this.renderer = new AudioRenderer(await adapter.createAudioPort({ sampleRate, resources: data.resources }), adapter.metadata, sampleRate, { fixture });
          this.port.postMessage({ type: 'ready' });
        } else if (this.renderer && data.type === 'seek') {
          this.epoch = data.epoch; this.renderer.seek(data.time); this.sinceReport = 0;
          this.report(0);
        } else if (this.renderer && data.type === 'pause') {
          this.renderer.paused = data.paused; this.report(0);
        }
      } catch (error) { this.renderer = null; this.port.postMessage({ type: 'error', message: error.message }); }
    };
  }
  report(peak) {
    this.port.postMessage({ type: 'position', epoch: this.epoch,
      time: this.renderer.position / sampleRate, peak, paused: this.renderer.paused,
      processing:{...this.processing,meanMs:this.processing.totalMs/Math.max(1,this.processing.blocks),resolution:'Date.now milliseconds; coarse measurement'} });
  }
  process(inputs, outputs) {
    const channels = outputs[0];
    if (!this.renderer) { for (const c of channels) c.fill(0); return true; }
    try {
      const started=Date.now();
      const written = this.renderer.process(channels);
      const elapsed=Date.now()-started;
      if(!this.renderer.paused){this.processing.blocks++;this.processing.totalMs+=elapsed;this.processing.maxMs=Math.max(this.processing.maxMs,elapsed);if(elapsed>(channels[0]?.length??0)/sampleRate*1000)this.processing.overBudget++;}
      let peak = 0;
      for (const c of channels) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]));
      this.sinceReport += channels[0]?.length ?? 0;
      if (this.sinceReport >= 2048) { this.sinceReport = 0; this.report(peak); }
      if (!written && !this.renderer.paused) { this.renderer.paused = true; this.report(0); }
    } catch (error) { this.renderer = null; for (const c of channels) c.fill(0); this.port.postMessage({ type: 'error', message: error.message }); }
    return true;
  }
}
registerProcessor('original-code-audio', OriginalAudioProcessor);

}
