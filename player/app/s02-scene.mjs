import {GraphicsMachine} from './integer-graphics.mjs';
import {paletteDAC,expandIndices} from './logo-scene.mjs';
export function initializeGraphics(code,data,assets,loads,setupTables=null) {
 const bytes=new Uint8Array(0x800000);bytes.set(code,0x171000);bytes.set(data,0x190000);const view=new DataView(bytes.buffer);
 for(const item of loads)bytes.set(assets.subarray(item.source_offset,item.source_offset+item.length),item.destination);
 if(setupTables){
  let offset=0;
  for(const range of setupTables.meta.ranges){bytes.set(setupTables.data.subarray(offset,offset+range.length),range.address);offset+=range.length;}
 }
 // Original sub_173570 pool initialization and accumulated-angle table generation.
 const pool=[0x193838,0x19e4f8,0x1a24f8,0x1a4d78,0x1aedb8,0x1b3ed8,0x1b9918];
 pool.forEach((value,i)=>view.setUint32(0x1f0de8+i*4,value,true));
 view.setUint32(0x1f0de0,pool[0],true);view.setUint32(0x1f0de4,pool[0],true);
 let angle=0;const increment=0.001533980788085938;
 for(let i=0;i<4096;i++){view.setInt32(0x2c3210+i*4,Math.trunc(Math.sin(angle)*32768),true);view.setInt32(0x290110+i*4,Math.trunc(Math.cos(angle)*32768),true);angle+=increment;}
 for(let y=-100,index=0;y<100;y++)for(let x=-160;x<160;x++,index++){bytes[0x200804+index]=Math.trunc(Math.sqrt(x*x+y*y));bytes[0x1f0e04+index]=Math.trunc(Math.atan2(y,x)*256*0.15915494307111402);}
 // Original sub_173570 table loop at 0x178DC0: dword_210204[31744].
 let tableIndex=0;
 for(let divisor=1;divisor<=124;divisor++)for(let value=0;value<0x2000;value+=0x20){
  const entry=Math.max(0,Math.trunc(value/divisor)-10);
  view.setInt32(0x210204+tableIndex*4,entry,true);tableIndex++;
 }
 // Static reciprocal table used by the S5/S7 voxel backgrounds:
 // dword_240110[16384*4], 256 blocks of 256 entries.
 for(let i=0;i<0x40000/4;i++){
  const entry=Math.floor((0x640+0x20*Math.floor(i/0x100))/((i%0x100)+1));
  view.setInt32(0x240110+i*4,entry,true);
 }
 if(view.getUint32(0x1bea44,true)!==0xa0000)throw Error('Unverified original graphics destination');
 return bytes;
}
export function createS02Renderer(initial) {
 let machine=null;const rgba=new Uint8ClampedArray(640*400*4);let lastCounter=-1,lastOffset=null;let lastMs=0;
 return {
  reset(){machine=null;lastCounter=-1;lastOffset=null;},
  render({counter,order,row,offset}) {
   if(!machine||counter<lastCounter){
    const bytes=initial.slice();machine=new GraphicsMachine(bytes,{eax:8,edx:0,ebx:0x2d6f10,esp:0x3617e4,eip:0x173b90,eflags:0x3202},{cs:0,ds:0,es:0,ss:0});
    machine.view.setUint32(0x3617e4,0x171155,true); // verified main CALL continuation
   }
   if(counter!==lastCounter){
    const begin=performance.now();const v=machine.view;
    v.setUint32(0x1c1f88,counter,true);v.setUint32(0x1c1f84,order,true);v.setUint32(0x1c1f7c,row,true);
    if(machine.pc===0x171340){machine.r[0]=row;machine.r[2]=order;machine.pc=machine.pop();}
    machine.run(0x171340,20000000);lastMs=performance.now()-begin;lastCounter=counter;lastOffset=null;
   }
   if(offset!==lastOffset){
    const paletteBase=machine.view.getUint32(0x1c1f78,true);
    const {dac6}=paletteDAC(machine.bytes.subarray(paletteBase,paletteBase+0x300),offset,false);
    expandIndices(machine.bytes.subarray(0xa0000,0xa0000+64000),dac6,rgba);
    lastOffset=offset;
   }
   return {width:640,height:400,rgba};
  },
  debug(){return {counter:lastCounter,renderMs:lastMs,instructions:machine?.instructions??0};},
  memory(){return machine?.bytes;},
 };
}
