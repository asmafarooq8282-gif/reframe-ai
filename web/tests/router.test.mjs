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
test("video: style edit goes to AI (photo colour tools are photo-only)", () => {
  const r = video("make it brighter");
  assert.deepEqual(r.classicOps, []);
  assert.equal(r.aiInstruction, "make it brighter");
});

// video tools: trim / speed / mute (run on the device with ffmpeg.wasm)
const VIDEO_TOOLS = [
  ["trim to first 3 seconds", { op: "trim", start: 0, end: 3 }],
  ["keep only the first 4 seconds", { op: "trim", start: 0, end: 4 }],
  ["cut it to 5 sec", { op: "trim", start: 0, end: 5 }],
  ["5 seconds", { op: "trim", start: 0, end: 5 }],
  ["pehle 5 second", { op: "trim", start: 0, end: 5 }],
  ["from 2 to 6 seconds", { op: "trim", start: 2, end: 6 }],
  ["2s to 6s", { op: "trim", start: 2, end: 6 }],
  ["from 1.5 to 3.5 sec", { op: "trim", start: 1.5, end: 3.5 }],
  ["2 se 6 second tak", { op: "trim", start: 2, end: 6 }],
  ["last 4 seconds", { op: "trim", last: 4 }],
  ["aakhri 3 second rakho", { op: "trim", last: 3 }],
  ["remove the first 2 seconds", { op: "trim", start: 2, end: null }],
  ["2x", { op: "speed", factor: 2 }],
  ["1.5x", { op: "speed", factor: 1.5 }],
  ["make it 3x faster", { op: "speed", factor: 3 }],
  ["speed it up", { op: "speed", factor: 2 }],
  ["slow motion", { op: "speed", factor: 0.5 }],
  ["isko slow karo", { op: "speed", factor: 0.5 }],
  ["mute", { op: "mute" }],
  ["remove the sound", { op: "mute" }],
  ["awaaz band karo", { op: "mute" }],
];

for (const [text, expected] of VIDEO_TOOLS) {
  test(`video tool: "${text}"`, () => {
    const r = video(text);
    assert.equal(r.error, undefined);
    assert.equal(r.aiInstruction, "");
    assert.deepEqual(r.classicOps, [expected]);
  });
}

test("video: tool + style → tool on device, style to AI", () => {
  const r = video("trim to first 3 seconds and make it snowy");
  assert.deepEqual(r.classicOps, [{ op: "trim", start: 0, end: 3 }]);
  assert.equal(r.aiInstruction, "make it snowy");
});

test("video: several tools in one go", () => {
  const r = video("first 4 seconds, 2x, mute");
  assert.deepEqual(r.classicOps.map((o) => o.op), ["trim", "speed", "mute"]);
  assert.equal(r.aiInstruction, "");
});

test("video: sentences that only mention numbers stay with the AI", () => {
  assert.equal(video("me and my 2 friends dancing in the rain").classicOps.length, 0);
  assert.equal(video("first 3 seconds of snow falling").classicOps.length, 0);
});

test("video: silly speeds are refused", () => {
  assert.equal(video("100x").classicOps.length, 0);
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

// ── ffmpeg command building ─────────────────────────────────────────────────
import { buildFfmpegArgs, audioTempoChain, summarise } from "../js/videoplan.js";

test("audioTempoChain splits big changes into allowed steps", () => {
  assert.equal(audioTempoChain(2), "atempo=2");
  assert.equal(audioTempoChain(0.5), "atempo=0.5");
  assert.equal(audioTempoChain(4), "atempo=2,atempo=2");
  assert.equal(audioTempoChain(0.25), "atempo=0.5,atempo=0.5");
  assert.equal(audioTempoChain(3), "atempo=2,atempo=1.5");
});

test("summarise merges ops", () => {
  assert.deepEqual(summarise([{ op: "trim", start: 1, end: 4 }, { op: "speed", factor: 2 }, { op: "mute" }]), { start: 1, end: 4, fromEnd: null, speed: 2, mute: true });
});

test("ffmpeg args: trim range", () => {
  const a = buildFfmpegArgs("in.mp4", "out.mp4", [{ op: "trim", start: 2, end: 6 }]);
  assert.deepEqual(a.slice(0, 7), ["-hide_banner", "-ss", "2", "-i", "in.mp4", "-t", "4"]);
  assert.ok(a.includes("aac") && a.at(-1) === "out.mp4");
});

test("ffmpeg args: last N seconds uses -sseof", () => {
  const a = buildFfmpegArgs("in.mp4", "out.mp4", [{ op: "trim", last: 3 }]);
  assert.deepEqual(a.slice(0, 5), ["-hide_banner", "-sseof", "-3", "-i", "in.mp4"]);
  assert.ok(!a.includes("-t"));
});

test("ffmpeg args: speed changes picture and sound together", () => {
  const a = buildFfmpegArgs("in.mp4", "out.mp4", [{ op: "speed", factor: 2 }]);
  assert.ok(a[a.indexOf("-vf") + 1].startsWith("setpts=PTS/2"));
  assert.equal(a[a.indexOf("-af") + 1], "atempo=2");
});

test("ffmpeg args: mute or no audio drops the sound", () => {
  assert.ok(buildFfmpegArgs("i", "o", [{ op: "mute" }]).includes("-an"));
  const silent = buildFfmpegArgs("i", "o", [{ op: "speed", factor: 2 }], false);
  assert.ok(silent.includes("-an") && !silent.includes("-af"));
});
