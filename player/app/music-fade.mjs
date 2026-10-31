import {GraphicsMachine} from './integer-graphics.mjs';
import {blocks,blockLengths} from '../generated-sound/graphics-code.mjs';

const ENTRY=0x171370,POLL=0x171340,RETURN=0x17133f,STACK=0x6f0000;

/** Execute the translated original order/row fade controller. The poll hook
 * supplies the order and row from the same song clock used by the player. */
export class OriginalMusicFade {
  constructor(initial,module='aumax') { this.initial=initial; this.reset(module); }
  reset(module='aumax') {
    const m=this.machine=new GraphicsMachine(this.initial.slice(),{esp:STACK,eflags:0x202},{cs:0,ds:0,es:0,ss:0});
    m.view.setUint32(0x1c1f68,module==='pilips'?2:1,true);
    // Original published state at each module's start: AUMAX begins fading out,
    // while the credits module begins a fade IN (capture_000228: mode 1,
    // offset -192, reaching full brightness by 230 s). Seeding the credits scene
    // with the AUMAX state leaves it permanently black.
    m.view.setInt32(0x1c1f70,module==='pilips'?1:2,true);
    m.view.setInt32(0x1c1f74,module==='pilips'?-192:-256,true);
    m.view.setUint32(0x1c1fd0,0,true);
    m.view.setUint32(0x1c1fd4,0,true);
    this.counter=0;
    return this.state();
  }
  /** Current original published fade state (0x1C1F70 mode, 0x1C1F74 offset). */
  state() {
    const m=this.machine;
    return {mode:m.view.getInt32(0x1c1f70,true),offset:m.view.getInt32(0x1c1f74,true)};
  }
  update(order,row,counter) {
    const m=this.machine;
    m.view.setUint32(0x1c1f88,counter,true);
    m.r[4]=STACK;m.store(STACK,4,RETURN);m.pc=ENTRY;
    let instructions=0;
    while(m.pc!==RETURN){
      if(m.pc===POLL){
        m.view.setUint32(0x1c1f84,order,true);
        m.view.setUint32(0x1c1f7c,row,true);
        m.pc=m.pop();continue;
      }
      const block=blocks[m.pc];
      if(!block)throw Error(`Missing translated original music-fade block ${m.pc.toString(16)}`);
      instructions+=blockLengths[m.pc]??1;
      if(instructions>10000)throw Error('Original music-fade instruction budget exceeded');
      m.pc=block(m)>>>0;
    }
    this.counter=counter+1;
    return {mode:m.view.getInt32(0x1c1f70,true),offset:m.view.getInt32(0x1c1f74,true)};
  }
  pulse(offset) {
    this.machine.view.setInt32(0x1c1f74,offset,true);
    return {mode:this.machine.view.getInt32(0x1c1f70,true),offset};
  }
}
