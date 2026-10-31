/** Original logo resource loader + copy loop + 171A00 palette translation.
 * Only original DAT bytes and recovered control timing are runtime resources.
 * Time comes from the shared replaceable SimulationClock; no browser frame count.
 */
import {SimulationClock, MusicTimeline, VGA_REFRESH_HZ} from '../runtime/sim-clock.mjs';
export function stepBrightness(state) {
  let {mode,offset} = state;
  if (mode === 0) { if (offset < 0) offset += 4; if (offset > 0) offset -= 4; }
  if (mode === 1) { offset += 2; if (offset > 0) { offset=0; mode=0; } }
  if (mode === 2) offset = Math.max(-256,offset-2);
  if (mode === 3) offset = Math.max(-256,offset-8);
  if (mode === 4) offset = Math.max(-256,offset-1);
  if (mode === 5) { offset++; if (offset>0) {offset=0;mode=0;} }
  return {mode,offset};
}
export function paletteDAC(palette,offset,eventsEnabled=true) {
  if (palette.length !== 768 || !Number.isInteger(offset)) throw new Error('Invalid original palette/brightness');
  const dac6=new Uint8Array(768), events=eventsEnabled?[]:null;
  for (let i=0;i<256;i++) {
    if(events)events.push([0x3c8,1,i]);
    for(let c=0;c<3;c++) {
      // Original clamp in signed 32-bit arithmetic, then SAR 2 and OUT 3C9.
      const value=Math.max(0,Math.min(255,(palette[3*i+c]+offset)|0))>>2;
      dac6[3*i+c]=value; if(events)events.push([0x3c9,1,value]);
    }
  }
  return {dac6,events};
}
/** Expand a 320x200 VGA index buffer into the 640x400 presentation buffer.
 * One 32-bit write per output pixel through a per-palette color table. */
export function expandIndices(indices,dac6,rgba) {
  const out=new Uint32Array(rgba.buffer,rgba.byteOffset,640*400);
  const colors=new Uint32Array(256);
  for(let i=0;i<256;i++){
    const p=i*3,r=(dac6[p]<<2)|(dac6[p]>>4),g=(dac6[p+1]<<2)|(dac6[p+1]>>4),b=(dac6[p+2]<<2)|(dac6[p+2]>>4);
    colors[i]=0xff000000|(b<<16)|(g<<8)|r;
  }
  for(let y=0;y<200;y++){
    const src=y*320,top=y*1280;
    for(let x=0;x<320;x++){
      const color=colors[indices[src+x]],at=top+x*2;
      out[at]=color;out[at+1]=color;out[at+640]=color;out[at+641]=color;
    }
  }
}
export function copyLogoIndices(source,destination) {
  if(source.length!==64000 || destination.length!==64000) throw new Error('Unverified logo geometry');
  // 17A7C0 full-loop drawing: INC EAX; read source[EAX]; write destination[EAX-1].
  // Source symbolic base 2D720F is one byte before the resource's first pixel.
  for(let eax=1;eax<=0xfa00;eax++) destination[eax-1]=source[eax-1];
}
export function createLogoPort(resource,timing,timelineData=null) {
  if(resource.length!==64800) throw new Error('Incomplete original logo resource');
  const palette=resource.slice(32,800), source=resource.slice(800);
  const indices=new Uint8Array(64000),rgba=new Uint8ClampedArray(640*400*4);
  const timeline=timelineData?new MusicTimeline(timelineData):null;
  let brightness={mode:2,offset:-256};
  const clock=new SimulationClock(timeline,{startCallback:timing.initial_callback_counter,
    refreshHz:timing.refresh_hz??VGA_REFRESH_HZ,duration:timing.preview_duration});
  clock.phase=timing.callback_phase;
  clock.onCallback=state=>{
    // 171370 music-position controls: order 0/row 58 starts fade in;
    // order 1/row 58 starts fade out. Counters recovered from original state.
    if(state.callback===timing.fade_in_first_callback)brightness={mode:1,offset:-256};
    if(state.callback===timing.fade_out_first_callback)brightness={...brightness,mode:2};
    brightness=stepBrightness(brightness);
  };
  const reset=()=>{clock.reset();brightness={mode:2,offset:-256};indices.fill(0);};
  return {
    reset,
    advanceTo(target) {
      if(!Number.isFinite(target)||target<0||target>timing.preview_duration)throw new Error('Time outside first-scene preview');
      if(target<clock.seconds)reset();
      clock.advanceTo(target);
    },
    render() {
      copyLogoIndices(source,indices);
      const {dac6}=paletteDAC(palette,brightness.offset,false);
      // VGA logical 320x200; recovered scanline repetition and capture width
      // expansion produce 640x400. VGA6 -> RGB8 uses bit replication.
      expandIndices(indices,dac6,rgba);
      return {width:640,height:400,rgba};
    },
    debugState:()=>({seconds:clock.seconds,callback:clock.callback,...brightness,
      position:clock.timeline?clock.timeline.positionAt(clock.seconds):null}),
  };
}
