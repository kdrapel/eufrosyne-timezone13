import {initializeGraphics} from '../player/app/s02-scene.mjs';
import {GraphicsMachine} from '../player/app/integer-graphics.mjs';
import {paletteDAC} from '../player/app/logo-scene.mjs';

export async function loadData(){
 const root=new URL('../player/generated/',import.meta.url);
 const bin=async name=>{const r=await fetch(new URL(name,root));if(!r.ok)throw Error(`Missing original resource: ${name}`);return new Uint8Array(await r.arrayBuffer());};
 const json=async name=>JSON.parse(new TextDecoder().decode(await bin(name)));
 const [code,data,assets,loads,setup,meta]=await Promise.all([bin('le-code.bin'),bin('le-data.bin'),bin('demo-assets.dat'),json('resource-loads.json'),bin('setup-tables.bin'),json('setup-tables.json')]);
 return initializeGraphics(code,data,assets,loads,{data:setup,meta});
}
export class VoxelTunnel {
 constructor(initial){
  this.initial=initial;this.view=new DataView(initial.buffer,initial.byteOffset,initial.byteLength);
  this.height=initial.subarray(0x350090,0x360090);this.texture=initial.subarray(0x330090,0x340090);
  this.palette=new Uint8Array(768);this.palette.set(initial.subarray(0x2e7090,0x2e7090+576));this.palette.set(initial.subarray(0x2e6c10,0x2e6c10+192),576);
 }
 build(counter,columns=256,depths=97){
  const pixels=new Uint8Array(256*256),spans=[];
  // Original 0x178BC8 clears 256x200 bytes; the remaining radial rows are
  // outside every 320x200 screen pixel's radius and are left zero here.
  for(let column=0;column<Math.min(256,columns+1);column++){
   if(column===columns&&columns===256)break;
   let top=199;const count=column<columns?97:depths;
   for(let depth=0;depth<count;depth++){
    const source=(column<<8)|((counter+depth)&255),height=this.height[source],color=this.texture[source];
    const projected=this.view.getInt32(0x210204+(depth*256+height)*4,true),before=top;
    while(projected<top&&top>=0){pixels[top*256+column]=color;top--;}
    if(column===Math.min(columns,255))spans.push({depth,source,height,color,projected,before,after:top,writes:before-top});
    if(top<0)break;
   }
  }
  return {pixels,spans};
 }
 rotation(counter){return this.view.getInt32(0x2c3210+((counter*8)&4095)*4,true)>>9;}
 sample(counter,x,y){const i=y*320+x,angle=this.initial[0x1f0e04+i],radius=this.initial[0x200804+i],u=(angle+this.rotation(counter))&255;return {x,y,angle,radius,u,index:radius*256+u};}
 map(counter,buffer,rows=200){const out=new Uint8Array(64000);for(let y=0;y<rows;y++)for(let x=0;x<320;x++){const p=this.sample(counter,x,y);out[y*320+x]=buffer[p.index];}return out;}
 rgba(indices,palette=this.palette){const out=new Uint8ClampedArray(indices.length*4),{dac6}=paletteDAC(palette,0,false);for(let i=0;i<indices.length;i++){for(let c=0;c<3;c++){const v=dac6[indices[i]*3+c];out[i*4+c]=(v<<2)|(v>>4);}out[i*4+3]=255;}return out;}
 compose(counter,panorama){
  const m=new GraphicsMachine(this.initial.slice(),{eax:12,edx:0,ebx:0x330090,ecx:0x2e7090,esp:0x3617dc,eip:0x178e10,eflags:0x3202},{cs:0,ds:0,es:0,ss:0});
  m.view.setUint32(0x3617dc,0x171175,true);m.view.setUint32(0x3617e0,0x2e7510,true);m.view.setUint32(0x3617e4,0x2e6c10,true);
  const music=()=>{const row=Math.floor(counter*9.590148398717394/70.08630289532294+9.562016394698539);m.view.setUint32(0x1c1f88,counter,true);m.view.setUint32(0x1c1f84,Math.floor(row/64),true);m.view.setUint32(0x1c1f7c,row%64,true);return row;};
  // First original interval initializes the object; its end computes this
  // counter's transform for the next draw. Re-enter before the voxel CALL.
  let row=music();m.run(0x171340);m.r[0]=row%64;m.r[2]=Math.floor(row/64);m.pc=m.pop();music();m.run(0x178bc8);
  m.bytes.set(panorama.subarray(0,51200),0x230204);m.bytes.set(this.map(counter,panorama),0x2c7210);
  // The isolated voxel routine preserves all registers with PUSHAD/POPAD.
  // Resume its caller to run the original polygon object and credits layers.
  m.pc=m.pop();m.run(0x171340);
  const base=m.view.getUint32(0x1c1f78,true);return {indices:m.bytes.slice(0xa0000,0xa0000+64000),palette:m.bytes.slice(base,base+768)};
 }
}
