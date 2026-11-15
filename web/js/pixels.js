// Pixel maths for the simple edits. Works on RGBA byte arrays, so the same
// code runs in the browser (canvas ImageData) and in Node tests.

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** amount: -1…+1 (0 = no change). */
export function brightness(data, amount) {
  const f = 1 + amount;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(data[i] * f);
    data[i + 1] = clamp(data[i + 1] * f);
    data[i + 2] = clamp(data[i + 2] * f);
  }
  return data;
}

export function contrast(data, amount) {
  const f = 1 + amount;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp((data[i] - 128) * f + 128);
    data[i + 1] = clamp((data[i + 1] - 128) * f + 128);
    data[i + 2] = clamp((data[i + 2] - 128) * f + 128);
  }
  return data;
}

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** amount: -1 (grey) … +1 (double saturation). */
export function saturation(data, amount) {
  const f = 1 + amount;
  for (let i = 0; i < data.length; i += 4) {
    const y = luma(data[i], data[i + 1], data[i + 2]);
    data[i] = clamp(y + (data[i] - y) * f);
    data[i + 1] = clamp(y + (data[i + 1] - y) * f);
    data[i + 2] = clamp(y + (data[i + 2] - y) * f);
  }
  return data;
}

export function grayscale(data) {
  return saturation(data, -1);
}

export function sepia(data) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    data[i] = clamp(0.393 * r + 0.769 * g + 0.189 * b);
    data[i + 1] = clamp(0.349 * r + 0.686 * g + 0.168 * b);
    data[i + 2] = clamp(0.272 * r + 0.534 * g + 0.131 * b);
  }
  return data;
}

export function invert(data) {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
  return data;
}

/** Largest centred rectangle with the given aspect ratio. */
export function cropRect(width, height, [rw, rh]) {
  const target = rw / rh;
  let w = width, h = height;
  if (width / height > target) w = Math.round(height * target);
  else h = Math.round(width / target);
  return { x: Math.floor((width - w) / 2), y: Math.floor((height - h) / 2), width: w, height: h };
}

export const COLOUR_OPS = { brightness, contrast, saturation, grayscale, sepia, invert };
