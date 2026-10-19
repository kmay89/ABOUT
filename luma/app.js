import { buildMesh, binarySTL, estimateGrid } from './mesh.js';
import { imagePlacement, grayscale, photoLevels, enhanceDetail, estimateBounds, printerFit, safeResolution, clamp,
  MATERIALS, COLOURS, LIGHTS, absorption, transmissionRGB, recommendedRange, contrastWords } from './image-processing.js';
import { LithophanePreview } from './preview.js';
import { ACCESSORIES } from './accessories.js';
import { LIGHT_SOURCES, ROOMS, recommendThickness } from './light.js';

const $ = (id) => document.getElementById(id);
const state = { accessory:{ flat:'none', curved:'none', cylinder:'none' }, accessoryParts:[], shape:'flat', rotation:0, mirror:false, autoTone:true, colour:'white', levels:null, mode:'lit', source:null, name:'Sample · golden retriever', sample:true, revision:0, busy:false, loaded:false, mesh:null, ready:null };
const fieldIds = ['widthInput','heightInput','diameterInput','angleInput','curveHeightInput','fitSelect','cropX','cropY','zoomInput','brightnessInput','contrastInput','borderInput','minThicknessInput','maxThicknessInput','detailSelect','detailInput','materialSelect','lightColourSelect','standSelect'];
// Fields added after the first project format: an older project simply lacks them.
const optionalFields = { detailInput:'0', materialSelect:'pla', lightColourSelect:'warm', standSelect:'bottom' };
// The test strip always spans the same useful range, so its key never changes.
const STRIP_STEPS = [0.6,1.1,1.6,2.1,2.6,3.1,3.6];
const linearToSRGB = v => Math.round(255*clamp(v<=0.0031308?12.92*v:1.055*Math.pow(v,1/2.4)-0.055,0,1));
const sizeIds = ['widthInput','heightInput','diameterInput','angleInput','curveHeightInput'];
const transformIds = ['rotateBtn','mirrorBtn','resetToneBtn','autoToneBtn','orient-portrait','orient-landscape','filamentResetBtn','stripApplyBtn','shape-flat','shape-curved','shape-cylinder','sampleBtn','uploadBtn','projectOpenBtn','projectSaveBtn','calibrationBtn'];
const SHAPES = ['flat','curved','cylinder'];
/* Build volumes from each maker's published specifications, in mm. The upright
   panel stands on its edge, so its height uses the printer's Z. */
const PRINTERS = [
  { id:'p2s', name:'Bambu Lab P2S', short:'P2S', bed:{ x:256, y:256, z:256 } },
  { id:'bambu256', name:'Bambu Lab X1 · P1 · A1', short:'your Bambu', bed:{ x:256, y:256, z:256 } },
  { id:'a1mini', name:'Bambu Lab A1 mini', short:'A1 mini', bed:{ x:180, y:180, z:180 } },
  { id:'mk4', name:'Prusa MK4S · MK4', short:'MK4', bed:{ x:250, y:210, z:220 } },
  { id:'coreone', name:'Prusa CORE One', short:'CORE One', bed:{ x:250, y:220, z:270 } },
  { id:'mini', name:'Prusa MINI+', short:'MINI+', bed:{ x:180, y:180, z:180 } },
  { id:'k1', name:'Creality K1 · Ender-3 V3', short:'your Creality', bed:{ x:220, y:220, z:250 } },
  { id:'big', name:'A large printer · 300 mm', short:'your printer', bed:{ x:300, y:300, z:300 } },
];
const DETAIL_RADIUS_MM = 1.2;
let preview, renderTimer, toastTimer, photoLoadId = 0, exportId = 0, disabledBefore = new Set();
const fmt = (value, digits = 1) => Number(value).toLocaleString(undefined,{maximumFractionDigits:digits});

function toast(message) {
  clearTimeout(toastTimer); $('toast').textContent = message; $('toast').classList.add('visible','show'); $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').classList.remove('visible','show'); $('toast').hidden = true; },6500);
}

function numeric(id, min, max) {
  const field=$(id), value=Number(field.value);
  if (field.value.trim()==='' || !Number.isFinite(value) || value<min || value>max) throw new Error(`${field.labels?.[0]?.textContent?.trim() || id.replace('Input','')} must be between ${min} and ${max}.`);
  return value;
}

function printer() {
  return PRINTERS.find(p=>p.id===$('printerSelect').value) || PRINTERS[0];
}

function settings() {
  const angleDeg = numeric('angleInput',30,180);
  const diameter = numeric('diameterInput',20,240);
  const width = state.shape==='flat' ? numeric('widthInput',20,320) : state.shape==='cylinder' ? Math.PI*diameter : diameter/2*angleDeg*Math.PI/180;
  const height = state.shape==='flat' ? numeric('heightInput',20,320) : numeric('curveHeightInput',20,320);
  const border = numeric('borderInput',0,8);
  const minThickness=numeric('minThicknessInput',0.4,2), maxThickness=numeric('maxThicknessInput',1.5,5);
  if (maxThickness<=minThickness) throw new Error('Dark-area thickness must be greater than bright-area thickness.');
  if (2*border>=height-2 || (state.shape!=='cylinder' && 2*border>=width-2)) throw new Error('This border leaves too little room for the photo. Reduce the border or increase the panel size.');
  const requested=numeric('detailSelect',0.15,0.3), resolution=safeResolution(width,height,requested);
  // A tall flat panel prints on its long edge unless asked otherwise (see mesh.js).
  const turn=state.shape==='flat'&&$('standSelect').value==='long'&&height>width;
  return { shape:state.shape,width,height,angleDeg,diameter,minThickness,maxThickness,border,borderThickness:maxThickness,resolution,requestedResolution:requested,turn };
}

function adjustments() {
  return { fit:$('fitSelect').value,zoom:Number($('zoomInput').value),cropX:Number($('cropX').value),cropY:Number($('cropY').value),brightness:Number($('brightnessInput').value),contrast:Number($('contrastInput').value),levels:state.autoTone?state.levels:null };
}

/** The photo opening in mm. A lamp wraps the photo all the way round, so only its top and bottom have a border. */
function photoSize(s) {
  return { iw:s.shape==='cylinder'?s.width:s.width-2*s.border, ih:s.height-2*s.border };
}

function imageField(s, maxDimension = 1000) {
  const {iw,ih}=photoSize(s);
  const pixelsPerMM=Math.min(1/s.resolution,maxDimension/Math.max(iw,ih));
  const nx=Math.max(2,Math.ceil(iw*pixelsPerMM)+1),ny=Math.max(2,Math.ceil(ih*pixelsPerMM)+1);
  const canvas=document.createElement('canvas'); canvas.width=nx;canvas.height=ny;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='#fff';ctx.fillRect(0,0,nx,ny);
  if(state.source) {
    const rotated=state.rotation%180!==0;
    const sw=rotated?state.source.height:state.source.width,sh=rotated?state.source.width:state.source.height;
    const a=adjustments(),p=imagePlacement(sw,sh,iw,ih,a);
    ctx.save();
    ctx.setTransform((nx-1)/iw,0,0,(ny-1)/ih,0.5,0.5);
    ctx.translate(p.x+p.width/2,p.y+p.height/2);
    if(state.mirror)ctx.scale(-1,1);
    ctx.rotate(state.rotation*Math.PI/180);
    const dw=rotated?p.height:p.width,dh=rotated?p.width:p.height;
    ctx.drawImage(state.source,-dw/2,-dh/2,dw,dh);
    ctx.restore();
  }
  const imageData=ctx.getImageData(0,0,nx,ny),values=grayscale(imageData.data,adjustments());
  // The same physical radius at preview and export resolution, so both agree.
  enhanceDetail(values,nx,ny,DETAIL_RADIUS_MM*(nx-1)/iw,Number($('detailInput').value)/50);
  for(let i=0,j=0;i<values.length;i++,j+=4) { const c=Math.round(values[i]*255);imageData.data[j]=c;imageData.data[j+1]=c;imageData.data[j+2]=c;imageData.data[j+3]=255; }
  ctx.putImageData(imageData,0,0);
  return {values,nx,ny,canvas,widthMM:iw,heightMM:ih};
}

function displayLabels() {
  $('angleValue').textContent=`${$('angleInput').value}°`;
  $('brightnessValue').textContent=`${Number($('brightnessInput').value)>0?'+':''}${$('brightnessInput').value}`;
  $('contrastValue').textContent=`${$('contrastInput').value}%`;
  $('detailValue').textContent=`${$('detailInput').value}%`;
  $('autoToneBtn').setAttribute('aria-pressed',String(state.autoTone));
  const w=Number($('widthInput').value),h=Number($('heightInput').value);
  $('orient-portrait').setAttribute('aria-pressed',String(h>w));$('orient-landscape').setAttribute('aria-pressed',String(w>h));
  const min=Number($('minThicknessInput').value),max=Number($('maxThicknessInput').value);
  if(max>min){const c=contrastWords(min,max,filamentK());$('contrastBadge').textContent=c.word;$('contrastBadge').dataset.level=c.word.toLowerCase().replace(' ','-');$('contrastNote').textContent=c.note;}
  drawStripKey();
  updateCalculator();
  $('borderValue').textContent=`${fmt($('borderInput').value)} mm`;
  $('lightValue').textContent=`${Math.round(Number($('lightInput').value)*100)}%`;
  $('fileName').textContent=state.name;
  $('mirrorBtn').setAttribute('aria-pressed',String(state.mirror));
}

function changed(resetView=false) {
  state.revision++; clearReady(); displayLabels();
  clearTimeout(renderTimer);
  $('viewerStatus').textContent='Updating preview…';
  renderTimer=setTimeout(()=>render(resetView),100);
}

function render(resetView=false) {
  if(!state.source)return;
  try {
    const s=settings();
    const p={...s,turn:false,resolution:Math.max(0.5,s.width/(s.shape==='cylinder'?320:220),s.height/280)};
    const photo=imageField(s,1100);
    state.photo=photo;
    const mesh=buildMesh({...p,values:photo.values,nx:photo.nx,ny:photo.ny});
    state.mesh=mesh;
    if(preview&&!preview.failed)preview.update(mesh,resetView);
    updateAccessory(s);
    drawPhotoCanvas(photo);
    if(!preview||preview.failed)drawFallback(photo,s);
    // The preview stands as it hangs; the fit check uses the way it will print.
    const dimensions=s.turn?{x:mesh.bounds.size[2],y:mesh.bounds.size[1],z:mesh.bounds.size[0]}:{x:mesh.bounds.size[0],y:mesh.bounds.size[1],z:mesh.bounds.size[2]};
    const pr=printer(),bed=pr.bed,fit=printerFit(dimensions,8,bed);
    const {iw,ih}=photoSize(s);
    $('dimensionLabel').textContent=state.shape==='flat'?`${fmt(s.width)} × ${fmt(s.height)} mm`:state.shape==='cylinder'?`Ø ${fmt(dimensions.x)} × ${fmt(s.height)} mm`:`${fmt(dimensions.x)} × ${fmt(s.height)} mm`;
    $('tuningNote').textContent=state.shape!=='flat'?'Prints standing up':s.turn||s.width>=s.height?'Prints on its long edge':'Prints on its bottom edge';
    $('photoAreaLabel').textContent=`Photo ${fmt(iw)} × ${fmt(ih)} mm${state.shape==='curved'?' along curve':state.shape==='cylinder'?' all the way round':''}`;
    const theta=s.angleDeg*Math.PI/180,insideDiameter=2*s.width/theta;
    $('radiusLabel').textContent=state.shape==='curved'?`Ø ${fmt(insideDiameter)} mm inside · ${fmt(insideDiameter*Math.sin(theta/2))} mm opening · ${fmt(s.width)} mm arc · ${fmt(dimensions.y)} mm depth`:state.shape==='cylinder'?`Ø ${fmt(s.diameter)} mm inside — room for a light up to about Ø ${fmt(Math.max(0,s.diameter-6))} mm · ${fmt(s.border)} mm rims top and bottom`:`${fmt(s.border)} mm border included · ${fmt(s.maxThickness)} mm maximum depth`;
    const bedText=`${bed.x} × ${bed.y} × ${bed.z} mm`;
    $('fitBadge').textContent=fit.brimFits?`Fits ${pr.short}`:fit.objectFits?'Check brim':`Too large for ${pr.short}`;
    $('fitBadge').dataset.state=fit.brimFits?'good':fit.objectFits?'warning':'error';
    $('fitBadge').classList.toggle('warning',!fit.brimFits);
    $('fitMessage').textContent=fit.brimFits?`Room for an 8 mm brim on the ${pr.name}’s ${bed.x} × ${bed.y} mm plate. Confirm placement in your slicer.`:fit.objectFits?'It fits, but an 8 mm brim would run off the plate. Make it a little smaller, or use a narrower brim after checking adhesion.':`Make it smaller before exporting: the finished model is ${fmt(dimensions.x)} × ${fmt(dimensions.y)} × ${fmt(dimensions.z)} mm and the ${pr.name} builds up to ${bedText}.`;
    const estimate=estimateGrid(s);
    const approxMB=estimate.stlBytes/1e6;
    const volumeCM3=mesh.signedVolume/1000;
    const material=MATERIALS[$('materialSelect').value]||MATERIALS.pla;
    $('modelStats').textContent=`About ${fmt(volumeCM3*material.density,0)} g of ${material.name} · ${fmt(s.resolution,2)} mm detail · ${fmt(approxMB,1)} MB STL${s.resolution>s.requestedResolution?' · detail adjusted for this size':''}`;
    $('exportSubtext').textContent=`${fmt(s.minThickness)}–${fmt(s.maxThickness)} mm · upright · millimeters`;
    $('exportBtn').disabled=state.busy||!fit.objectFits;
    $('viewerStatus').textContent=preview&&!preview.failed?'Drag to rotate · pinch to zoom':'2D preview · 3D is unavailable on this device';
    $('previewCaption').textContent=state.mode==='lit'?'Approximate transmitted-light preview. Your filament and light determine the printed result.':'Actual relief shape in white plastic. Illuminate from behind to reveal the photo.';
  } catch(error) {
    $('viewerStatus').textContent=error.message;
    $('fitBadge').textContent='Check settings';
    $('fitBadge').dataset.state='error';
    $('fitMessage').textContent=error.message;
    $('exportBtn').disabled=true;
  }
}

function drawPhotoCanvas(photo) {
  const canvas=$('photoCanvas');
  const ratio=photo.widthMM/photo.heightMM;
  canvas.width=Math.round(Math.min(480,400*ratio));canvas.height=Math.round(canvas.width/ratio);
  const ctx=canvas.getContext('2d');ctx.drawImage(photo.canvas,0,0,canvas.width,canvas.height);
  canvas.setAttribute('aria-label','Cropped grayscale photo. Use the crop sliders or drag the image to reposition it.');
}

function drawFallback(photo,s) {
  if(!photo)return;
  const canvas=$('fallbackCanvas');canvas.hidden=false;
  if(preview?.renderer?.domElement)preview.renderer.domElement.hidden=true;
  const scale=Math.min(550/s.width,550/s.height);canvas.width=Math.ceil(s.width*scale);canvas.height=Math.ceil(s.height*scale);
  const ctx=canvas.getContext('2d');ctx.fillStyle=state.mode==='lit'?'#68553a':'#e9e5dc';ctx.fillRect(0,0,canvas.width,canvas.height);
  const b=s.border*scale;
  let display=photo.canvas;
  if(state.mode==='lit') {
    display=document.createElement('canvas');display.width=photo.nx;display.height=photo.ny;
    const lightCtx=display.getContext('2d'),pixels=lightCtx.createImageData(photo.nx,photo.ny),power=Number($('lightInput').value),k=filamentK(),light=lightRGB();
    for(let i=0,j=0;i<photo.values.length;i++,j+=4){
      const t=s.minThickness+(1-photo.values[i])*(s.maxThickness-s.minThickness);
      const rgb=transmissionRGB(t,k,light,power);
      for(let channel=0;channel<3;channel++)pixels.data[j+channel]=linearToSRGB(rgb[channel]);
      pixels.data[j+3]=255;
    }
    lightCtx.putImageData(pixels,0,0);
  }
  ctx.drawImage(display,b,b,canvas.width-2*b,canvas.height-2*b);
}

function clearReady() {
  if(state.ready)URL.revokeObjectURL(state.ready.url);
  state.ready=null;
  $('downloadResult').hidden=true;
  $('exportLabel').textContent='Download STL';
}

function filamentK() { return absorption($('materialSelect').value,state.colour); }
function lightRGB() { return (LIGHTS[$('lightColourSelect').value]||LIGHTS.warm).rgb; }

const VERDICTS = {
  best:'Best choice. White spreads the light evenly and shows the most detail.',
  good:'Works beautifully — a slightly warmer, softer glow than white.',
  soft:'Very bright but soft. Clear plastic shows the print’s inner walls and lines, and highlights can glare, so it needs a thicker range.',
  dim:'Works, but dimmer: grey plastic soaks up light. Use a bright light and the thinner range below.',
  tint:'Works as a tinted picture: the whole photo glows {colour}, and it’s dimmer than white. Use a bright light and the thinner range below.',
  poor:'Mostly a {colour} silhouette: only {colour} light gets through, so faces and detail fade. Not recommended.',
  none:'Won’t work. Almost no light gets through, so the picture stays dark even with a bright light. Use white.',
};

/** A filament change: re-colour the preview, explain the choice, and (when
 * asked) set the thickness range that suits it. */
function applyFilament(setRange) {
  const colour=COLOURS[state.colour]||COLOURS.white,material=MATERIALS[$('materialSelect').value]||MATERIALS.pla;
  for(const b of $('colourSwatches').children){const on=b.dataset.colour===state.colour;b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1;}
  $('colourVerdict').dataset.verdict=colour.verdict;
  $('colourVerdict').textContent=VERDICTS[colour.verdict].replaceAll('{colour}',colour.name.toLowerCase());
  if(setRange&&colour.verdict!=='none') {
    const [min,max]=recommendedRange($('materialSelect').value,state.colour);
    $('minThicknessInput').value=String(min);$('maxThicknessInput').value=String(max);
    toast(`Thickness set to ${fmt(min)}–${fmt(max)} mm for ${colour.name.toLowerCase()} ${material.name}. A test strip can fine-tune it.`);
  }
  preview?.setFilament(filamentK(),lightRGB(),colour.rgb);
  try { localStorage.setItem('luma-filament',JSON.stringify({material:$('materialSelect').value,colour:state.colour,light:$('lightColourSelect').value})); } catch(error) {}
  if(setRange)changed();else{displayLabels();if((!preview||preview.failed)&&state.photo)drawFallback(state.photo,settings());}
}

/** What each step of the test strip should look like with this filament and light. */
function drawStripKey() {
  const key=$('stripKey');if(!key)return;
  const k=filamentK(),light=lightRGB();
  key.replaceChildren(...STRIP_STEPS.map((t,i)=>{
    const rgb=transmissionRGB(t,k,light,1).map(linearToSRGB),cell=document.createElement('span');
    cell.style.background=`rgb(${rgb.join(',')})`;cell.style.color=rgb[1]>140?'#3a3020':'#f3ead7';
    cell.textContent=`${i+1}`;cell.title=`Step ${i+1}: ${fmt(t)} mm`;
    const mm=document.createElement('small');mm.textContent=`${fmt(t)}`;cell.append(mm);
    return cell;
  }));
}

/* ---------- the light calculator ---------- */
const SHAPE_LIGHT = { flat:'strip', curved:'nightlight', cylinder:'tealight' };
let calcTouched = false, calcResult = null;

/** Put a light's typical brightness and distance in the fields. */
function setLightDefaults() {
  const src=LIGHT_SOURCES[$('lightSource').value];
  $('lightAmount').value=String(src.lux??src.lumens);
  $('lightAmountUnit').textContent=src.lux!==undefined?'lux':'lm';
  $('lightAmountLabel').textContent=src.lux!==undefined?'Brightness on its surface':'Brightness';
  $('lightDistanceField').hidden=!src.point;
  const d=src.distance==='radius'?Number($('diameterInput').value)/2:src.distance==='depth'?Number($('boxDepthInput').value):src.distance;
  if(typeof d==='number'&&Number.isFinite(d))$('lightDistance').value=String(Math.round(d));
  $('lightHint').textContent=src.hint;
}

/** Recompute the advice from the light, the room, the shape and the filament. */
function updateCalculator() {
  if(!$('lightSource').value)return;
  if(!calcTouched)setLightDefaults();      // follow the picture's size until the fields are edited
  const src=LIGHT_SOURCES[$('lightSource').value],amount=Number($('lightAmount').value);
  const flat=state.shape==='flat',d=Number($('diameterInput').value);
  const width=flat?Number($('widthInput').value):state.shape==='cylinder'?Math.PI*d:d/2*Number($('angleInput').value)*Math.PI/180;
  const height=flat?Number($('heightInput').value):Number($('curveHeightInput').value);
  if(!(amount>0)||!(width>0)||!(height>0)){$('calcHeadline').textContent='Enter how bright the light is.';return;}
  calcResult=recommendThickness({source:$('lightSource').value,room:$('roomSelect').value,k:filamentK(),shape:state.shape,width,height,
    lumens:src.lux===undefined?amount:undefined,lux:src.lux!==undefined?amount:undefined,distance:Number($('lightDistance').value)||40});
  $('calcResult').dataset.look=calcResult.look;
  $('calcHeadline').textContent=calcResult.headline;
  $('calcMin').textContent=fmt(calcResult.min);$('calcMax').textContent=fmt(calcResult.max);
  $('calcTips').replaceChildren(...calcResult.tips.map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
  const same=Number($('minThicknessInput').value)===calcResult.min&&Number($('maxThicknessInput').value)===calcResult.max;
  $('calcApplyBtn').textContent=same?'✓ Using these thicknesses':'Use these thicknesses';
}

/* ---------- frames and bases ---------- */
function accessoryChoice() {
  const options=ACCESSORIES[state.shape]||[];
  return options.find(o=>o.id===state.accessory[state.shape])||null;
}

function drawAccessoryCards() {
  const options=ACCESSORIES[state.shape]||[],chosen=state.accessory[state.shape];
  const card=(id,name,blurb)=>{
    const b=document.createElement('button');b.type='button';b.className='accessory-card';b.setAttribute('role','radio');
    b.setAttribute('aria-checked',String(chosen===id));b.dataset.id=id;
    b.innerHTML=`<strong></strong><span></span>`;b.querySelector('strong').textContent=name;b.querySelector('span').textContent=blurb;
    b.addEventListener('click',()=>{if(state.busy)return;state.accessory[state.shape]=id;drawAccessoryCards();render();});
    return b;
  };
  $('accessoryCards').replaceChildren(card('none','Just the picture','Nothing extra'),...options.map(o=>card(o.id,o.name,o.blurb)));
}

/** Build the chosen frame or base for these settings, show it, and offer its files. */
function updateAccessory(s) {
  const choice=accessoryChoice();
  $('accessoryOptions').hidden=!choice;$('depthField').hidden=choice?.id!=='lightbox';
  $('boxDepthValue').textContent=`${$('boxDepthInput').value} mm`;
  state.accessoryParts=[];
  if(!choice){preview?.setAccessories?.([]);return;}
  try {
    const made=choice.make({...s,depth:Number($('boxDepthInput').value)});
    state.accessoryParts=made.parts;
    $('accessoryNotes').textContent=made.notes;
    const show=$('accessoryPreview').checked;
    preview?.setAccessories?.(show?made.parts.map(({mesh})=>{
      const v=new Float32Array(mesh.vertices.length);
      for(let i=0;i<v.length;i+=3)v.set(mesh.place([mesh.vertices[i],mesh.vertices[i+1],mesh.vertices[i+2]]),i);
      return {vertices:v,indices:mesh.indices};
    }):[]);
    const pr=printer(),material=MATERIALS[$('materialSelect').value]||MATERIALS.pla;
    $('accessoryDownloads').replaceChildren(...made.parts.map(part=>{
      const [x,y,z]=part.mesh.size,fit=printerFit({x,y,z},5,pr.bed);
      const b=document.createElement('button');b.type='button';b.className='button button-small accessory-download';
      b.disabled=!fit.objectFits;
      b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg><span></span>';
      b.querySelector('span').textContent=fit.objectFits
        ?`${part.name} · ${fmt(x,0)} × ${fmt(y,0)} × ${fmt(z,0)} mm · about ${fmt(part.mesh.volume/1000*material.density,0)} g`
        :`${part.name} is too large for the ${pr.name}`;
      b.addEventListener('click',()=>downloadAccessory(part));
      return b;
    }));
  } catch(error) {
    $('accessoryNotes').textContent=error.message;$('accessoryDownloads').replaceChildren();preview?.setAccessories?.([]);
  }
}

function downloadAccessory(part) {
  const base=(state.sample?'luma-photo':state.name.replace(/\.[^.]+$/,'')).normalize('NFKD').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,50)||'luma-photo';
  saveBlob(new Blob([binarySTL(part.mesh,{header:`Luma ${part.name} | units: mm | print as it arrives`})],{type:'model/stl'}),`${base}-${part.name.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.stl`);
  toast(`${part.name} saved. Print it exactly as it arrives — no supports needed.`);
}

/** Turn a flat panel to portrait or landscape by swapping its sides. */
function setOrientation(orientation) {
  const w=Number($('widthInput').value),h=Number($('heightInput').value);
  if((orientation==='landscape')===(w>h)||w===h)return false;
  $('widthInput').value=String(h);$('heightInput').value=String(w);
  return true;
}

/** Is the photo, as currently rotated, wider than it is tall? */
function photoIsLandscape() {
  if(!state.source)return false;
  const rotated=state.rotation%180!==0,w=rotated?state.source.height:state.source.width,h=rotated?state.source.width:state.source.height;
  return w>h*1.05;
}

/** A standard print size follows the photo: a wide photo gets a 6 × 4, a tall one a 4 × 6. */
function orientPresetToPhoto(announce) {
  if(state.shape!=='flat'||!['4x6','5x7'].includes($('presetSelect').value))return;
  if(setOrientation(photoIsLandscape()?'landscape':'portrait')&&announce)toast(`Turned to ${photoIsLandscape()?'landscape':'portrait'} to match your photo. Use the Portrait / Landscape buttons to change it.`);
}

function setShape(shape,reset=true) {
  state.shape=shape;
  for(const name of SHAPES)$(`shape-${name}`).setAttribute('aria-pressed',String(shape===name));
  $('flatFields').hidden=shape!=='flat';$('orientField').hidden=shape!=='flat';$('standField').hidden=shape!=='flat';$('curvedFields').hidden=shape==='flat';
  $('angleField').hidden=shape!=='curved';
  drawAccessoryCards();
  if(!calcTouched&&$('lightSource').options.length){$('lightSource').value=SHAPE_LIGHT[shape];setLightDefaults();}
  $('curveHelp').textContent=shape==='cylinder'
    ?'A closed lamp shade that stands over an LED tea light or puck light. Measure your light and allow a few millimetres all round. Use LED lights only.'
    :'Measure your light first. The shade is an open curved panel; a lamp mount is not included.';
  if(reset)changed(true);
}

function setBusy(busy) {
  state.busy=busy;
  const ids=[...fieldIds,...transformIds,'presetSelect','printerSelect','photoInput','exportBtn'];
  if(busy) {
    disabledBefore=new Set(ids.filter(id=>$(id).disabled));
    for(const id of ids)$(id).disabled=true;
  } else {
    for(const id of ids)$(id).disabled=disabledBefore.has(id);
    $('exportBtn').disabled=false;
    if(state.source)render();
  }
  $('progressBar').hidden=!busy;
  $('exportProgress').hidden=!busy;
  if(!busy)$('progressBar').value=0;
}

function normalizeImage(image) {
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  if(!width||!height)throw new Error('This photo has no readable dimensions.');
  const scale=Math.min(1,2200/Math.max(width,height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  return canvas;
}

function decodeImage(url) {
  return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('This browser could not read that photo. Try JPG, PNG, or WebP.'));img.src=url;});
}

let heicPromise;
async function decodeHeic(file) {
  if(!heicPromise)heicPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./vendor/heic2any.min.js';script.onload=resolve;script.onerror=()=>reject(new Error('The iPhone photo decoder could not load. Try exporting the photo as a JPEG.'));document.head.append(script);});
  await heicPromise;
  const result=await window.heic2any({blob:file,toType:'image/jpeg',quality:0.94});
  return Array.isArray(result)?result[0]:result;
}

async function loadPhoto(file) {
  if(!file||state.busy)return;
  if(file.size>60*1024*1024){toast('Choose a photo smaller than 60 MB.');return;}
  if(!/\.(heic|heif)$/i.test(file.name)&&file.type&&!file.type.startsWith('image/')){toast('Choose a photo, such as JPG, PNG, WebP, or HEIC.');return;}
  const loadId=++photoLoadId;setBusy(true);$('viewerStatus').textContent='Opening your photo…';
  let url=URL.createObjectURL(file);
  try {
    let img;
    try {img=await decodeImage(url);} catch(error) {
      if(!/\.(heic|heif)$/i.test(file.name)&&!/hei[cf]/i.test(file.type))throw error;
      $('viewerStatus').textContent='Converting your iPhone photo locally…';
      const converted=await decodeHeic(file);URL.revokeObjectURL(url);url=URL.createObjectURL(converted);img=await decodeImage(url);
    }
    if(loadId!==photoLoadId)return;
    setSource(normalizeImage(img));state.name=file.name||'Pasted photo';state.sample=false;state.rotation=0;state.mirror=false;
    resetPhotoControls();toast('Photo added. Choose the shape and size, then download your STL.');orientPresetToPhoto(true);changed(true);
  } catch(error) {toast(error.message||'That photo could not be opened. Try a JPEG copy.');}
  finally {URL.revokeObjectURL(url);setBusy(false);$('photoInput').value='';}
}

/** A new photo: measure its tones once, so panning the crop never shifts the exposure. */
function setSource(canvas) {
  state.source=canvas;
  const sample=document.createElement('canvas'),scale=Math.min(1,400/Math.max(canvas.width,canvas.height));
  sample.width=Math.max(1,Math.round(canvas.width*scale));sample.height=Math.max(1,Math.round(canvas.height*scale));
  const ctx=sample.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,sample.width,sample.height);
  state.levels=photoLevels(ctx.getImageData(0,0,sample.width,sample.height).data);
}

function resetTone() {
  $('brightnessInput').value='0';$('contrastInput').value='100';$('detailInput').value='35';state.autoTone=true;
}

function resetPhotoControls() {
  $('cropX').value='0';$('cropY').value='0';$('zoomInput').value='1';resetTone();
}

async function loadSample() {
  if(state.busy)return;
  const loadId=++photoLoadId;
  setBusy(true);
  try {
    const img=await decodeImage('./sample.jpg');
    if(loadId!==photoLoadId)return;
    setSource(normalizeImage(img));state.name='Sample · golden retriever';state.sample=true;state.rotation=0;state.mirror=false;
    resetPhotoControls();changed(true);state.loaded=true;
  } catch(error) { $('viewerStatus').textContent='Choose a photo to begin.';toast('The sample did not load. Add your own photo to begin.'); }
  finally { setBusy(false); }
}

function filename(s,prefix='') {
  const base=(state.sample?'luma-photo':state.name.replace(/\.[^.]+$/,'')).normalize('NFKD').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,50)||'luma-photo';
  const size=s.shape==='cylinder'?`lamp-d${s.diameter.toFixed(1)}x${s.height.toFixed(1)}mm`:`${s.shape}-${s.width.toFixed(1)}x${s.height.toFixed(1)}mm`;
  return `${prefix}${base}-${size}.stl`;
}

function triggerDownload(url,name) {
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.style.display='none';document.body.append(anchor);anchor.click();anchor.remove();
}

function saveBlob(blob,name) {
  const url=URL.createObjectURL(blob);triggerDownload(url,name);setTimeout(()=>URL.revokeObjectURL(url),60000);
}

async function generate(settings,photo) {
  const id=++exportId;
  if(typeof Worker==='function') {
    return new Promise((resolve,reject)=> {
      const worker=new Worker('./export-worker.js',{type:'module'});
      const timeout=setTimeout(()=>{worker.terminate();reject(new Error('This export took too long. Choose Standard detail or a smaller panel and try again.'));},90000);
      const finish=()=>{clearTimeout(timeout);worker.terminate();};
      worker.onmessage=({data})=> {
        if(data.id!==id)return;
        if(data.error){finish();reject(new Error(data.error));return;}
        if(data.progress){$('progressBar').value=data.progress;$('exportLabel').textContent=data.message||'Finishing…';}
        if(data.buffer){finish();resolve(data);}
      };
      worker.onerror=()=>{finish();reject(new Error('Your browser could not run the STL generator. Reload the page or try another browser.'));};
      worker.postMessage({id,settings,values:photo.values,nx:photo.nx,ny:photo.ny});
    });
  }
  await new Promise(resolve=>setTimeout(resolve,50));
  const mesh=buildMesh({...settings,values:photo.values,nx:photo.nx,ny:photo.ny});
  return {buffer:binarySTL(mesh),triangleCount:mesh.triangleCount,volume:mesh.signedVolume,bounds:mesh.bounds};
}

async function exportSTL() {
  if(state.busy||!state.source)return;
  if(state.ready&&state.ready.revision===state.revision){triggerDownload(state.ready.url,state.ready.name);return;}
  try {
    const s=settings(),pr=printer(),fit=printerFit(estimateBounds(s),8,pr.bed);
    if(!fit.objectFits)throw new Error(`Make it a little smaller to fit the ${pr.name} before exporting.`);
    const photo=imageField(s,2200);
    const exportRevision=state.revision,exportName=filename(s);
    setBusy(true);$('exportLabel').textContent='Creating your lithophane…';
    const result=await generate(s,photo);
    const actual={x:result.bounds.size[0],y:result.bounds.size[1],z:result.bounds.size[2]};
    if(!printerFit(actual,0,pr.bed).objectFits)throw new Error(`The finished model is larger than the ${pr.name} can build. Reduce its size and try again.`);
    const blob=new Blob([result.buffer],{type:'model/stl'}),url=URL.createObjectURL(blob),name=exportName;
    state.ready={url,name,revision:exportRevision};
    $('downloadReady').href=url;$('downloadReady').download=name;$('downloadReady').textContent=`Save STL · ${fmt(blob.size/1e6,1)} MB`;
    $('downloadResult').hidden=false;
    $('downloadDetails').textContent=`${fmt(actual.x)} × ${fmt(actual.y)} × ${fmt(actual.z)} mm · ${fmt(result.triangleCount,0)} triangles · about ${fmt(result.volume/1000*(MATERIALS[$('materialSelect').value]||MATERIALS.pla).density,0)} g of plastic. Open it in your slicer at 100% scale and print it standing up, exactly as it arrives${s.turn?' — lying on its long edge, with the picture sideways. That’s on purpose: it’s steadier':''}.`;
    triggerDownload(url,name);
    toast('STL created. Open it in your slicer — the print guide has starting settings.');
  } catch(error) {toast(error.message||'Export failed. Try Standard detail.');}
  finally {setBusy(false);$('exportLabel').textContent=state.ready?'Download STL again':'Download STL';}
}

async function exportCalibration() {
  if(state.busy)return;
  try {
    const current=settings();
    const lo=STRIP_STEPS[0],hi=STRIP_STEPS[STRIP_STEPS.length-1];
    const s={...current,shape:'flat',width:70,height:25,border:1.5,resolution:0.25,minThickness:lo,maxThickness:hi,borderThickness:hi,turn:false};
    // Seven flat plateaus run left (bright/thin) to right (dark/thick).
    const nx=281,ny=2,values=new Float32Array(nx*ny);
    for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)values[y*nx+x]=1-Math.min(6,Math.floor(x/(nx-1)*7))/6;
    setBusy(true);$('exportLabel').textContent='Creating thickness test…';
    const result=await generate(s,{values,nx,ny});
    if(state.calibrationURL)URL.revokeObjectURL(state.calibrationURL);
    state.calibrationURL=URL.createObjectURL(new Blob([result.buffer],{type:'model/stl'}));
    const testName=`luma-thickness-test-${s.minThickness.toFixed(1)}-to-${s.maxThickness.toFixed(1)}mm.stl`;
    $('calibrationDownload').href=state.calibrationURL;$('calibrationDownload').download=testName;$('calibrationDownload').hidden=false;
    triggerDownload(state.calibrationURL,testName);
    $('calibrationInfo').textContent=`Your 70 × 25 mm strip runs from thin to thick. Left to right, facing the bumpy side: ${STRIP_STEPS.map(t=>fmt(t)).join(', ')} mm. Print it with the same filament and settings as your photo, hold it in front of the light you’ll really use, and choose under “Read your strip” (section 04).`;
    toast('Test strip created. When it’s printed, choose what you see under “Read your strip”.');
  } catch(error){toast(error.message||'Could not create the test strip.');}
  finally{setBusy(false);$('exportLabel').textContent=state.ready?'Download STL again':'Download STL';}
}

function saveProject() {
  if(!state.source||state.busy)return;
  const data={format:'luma-lithophane',version:1,created:new Date().toISOString(),name:state.name,sample:state.sample,shape:state.shape,rotation:state.rotation,mirror:state.mirror,autoTone:state.autoTone,colour:state.colour,fields:Object.fromEntries(fieldIds.map(id=>[id,$(id).value])),image:state.source.toDataURL('image/jpeg',0.95)};
  saveBlob(new Blob([JSON.stringify(data)],{type:'application/json'}),'luma-project.json');toast('Project saved with the photo and settings. Open it here to continue later.');
}

async function openProject(file) {
  if(!file||state.busy)return;
  if(file.size>25*1024*1024){toast('That project is too large. Choose a Luma project under 25 MB.');return;}
  const previous={source:state.source,levels:state.levels,name:state.name,sample:state.sample,rotation:state.rotation,mirror:state.mirror,autoTone:state.autoTone,colour:state.colour,shape:state.shape,fields:Object.fromEntries(fieldIds.map(id=>[id,$(id).value]))};
  try {
    photoLoadId++;
    setBusy(true);
    const data=JSON.parse(await file.text());
    if(data.format!=='luma-lithophane'||data.version!==1||!data.fields||typeof data.image!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data.image))throw new Error('Choose a valid Luma project file.');
    if(!SHAPES.includes(data.shape)||![0,90,180,270].includes(data.rotation)||typeof data.mirror!=='boolean'||(data.autoTone!==undefined&&typeof data.autoTone!=='boolean'))throw new Error('This project contains invalid settings.');
    for(const id of fieldIds) {
      const el=$(id),value=data.fields[id]===undefined&&id in optionalFields?optionalFields[id]:data.fields[id];
      if(typeof value!=='string'||value.length>30)throw new Error('This project contains invalid settings.');
      if(el.tagName==='SELECT') {
        if(!Array.from(el.options).some(o=>o.value===value))throw new Error('This project contains an unsupported option.');
      } else if(!Number.isFinite(Number(value))||value.trim()===''||Number(value)<Number(el.min)||Number(value)>Number(el.max))throw new Error('This project contains an out-of-range value.');
      el.value=value;
    }
    setShape(data.shape,false);settings();
    const image=await decodeImage(data.image);
    setSource(normalizeImage(image));state.name=String(data.name||'Saved photo').slice(0,150);state.sample=!!data.sample;state.rotation=data.rotation;state.mirror=data.mirror;state.autoTone=data.autoTone??false;state.colour=COLOURS[data.colour]?data.colour:'white';applyFilament(false);
    changed(true);toast('Project opened. Your photo, crop, and print settings are restored.');
  } catch(error) {
    Object.assign(state,{source:previous.source,levels:previous.levels,name:previous.name,sample:previous.sample,rotation:previous.rotation,mirror:previous.mirror,autoTone:previous.autoTone,colour:previous.colour});
    for(const id of fieldIds)$(id).value=previous.fields[id];setShape(previous.shape,false);applyFilament(false);
    toast(error.message||'This project could not be read.');
  } finally {setBusy(false);$('projectInput').value='';}
}

/** The lit preview as a picture to send to whoever the lithophane is for. */
function saveSnapshot() {
  const webgl=preview&&!preview.failed?preview.renderer.domElement:null;
  const source=webgl||$('fallbackCanvas');
  if(!source||!state.photo){toast('Add a photo first.');return;}
  if(webgl)preview.render();   // drawn just now, so the buffer still holds the picture
  const out=document.createElement('canvas');out.width=source.width;out.height=source.height;
  const ctx=out.getContext('2d'),glow=ctx.createRadialGradient(out.width*.4,out.height*.42,0,out.width*.5,out.height*.5,Math.max(out.width,out.height)*.7);
  glow.addColorStop(0,'#33402f');glow.addColorStop(1,'#1b211e');
  ctx.fillStyle=glow;ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(source,0,0);
  const base=(state.sample?'luma-photo':state.name.replace(/\.[^.]+$/,'')).normalize('NFKD').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-|-$/g,'').slice(0,50)||'luma-photo';
  out.toBlob(blob=>{if(!blob){toast('This browser could not save the picture.');return;}saveBlob(blob,`${base}-lithophane-preview.png`);toast('Preview picture saved — send it to whoever it is for.');},'image/png');
}

function openGuide() {
  if(typeof $('printGuide').showModal==='function')$('printGuide').showModal();else $('printGuide').setAttribute('open','');
}

function installGuide() {
  $('guideContent').innerHTML=`
    <p class="guide-intro">One photo. One white filament. A light behind it.</p>
    <ol class="guide-steps">
      <li><strong>Open your STL in your slicer</strong> — Bambu Studio, OrcaSlicer, PrusaSlicer or Cura. Choose your printer, the nozzle actually installed, your build plate and your white PLA. Keep the size at <strong>100%</strong> (the file is in millimetres) and print it <strong>standing up, exactly as it arrives</strong>: the layers then follow the picture, and the light comes through cleanly.</li>
      <li><strong>Start with these settings.</strong> With a 0.4 mm nozzle: <strong>0.12 mm layers</strong>, <strong>4 or more wall loops</strong>, <strong>100% infill</strong> (rectilinear), an <strong>8 mm brim</strong>, and about <strong>40 mm/s</strong> on outer walls. Use your filament profile for temperatures and leave supports off. Every bit of it should be solid plastic — that is what makes thickness into shade.</li>
      <li><strong>Check the slice, then print.</strong> Scrub through the layer preview: the panel should be solid all the way through, the bottom border should sit flat on the plate, and the brim should stay on the plate. A lamp stands on its bottom rim and needs no brim on most printers, but a brim never hurts a tall one.</li>
      <li><strong>Add the light.</strong> Use an LED light and follow its instructions. A flat picture looks best a few centimetres in front of an even light — an LED panel, or a strip or puck light in Luma’s light box. A lamp sits over an LED tea light or puck light in its base. Never use a candle or a hot bulb.</li>
    </ol>
    <div class="guide-note"><strong>Starting settings, ready to tune.</strong> They are good starting points, not a certified profile for any one printer. Every brand of white lets through a slightly different amount of light, so the 20-minute test strip is the quickest way to dial yours in.</div>
    <h3>Why standing up — and on its long edge?</h3>
    <p>The picture lives in the plastic’s thickness. Standing up, the nozzle draws that thickness with its fine side-to-side movement, so tones are smooth. Printed lying flat, the thickness has to be built from stacked layers — every 0.12 mm becomes a visible step, and the picture bands. A tall picture arrives <strong>lying on its long edge</strong>: it’s shorter, so it wobbles less, needs fewer layers and prints faster. Turn it in your slicer if you prefer, but keep it standing.</p>
    <h3>PLA or PETG?</h3>
    <p><strong>White PLA</strong> is the easiest and most predictable. <strong>White PETG</strong> works well too: it usually lets a little more light through, so Luma suggests a slightly thicker range (0.8–3.2 mm), and it copes better with warmth, which is nice for lamps. Print PETG with its own filament profile, a little slower, and expect some stringing.</p>
    <h3>What about other colours?</h3>
    <p>Light has to pass through the plastic, so the colour matters. <strong>White</strong> is best. <strong>Ivory</strong> works and glows warmer. <strong>Light colours</strong> (yellow, pink, sky blue) give a tinted, dimmer picture — use a thinner range and a bright light. <strong>Red and dark colours</strong> show little more than a silhouette, and <strong>black won’t work at all</strong>. <strong>Clear</strong> plastic is bright but shows the print’s inner lines. Tap a colour under “Your filament” to see it in the preview.</p>
    <h3>Which side faces out?</h3>
    <p>The picture reads correctly from the <strong>textured side</strong>, so hang it textured side towards you and the light behind. If you would rather show the smooth back, press <strong>Mirror</strong> before you download — the picture will then read correctly from the smooth side.</p>
    <h3>Getting a stunning print</h3>
    <ul class="guide-tips">
      <li><strong>Choose a photo with a clear subject and good light.</strong> Faces, pets and landscapes with a bright sky make wonderful lithophanes; dark, busy scenes turn muddy.</li>
      <li><strong>Leave Auto-enhance on.</strong> It stretches your photo’s darkest and brightest tones to the full thickness range, which is the single biggest improvement for most photos.</li>
      <li><strong>Use Detail</strong> to keep eyes, fur and edges crisp — light softens a little as it spreads through plastic. Around 30–50% suits most photos; turn it down for skin-smooth portraits.</li>
      <li><strong>Brighten faces, not backgrounds.</strong> If the subject looks heavy with the light on, raise Brightness a little — thin plastic glows, thick plastic holds shadow.</li>
      <li><strong>Bigger is better.</strong> Fine detail needs room: a 4 × 6 in picture shows far more than a postcard-sized one.</li>
    </ul>
    <h3>Fitting your frame or light</h3>
    <p>Flat sizes include the border: a 4 × 6 inch preset makes a 101.6 × 152.4 mm insert. Measure the frame opening and allow the clearance it needs. Curved shades and lamps use the <strong>inside diameter</strong>; for a lamp, leave a few millimetres around your light. No mounting clip is included.</p>
    <h3>Matching your light</h3>
    <p>“Match your light” (section 04) works out a starting range from the light and the room. It estimates how much light reaches the back of the picture — from the brightness on the light’s box and how far away it is — then picks the thinnest areas so highlights glow comfortably for the room, and the thickest so shadows are about a fifteenth as bright. Dim lights get a thinner range, bright ones a thicker one, and it tells you when a light is too weak, too strong, or the room too bright. It’s an estimate from typical figures; the test strip confirms it.</p>
    <h3>Your thickness test</h3>
    <p id="calibrationInfo">“Make a test strip” (section 04) creates a 70 × 25 mm strip with seven steps, 0.6 to 3.6 mm, thin on the left. Print it with your photo’s filament and settings and hold it in front of the light you’ll use. Pick the <strong>thinnest step that’s solid and glows bright</strong> (no gaps or holes) and the <strong>first step that looks almost black</strong>. Choose those under “Read your strip” and Luma uses them. If every step still glows, your light is strong — keep the darkest step. If several on the right look equally black, the first of them is enough.</p>
    <a id="calibrationDownload" class="ready-link" hidden download>Save thickness-test STL</a>
    <h3>Photos and projects</h3>
    <p>Your photo is processed on your device and is never uploaded — this page has nowhere to send it. JPG, PNG, WebP and iPhone HEIC photos work, and you can paste a photo straight from your clipboard. “Save project” downloads your photo and settings together; “Open project” restores them. The page keeps nothing after you close it, apart from remembering which printer you chose.</p>
    <p>Works on a phone, tablet or computer. On an iPhone or iPad, save the STL to Files and send it to the computer that runs your slicer.</p>
    <h3>References</h3>
    <ul class="guide-sources">
      <li><a href="https://store.bblcdn.com/s7/default/2d1a01cd2dca425eb071ccc28c26c9fa/spec.pdf" target="_blank" rel="noopener noreferrer">Bambu Lab P2S specifications</a> — 256 × 256 × 256 mm build volume; stock 0.4 mm nozzle.</li>
      <li><a href="https://csm.bblcdn.com/hub/9425242c00344b0e801b6179f9a243aa.pdf" target="_blank" rel="noopener noreferrer">P2S user manual</a> — model import, layer heights, adhesion, and tall-model stability.</li>
      <li><a href="https://www.prusa3d.com/product/pla-lithophane-filament-1kg/" target="_blank" rel="noopener noreferrer">Prusa lithophane PLA guidance</a> — solid infill and material-specific thickness.</li>
      <li><a href="https://blog.prusa3d.com/let-there-be-light-enter-our-contest-to-win-a-new-original-prusa-i3-mk3s-printer_37744/" target="_blank" rel="noopener noreferrer">Prusa: 3D printed lighting</a> — LED and heat guidance.</li>
    </ul>
    <p class="fine-print">Made by Karl Meves · ERRERLabs, on <a href="/">kmay89.com</a>. Printer names are trademarks of their owners; Luma is independent of all of them. Sample photograph: <a href="https://images.unsplash.com/photo-1552053831-71594a27632d" target="_blank" rel="noopener noreferrer">Unsplash</a>. 3D rendering uses Three.js (MIT); HEIC conversion uses heic2any (MIT). <a href="./third-party-notices.txt" target="_blank" rel="noopener">Third-party notices</a>.</p>`;
  const result=document.createElement('div');result.id='downloadResult';result.className='download-result';result.hidden=true;
  result.innerHTML='<strong>Your lithophane is ready.</strong><a id="downloadReady" class="ready-link" download>Save STL</a><p id="downloadDetails"></p><button id="resultGuideBtn" type="button" class="text-button">Open the print guide →</button>';
  $('exportBtn').parentElement.append(result);
  $('resultGuideBtn').addEventListener('click',openGuide);
}

function init() {
  installGuide();
  try { preview=new LithophanePreview($('viewer'),()=>{if(state.photo&&state.mesh){drawFallback(state.photo,settings());$('viewerStatus').textContent='2D preview · 3D is unavailable on this device';}},()=>{$('fallbackCanvas').hidden=true;render(true);}); }
  catch(error) { preview=null;$('fallbackCanvas').hidden=false; }
  $('uploadBtn').addEventListener('click',()=>$('photoInput').click());
  $('photoInput').addEventListener('change',e=>loadPhoto(e.target.files[0]));
  $('sampleBtn').addEventListener('click',loadSample);
  for(const name of SHAPES)$(`shape-${name}`).addEventListener('click',()=>{ $('presetSelect').value='custom';setShape(name); });
  for(const id of fieldIds)$(id).addEventListener('input',()=>{
    if(sizeIds.includes(id))$('presetSelect').value='custom';
    changed(sizeIds.includes(id));
  });
  $('presetSelect').addEventListener('change',()=>{
    const value=$('presetSelect').value;
    const round={nightlight:['curved',90,115,120],lamp:['cylinder',80,100],lantern:['cylinder',100,150]}[value];
    if(round) {setShape(round[0],false);$('diameterInput').value=String(round[1]);$('curveHeightInput').value=String(round[2]);if(round[3])$('angleInput').value=String(round[3]);}
    else if(value!=='custom') {setShape('flat',false);const sizes={'4x6':[101.6,152.4],'5x7':[127,177.8],square:[150,150]};const size=sizes[value];if(size){$('widthInput').value=String(size[0]);$('heightInput').value=String(size[1]);}orientPresetToPhoto(false);}
    changed(true);
  });
  for(const o of ['portrait','landscape'])$(`orient-${o}`).addEventListener('click',()=>{if(state.busy)return;if(setOrientation(o))changed(true);});
  // Filament: plastic, colour swatches, and the colour of the light behind it.
  for(const [id,c] of Object.entries(COLOURS)) {
    const b=document.createElement('button');b.type='button';b.className='swatch';b.dataset.colour=id;b.setAttribute('role','radio');
    b.setAttribute('aria-label',c.name);b.title=c.name;b.style.setProperty('--swatch',`rgb(${c.rgb.map(v=>Math.round(255*v)).join(',')})`);
    if(c.clear)b.classList.add('clear');
    b.addEventListener('click',()=>{if(state.busy)return;state.colour=id;applyFilament(true);});
    $('colourSwatches').append(b);
  }
  $('colourSwatches').addEventListener('keydown',e=>{
    const ids=Object.keys(COLOURS),step={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];if(!step||state.busy)return;
    e.preventDefault();state.colour=ids[(ids.indexOf(state.colour)+step+ids.length)%ids.length];applyFilament(true);
    $('colourSwatches').querySelector(`[data-colour="${state.colour}"]`).focus();
  });
  try { const saved=JSON.parse(localStorage.getItem('luma-filament')||'null');
    if(saved){ if(MATERIALS[saved.material])$('materialSelect').value=saved.material; if(COLOURS[saved.colour])state.colour=saved.colour; if(LIGHTS[saved.light])$('lightColourSelect').value=saved.light;
      if(saved.material!=='pla'||saved.colour!=='white'){const [min,max]=recommendedRange($('materialSelect').value,state.colour);$('minThicknessInput').value=String(min);$('maxThicknessInput').value=String(max);} } } catch(error) {}
  $('materialSelect').addEventListener('change',()=>applyFilament(true));
  $('lightColourSelect').addEventListener('change',()=>applyFilament(false));
  $('filamentResetBtn').addEventListener('click',()=>applyFilament(true));
  for(const [i,t] of STRIP_STEPS.entries())for(const id of ['stripLight','stripDark']){const o=document.createElement('option');o.value=String(t);o.textContent=`${i+1} · ${fmt(t)} mm`;$(id).append(o);}
  $('stripLight').value=String(STRIP_STEPS[1]);$('stripDark').value=String(STRIP_STEPS[5]);
  $('stripApplyBtn').addEventListener('click',()=>{
    const light=Number($('stripLight').value),dark=Number($('stripDark').value);
    if(dark-light<1){toast('The dark step needs to be at least two steps to the right of the bright one — otherwise there’s no room for the picture’s tones.');return;}
    $('minThicknessInput').value=String(light);$('maxThicknessInput').value=String(dark);changed();
    toast(`Using ${fmt(light)}–${fmt(dark)} mm, from your test strip.`);
  });
  for(const p of PRINTERS){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;$('printerSelect').append(option);}
  try { const saved=localStorage.getItem('luma-printer'); if(PRINTERS.some(p=>p.id===saved))$('printerSelect').value=saved; } catch(error) {}
  $('printerSelect').addEventListener('change',()=>{ try { localStorage.setItem('luma-printer',$('printerSelect').value); } catch(error) {} render(); });
  $('autoToneBtn').addEventListener('click',()=>{state.autoTone=!state.autoTone;changed();});
  $('snapshotBtn').addEventListener('click',saveSnapshot);
  for(const [id,src] of Object.entries(LIGHT_SOURCES)){const o=document.createElement('option');o.value=id;o.textContent=src.name;$('lightSource').append(o);}
  for(const [id,room] of Object.entries(ROOMS)){const o=document.createElement('option');o.value=id;o.textContent=room.name;$('roomSelect').append(o);}
  $('roomSelect').value='dim';$('lightSource').value=SHAPE_LIGHT.flat;setLightDefaults();
  $('lightSource').addEventListener('change',()=>{calcTouched=true;setLightDefaults();updateCalculator();});
  for(const id of ['roomSelect','lightAmount','lightDistance'])$(id).addEventListener('input',()=>{calcTouched=true;updateCalculator();});
  $('calcApplyBtn').addEventListener('click',()=>{
    if(!calcResult||state.busy)return;
    $('minThicknessInput').value=String(calcResult.min);$('maxThicknessInput').value=String(calcResult.max);
    $('lightInput').value=String(Math.round(calcResult.previewPower*20)/20);preview?.setLight(Number($('lightInput').value));
    changed();toast(`Using ${fmt(calcResult.min)}–${fmt(calcResult.max)} mm for your light (${LIGHT_SOURCES[$('lightSource').value].name}). The preview’s backlight now matches it.`);
  });
  $('boxDepthInput').addEventListener('input',()=>{clearTimeout(renderTimer);renderTimer=setTimeout(()=>render(),80);$('boxDepthValue').textContent=`${$('boxDepthInput').value} mm`;});
  $('accessoryPreview').addEventListener('change',()=>render());
  $('rotateBtn').addEventListener('click',()=>{state.rotation=(state.rotation+90)%360;$('cropX').value='0';$('cropY').value='0';changed();});
  $('mirrorBtn').addEventListener('click',()=>{state.mirror=!state.mirror;changed();});
  $('resetToneBtn').addEventListener('click',()=>{resetTone();changed();});
  for(const mode of ['lit','solid'])$(`preview-${mode}`).addEventListener('click',()=>{
    state.mode=mode;
    $('preview-lit').setAttribute('aria-pressed',String(mode==='lit'));$('preview-solid').setAttribute('aria-pressed',String(mode==='solid'));
    preview?.setMode(mode);if(!preview||preview.failed)drawFallback(state.photo,settings());render();
  });
  $('resetViewBtn').addEventListener('click',()=>preview?.resetView());
  $('lightInput').addEventListener('input',()=>{displayLabels();preview?.setLight(Number($('lightInput').value));if((!preview||preview.failed)&&state.photo)drawFallback(state.photo,settings());});
  $('exportBtn').addEventListener('click',exportSTL);
  $('calibrationBtn').addEventListener('click',exportCalibration);
  $('projectSaveBtn').addEventListener('click',saveProject);
  $('projectOpenBtn').addEventListener('click',()=>$('projectInput').click());
  $('projectInput').addEventListener('change',e=>openProject(e.target.files[0]));
  $('guideBtn').addEventListener('click',openGuide);
  $('guideCloseBtn').addEventListener('click',()=>{if(typeof $('printGuide').close==='function')$('printGuide').close();else $('printGuide').removeAttribute('open');});
  $('printGuide').addEventListener('click',e=>{if(e.target===$('printGuide'))$('guideCloseBtn').click();});
  // A photo dropped anywhere on the page is taken, not just one dropped on the box.
  const hasFile=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
  for(const name of ['dragenter','dragover'])document.addEventListener(name,e=>{if(!hasFile(e))return;e.preventDefault();$('dropZone').classList.add('drag-over');});
  for(const name of ['dragleave','drop'])document.addEventListener(name,e=>{if(!hasFile(e))return;e.preventDefault();if(name==='drop'||!e.relatedTarget)$('dropZone').classList.remove('drag-over');});
  document.addEventListener('drop',e=>{if(!hasFile(e))return;const file=e.dataTransfer.files[0];if(/\.json$/i.test(file?.name||''))openProject(file);else loadPhoto(file);});
  document.addEventListener('paste',e=>{
    if(e.target.closest?.('input,textarea'))return;
    const item=Array.from(e.clipboardData?.items||[]).find(i=>i.kind==='file'&&i.type.startsWith('image/'));
    const file=item?.getAsFile();if(!file)return;
    e.preventDefault();loadPhoto(file.name&&file.name!=='image.png'?file:new File([file],'Pasted photo.png',{type:file.type}));
  });
  const photoCanvas=$('photoCanvas');let drag;
  photoCanvas.style.touchAction='none';photoCanvas.style.cursor='grab';
  photoCanvas.addEventListener('pointerdown',e=>{if(state.busy)return;drag={x:e.clientX,y:e.clientY,cx:Number($('cropX').value),cy:Number($('cropY').value)};photoCanvas.setPointerCapture(e.pointerId);});
  photoCanvas.addEventListener('pointermove',e=>{if(!drag||state.busy)return;const rect=photoCanvas.getBoundingClientRect();$('cropX').value=String(clamp(drag.cx+(e.clientX-drag.x)/rect.width*200,-100,100));$('cropY').value=String(clamp(drag.cy+(e.clientY-drag.y)/rect.height*200,-100,100));changed();});
  for(const name of ['pointerup','pointercancel'])photoCanvas.addEventListener(name,()=>{drag=null;});
  const zoomBy=factor=>{const z=$('zoomInput');z.value=String(clamp(Number(z.value)*factor,Number(z.min),Number(z.max)));changed();};
  photoCanvas.addEventListener('wheel',e=>{if(state.busy)return;e.preventDefault();zoomBy(Math.exp(-e.deltaY*0.0015));},{passive:false});
  photoCanvas.addEventListener('dblclick',()=>{if(state.busy)return;$('cropX').value='0';$('cropY').value='0';$('zoomInput').value='1';changed();});
  // Two fingers on the crop: pinch to zoom, alongside the one-finger drag above.
  const touches=new Map();let pinch=null;
  photoCanvas.addEventListener('pointerdown',e=>{if(e.pointerType!=='touch')return;touches.set(e.pointerId,[e.clientX,e.clientY]);if(touches.size===2){const [a,b]=[...touches.values()];pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1]),z:Number($('zoomInput').value)};drag=null;}});
  photoCanvas.addEventListener('pointermove',e=>{if(!touches.has(e.pointerId))return;touches.set(e.pointerId,[e.clientX,e.clientY]);if(pinch&&touches.size===2&&!state.busy){const [a,b]=[...touches.values()];$('zoomInput').value=String(clamp(pinch.z*Math.hypot(a[0]-b[0],a[1]-b[1])/Math.max(1,pinch.d),1,3));changed();}});
  for(const name of ['pointerup','pointercancel'])photoCanvas.addEventListener(name,e=>{touches.delete(e.pointerId);if(touches.size<2)pinch=null;});
  window.addEventListener('beforeunload',()=>{if(state.ready)URL.revokeObjectURL(state.ready.url);if(state.calibrationURL)URL.revokeObjectURL(state.calibrationURL);});
  applyFilament(false);setShape('flat',false);loadSample();
}

init();
