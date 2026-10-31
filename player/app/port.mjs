import {metadata as sound} from './audio-port.mjs';
import {createSequencePreview} from './sequence-preview.mjs';
export const metadata={title:'Timezone +13:00 — S01 / S02 preview',group:'Eufrosyne',duration:51,
 displayAspect:'8 / 5',audio:sound.audio,audioChannels:sound.audioChannels,
 previewNotice:'Logo + tunnel preview · sound pending',
 provenance:'Original EXE/DAT/S3M graphics/control bytes translated to JavaScript. No captured pictures loaded.'};
export async function createVideoPort(resources={}){
 const binary=async(relative)=>{const r=await fetch(new URL(relative,import.meta.url));if(!r.ok)throw Error('Missing original graphics resource');return new Uint8Array(await r.arrayBuffer());};
 const json=async(relative)=>{const r=await fetch(new URL(relative,import.meta.url));if(!r.ok)throw Error('Missing graphics timing resource');return r.json();};
 const [resource,timing,code,data,assets,loads,clock]=await Promise.all([
  resources.resource??binary('../assets/logo-resource.bin'),resources.timing??json('../assets/logo-timing.json'),
  resources.code??binary('../generated/le-code.bin'),resources.data??binary('../generated/le-data.bin'),resources.assets??binary('../generated/demo-assets.dat'),resources.loads??json('../generated/resource-loads.json'),resources.clock??json('../generated/s02-clock.json')]);
 return createSequencePreview({resource,timing,code,data,assets,loads,clock});
}
export {createAudioPort,loadAudioResources} from './audio-port.mjs';
