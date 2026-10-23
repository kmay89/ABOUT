/**
 * Cameo — the two models. Background removal (BRIA RMBG 1.4) and depth
 * estimation (Depth Anything V2, small) run in the browser through
 * transformers.js and ONNX Runtime Web. This is the one place the studio
 * reaches the network: the library comes from jsDelivr and the weights
 * (about 45 MB and 25 MB) from the Hugging Face hub, the first time only;
 * the browser caches both. Nothing is sent anywhere — the photo never
 * leaves the page. If the library or a model cannot be fetched, every
 * function here rejects and the page carries on with the wand and brush.
 */

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js';
const MODELS = {
  cutout: 'briaai/RMBG-1.4',
  depth: 'onnx-community/depth-anything-v2-small',
};

let libPromise = null;
export function library() {
  if (!libPromise) {
    libPromise = import(/* webpackIgnore: true */ LIB).then(t => {
      t.env.allowLocalModels = false;
      t.env.useBrowserCache = true;
      return t;
    }).catch(() => { libPromise = null; throw new Error('the AI library could not be fetched — no network, or a blocker in the way'); });
  }
  return libPromise;
}

const loaded = {};
async function device() {
  // WebGPU where it exists; the WASM backend elsewhere (slower but fine)
  try { if (typeof navigator !== 'undefined' && navigator.gpu && await navigator.gpu.requestAdapter()) return 'webgpu'; } catch { /* fall through */ }
  return 'wasm';
}

/**
 * Cut the subject out: returns { alpha: Uint8Array (0–255, width × height) }
 * at the given image's size. `image` is an HTMLImageElement, canvas or
 * ImageBitmap; `onProgress` gets the library's progress events.
 */
export async function removeBackground(image, { onProgress } = {}) {
  const t = await library();
  if (!loaded.cutout) {
    loaded.cutout = (async () => {
      const dev = await device();
      const model = await t.AutoModel.from_pretrained(MODELS.cutout, { config: { model_type: 'custom' }, device: dev, dtype: 'fp32', progress_callback: onProgress });
      const processor = await t.AutoProcessor.from_pretrained(MODELS.cutout, {
        config: { do_normalize: true, do_pad: false, do_rescale: true, do_resize: true, image_mean: [0.5, 0.5, 0.5], feature_extractor_type: 'ImageFeatureExtractor', image_std: [1, 1, 1], resample: 2, rescale_factor: 0.00392156862745098, size: { width: 1024, height: 1024 } },
      });
      return { model, processor };
    })().catch(err => { loaded.cutout = null; throw err; });
  }
  const { model, processor } = await loaded.cutout;
  const raw = await toRawImage(t, image);
  const { pixel_values } = await processor(raw);
  const { output } = await model({ input: pixel_values });
  const maskImage = await t.RawImage.fromTensor(output[0].mul(255).to('uint8')).resize(raw.width, raw.height);
  return { alpha: new Uint8Array(maskImage.data), width: raw.width, height: raw.height };
}

/**
 * Estimate depth: returns { depth: Float32Array (bigger = nearer), width, height }
 * at the image's size.
 */
export async function estimateDepth(image, { onProgress } = {}) {
  const t = await library();
  if (!loaded.depth) {
    loaded.depth = (async () => {
      const dev = await device();
      return t.pipeline('depth-estimation', MODELS.depth, { device: dev, dtype: dev === 'webgpu' ? 'fp32' : 'q8', progress_callback: onProgress });
    })().catch(err => { loaded.depth = null; throw err; });
  }
  const pipe = await loaded.depth;
  const raw = await toRawImage(t, image);
  const { predicted_depth } = await pipe(raw);
  // predicted_depth is a tensor [1, h, w] (or [h, w]) in the model's resolution; resample to the image
  const dims = predicted_depth.dims, h = dims[dims.length - 2], w = dims[dims.length - 1];
  const data = predicted_depth.data;
  const out = new Float32Array(raw.width * raw.height);
  for (let y = 0; y < raw.height; y++) {
    const fy = Math.min(h - 1, (y + 0.5) * h / raw.height - 0.5), y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < raw.width; x++) {
      const fx = Math.min(w - 1, (x + 0.5) * w / raw.width - 0.5), x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      out[y * raw.width + x] = (data[y0 * w + x0] * (1 - tx) + data[y0 * w + x1] * tx) * (1 - ty) + (data[y1 * w + x0] * (1 - tx) + data[y1 * w + x1] * tx) * ty;
    }
  }
  return { depth: out, width: raw.width, height: raw.height };
}

async function toRawImage(t, image) {
  if (image instanceof t.RawImage) return image;
  const canvas = image instanceof HTMLCanvasElement ? image : (() => { const c = document.createElement('canvas'); c.width = image.naturalWidth || image.width; c.height = image.naturalHeight || image.height; c.getContext('2d').drawImage(image, 0, 0); return c; })();
  const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
  return t.RawImage.fromBlob(blob);
}

export const MODEL_NAMES = MODELS;
