import {loadData,VoxelTunnel} from './voxel-engine.mjs';
const $=id=>document.getElementById(id);
let engine,queued=false,last,selected=null,columnTimer,rowTimer;
const value=id=>Number($(id).value);
function image(id,width,height,rgba){const c=$(id);c.width=width;c.height=height;c.getContext('2d').putImageData(new ImageData(rgba,width,height),0,0);}
function marker(id,x,y,color='#bda1ef'){const ctx=$(id).getContext('2d');ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+.5,0);ctx.lineTo(x+.5,$(id).height);ctx.moveTo(0,y+.5);ctx.lineTo($(id).width,y+.5);ctx.stroke();}
function gray(bytes){const out=new Uint8ClampedArray(bytes.length*4);bytes.forEach((v,i)=>{out.set([v,v,v,255],i*4);});return out;}
function stopColumns(){clearInterval(columnTimer);columnTimer=null;$('play-columns').textContent='Build automatically';$('play-columns').setAttribute('aria-pressed','false');}
function stopRows(){clearInterval(rowTimer);rowTimer=null;$('play-rows').textContent='Map automatically';$('play-rows').setAttribute('aria-pressed','false');}
function nextColumn(){if(value('columns')>=256){stopColumns();return;}$('columns').value=value('columns')+1;$('depth').value=0;schedule();}
function profile(spans){const c=$('profile'),ctx=c.getContext('2d');ctx.fillStyle='#090614';ctx.fillRect(0,0,c.width,c.height);ctx.font='12px monospace';ctx.fillStyle='#afa0c8';ctx.fillText('near (0) → depth → far (96)',12,18);for(const y of [0,100,199]){ctx.strokeStyle='#443762';ctx.beginPath();ctx.moveTo(30,30+y);ctx.lineTo(505,30+y);ctx.stroke();ctx.fillText(String(y),0,33+y);}for(const [key,color]of [['projected','#c0a2f4'],['after','#79cbd5']]){ctx.strokeStyle=color;ctx.beginPath();spans.forEach((s,i)=>{const x=32+s.depth*4.85,y=30+Math.max(0,Math.min(199,s[key]));if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.stroke();}}
function draw(){
 queued=false;if(!engine)return;
 const counter=value('counter'),columns=value('columns'),depths=value('depth'),rows=value('rows');
 const built=engine.build(counter,columns,depths),mapped=engine.map(counter,built.pixels,rows);
 last={counter,columns,depths,rows,buffer:built.pixels,mapped};
 $('counter-value').textContent=counter;$('columns-value').textContent=`${columns} / 256`;$('depth-value').textContent=`${depths} / 97`;$('rows-value').textContent=`${rows} / 200`;
 for(const id of ['height','height-live'])image(id,256,256,gray(engine.height));for(const id of ['texture','texture-live'])image(id,256,256,engine.rgba(engine.texture));image('buffer',256,200,engine.rgba(built.pixels.subarray(0,51200)));
 const column=Math.min(columns,255),depth=Math.min(Math.max(0,depths-1),96),source=(column<<8)|((counter+depth)&255);
 for(const id of ['height','texture','height-live','texture-live'])marker(id,source&255,column,'#79e5e3');
 const position=`${(Math.min(columns,255)+0.5)/256*100}%`;
 for(const id of ['column-top','column-bottom']){$(id).style.left=position;$(id).hidden=columns>=256;}

 $('source-info').textContent=`Column ${column} → map row ${column}\nDepth ${depth} → map x (${counter} + ${depth}) & 255 = ${source&255}\nSource byte ${source} (0x${source.toString(16).padStart(4,'0')})\nHeight ${engine.height[source]} · palette index ${engine.texture[source]}`;
 const span=built.spans.at(-1);
 $('span-info').textContent=span?`Column ${column}, depth ${span.depth}\nHeight ${span.height}, projected Y ${span.projected}\nWrite cursor ${span.before} → ${span.after}\n${span.writes?`${span.writes} pixel(s) written with palette index ${span.color}`:'Occluded: no pixels written'}`:'No samples executed in the selected column. Press Next depth sample.';
 profile(built.spans);
 const mode=$('mapping-view').value;
 if(mode==='color')image('tunnel',320,200,engine.rgba(mapped));
 else {const diagnostic=new Uint8ClampedArray(64000*4);for(let y=0;y<200;y++)for(let x=0;x<320;x++){const p=engine.sample(counter,x,y),i=(y*320+x)*4;diagnostic[i+3]=255;if(y>=rows)continue;if(mode==='radius')diagnostic.set([p.radius,p.radius,p.radius,255],i);else diagnostic.set([p.u,Math.floor(p.u*.55),255-p.u,255],i);}image('tunnel',320,200,diagnostic);}
 if(selected){
  const pixel=engine.sample(counter,selected.x,selected.y);
  for(const [id,x,y]of [['buffer',pixel.u,pixel.radius],['tunnel',selected.x,selected.y]]){const ctx=$(id).getContext('2d');ctx.strokeStyle='#f0dfee';ctx.strokeRect(x-2.5,y-2.5,5,5);}
  $('pixel-info').textContent=`Inspecting screen (${pixel.x}, ${pixel.y}) → radius ${pixel.radius}, angle byte ${pixel.angle}\nAngular offset ${engine.rotation(counter)} → buffer column ${pixel.u}\nBuffer (${pixel.u}, ${pixel.radius}) → byte ${pixel.index}\nPalette index ${built.pixels[pixel.index]}${selected.y>=rows?' · screen row not mapped yet':''}`;
 }else $('pixel-info').textContent='Point at the tunnel to inspect a pixel. A small pink square will mark its source in the voxel buffer. The blue arrows above and below the buffer mark the column being built.';
 if($('layers').checked){const frame=engine.compose(counter,built.pixels);image('scene-view',320,200,engine.rgba(frame.indices,frame.palette));}
 else image('scene-view',320,200,engine.rgba(mapped));
}
function schedule(){if(!queued){queued=true;requestAnimationFrame(()=>{try{draw();}catch(error){$('error').textContent=error.message;stopColumns();stopRows();}});}}
for(const id of ['counter','columns','depth','rows','mapping-view','layers'])$(id).addEventListener('input',schedule);
$('next-depth').onclick=()=>{if(value('depth')>=97){nextColumn();return;}if(value('columns')<256)$('depth').value=value('depth')+1;schedule();};
$('next-column').onclick=nextColumn;
$('complete').onclick=()=>{stopColumns();$('columns').value=256;$('depth').value=0;schedule();};
$('clear').onclick=()=>{stopColumns();$('columns').value=0;$('depth').value=0;schedule();};
$('play-columns').onclick=()=>{if(columnTimer){stopColumns();return;}if(value('columns')===256)$('columns').value=0;$('play-columns').textContent='Pause building';$('play-columns').setAttribute('aria-pressed','true');columnTimer=setInterval(nextColumn,100);};
function nextRow(){if(value('rows')>=200){stopRows();return;}$('rows').value=value('rows')+1;schedule();}
$('next-row').onclick=nextRow;$('reset-rows').onclick=()=>{stopRows();$('rows').value=0;schedule();};$('all-rows').onclick=()=>{stopRows();$('rows').value=200;schedule();};
$('play-rows').onclick=()=>{if(rowTimer){stopRows();return;}if(value('rows')===200)$('rows').value=0;$('play-rows').textContent='Pause mapping';$('play-rows').setAttribute('aria-pressed','true');rowTimer=setInterval(nextRow,80);};
$('show-finished').onclick=()=>{stopColumns();stopRows();$('columns').value=256;$('depth').value=0;$('rows').value=200;$('layers').checked=true;schedule();};
function point(event){const r=$('tunnel').getBoundingClientRect();selected={x:Math.max(0,Math.min(319,Math.floor((event.clientX-r.left)*320/r.width))),y:Math.max(0,Math.min(199,Math.floor((event.clientY-r.top)*200/r.height)))};schedule();}
$('tunnel').onpointermove=point;$('tunnel').onpointerdown=point;
$('tunnel').onpointerleave=()=>{selected=null;schedule();};
window.addEventListener('pagehide',()=>{stopColumns();stopRows();});
window.voxelLesson={get state(){return last;},get engine(){return engine;}};
try{engine=new VoxelTunnel(await loadData());$('error').textContent='';draw();}catch(error){$('error').textContent=`Unable to load the original effect: ${error.message}`;throw error;}
