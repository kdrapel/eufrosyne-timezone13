/** Optional offline/prefill worker for expensive translated original audio routines.
 * The default player renders in AudioWorklet. No timer-driven guessed sample supply.
 */
import { AudioRenderer } from '../runtime/audio-renderer.mjs';
let renderer;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const adapter = await import(data.adapterURL);
      renderer = new AudioRenderer(await adapter.createAudioPort({ sampleRate: data.sampleRate }), adapter.metadata, data.sampleRate, { fixture: data.fixture });
      postMessage({ type: 'ready' });
    } else if (data.type === 'seek') renderer.seek(data.time);
    else if (data.type === 'render') {
      renderer.paused = false;
      const channels = Array.from({ length: data.channels }, () => new Float32Array(data.frames));
      const written = renderer.process(channels);
      postMessage({ type: 'samples', epoch: data.epoch, channels, written }, channels.map(c => c.buffer));
    }
  } catch (error) { postMessage({ type: 'error', message: error.message }); }
};
