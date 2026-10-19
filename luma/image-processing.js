export const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

/** Compute photo placement without stretching, before rasterization. */
export function imagePlacement(sourceWidth, sourceHeight, targetWidth, targetHeight, { fit = 'cover', zoom = 1, cropX = 0, cropY = 0 } = {}) {
  const base = fit === 'contain' ? Math.min(targetWidth/sourceWidth,targetHeight/sourceHeight) : Math.max(targetWidth/sourceWidth,targetHeight/sourceHeight);
  const scale = base * zoom, width = sourceWidth * scale, height = sourceHeight * scale;
  const movableX = Math.abs(width-targetWidth)/2, movableY = Math.abs(height-targetHeight)/2;
  return { width, height, x:(targetWidth-width)/2 + clamp(cropX,-100,100)/100*movableX, y:(targetHeight-height)/2 + clamp(cropY,-100,100)/100*movableY };
}

/** Photo luminance in display space, mapped consistently to thickness and preview.
 * levels, when given, is the photo's own black and white point (see photoLevels):
 * the tones between them are stretched to fill the whole thickness range first. */
export function grayscale(rgba, { brightness = 0, contrast = 100, levels = null } = {}) {
  const values = new Float32Array(rgba.length/4);
  const lo = levels ? levels.lo : 0, span = levels ? Math.max(0.05, levels.hi - levels.lo) : 1;
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    const alpha = rgba[i+3]/255;
    let gray = ((0.2126*rgba[i] + 0.7152*rgba[i+1] + 0.0722*rgba[i+2])/255)*alpha + 1-alpha;
    if (levels) gray = clamp((gray-lo)/span,0,1);
    values[j] = clamp((gray-0.5)*(contrast/100)+0.5+brightness/100,0,1);
  }
  return values;
}

/** A photo's black and white points: the luminance below which its darkest
 * 0.5% of pixels fall, and above which its brightest 0.5% do. Most photos never
 * reach true black or white, and a lithophane only shows the tones it is given,
 * so stretching these to the ends of the range is the single biggest gain in
 * how a print looks. Ignores transparent pixels. */
export function photoLevels(rgba, clip = 0.005) {
  const histogram = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i+3] < 128) continue;
    histogram[Math.round(0.2126*rgba[i] + 0.7152*rgba[i+1] + 0.0722*rgba[i+2])]++;
    total++;
  }
  if (!total) return { lo:0, hi:1 };
  const cut = total * clip;
  let lo = 0, hi = 255, sum = 0;
  for (; lo < 255; lo++) { sum += histogram[lo]; if (sum > cut) break; }
  for (sum = 0; hi > 0; hi--) { sum += histogram[hi]; if (sum > cut) break; }
  if (hi - lo < 24) return { lo:0, hi:1 };        // a nearly flat photo: leave it alone
  return { lo:lo/255, hi:hi/255 };
}

/** Local contrast, in place: an unsharp mask whose radius is a physical size.
 * Light spreads a little inside the plastic, which softens fine detail; giving
 * edges a small push before they become thickness wins that detail back.
 * The blur is two passes of a separable box filter (close to a Gaussian). */
export function enhanceDetail(values, nx, ny, radiusPx, amount) {
  const r = Math.round(radiusPx);
  if (!(amount > 0) || r < 1 || nx < 3 || ny < 3) return values;
  const blur = Float32Array.from(values), scratch = new Float32Array(values.length);
  const pass = (from, to, length, count, stride, step) => {
    for (let line = 0; line < count; line++) {
      const base = line * stride;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += from[base + clamp(k,0,length-1) * step];
      for (let k = 0; k < length; k++) {
        to[base + k * step] = sum / (2*r + 1);
        sum += from[base + Math.min(k + r + 1, length - 1) * step] - from[base + Math.max(k - r, 0) * step];
      }
    }
  };
  for (let n = 0; n < 2; n++) {
    pass(blur, scratch, nx, ny, nx, 1);
    pass(scratch, blur, ny, nx, 1, nx);
  }
  for (let i = 0; i < values.length; i++) values[i] = clamp(values[i] + amount * (values[i] - blur[i]), 0, 1);
  return values;
}

export function estimateBounds(settings) {
  const thickness = Math.max(settings.maxThickness, settings.borderThickness || 0);
  if (settings.shape === 'flat') return { x:settings.width, y:thickness, z:settings.height };
  if (settings.shape === 'cylinder') {
    const outside = settings.width/Math.PI + 2*thickness;
    return { x:outside, y:outside, z:settings.height };
  }
  const theta=settings.angleDeg*Math.PI/180, radius=settings.width/theta;
  return { x:2*(radius+thickness)*Math.sin(theta/2), y:radius*(1-Math.cos(theta/2))+thickness, z:settings.height };
}

/** Does a model stand on this printer's plate? The bed defaults to the P2S's
 * 256 mm cube. The footprint may be turned a quarter on the plate, so a long
 * panel fits a rectangular bed either way round. */
export function printerFit(dimensions, brim = 8, bed = { x:256, y:256, z:256 }) {
  const finite = Object.values(dimensions).every(v=>Number.isFinite(v)&&v>0);
  const footprint = (gx, gy) => (dimensions.x+gx<=bed.x && dimensions.y+gy<=bed.y) || (dimensions.x+gx<=bed.y && dimensions.y+gy<=bed.x);
  const objectFits=finite && dimensions.z<=bed.z && footprint(0,0);
  const brimFits=objectFits && footprint(2*brim,2*brim);
  return { objectFits, brimFits, fits:objectFits && brimFits };
}

export function safeResolution(width,height,requested,maxVertices = 1050000) {
  // Allow for the border breakpoints, transition rows and both surfaces.
  let step=requested;
  while (2*(Math.ceil(width/step)+10)*(Math.ceil(height/step)+10)>maxVertices) step=Math.ceil((step+0.01)*100)/100;
  return step;
}
