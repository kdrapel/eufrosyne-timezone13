/** Original executable/module resources for the experimental sound runner. */
export async function loadOriginalSoundResources(){
 const root=new URL('../generated-sound/',import.meta.url);
 const names=['le-code.bin','le-data.bin','AUMAX.S3M','PILIPS.S3M'];
 const data=await Promise.all(names.map(async name=>{const response=await fetch(new URL(name,root));if(!response.ok)throw Error(`Sound resource ${name}: ${response.status}`);return new Uint8Array(await response.arrayBuffer());}));
 return {code:data[0],data:data[1],modules:{aumax:data[2],pilips:data[3]}};
}
