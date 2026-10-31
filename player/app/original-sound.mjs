/** Original MIDAS instruction runner. Resources and translated blocks are supplied explicitly.
 * Output scheduling is controlled by the caller until timeline integration is validated.
 */
import {GraphicsMachine} from './integer-graphics.mjs';
export class OriginalSound {
 constructor({code,data,module,blocks,blockLengths}) {
  this.resources={code,data,module,blocks,blockLengths};this.reset();
 }
 reset(){
  const {code,data,module}=this.resources;
  this.bytes=new Uint8Array(0x800000);this.bytes.set(code,0x171000);this.bytes.set(data,0x190000);
  this.m=new GraphicsMachine(this.bytes,{eflags:0x202,cs:0x868,ds:0x860,es:0x860,ss:0x860},{cs:0,ds:0,es:0,ss:0});
  this.heap=0x500000;this.cursor=0;this.file=module;this.frames=0;
  this.pending=new Uint8Array(0);this.pendingOffset=0;this.deliveredFrames=0;
  this.call(0x185c68,[44100,10,0xffffffff]);
  this.m.store(0x3600bc,4,0x1c0fe8);this.call(0x17d970,[0x1c0fe8]);
  this.bytes.set(Uint8Array.from('MODULE.S3M\0',c=>c.charCodeAt(0)),0x700000);
  this.call(0x17c198,[0x700000,1,0,0x700100]);
  this.module=this.m.load(0x700100,4);this.channels=this.m.load(this.module+0x34,1);
  this.call(0x185ecc,[this.channels]);
  this.call(0x17da00,[this.module,0xffffffff,0xffffffff,0xffffffff,0xffffffff,0x1bea64,0x700104]);
  this.player=this.m.load(0x700104,4);
 }
 call(entry,args,checkError=true){
  const m=this.m,sp=0x6f0000;
  for(const [i,v]of[0x171340,...args].entries())m.view.setUint32(sp+i*4,v,true);
  m.r[4]=sp;m.pc=entry;let count=0;
  while(m.pc!==0x171340){
   if(count>2000000)throw Error('Original sound instruction budget exceeded');
   const pc=m.pc;
   if([0x1840a0,0x186e90,0x1840dc,0x180340,0x1803a8,0x1803ec,0x18042c].includes(pc)){
    const s=m.r[4],ret=m.load(s,4),a=m.load(s+4,4),b=m.load(s+8,4),c=m.load(s+12,4);
    if(pc===0x1840a0){if(!a||this.heap+a>0x600000)throw Error('Sound heap bounds');m.store(b,4,this.heap);this.heap=(this.heap+a+15)&~15;}
    if(pc===0x186e90)for(const [offset,value]of[[8,0x14a00],[12,a],[20,0xffffffff],[24,0x14a00]])m.store(b+offset,4,value);
    if(pc===0x180340){this.cursor=0;m.store(c,4,1);}
    if(pc===0x1803ec){if(this.cursor+c>this.file.length)throw Error('Sound file read bounds');this.bytes.set(this.file.subarray(this.cursor,this.cursor+c),b);this.cursor+=c;}
    if(pc===0x18042c){this.cursor=c===1?b:c===2?this.cursor+b:this.file.length+b;if(this.cursor<0||this.cursor>this.file.length)throw Error('Sound seek bounds');}
    m.r[0]=0;m.r[4]=s+4;m.pc=ret;continue;
   }
   const block=this.resources.blocks[pc];if(!block)throw Error(`Missing original sound block ${pc.toString(16)}`);
   const length=this.resources.blockLengths[pc]??1;count+=length;m.instructions+=length;m.pc=block(m)>>>0;
  }
  if(checkError&&m.r[0])throw Error(`Original sound error ${m.r[0]} at ${entry.toString(16)}`);
  return m.r[0];
 }
 /** Controlled tick used for differential validation. Returns original signed-16 stereo PCM. */
 tick(){
  this.call(0x17dffc,[]);
  const frames=this.m.load(0x360368,4);if(frames<1||frames>1764)throw Error('Unsupported original tick size');
  this.call(0x186dd8,[frames]);
  this.call(0x189b69,[frames,0x14a00,0,this.m.load(0x3603d4,4),0],false);
  this.frames+=frames;
  return this.bytes.slice(0x14a00,0x14a00+frames*4);
 }
 position(){return {frames:this.frames,seconds:this.frames/44100,order:this.m.load(this.player+0x0c,4),row:this.m.load(this.player+0x14,4)};}
 /** Complete integer machine and transport state, including a partially consumed tick. */
 checkpoint(){
  const state={schema:1,registers:this.m.registers(),segments:this.m.segments,instructions:this.m.instructions,writes:this.m.writes};
  for(const key of ['heap','cursor','frames','pendingOffset','deliveredFrames','module','channels','player'])state[key]=this[key];
  state.pending=Array.from(this.pending);
  const meta=new TextEncoder().encode(JSON.stringify(state));
  const out=new Uint8Array(4+meta.length+this.bytes.length);new DataView(out.buffer).setUint32(0,meta.length,true);out.set(meta,4);out.set(this.bytes,4+meta.length);return out;
 }
 restoreCheckpoint(blob){
  const size=new DataView(blob.buffer,blob.byteOffset,blob.byteLength).getUint32(0,true);
  if(size>blob.length-4||blob.length-size-4!==0x800000)throw Error('Invalid original sound checkpoint');
  const state=JSON.parse(new TextDecoder().decode(blob.subarray(4,4+size)));
  if(state.schema!==1)throw Error('Unsupported sound checkpoint');
  this.bytes=blob.slice(4+size);this.m=new GraphicsMachine(this.bytes,state.registers,state.segments);
  this.m.instructions=state.instructions;this.m.writes=state.writes;
  for(const key of ['heap','cursor','frames','pendingOffset','deliveredFrames','module','channels','player'])this[key]=state[key];
  this.pending=Uint8Array.from(state.pending);this.file=this.resources.module;
 }
 /** Preserve original tick boundaries while serving arbitrary transport chunk sizes. */
 readFrames(frames){
  if(!Number.isInteger(frames)||frames<0||frames>441000)throw Error('Invalid sound read size');
  const out=new Uint8Array(frames*4);let offset=0;
  while(offset<out.length){
   if(this.pendingOffset===this.pending.length){this.pending=this.tick();this.pendingOffset=0;}
   const length=Math.min(out.length-offset,this.pending.length-this.pendingOffset);
   out.set(this.pending.subarray(this.pendingOffset,this.pendingOffset+length),offset);
   offset+=length;this.pendingOffset+=length;
  }
  this.deliveredFrames+=frames;return out;
 }
 seekFrames(frame){
  if(!Number.isInteger(frame)||frame<0)throw Error('Invalid sound seek');
  if(frame<this.deliveredFrames)this.reset();
  while(this.deliveredFrames<frame)this.readFrames(Math.min(4096,frame-this.deliveredFrames));
 }
}
