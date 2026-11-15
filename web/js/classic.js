// Simple edits that run on the visitor's device (no AI, no quota, no upload).

import { COLOUR_OPS, cropRect } from "./pixels.js";

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Decode an image file (respecting phone rotation) into a canvas, optionally shrunk. */
export async function fileToCanvas(file, maxSide = 4096) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw Object.assign(new Error("That file isn't a photo this browser can open. Use JPG, PNG or WebP."), { code: "unsupported_format" });
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = makeCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

export function shrink(canvas, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  if (scale === 1) return canvas;
  const out = makeCanvas(Math.round(canvas.width * scale), Math.round(canvas.height * scale));
  out.getContext("2d").drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

function applyOne(canvas, op) {
  if (op.op === "crop") {
    const r = cropRect(canvas.width, canvas.height, op.ratio);
    const out = makeCanvas(r.width, r.height);
    out.getContext("2d").drawImage(canvas, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
    return out;
  }
  if (op.op === "rotate") {
    const quarter = op.degrees === 90 || op.degrees === 270;
    const out = makeCanvas(quarter ? canvas.height : canvas.width, quarter ? canvas.width : canvas.height);
    const ctx = out.getContext("2d");
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate((op.degrees * Math.PI) / 180);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return out;
  }
  if (op.op === "flip") {
    const out = makeCanvas(canvas.width, canvas.height);
    const ctx = out.getContext("2d");
    if (op.axis === "horizontal") {
      ctx.translate(out.width, 0);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(0, out.height);
      ctx.scale(1, -1);
    }
    ctx.drawImage(canvas, 0, 0);
    return out;
  }
  const fn = COLOUR_OPS[op.op];
  if (!fn) return canvas;
  const out = makeCanvas(canvas.width, canvas.height);
  const ctx = out.getContext("2d");
  ctx.drawImage(canvas, 0, 0);
  const image = ctx.getImageData(0, 0, out.width, out.height);
  fn(image.data, op.amount);
  ctx.putImageData(image, 0, 0);
  return out;
}

export function applyOps(canvas, ops) {
  return ops.reduce(applyOne, canvas);
}

export function canvasToBlob(canvas, type = "image/png", quality = 0.92) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not save the image."))), type, quality)
  );
}

/** Small "AI-edited" label in the corner, for honest sharing. */
export function addLabel(canvas, text = "AI-edited") {
  const out = makeCanvas(canvas.width, canvas.height);
  const ctx = out.getContext("2d");
  ctx.drawImage(canvas, 0, 0);
  const size = Math.max(12, Math.round(Math.min(out.width, out.height) * 0.028));
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  const pad = size * 0.5;
  const w = ctx.measureText(text).width + pad * 2;
  const h = size + pad * 1.2;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(out.width - w - pad, out.height - h - pad, w, h);
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, out.width - w, out.height - pad - h / 2);
  return out;
}

// ── video helpers ───────────────────────────────────────────────────────────

function loadVideo(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);
    video.onloadedmetadata = () => resolve(video);
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(Object.assign(new Error("That file isn't a video this browser can open. Use MP4, MOV or WebM."), { code: "unsupported_format" }));
    };
  });
}

export async function videoDuration(file) {
  const video = await loadVideo(file);
  const seconds = video.duration;
  URL.revokeObjectURL(video.src);
  return seconds;
}

/** Grab `count` evenly spaced frames from a video as JPEG blobs (used for reference videos). */
export async function videoFrames(file, count = 1, maxSide = 1024) {
  const video = await loadVideo(file);
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  const blobs = [];
  for (let i = 0; i < count; i++) {
    const t = duration * ((i + 1) / (count + 1));
    await new Promise((resolve, reject) => {
      video.onseeked = resolve;
      video.onerror = reject;
      video.currentTime = t;
    });
    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
    const canvas = makeCanvas(Math.round(video.videoWidth * scale), Math.round(video.videoHeight * scale));
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    blobs.push(await canvasToBlob(canvas, "image/jpeg", 0.92));
  }
  URL.revokeObjectURL(video.src);
  return blobs;
}
