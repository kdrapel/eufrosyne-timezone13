const p=window.player,$=id=>document.getElementById(id);
let timer;
function reveal(){if(document.fullscreenElement)return;$('hud').classList.add('visible');clearTimeout(timer);timer=setTimeout(()=>$('hud').classList.remove('visible'),5000);}
for(const event of ['pointermove','pointerdown','keydown','wheel','touchstart'])addEventListener(event,reveal,{passive:true});
$('scale').onchange=()=>{$('screen').style.transform=`scale(${$('scale').value})`;};
$('volume').oninput=()=>{if(p.outputGain)p.outputGain.gain.value=Number($('volume').value);};
$('stats-toggle').onchange=()=>{$('nerd-panel').hidden=!$('stats-toggle').checked;$('stats').hidden=!$('stats-toggle').checked;};
await p.ready;
const {createVideoPort}=await import('./port-extended.mjs');
const background=await createVideoPort();background.reset();background.advanceTo(33);const frame=background.render();
const canvas=$('background');canvas.width=frame.width;canvas.height=frame.height;canvas.getContext('2d').putImageData(new ImageData(frame.rgba,frame.width,frame.height),0,0);
