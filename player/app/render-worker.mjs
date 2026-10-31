import { PortRunner } from '../runtime/port-runner.mjs';
let runner = null;
const pool = [];
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const adapter = await import(data.adapterURL);
      runner = new PortRunner(await adapter.createVideoPort(), adapter.metadata);
      postMessage({ type: 'ready', metadata: adapter.metadata });
    } else if (data.type === 'recycle') {
      if (pool.length < 3) pool.push(data.buffer);
    } else if (data.type === 'render' || data.type === 'seek') {
      if (!runner) throw new Error('Translated port is not ready');
      if (data.type === 'seek') runner.seek(data.time);
      else runner.advanceTo(data.time);
      const frame = runner.render();
      let buffer = pool.pop();
      if (!buffer || buffer.byteLength !== frame.rgba.byteLength) buffer = new ArrayBuffer(frame.rgba.byteLength);
      new Uint8ClampedArray(buffer).set(frame.rgba);
      postMessage({ type: 'frame', epoch: data.epoch, time: runner.time,
        width: frame.width, height: frame.height, buffer, stats: runner.stats() }, [buffer]);
    }
  } catch (error) { postMessage({ type: 'error', message: error.message }); }
};
