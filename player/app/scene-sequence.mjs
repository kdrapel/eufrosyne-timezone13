/** Live scene players driven by original translated blocks.
 * Each scene starts from original LE/DAT bytes plus verified setup tables.
 * Production frames are always produced by translated original code. */
import {GraphicsMachine} from './integer-graphics.mjs';
import {paletteDAC,expandIndices} from './logo-scene.mjs';

export const SCENE_ABI = {
  S3: {entry:0x178e10, continuation:0x171175, eax:0x0c, edx:0, ebx:0x330090, ecx:0x2e7090, stack:[0x2e7510,0x2e6c10]},
  S4: {entry:0x1739b0, continuation:0x171186, eax:0x10, edx:0, ebx:0x2d6f10, ecx:0, stack:[]},
  S5: {entry:0x179250, continuation:0x1711a6, eax:0x14, edx:0, ebx:0x340090, ecx:0x2e72d0, stack:[0x306910,0x2e6d90]},
  S6: {entry:0x173650, continuation:0x1711b7, eax:0x1a, edx:0, ebx:0x2d6f10, ecx:0, stack:[]},
  S7: {entry:0x179530, continuation:0x1711da, eax:0x1e, edx:0x20, ebx:0x31cc10, ecx:0x2e6e50, stack:[0x2f6f10,0x2e6cd0]},
  S8: {entry:0x173e90, continuation:0x1711ee, eax:0x22, edx:0x10, ebx:0x2d6f10, ecx:0, stack:[]},
  S9: {entry:0x17a7f0, continuation:0x1712b0, eax:0x04, edx:0x10, ebx:2, ecx:0, stack:[], music:2},
};

const STACK_TOP = 0x3617dc;
const POLL = 0x171340;

export function createSceneRenderer(initial) {
  let scene = null;
  let machine = null;
  const color = new Uint8ClampedArray(640*400*4);
  let lastCounter = -1;
  let lastOffset = null;
  let lastMs = 0;

  function start(name) {
    scene = name;
    const abi = SCENE_ABI[name];
    machine = new GraphicsMachine(initial.slice(), {eax:abi.eax, edx:abi.edx, ebx:abi.ebx, ecx:abi.ecx,
      esp:STACK_TOP, eip:abi.entry, eflags:0x3202}, {cs:0, ds:0, es:0, ss:0});
    machine.view.setUint32(STACK_TOP, abi.continuation, true);
    abi.stack.forEach((value, index) => machine.view.setUint32(STACK_TOP + 4 + index*4, value, true));
    if (abi.music) machine.view.setUint32(0x1c1f68, abi.music, true);
  }

  function frame(counter, order, row) {
    const view = machine.view;
    view.setUint32(0x1c1f88, counter, true);
    view.setUint32(0x1c1f84, order, true);
    view.setUint32(0x1c1f7c, row, true);
    const entered = scene === 'S9' && machine.instructions === 0;
    machine.run(POLL, 20000000);
    if (entered && machine.pc === POLL) {
      // S9 calls the poll before its own setup; return from that call and
      // continue to the first poll of the render loop.
      machine.pc = machine.pop();
      machine.run(POLL, 20000000);
    }
    if (machine.pc !== POLL) throw Error('Scene '+scene+' left its frame loop at '+machine.pc.toString(16));
    machine.r[0] = row; machine.r[2] = order; machine.pc = machine.pop();
  }

  function render({scene:name, counter, order, row, offset}) {
    if (!name) throw Error('No translated scene selected');
    if (scene !== name || counter < lastCounter || !machine) start(name);
    if (counter !== lastCounter) {
      const begin = performance.now();
      frame(counter, order, row);
      lastMs = performance.now() - begin;
      lastCounter = counter;
      lastOffset = null;
    }
    return present(offset);
  }

  /** Re-present the current original framebuffer with a palette offset.
   * Used by render() and while the screen holds its content between scenes. */
  function present(offset) {
    // A seek that lands inside the module-switch gap has no translated scene
    // frame yet; present the empty buffer rather than inventing one.
    if (!machine) return {width:640, height:400, rgba:color};
    const base = machine.view.getUint32(0x1c1f78, true);
    if (!base || base + 0x300 > machine.bytes.length) throw Error('Unverified scene palette pointer');
    if (offset !== lastOffset) {
      const {dac6} = paletteDAC(machine.bytes.subarray(base, base + 0x300), offset, false);
      expandIndices(machine.bytes.subarray(0xa0000, 0xa0000 + 64000), dac6, color);
      lastOffset = offset;
    }
    return {width:640, height:400, rgba:color};
  }

  return {
    checkpoint(){
      if(!machine)throw Error('No scene state');
      const pages=[];
      for(let at=0;at<initial.length;at+=4096){const end=Math.min(at+4096,initial.length);for(let i=at;i<end;i++)if(initial[i]!==machine.bytes[i]){pages.push(at);break;}}
      const meta=new TextEncoder().encode(JSON.stringify({schema:1,scene,lastCounter,registers:machine.registers(),segments:machine.segments,instructions:machine.instructions,writes:machine.writes,pages}));
      const out=new Uint8Array(4+meta.length+pages.length*4096);new DataView(out.buffer).setUint32(0,meta.length,true);out.set(meta,4);
      pages.forEach((at,i)=>out.set(machine.bytes.subarray(at,Math.min(at+4096,initial.length)),4+meta.length+i*4096));return out;
    },
    restoreCheckpoint(blob){
      const length=new DataView(blob.buffer,blob.byteOffset,blob.byteLength).getUint32(0,true),meta=JSON.parse(new TextDecoder().decode(blob.subarray(4,4+length)));
      if(meta.schema!==1||blob.length!==4+length+meta.pages.length*4096)throw Error('Invalid scene checkpoint');
      const bytes=initial.slice();meta.pages.forEach((at,i)=>{if(at%4096||at<0||at>=bytes.length)throw Error('Invalid scene checkpoint page');bytes.set(blob.subarray(4+length+i*4096,4+length+i*4096+Math.min(4096,bytes.length-at)),at);});
      machine=new GraphicsMachine(bytes,meta.registers,meta.segments);machine.instructions=meta.instructions;machine.writes=meta.writes;scene=meta.scene;lastCounter=meta.lastCounter;lastOffset=null;
    },
    reset() {scene=null; machine=null; lastCounter=-1; lastOffset=null;},
    render, present,
    debug() {return {scene, counter:lastCounter, renderMs:lastMs, instructions:machine?.instructions??0};},
    memory() {return machine?.bytes;},
  };
}
