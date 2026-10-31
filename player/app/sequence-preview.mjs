import {createLogoPort,stepBrightness} from './logo-scene.mjs';
import {initializeGraphics,createS02Renderer} from './s02-scene.mjs';
export function createSequencePreview(resources){
 const {resource,timing,code,data,assets,loads,clock}=resources;
 const logo=createLogoPort(resource,{...timing,preview_duration:51});const s02=createS02Renderer(initializeGraphics(code,data,assets,loads));
 let seconds=0,n=79,brightness={mode:2,offset:-256};
 const fade=new Map([[431,{mode:1,offset:-256}],[898,{mode:2}],[1030,{mode:1,offset:-256}],[clock.fade_out_counter,{mode:2}]]);
 const sync=new Map(clock.sync.map(x=>[x.counter,x.command]));
 function counterAt(t){const i=Math.min(clock.anchors.length-2,Math.floor(t));const a=clock.anchors[i],b=clock.anchors[i+1];return Math.floor(a[1]+(b[1]-a[1])*(t-a[0]));}
 return {
  reset(){seconds=0;n=79;brightness={mode:2,offset:-256};logo.reset();s02.reset();},
  advanceTo(t){
   if(t<0||t>51||!Number.isFinite(t))throw Error('Outside scenes 01–02 preview');
   if(t<seconds)this.reset();
   const desired=counterAt(t);
   while(n<desired){n++;const event=fade.get(n);if(event)brightness={...brightness,...event};brightness=stepBrightness(brightness);const command=sync.get(n);if(command!==undefined&&brightness.mode===0){const offsets={16:128,17:-128,18:64,19:-64};if(command in offsets)brightness.offset=offsets[command];}}
   seconds=t;
   if(n<clock.s02_start_counter)logo.advanceTo(t);
  },
  render(){if(n<clock.s02_start_counter)return logo.render();const row=Math.floor(seconds*clock.music_rows_per_second+clock.music_row_phase);return s02.render({counter:n,order:Math.floor(row/64),row:row%64,offset:brightness.offset});},
  debugState(){return {seconds,counter:n,brightness,...s02.debug()};},
 };
}
