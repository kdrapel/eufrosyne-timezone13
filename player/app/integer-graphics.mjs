/** Integer state used by generated original graphics blocks; no DOS/device emulation. */
import {blocks,blockLengths} from '../generated/graphics-code.mjs';
const names=['eax','ecx','edx','ebx','esp','ebp','esi','edi'];
const parity=Uint8Array.from({length:256},(_,x)=>{let n=0;for(let i=0;i<8;i++)n+=(x>>i)&1;return (n&1)^1;});
// Flat translated-block table: a numeric index into a holey array is measurably
// cheaper than a dictionary lookup on the sparse address-keyed object.
const CBASE=0x171000,CSPAN=0x1e2a0;
const fastBlocks=new Array(CSPAN),fastLengths=new Uint32Array(CSPAN);
for(const key of Object.keys(blocks)){const at=key-CBASE;fastBlocks[at]=blocks[key];fastLengths[at]=blockLengths[key]??1;}
export class GraphicsMachine {
 constructor(bytes,registers={},segments={}) {
  this.bytes=bytes;this.view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);this.r=new Uint32Array(8);
  this.parity=parity;
  names.forEach((n,i)=>this.r[i]=registers[n]??0);this.pc=registers.eip??0;
  this.segments=segments;this.selectors=Object.fromEntries(['cs','ds','es','ss','fs','gs'].map(n=>[n,registers[n]??0]));
  this.setFlags(registers.eflags??2);this.instructions=0;this.writes=0;this.onWrite=null;
 }
 width(o){return o[0]===0?o[3]:o[0]===1?o[2]:o[0]===2?o[5]:o[3];}
 mask(w){return w===4?0xffffffff:w===2?65535:255;}
 signed(x,w){return w===4?x|0:w===2?(x<<16)>>16:(x<<24)>>24;}
 addr(o){let d=o[4];if(o[8])d=o[8]===4?this.view.getInt32(o[7],true):o[8]===1?this.view.getInt8(o[7]):this.view.getInt16(o[7],true);return ((o[1]<0?0:this.r[o[1]])+(o[2]<0?0:this.r[o[2]]*o[3])+d+(this.segments[o[6]]??0))>>>0;}
 check(a,n){if(a<0||a+n>this.bytes.length)throw new Error(`Uncovered graphics memory ${a.toString(16)}+${n}`);}
 load(a,n){const b=this.bytes;if(a<0||a+n>b.length)throw new Error(`Uncovered graphics memory ${a.toString(16)}+${n}`);return n===4?this.view.getUint32(a,true):n===2?this.view.getUint16(a,true):b[a];}
 store(a,n,value){const b=this.bytes;if(a<0||a+n>b.length)throw new Error(`Uncovered graphics memory ${a.toString(16)}+${n}`);const v=value>>>0;if(n===4)this.view.setUint32(a,v,true);else if(n===2)this.view.setUint16(a,v,true);else b[a]=v;this.writes++;this.onWrite?.(a,n,v&this.mask(n));}
 v(o){switch(o[0]){case 0:return (this.r[o[1]]>>>o[2])&this.mask(o[3])>>>0;case 1:return o[1]>>>0;case 2:return this.load(this.addr(o),o[5]);case 3:{const a=o[1],n=o[2];return (n<o[3]?(n===1?this.view.getInt8(a):this.view.getInt16(a,true)):this.load(a,n))>>>0;}case 4:return this.selectors[o[1]]??0;default:throw Error('Invalid operand');}}
 w(o,v){v>>>=0;if(o[0]===0){if(o[3]===4)this.r[o[1]]=v;else{const mask=this.mask(o[3])<<o[2];this.r[o[1]]=(this.r[o[1]]&~mask)|((v<<o[2])&mask);}}else if(o[0]===2)this.store(this.addr(o),o[5],v);else throw Error('Invalid write operand');}
 resultFlags(v,w){this.zf=v===0?1:0;this.sf=(v&(w===4?0x80000000:w===2?0x8000:0x80))?1:0;this.pf=parity[v&255];}
 alu(kind,a,b,w,carry=0){const mask=this.mask(w),sign=w===4?0x80000000:w===2?0x8000:0x80;a=(a&mask)>>>0;b=(b&mask)>>>0;let value,total;
  if(kind==='add'||kind==='adc'){total=a+b+carry;value=(total&mask)>>>0;this.cf=total>(mask>>>0)?1:0;this.of=((~(a^b)&(a^value))&sign)?1:0;this.af=((a^b^value)&16)?1:0;}
  else if(kind==='sub'||kind==='sbb'||kind==='cmp'){total=b+carry;value=((a-total)&mask)>>>0;this.cf=a<total?1:0;this.of=(((a^b)&(a^value))&sign)?1:0;this.af=((a^b^value)&16)?1:0;}
  else{value=(kind==='and'||kind==='test'?a&b:kind==='or'?a|b:a^b)&mask;value>>>=0;this.cf=this.of=this.af=0;}
  this.resultFlags(value,w);return value;
 }
 bin(kind,a,b){const value=this.alu(kind,this.v(a),this.v(b),this.width(a),kind==='adc'||kind==='sbb'?this.cf:0);if(kind!=='cmp'&&kind!=='test')this.w(a,value);}
 unary(kind,o){const a=this.v(o),w=this.width(o),cf=this.cf;let v;if(kind==='not'){this.w(o,~a);return;}if(kind==='neg')v=this.alu('sub',0,a,w);else{v=this.alu(kind==='inc'?'add':'sub',a,1,w);this.cf=cf;}this.w(o,v);}
 shift(kind,o,n){n&=31;if(n===0)return;const a=this.v(o)>>>0,w=this.width(o),bits=w*8,mask=this.mask(w),sign=bits===32?0x80000000:1<<(bits-1);let v=a;
  if(kind==='shl'||kind==='sal'){this.cf=n<=bits?(a>>>(bits-n))&1:0;v=(a<<n)&mask;this.of=((v&sign)?1:0)^this.cf;this.af=0;this.resultFlags(v>>>0,w);}
  else if(kind==='shr'){this.cf=n<=bits?(a>>>(n-1))&1:0;v=(a>>>n)&mask;this.of=(a&sign)?1:0;this.af=0;this.resultFlags(v>>>0,w);}
  else if(kind==='sar'){this.cf=n<=bits?(a>>>(n-1))&1:(a&sign?1:0);v=(this.signed(a,w)>>n)&mask;this.of=0;this.af=0;this.resultFlags(v>>>0,w);}
  else{const count=(kind==='rol'||kind==='ror')?n%bits:n%(bits+1);for(let i=0;i<count;i++){const cf=this.cf;if(kind==='rol'||kind==='rcl'){this.cf=(v&sign)?1:0;v=((v<<1)|(kind==='rol'?this.cf:cf))&mask;}else{this.cf=v&1;v=((v>>>1)|((kind==='ror'?this.cf:cf)?sign:0))&mask;}}this.of=kind==='ror'||kind==='rcr'?((v>>>(bits-1))^(v>>>(bits-2)))&1:((v&sign)?1:0)^this.cf;}
  this.w(o,v);
 }
 doubleShift(kind,o,b,n){n&=31;if(!n)return;const a=this.v(o)>>>0;let v;if(kind==='shld'){v=(a<<n)|(b>>>(32-n));this.cf=(a>>>(32-n))&1;}else{v=(a>>>n)|(b<<(32-n));this.cf=(a>>>(n-1))&1;}this.resultFlags(v>>>0,4);this.af=0;this.of=((a^v)>>>31)&1;this.w(o,v);}
 multiply(kind,ops){let a,b,product;
  if(kind==='imul'&&ops.length>1){a=this.signed(this.v(ops.length===3?ops[1]:ops[0]),this.width(ops[0]));b=this.signed(this.v(ops.length===3?ops[2]:ops[1]),this.width(ops[0]));const low=Math.imul(a,b);this.cf=this.of=a*b===low?0:1;this.w(ops[0],low);return;}
  const divisor=this.v(ops[0])>>>0;
  if((kind==='mul'||kind==='imul')&&this.width(ops[0])<4){const w=this.width(ops[0]), bits=w*8, mask=this.mask(w);const left=this.r[0]&mask;const p=kind==='imul'?this.signed(left,w)*this.signed(divisor,w):left*divisor;const low=p&mask, high=(p>>>bits)&mask;if(w===1)this.r[0]=(this.r[0]&0xffff0000)|(p&65535);else{this.r[0]=(this.r[0]&0xffff0000)|low;this.r[2]=(this.r[2]&0xffff0000)|high;}this.cf=this.of=kind==='mul'?(high?1:0):(p!==this.signed(low,w)?1:0);return;}
  if(kind==='mul'||kind==='imul'){product=BigInt(kind==='imul'?this.r[0]|0:this.r[0])*BigInt(kind==='imul'?divisor|0:divisor);const lo=Number(BigInt.asUintN(32,product)),hi=Number(BigInt.asUintN(32,product>>32n));this.r[0]=lo;this.r[2]=hi;this.cf=this.of=kind==='mul'?(hi!==0?1:0):(hi===(lo&0x80000000?0xffffffff:0)?0:1);return;}
  if(divisor===0)throw new Error('Original graphics division by zero');
  if(kind==='idiv'&&this.r[2]===(this.r[0]&0x80000000?0xffffffff:0)){const a=this.r[0]|0,d=divisor|0,q=Math.trunc(a/d);if(q<-2147483648||q>2147483647)throw Error('Original signed quotient overflow');this.r[0]=q;this.r[2]=a-q*d;return;}
  const numerator=(BigInt(this.r[2])<<32n)|BigInt(this.r[0]);const num=kind==='idiv'?BigInt.asIntN(64,numerator):numerator;const den=BigInt(kind==='idiv'?divisor|0:divisor);const q=num/den,rem=num%den;
  if((kind==='idiv'&&(q< -2147483648n||q>2147483647n))||(kind==='div'&&(q<0||q>4294967295n)))throw Error('Original quotient overflow');this.r[0]=Number(BigInt.asUintN(32,q));this.r[2]=Number(BigInt.asUintN(32,rem));
 }
 push(v){this.r[4]=(this.r[4]-4)>>>0;this.store(this.r[4],4,v);}
 pop(){const v=this.load(this.r[4],4);this.r[4]=(this.r[4]+4)>>>0;return v;}
 pusha(){const sp=this.r[4];for(const n of [0,1,2,3])this.push(this.r[n]);this.push(sp);for(const n of [5,6,7])this.push(this.r[n]);}
 popa(){for(const n of [7,6,5])this.r[n]=this.pop();this.pop();for(const n of [3,2,1,0])this.r[n]=this.pop();}
 string(name){const size=name.endsWith('d')?4:1,rep=name.startsWith('rep ');let count=rep?this.r[1]:1;while(count--){if(name.includes('movs')){this.store(this.r[7],size,this.load(this.r[6],size));this.r[6]=(this.r[6]+(this.df?-size:size))>>>0;}else this.store(this.r[7],size,this.r[0]);this.r[7]=(this.r[7]+(this.df?-size:size))>>>0;}if(rep)this.r[1]=0;}
 condition(c){switch(c){case'e':case'z':return !!this.zf;case'ne':case'nz':return !this.zf;case'l':case'nge':return this.sf!==this.of;case'ge':case'nl':return this.sf===this.of;case'le':case'ng':return !!this.zf||this.sf!==this.of;case'g':case'nle':return !this.zf&&this.sf===this.of;case'b':case'c':case'nae':return !!this.cf;case'ae':case'nc':case'nb':return !this.cf;case'a':case'nbe':return !this.cf&&!this.zf;case'be':case'na':return !!this.cf||!!this.zf;case's':return !!this.sf;case'ns':return !this.sf;case'o':return !!this.of;case'no':return !this.of;case'p':case'pe':return !!this.pf;case'np':case'po':return !this.pf;case'ecxz':return this.r[1]===0;default:throw new Error('Unsupported condition '+c);}}
 flags(){return (this.reserved|this.cf|(this.pf<<2)|(this.af<<4)|(this.zf<<6)|(this.sf<<7)|(this.df<<10)|(this.of<<11))>>>0;}
 setFlags(v){this.reserved=v&~0xcd5;this.cf=v&1;this.pf=(v>>>2)&1;this.af=(v>>>4)&1;this.zf=(v>>>6)&1;this.sf=(v>>>7)&1;this.df=(v>>>10)&1;this.of=(v>>>11)&1;}
 registers(){return {...Object.fromEntries(names.map((n,i)=>[n,this.r[i]])),eip:this.pc,eflags:this.flags(),...this.selectors};}
 run(stop,limit=20000000){const start=this.instructions;while(this.pc!==stop){if(this.instructions-start>=limit)throw new Error('Graphics instruction budget exceeded');const at=this.pc-CBASE,block=fastBlocks[at];if(block===undefined)throw new Error('Missing original block at '+this.pc.toString(16));this.instructions+=fastLengths[at];this.pc=block(this)>>>0;}return this.instructions-start;}
}
