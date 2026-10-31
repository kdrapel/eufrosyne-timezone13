import {metadata as sound} from './audio-port.mjs';
import {createSequencePreview} from './sequence-preview-extended.mjs';
export const metadata={title:'Timezone +13:00 — extended preview',group:'Eufrosyne',duration:245,
  displayAspect:'8 / 5',audio:sound.audio,audioChannels:sound.audioChannels,
  previewNotice:'Translated graphics · original-code music · experimental timing',
  provenance:'Original EXE/DAT/S3M graphics/control bytes translated to JavaScript. No captured pictures loaded.'};
export async function createVideoPort(resources={}){
  const binary=async(relative)=>{const r=await fetch(new URL(relative,import.meta.url));if(!r.ok)throw Error('Missing original graphics resource');return new Uint8Array(await r.arrayBuffer());};
  const json=async(relative)=>{const r=await fetch(new URL(relative,import.meta.url));if(!r.ok)throw Error('Missing graphics timing resource');return r.json();};
  const [resource,timing,code,data,assets,loads,clock,setupData,setupMeta,timeline,musicSync]=await Promise.all([
   resources.resource??binary('../assets/logo-resource.bin'),resources.timing??json('../assets/logo-timing.json'),
   resources.code??binary('../generated/le-code.bin'),resources.data??binary('../generated/le-data.bin'),resources.assets??binary('../generated/demo-assets.dat'),resources.loads??json('../generated/resource-loads.json'),resources.clock??json('../generated/s02-clock.json'),
   resources.setupData??binary('../generated/setup-tables.bin'),resources.setupMeta??json('../generated/setup-tables.json'),resources.timeline??json('../assets/scene-timeline.json'),
   resources.musicSync??json('../generated/music-sync.json')]);
  const port=await createSequencePreview({resource,timing,code,data,assets,loads,clock,setup:{data:setupData,meta:setupMeta},timeline,musicSync});
  if(port.loadOffsets&&!resources.disableGraphicsCheckpoints)await port.loadOffsets();
  return port;
}
export {createAudioPort,loadAudioResources} from './audio-port.mjs';
