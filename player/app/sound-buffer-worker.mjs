import {OriginalSound} from './original-sound.mjs';
import {blocks,blockLengths} from '../generated-sound/graphics-code.mjs';
const RATE=44100,CHUNK=8192,SWITCH_FRAME=Math.round(227.7*RATE);
// Captured visual music positions (0x1C1F84/0x1C1F7C) run 9 rows ahead of a replay
// started at demo frame 0, so AUMAX must be replayed 1 s ahead to sound at the
// position the original published; PILIPS already starts 0.3 s ahead at the switch.
// See oracle/step09/probe_av_alignment.mjs.
const AUMAX_PREROLL=44100;
let resources,sound,position=0,active='aumax';
function makeSound(name){return new OriginalSound({...resources,module:resources.modules[name],blocks,blockLengths});}
let checkpointIndex;
const checkpointCache=new Map();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
async function sha(bytes){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));}
async function setPosition(frame){
 const begin=performance.now();position=frame;
 active=frame>=SWITCH_FRAME?'pilips':'aumax';sound=makeSound(active);
 const target=active==='pilips'?frame-SWITCH_FRAME:frame+AUMAX_PREROLL;
 const root=new URL('../generated-sound/checkpoints/',import.meta.url);
 if(!checkpointIndex){
  const response=await fetch(new URL('index.json',root));if(!response.ok)throw Error('Missing sound checkpoints');
  checkpointIndex=await response.json();
  for(const [key,value]of Object.entries({'le-code.bin':resources.code,'le-data.bin':resources.data,'AUMAX.S3M':resources.modules.aumax,'PILIPS.S3M':resources.modules.pilips}))
   if(await sha(value)!==checkpointIndex.resources[key])throw Error('Sound checkpoint resource mismatch');
 }
 const checkpoint=checkpointIndex.modules[active].filter(c=>c.frame<=target).at(-1);
 if(checkpoint){
  let blob=checkpointCache.get(checkpoint.file);
  if(!blob){const response=await fetch(new URL(checkpoint.file,root));if(!response.ok)throw Error('Missing sound checkpoint');const packed=new Uint8Array(await response.arrayBuffer());if(await sha(packed)!==checkpoint.sha256)throw Error('Corrupt sound checkpoint');blob=new Uint8Array(await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());checkpointCache.set(checkpoint.file,blob);if(checkpointCache.size>3)checkpointCache.delete(checkpointCache.keys().next().value);}
  sound.restoreCheckpoint(blob);
 }
 sound.seekFrames(target);
 postMessage({type:'seek-metrics',ms:performance.now()-begin,checkpointFrame:checkpoint?.frame??0,forwardFrames:target-(checkpoint?.frame??0)});
}
// Serialize async restore/fetch with subsequent sample requests.
let jobs=Promise.resolve();
self.onmessage=({data})=>{jobs=jobs.then(async()=>{try{
 if(data.type==='init'){resources=data.resources;if(!resources?.modules?.aumax||!resources?.modules?.pilips)throw Error('Original S3M resources are incomplete');await setPosition(data.frame??0);postMessage({type:'ready'});}
 if(data.type==='seek'){await setPosition(data.frame);postMessage({type:'seeked',frame:position});}
 if(data.type==='render'){
  const t=performance.now(),out=new Uint8Array(CHUNK*4);let offset=0;
  while(offset<CHUNK){
   if(active==='aumax'&&position>=SWITCH_FRAME){active='pilips';sound=makeSound(active);}
   const untilSwitch=active==='aumax'?SWITCH_FRAME-position:CHUNK;
   const frames=Math.min(CHUNK-offset,untilSwitch);
   const pcm=sound.readFrames(frames);out.set(pcm,offset*4);offset+=frames;position+=frames;
  }
  postMessage({type:'samples',pcm:out,ms:performance.now()-t,frame:position-CHUNK,generation:data.generation},[out.buffer]);
 }
}catch(error){postMessage({type:'error',message:error.message});}});};
