import test from "node:test";
import assert from "node:assert/strict";
import {
  route, classifyClause, splitClauses, checkAllowed,
  buildPhotoPrompt, buildVideoPrompt, outputSize, friendlyError, PRESETS,
} from "../js/router.js";
import * as px from "../js/pixels.js";

const photo = (instruction, referenceCount = 0) => route({ kind: "photo", instruction, referenceCount });
const video = (instruction, referenceCount = 0) => route({ kind: "video", instruction, referenceCount });

// ── classic-only instructions (no AI, no quota) ─────────────────────────────
const CLASSIC = [
  ["make it brighter", "brightness", +1],
  ["brighter", "brightness", +1],
  ["Make the photo a bit brighter please", "brightness", +1],
  ["isko bright karo", "brightness", +1],
  ["thora roshan karo", "brightness", +1],
  ["make it darker", "brightness", -1],
  ["much darker", "brightness", -1],
  ["andhera karo", "brightness", -1],
  ["more contrast", "contrast", +1],
  ["less contrast", "contrast", -1],
  ["make it more colorful", "saturation", +1],
  ["more vivid", "saturation", +1],
  ["isko rangeen karo", "saturation", +1],
  ["desaturate it", "saturation", -1],
  ["black and white", "grayscale"],
  ["make it black and white", "grayscale"],
  ["b&w", "grayscale"],
  ["grayscale", "grayscale"],
  ["sepia", "sepia"],
  ["invert colors", "invert"],
  ["rotate left", "rotate"],
  ["rotate right", "rotate"],
  ["rotate 180", "rotate"],
  ["flip it", "flip"],
  ["mirror", "flip"],
  ["flip vertically", "flip"],
  ["crop to square", "crop"],
  ["crop 9:16", "crop"],
  ["crop for youtube", "crop"],
  ["crop for instagram", "crop"],
];

for (const [text, op, sign] of CLASSIC) {
  test(`classic: "${text}" → ${op}`, () => {
    const r = photo(text);
    assert.equal(r.error, undefined);
    assert.equal(r.aiInstruction, "");
    assert.equal(r.classicOps.length, 1);
    assert.equal(r.classicOps[0].op, op);
    if (sign) assert.equal(Math.sign(r.classicOps[0].amount), sign);
  });
}

// ── instructions that must go to the AI ─────────────────────────────────────
const AI = [
  "make the sky purple",
  "turn me into an anime character",
  "make the dark sky brighter", // mentions a specific thing → not a global tweak
  "remove the background",
  "add a hat",
  "make it look like winter",
  "make it look like a bright sunny day",
  "change the car to a square shape",
  "put me in a dark forest",
  "isko cartoon bana do",
  "give it a vintage film look",
  "make the mirror on the wall bigger",
];

for (const text of AI) {
  test(`ai: "${text}"`, () => {
    const r = photo(text);
    assert.equal(r.error, undefined);
    assert.deepEqual(r.classicOps, []);
    assert.equal(r.aiInstruction, text);
  });
}

test("mixed: classic first, the rest goes to AI", () => {
  const r = photo("crop to square and make it brighter, then turn it into anime");
  assert.deepEqual(r.classicOps.map((o) => o.op), ["crop", "brightness"]);
  assert.equal(r.aiInstruction, "turn it into anime");
});

test("mixed Roman Urdu: 'isko bright karo aur cartoon bana do'", () => {
  const r = photo("isko bright karo aur cartoon bana do");
  assert.deepEqual(r.classicOps.map((o) => o.op), ["brightness"]);
  assert.equal(r.aiInstruction, "cartoon bana do");
});

test("'black and white' is not split on 'and'", () => {
  assert.deepEqual(splitClauses("black and white and brighter"), ["black and white", "brighter"]);
});

test("amounts: small, default, big, percent", () => {
  const amt = (t) => classifyClause(t).amount;
  assert.ok(amt("a bit brighter") < amt("brighter"));
  assert.ok(amt("much brighter") > amt("brighter"));
  assert.equal(amt("brighter by 50%"), 0.5);
  assert.equal(amt("darker 30%"), -0.3);
});

test("rotate and crop details", () => {
  assert.equal(classifyClause("rotate left").degrees, 270);
  assert.equal(classifyClause("rotate").degrees, 90);
  assert.equal(classifyClause("upside down").degrees, 180);
  assert.equal(classifyClause("flip").axis, "horizontal");
  assert.deepEqual(classifyClause("crop to square").ratio, [1, 1]);
  assert.deepEqual(classifyClause("crop for tiktok").ratio, [9, 16]);
});

test("empty instruction with no reference is an error", () => {
  assert.equal(photo("   ").error.code, "empty");
});

test("reference with no instruction → edit like the reference", () => {
  assert.equal(photo("", 1).aiInstruction, "Edit it like the reference");
});

test("classic-only instruction with a reference stays classic and says so", () => {
  const r = photo("make it brighter", 1);
  assert.equal(r.aiInstruction, "");
  assert.equal(r.notes.length, 1);
});

// ── safety ──────────────────────────────────────────────────────────────────
for (const text of ["make her nude", "remove her clothes", "undress him", "nsfw version", "swap my face with this actor", "face swap", "make a deepfake"]) {
  test(`blocked: "${text}"`, () => {
    assert.equal(photo(text).error.code, "content_blocked");
    assert.equal(video(text).error.code, "content_blocked");
  });
}

test("ordinary requests are not blocked", () => {
  for (const text of ["remove the background", "make my face brighter", "film strip look", "change clothes colour to red"]) {
    assert.equal(checkAllowed(text), null, text);
  }
});

// ── video ───────────────────────────────────────────────────────────────────
test("video: style edit goes to AI, never classic", () => {
  const r = video("make it brighter");
  assert.deepEqual(r.classicOps, []);
  assert.equal(r.aiInstruction, "make it brighter");
});

test("video: trim-only request explains it isn't built yet", () => {
  assert.equal(video("trim to first 3 seconds").error.code, "not_built");
  assert.equal(video("pehle 5 second").error.code, "not_built");
});

test("video: trim + style keeps the style part and adds a note", () => {
  const r = video("trim to first 3 seconds and make it snowy");
  assert.equal(r.error, undefined);
  assert.equal(r.aiInstruction, "make it snowy");
  assert.equal(r.notes.length, 1);
});

// ── prompts ─────────────────────────────────────────────────────────────────
test("photo prompt without a reference protects the rest of the image", () => {
  const p = buildPhotoPrompt("make the sky purple");
  assert.match(p, /^Make the sky purple\. Keep everything else/);
});

test("photo prompt with a style reference", () => {
  const p = buildPhotoPrompt("edit it like this", 1);
  assert.match(p, /match image 2/);
  assert.match(p, /Keep the people, faces, pose/);
});

test("photo prompt with an object reference", () => {
  const p = buildPhotoPrompt("put this jacket on me", 1);
  assert.match(p, /place it naturally in image 1/);
});

test("photo prompt with several references names them all", () => {
  assert.match(buildPhotoPrompt("same vibe", 3), /images 2 to 4/);
});

test("video prompts preserve motion", () => {
  assert.match(buildVideoPrompt("make it snowy"), /Preserve the original motion, camera movement/);
  assert.match(buildVideoPrompt("like this", true), /Use the reference image/);
});

test("presets all route without errors", () => {
  for (const preset of PRESETS) {
    assert.equal(photo(preset.text, preset.needsReference ? 1 : 0).error, undefined, preset.label);
  }
});

// ── helpers ─────────────────────────────────────────────────────────────────
test("outputSize keeps shape and uses multiples of 16", () => {
  assert.deepEqual(outputSize(4000, 3000), { width: 1024, height: 768 });
  assert.deepEqual(outputSize(1080, 1920), { width: 576, height: 1024 });
  const s = outputSize(1234, 777);
  assert.equal(s.width % 16, 0);
  assert.equal(s.height % 16, 0);
});

test("friendlyError maps common failures", () => {
  assert.equal(friendlyError(new Error("You have exceeded your GPU quota (60s requested)")).code, "quota_exceeded");
  assert.equal(friendlyError("Failed to fetch").code, "network");
  assert.equal(friendlyError({ message: "Space is paused" }).code, "model_loading");
  assert.equal(friendlyError("weird").code, "internal");
  assert.equal(friendlyError("The requested GPU duration (225s) is larger than the maximum allowedSubscribe to Hugging Face PRO").code, "needs_token");
});

// ── pixel maths ─────────────────────────────────────────────────────────────
const pixel = (r, g, b) => new Uint8ClampedArray([r, g, b, 255]);

test("brightness up/down and alpha untouched", () => {
  assert.deepEqual([...px.brightness(pixel(100, 100, 100), 0.5)], [150, 150, 150, 255]);
  assert.deepEqual([...px.brightness(pixel(100, 100, 100), -0.5)], [50, 50, 50, 255]);
  assert.deepEqual([...px.brightness(pixel(200, 200, 200), 1)], [255, 255, 255, 255]);
});

test("contrast pushes away from mid-grey", () => {
  const out = px.contrast(pixel(100, 128, 200), 0.5);
  assert.ok(out[0] < 100 && out[1] === 128 && out[2] > 200);
});

test("grayscale makes channels equal; invert flips", () => {
  const g = px.grayscale(pixel(255, 0, 0));
  assert.ok(g[0] === g[1] && g[1] === g[2]);
  assert.deepEqual([...px.invert(pixel(0, 100, 255))], [255, 155, 0, 255]);
});

test("cropRect centres the crop", () => {
  assert.deepEqual(px.cropRect(1000, 500, [1, 1]), { x: 250, y: 0, width: 500, height: 500 });
  assert.deepEqual(px.cropRect(900, 1600, [16, 9]), { x: 0, y: 547, width: 900, height: 506 });
});
