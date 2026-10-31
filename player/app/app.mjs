import { PlaybackClock } from '../runtime/transport.mjs';
import { frameDigest } from '../runtime/port-runner.mjs';
const $ = id => document.getElementById(id);

export class DemoPlayer {
  constructor() {
    this.canvas = $('screen'); this.ctx = this.canvas.getContext('2d');
    this.fixture = false;
    const adapterURL = new URL('./port-extended.mjs', import.meta.url);
    this.adapterURL = adapterURL.href;
    this.clock = null; this.metadata = null; this.worker = null; this.audioContext = null; this.audioNode = null; this.soundWorker = null;
    this.epoch = 0; this.audioEpoch=0; this.pending = false; this.playing = false; this.starting = false; this.paused = true; this.frame = null;
    this.audioLevel = 0; this.workerStats = {}; this.raf = 0; this.lastFrameWall = 0; this.intervals = [];
    this.bindControls(); this.ready = this.prepare();
  }
  fail(error) {
    const message = error?.message ?? String(error);
    $('status').textContent = message; $('loading').hidden = true;
    this.clock?.pause(); this.paused = true;
    this.audioNode?.port.postMessage({ type: 'pause', paused: true });
    this.pending = false;
    if (!this.playing) { $('start').disabled = true; $('start').textContent = 'Port unavailable'; }
    throw new Error(message);
  }
  async prepare() {
    $('start').disabled = true;
    return new Promise((resolve, reject) => {
      this.worker = new Worker(new URL('./render-worker.mjs', import.meta.url), { type: 'module' });
      this.worker.onerror = event => { $('status').textContent = event.message; reject(new Error(event.message)); };
      this.worker.onmessage = ({ data }) => {
        if (data.type === 'ready') {
          this.metadata = data.metadata; this.clock = new PlaybackClock(data.metadata.duration);
          document.title = 'Timezone +13:00 — Eufrosyne'; $('demo-title').textContent = 'Timezone +13:00';
          if (data.metadata.displayAspect) this.canvas.style.aspectRatio = data.metadata.displayAspect;
          else this.canvas.style.aspectRatio = 'auto';
          $('timeline').max = String(data.metadata.duration ?? 0);
          $('timeline').disabled = data.metadata.duration === null;
          $('demo-meta').textContent = this.fixture ? 'Infrastructure fixture  -  no demo fidelity claim' : 'Timezone +13:00 · DOS demo - Juhla 1997 - 3rd rank PC demo · JavaScript port';
          $('demo-group').textContent = data.metadata.group ?? '';
          $('demo-credits').hidden = false;
          $('player-details').textContent = `Render: translated JS  |  Audio: ${data.metadata.audio}`;
          $('tracker-title').hidden = true; $('tracker').hidden = true;
          $('start').disabled = false; $('start').textContent = 'Start';
          $('status').textContent = this.fixture ? 'Framework fixture  -  not a demo port' : '';
          resolve(this.metadata);
        } else if (data.type === 'error') {
          $('status').textContent = data.message; $('start').textContent = 'Port unavailable';
          if (!this.metadata) reject(new Error(data.message));
          else { this.clock.pause(); this.paused = true; this.pending = false; $('loading').hidden = true; this.audioNode?.port.postMessage({ type: 'pause', paused: true }); }
        } else if (data.type === 'frame') {
          this.pending = false;
          if (data.epoch !== this.epoch) { this.recycle(data.buffer); return; }
          const now = performance.now();
          if (this.lastFrameWall && !this.paused) { this.intervals.push(now - this.lastFrameWall); if (this.intervals.length > 240) this.intervals.shift(); }
          this.lastFrameWall = now;
          const previous = this.frame;
          this.frame = { width: data.width, height: data.height, rgba: new Uint8ClampedArray(data.buffer), time: data.time };
          if (this.canvas.width !== data.width || this.canvas.height !== data.height) { this.canvas.width = data.width; this.canvas.height = data.height; }
          this.ctx.putImageData(new ImageData(this.frame.rgba, data.width, data.height), 0, 0);
          if (previous) this.recycle(previous.rgba.buffer);
          this.workerStats = data.stats;
          this.seekFrameReady?.(data.epoch);
          if(!this.seeking) $('loading').hidden = true;
          $('stats').textContent = `Frames: ${data.stats.frames}  |  Advance p95: ${data.stats.advanceP95Ms.toFixed(2)} ms  |  Render max: ${data.stats.renderMaxMs.toFixed(2)} ms`;
        }
      };
      this.worker.postMessage({ type: 'init', adapterURL: this.adapterURL });
    });
  }
  recycle(buffer) { this.worker?.postMessage({ type: 'recycle', buffer }, [buffer]); }
  bindControls() {
    const action = operation => () => Promise.resolve().then(operation).catch(error => { $('status').textContent = error.message; });
    $('start').onclick = action(() => this.start());
    $('pause').onclick = action(() => this.setPaused(!this.paused));
    $('stop').onclick = action(() => this.stop());
    $('backward').onclick = action(() => this.seek(this.time - 15));
    $('forward').onclick = action(() => this.seek(this.time + 15));
    $('timeline').onpointerdown = () => {this.scrubbing=true;};
    $('timeline').oninput = () => {this.scrubbing=true;};
    $('timeline').onpointercancel = () => {this.scrubbing=false;};
    $('timeline').onchange = action(() => {
      const target=Number($('timeline').value);
      this.scrubbing=false;
      return this.seek(target);
    });
    $('fullscreen').onclick = action(() => document.fullscreenElement ? document.exitFullscreen() : $('shell').requestFullscreen());
    $('stats-toggle').onchange = () => { $('nerd-panel').hidden = !$('stats-toggle').checked; };
    window.addEventListener('keydown', event => {
      if (event.target.tagName === 'INPUT') return;
      const operation = { Space: () => this.setPaused(!this.paused), ArrowLeft: () => this.seek(this.time - 15),
        ArrowRight: () => this.seek(this.time + 15), Escape: () => this.stop(), KeyF: () => $('fullscreen').click() }[event.code];
      if (operation) { event.preventDefault(); action(operation)(); }
    });
  }
  get time() { return this.clock?.now() ?? 0; }
  async initAudio() {
    if (!['original-code', 'fixture'].includes(this.metadata.audio)) return;
    if (this.metadata.audio === 'original-code' && !this.metadata.provenance) throw new Error('Original audio provenance is missing');
    this.audioContext = new AudioContext({sampleRate:this.metadata.sampleRate??44100});
    // Samples the worklet has produced are heard only after the output latency;
    // the visual clock follows the audible position, not the render position.
    this.audioLatency = Math.min(0.5, (this.audioContext.baseLatency ?? 0) + (this.audioContext.outputLatency ?? 0));
    if(this.metadata.audio==='original-code'&&this.audioContext.sampleRate!==44100)throw new Error('Original sound playback requires a 44100 Hz AudioContext');
    await this.audioContext.resume();
    this.outputGain=this.audioContext.createGain();this.outputGain.gain.value=Number($('volume')?.value??0.7);this.outputGain.connect(this.audioContext.destination);
    const adapter = await import(this.adapterURL);
    const resources = await adapter.loadAudioResources?.();
    if(this.metadata.audio==='original-code'){
      await this.audioContext.audioWorklet.addModule(new URL('./sound-buffer-worklet.mjs',import.meta.url));
      this.audioNode=new AudioWorkletNode(this.audioContext,'original-sound-queue',{numberOfInputs:0,outputChannelCount:[2]});
      this.audioNode.connect(this.outputGain);
      const initialFrame=Math.round(this.clock.now()*44100);
      this.audioNode.port.postMessage({type:'clear',frame:initialFrame});
      this.soundWorker=new Worker(new URL('./sound-buffer-worker.mjs',import.meta.url),{type:'module'});
      const node=this.audioNode,worker=this.soundWorker;
      const prefetched=new Promise((resolve,reject)=>{
        // Seeking rebuilds the original replay from module start (~8x realtime),
        // so a late-module seek legitimately needs tens of seconds.
        const timeout=setTimeout(()=>reject(new Error('Original sound prebuffer timed out')),120000);
        worker.onerror=event=>{clearTimeout(timeout);reject(new Error(event.message||'Original sound worker failed'));};
        worker.onmessage=({data})=>{
          if(this.soundWorker!==worker)return;
          if(data.type==='ready'){for(let i=0;i<4;i++)worker.postMessage({type:'render',generation:this.audioEpoch});}
          else if(data.type==='seek-metrics')this.audioSeekMetrics=data;
          else if(data.type==='samples'){if(data.generation===this.audioEpoch)node.port.postMessage({type:'samples',pcm:data.pcm},[data.pcm.buffer]);}
          else if(data.type==='error'){clearTimeout(timeout);reject(new Error(data.message));}
        };
        node.port.onmessage=({data})=>{
          if(this.audioNode!==node)return;
          if(data.type==='queued'&&data.chunks>=3){clearTimeout(timeout);resolve();}
          else if(data.type==='need')worker.postMessage({type:'render',generation:this.audioEpoch});
          else if(data.type==='position'){
            this.soundDiagnostics={time:data.time,module:data.module,peak:data.peak,underruns:data.underruns,paused:data.paused};
            this.audioLevel=data.peak;
            if(!this.paused&&!data.paused&&this.clock)this.clock.seek(Math.max(0,data.time-(this.audioLatency??0)));
          }
        };
      });
      worker.postMessage({type:'init',resources,frame:initialFrame});
      await prefetched;
      this.clock.setSource(()=>this.audioContext.currentTime);
      return;
    }
  }
  async start() {
    await this.ready;
    if (this.playing || this.starting) return;
    const initialScene = new URLSearchParams(location.search).get('scene');
    if (initialScene === '2') this.clock.seek(20);
    if (initialScene === '3') this.clock.seek(53);
    if (initialScene === '4') this.clock.seek(80);
    if (initialScene === '5') this.clock.seek(107);
    if (initialScene === '6') this.clock.seek(134);
    if (initialScene === '7') this.clock.seek(174);
    if (initialScene === '8') this.clock.seek(204);
    if (initialScene === '9') this.clock.seek(229);
    this.starting = true; $('start').disabled = true; $('loading').hidden = false;
    try { await this.initAudio(); }
    catch (error) {
      this.audioNode?.disconnect(); this.audioNode = null;
      await this.audioContext?.close(); this.audioContext = null;
      throw error;
    } finally { this.starting = false; $('start').disabled = false; }
    this.playing = true; this.paused = false;
    $('gate').classList.add('dismissed'); $('hud').hidden = false; $('pause').textContent = 'Pause';
    this.clock.play(); this.audioNode?.port.postMessage({ type: 'pause', paused: false });
    this.pump();
  }
  pump() {
    if (!this.playing) return;
    const time = this.time;
    const ended = this.metadata.duration !== null && time >= this.metadata.duration;
    if (ended && !this.paused) this.setPaused(true);
    const needsFinalFrame = ended && this.frame?.time !== this.metadata.duration;
    if ((!this.paused || needsFinalFrame) && !this.pending) {
      this.pending = true; this.worker.postMessage({ type: 'render', time, epoch: this.epoch });
    }
    if(!this.scrubbing) $('timeline').value = String(time);
    $('time').textContent = `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')} / 4:05`;
    this.raf = requestAnimationFrame(() => this.pump());
  }
  async setPaused(paused) {
    if (!this.playing) return;
    if (paused) this.clock.pause(); else { await this.audioContext?.resume(); this.clock.play(); }
    this.paused = paused; if (paused) this.audioLevel = 0;
    this.audioNode?.port.postMessage({ type: 'pause', paused });
    $('pause').textContent = paused ? 'Resume' : 'Pause';
  }
  async seek(seconds) {
    await this.ready;
    const target = Math.min(this.metadata.duration ?? Infinity, Math.max(0, seconds));
    if (!Number.isFinite(target)) throw new Error('Seek time must be finite');
    let audioReady = Promise.resolve();
    const shouldResume = !this.paused;
    this.seeking = true;
    this.epoch++; this.clock.seek(target); this.lastFrameWall = 0;
    $('loading').hidden = false; this.pending = true;
    const seekEpoch = this.epoch;
    const frameReady = new Promise(resolve=>{this.seekFrameReady=epoch=>{if(epoch===seekEpoch){this.seekFrameReady=null;resolve();}};});
    if(this.metadata.audio==='original-code'&&this.audioNode&&this.soundWorker){
      const resume=!this.paused,node=this.audioNode,worker=this.soundWorker;
      this.audioEpoch++;
      if(resume){this.clock.pause();this.paused=true;}
      node.port.postMessage({type:'clear',frame:Math.round(target*44100)});
      audioReady = new Promise((resolve,reject)=>{
        const prior=node.port.onmessage;
        const timeout=setTimeout(()=>{node.port.onmessage=prior;reject(new Error('Original sound seek prebuffer timed out'));},120000);
        node.port.onmessage=event=>{
          prior?.(event);
          if(event.data.type==='queued'&&event.data.chunks>=3){
            clearTimeout(timeout);node.port.onmessage=prior;
            resolve();
          }
        };
      });
      worker.postMessage({type:'seek',frame:Math.round(target*44100)});
      for(let i=0;i<4;i++)worker.postMessage({type:'render',generation:this.audioEpoch});
    }else this.audioNode?.port.postMessage({ type: 'seek', time: target, epoch: this.epoch });
    this.worker.postMessage({ type: 'seek', time: target, epoch: this.epoch });
    try {
      await Promise.all([audioReady,frameReady]);
      if(shouldResume && this.epoch===seekEpoch){this.clock.seek(target);this.clock.play();this.paused=false;this.audioNode?.port.postMessage({type:'pause',paused:false});}
    } finally {
      if(this.epoch===seekEpoch){this.seeking=false;$('loading').hidden=true;}
    }
  }
  async stop() {
    this.playing = false; this.paused = true; this.seeking=false; $('loading').hidden=true; cancelAnimationFrame(this.raf);
    this.epoch++; this.worker?.terminate(); this.worker = null;this.soundWorker?.terminate();this.soundWorker=null;
    this.audioNode?.disconnect(); this.audioNode = null;
    await this.audioContext?.close(); this.audioContext = null;
    this.frame = null; this.pending = false; this.lastFrameWall = 0;
    this.metadata = null; this.clock = null;
    $('hud').hidden = true; $('gate').classList.remove('dismissed');
    this.ready = this.prepare();
  }
  async snapshot() {
    if (!this.frame) throw new Error('No live frame has been presented');
    // Copy before awaiting: the worker may recycle the source buffer on the next frame.
    const frame = { width: this.canvas.width, height: this.canvas.height,
      rgba: this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height).data };
    return { time: this.frame.time, width: frame.width, height: frame.height,
      sha256: await frameDigest(frame), paused: this.paused, audioLevel: this.audioLevel,
      fixture: this.fixture, stats: this.workerStats };
  }
}

window.player = new DemoPlayer();
window.player.ready.catch(error => { $('status').textContent = error.message; });

