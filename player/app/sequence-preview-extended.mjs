import {createLogoPort} from './logo-scene.mjs';
import {initializeGraphics,createS02Renderer} from './s02-scene.mjs';
import {createSceneRenderer} from './scene-sequence.mjs';
import {OriginalMusicFade} from './music-fade.mjs';
export function createSequencePreview(resources){
  const {resource,timing,code,data,assets,loads,clock,setup,timeline,musicSync}=resources;
  const initial=initializeGraphics(code,data,assets,loads,setup);
  const logo=createLogoPort(resource,{...timing,preview_duration:245});const s02=createS02Renderer(initial);
  const scenes=createSceneRenderer(initial),musicFade=new OriginalMusicFade(initial);
  const windows=timeline.scenes.filter(s=>s.key>='S3').map(s=>({key:s.key,start:s.start_s,end:s.exit_s}));
  const limit=timeline.duration;
  let creditsCheckpoints=[];
  let seconds=0,n=79,activeModule='aumax',brightness={mode:2,offset:-256},lastMusicPosition='',creditsCounter=31;
  const sync=new Map();
  for(const [module,info] of Object.entries(musicSync?.modules??{}))
    for(const event of info.events)sync.set(`${module}:${event.order}:${event.row}`,event.parameter);
  const syncOffsets=new Map([[16,128],[17,-128],[18,64],[19,-64]]);
  function counterAt(t){
    if(t<=51){const i=Math.min(clock.anchors.length-2,Math.floor(t));const a=clock.anchors[i],b=clock.anchors[i+1];return Math.floor(a[1]+(b[1]-a[1])*(t-a[0]));}
    if(t<timeline.module_switch_s)return Math.floor(3653 + timeline.refresh_hz*(t-51));
    return Math.floor(32 + timeline.refresh_hz*(t-timeline.module_switch_s));
  }
  function sceneAt(t){for(const item of windows)if(t>=item.start&&t<item.end)return item.key;return null;}
  function musicPosition(t,n){
    const row = t<timeline.module_switch_s
      ? timeline.modules['aumax.s3m'].rows_per_second*(n-79)/timeline.refresh_hz + timeline.modules['aumax.s3m'].intercept_rows
      : timeline.modules['pilips.s3m'].rows_per_second*(n-32)/timeline.refresh_hz;
    const whole=Math.max(0,Math.floor(row));
    return {order:Math.floor(whole/64),row:whole%64};
  }
  return {
   reset(){seconds=0;n=79;activeModule='aumax';brightness=musicFade.reset('aumax');lastMusicPosition='';creditsCounter=31;logo.reset();s02.reset();scenes.reset();},
   async loadOffsets(){
    const root=new URL('../generated/credits-checkpoints/',import.meta.url);
    const response=await fetch(new URL('index.json',root));if(!response.ok)throw Error('Missing credits checkpoints');
    const index=await response.json();
    if(index.baselineSha256!==await this.initialSha256())throw Error('Credits checkpoint baseline mismatch');
    creditsCheckpoints=await Promise.all(index.checkpoints.map(async checkpoint=>{
     const response=await fetch(new URL(checkpoint.file,root));if(!response.ok)throw Error('Missing credits checkpoint');
     const packed=new Uint8Array(await response.arrayBuffer());
     const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',packed)),b=>b.toString(16).padStart(2,'0')).join('');if(hash!==checkpoint.sha256)throw Error('Corrupt credits checkpoint');
     const state=new Uint8Array(await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());return {...checkpoint,state};
    }));
   },
   async initialSha256(){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',initial)),b=>b.toString(16).padStart(2,'0')).join('');},
   creditsCheckpoint(){return {counter:creditsCounter,state:scenes.checkpoint()};},
   advanceTo(t){
    if(t<0||!Number.isFinite(t))throw Error('Outside scenes');
    if(t>limit)t=limit;
    if(t<seconds)this.reset();
    const desired=counterAt(t);
    // The module (and therefore the fade controller state) follows the demo time,
    // not only the counter direction: seeking straight into the credits used to
    // keep the AUMAX fade state and present the whole scene black.
    const targetModule=t<timeline.module_switch_s?'aumax':'pilips';
    if(desired<n||targetModule!==activeModule){
     this.reset();activeModule=targetModule;
     if(targetModule==='pilips'){n=32;brightness=musicFade.reset('pilips');}
    }
    while(n<desired){n++;if(n>250000)break;
     const pos=musicPosition(t,n);brightness=musicFade.update(pos.order,pos.row,n);
     const module=t<timeline.module_switch_s?'aumax.s3m':'pilips.s3m',key=`${module}:${pos.order}:${pos.row}`;
     if(key!==lastMusicPosition){const command=sync.get(key);if(brightness.mode===0&&syncOffsets.has(command))brightness=musicFade.pulse(syncOffsets.get(command));lastMusicPosition=key;}
    }
    // S9 accumulates into its working buffer. Execute each recovered clock
    // counter once, regardless of browser presentation cadence or seek history.
    // Rendering only at requested times drops original writes and changes credits.
    if(targetModule==='pilips' && sceneAt(t)==='S9') {
     const checkpoint=creditsCheckpoints.filter(c=>c.counter<=desired&&c.counter>creditsCounter).at(-1);
     if(checkpoint){scenes.restoreCheckpoint(checkpoint.state);creditsCounter=checkpoint.counter;}

     while(creditsCounter<desired){
      creditsCounter++;
      const pos=musicPosition(t,creditsCounter);
      scenes.render({scene:'S9',counter:creditsCounter,order:pos.order,row:pos.row,offset:brightness.offset});
     }
    }
    seconds=t;
    if(n<clock.s02_start_counter)logo.advanceTo(t);
   },
   render(){
    const key=sceneAt(seconds);
    if(seconds<windows[0].start){
      if(n<clock.s02_start_counter)return logo.render();
      const row=Math.floor(seconds*9.6+9.9);
      return s02.render({counter:n,order:Math.floor(row/64),row:row%64,offset:brightness.offset});
    }
    // Between the last scene's exit and the credits scene's start the screen
    // holds its content while the original reloads the next module.
    if(key===null)return scenes.present(brightness.offset);
    const pos=musicPosition(seconds,n);
    return scenes.render({scene:key,counter:n,order:pos.order,row:pos.row,offset:brightness.offset});
   },
   debugState(){return {seconds,counter:n,scene:sceneAt(seconds),brightness,...(sceneAt(seconds)==='S2'?s02.debug():scenes.debug())};},
  };
}
