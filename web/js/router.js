// The router: turns what the user typed into a plan.
//   - simple edits (brightness, crop, rotate…) run instantly in the browser
//   - everything else goes to the AI model
// Pure functions only (no DOM), so it can be tested with `node --test`.

// Words that carry no meaning for classification (English + Roman Urdu).
const FILLER = new Set(
  (
    "make it the this that image photo picture pic video clip a an bit little more much very lot lots " +
    "please pls plz to by of in into just also look looks my me so too some slightly really quite way " +
    "isko isay ise is ko karo kar kardo krdo do dein de thora thoda thori zyada ziada bohat bahut " +
    "tasveer ki ka ke aur bhi zara"
  ).split(" ")
);

const SMALL = /\b(a bit|a little|slightly|little|thor[ai]|thod[ai]|zara)\b/;
const BIG = /\b(much|a lot|lots|very|way|really|zyada|ziada|bohat|bahut)\b/;

// Each rule: words that trigger it and the operation it produces.
// `words` are removed from the clause; if only filler is left, it's classic.
const RULES = [
  { op: "brightness", sign: +1, words: ["brighter", "brighten", "bright", "lighter", "lighten", "roshan", "increase brightness", "brightness up"] },
  { op: "brightness", sign: -1, words: ["darker", "darken", "dark", "dim", "dimmer", "andhera", "decrease brightness", "brightness down"] },
  { op: "contrast", sign: +1, words: ["more contrast", "increase contrast", "higher contrast", "add contrast", "contrast up", "contrasty"] },
  { op: "contrast", sign: -1, words: ["less contrast", "decrease contrast", "lower contrast", "reduce contrast", "contrast down"] },
  { op: "saturation", sign: +1, words: ["more saturated", "more saturation", "increase saturation", "saturate", "saturated", "more colorful", "more colourful", "colorful", "colourful", "vivid", "vibrant", "rangeen"] },
  { op: "saturation", sign: -1, words: ["less saturated", "less saturation", "decrease saturation", "desaturate", "desaturated", "less colorful", "less colourful", "muted"] },
  { op: "grayscale", words: ["black and white", "black & white", "black white", "b&w", "bw", "grayscale", "greyscale", "monochrome", "gray", "grey"] },
  { op: "sepia", words: ["sepia"] },
  { op: "invert", words: ["invert colors", "invert colours", "invert", "negative"] },
  { op: "rotate", degrees: 270, words: ["rotate left", "rotate counterclockwise", "rotate anticlockwise", "turn left"] },
  { op: "rotate", degrees: 180, words: ["rotate 180", "upside down", "rotate twice"] },
  { op: "rotate", degrees: 90, words: ["rotate right", "rotate clockwise", "rotate 90", "turn right", "rotate"] },
  { op: "flip", axis: "vertical", words: ["flip vertically", "flip vertical", "vertical flip", "flip upside down"] },
  { op: "flip", axis: "horizontal", words: ["flip horizontally", "flip horizontal", "horizontal flip", "mirror", "flip"] },
  { op: "crop", ratio: [1, 1], words: ["crop to square", "crop square", "square crop", "crop 1:1", "crop to 1:1", "square", "1:1"] },
  { op: "crop", ratio: [9, 16], words: ["crop to 9:16", "crop 9:16", "crop to portrait", "crop for reels", "crop for tiktok", "crop for stories", "9:16"] },
  { op: "crop", ratio: [16, 9], words: ["crop to 16:9", "crop 16:9", "crop to landscape", "crop to widescreen", "crop for youtube", "widescreen", "16:9"] },
  { op: "crop", ratio: [4, 5], words: ["crop to 4:5", "crop 4:5", "crop for instagram", "4:5"] },
];

// Longest phrases first so "rotate left" wins over "rotate".
const PHRASES = RULES.flatMap((rule) => rule.words.map((w) => ({ w, rule }))).sort(
  (a, b) => b.w.length - a.w.length
);

// Simple video edits we recognise but can't run in the browser yet.
const VIDEO_TOOL = /\b(trim|cut|shorten|first \d+ ?(s|sec|secs|second|seconds)|last \d+ ?(s|sec|secs|second|seconds)|pehle \d+ ?(second|sec)|speed up|slow down|slow motion|slow-mo|slowmo|\d(\.\d)?x|mute|remove (the )?(audio|sound))\b/;

const BLOCKED = /\b(nude|nudity|naked|nsfw|undress\w*|topless|porn\w*|sexual\w*|sexy|erotic\w*|strip (her|him|them|me)|stripped|stripping|lingerie|without (any )?clothes|no clothes|remove (\w+ ){0,2}cloth\w*|see[- ]?through)\b/;
const FACE_SWAP = /\b(face ?swap|swap (\w+ ){0,2}faces?|replace (\w+ ){0,2}face|put (\w+ ){0,3}face on|deepfake)\b/;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[“”"'’.!?]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split "make it brighter and turn it into anime" into clauses. */
export function splitClauses(text) {
  return String(text || "")
    .split(/\s*(?:,|;|\n|\band then\b|\bthen\b|\bphir\b|\baur\b|(?<!black )\band\b(?! white))\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function amountFor(clause) {
  const pct = clause.match(/(\d{1,3})\s*%/);
  if (pct) return Math.min(100, Number(pct[1])) / 100;
  if (SMALL.test(clause)) return 0.12;
  if (BIG.test(clause)) return 0.4;
  return 0.25;
}

/** Returns a classic operation for the clause, or null if it needs AI. */
export function classifyClause(rawClause) {
  const clause = normalise(rawClause);
  if (!clause) return null;
  for (const { w, rule } of PHRASES) {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(w)}($|[^a-z0-9])`);
    if (!re.test(clause)) continue;
    const rest = clause
      .replace(re, " ")
      .replace(/\d{1,3}\s*%/g, " ")
      .replace(/\b(degrees?|deg)\b/g, " ")
      .split(/\s+/)
      .filter((word) => word && !FILLER.has(word));
    if (rest.length > 0) return null; // other words left over → let the AI handle it
    const op = { op: rule.op };
    if (rule.sign) op.amount = rule.sign * amountFor(clause);
    if (rule.degrees) op.degrees = rule.degrees;
    if (rule.axis) op.axis = rule.axis;
    if (rule.ratio) op.ratio = rule.ratio;
    return op;
  }
  return null;
}

/** Why a request can't be done, or null if it is fine. */
export function checkAllowed(instruction) {
  const text = normalise(instruction);
  if (BLOCKED.test(text)) {
    return { code: "content_blocked", message: "This kind of edit isn't allowed here." };
  }
  if (FACE_SWAP.test(text)) {
    return { code: "content_blocked", message: "Face swaps aren't supported. Try a style, lighting or background change instead." };
  }
  return null;
}

/**
 * Main entry point.
 * @param {{kind: "photo"|"video", instruction: string, referenceCount?: number}} input
 * @returns {{error?: {code:string,message:string}, classicOps: object[], aiInstruction: string, notes: string[]}}
 */
export function route({ kind, instruction, referenceCount = 0 }) {
  const result = { classicOps: [], aiInstruction: "", notes: [] };
  const text = String(instruction || "").trim();
  if (!text && referenceCount === 0) {
    result.error = { code: "empty", message: "Type how you want it edited, or pick a preset." };
    return result;
  }
  const blocked = checkAllowed(text);
  if (blocked) {
    result.error = blocked;
    return result;
  }

  const aiParts = [];
  for (const clause of splitClauses(text)) {
    const op = kind === "photo" ? classifyClause(clause) : null;
    if (op) result.classicOps.push(op);
    else aiParts.push(clause);
  }

  if (kind === "video") {
    const tools = aiParts.filter((c) => VIDEO_TOOL.test(normalise(c)));
    if (tools.length) {
      result.notes.push("Simple video tools (trim, speed, mute) aren't built yet. Trim the clip on your phone first, then upload it.");
      if (tools.length === aiParts.length && referenceCount === 0) {
        result.error = { code: "not_built", message: result.notes[0] };
        return result;
      }
    }
    result.aiInstruction = aiParts.filter((c) => !VIDEO_TOOL.test(normalise(c))).join(", ");
  } else {
    result.aiInstruction = aiParts.join(", ");
  }

  if (!result.aiInstruction && referenceCount > 0) {
    if (result.classicOps.length === 0 || kind === "video") {
      result.aiInstruction = "Edit it like the reference";
    } else {
      result.notes.push("Only simple edits were asked for, so the reference wasn't used.");
    }
  }
  return result;
}

// ── Prompt templates (PLAN.md §7) ───────────────────────────────────────────

const OBJECT_HINT = /\b(put|add|wear|wearing|place|insert|give (me|him|her|them)|hold|holding|pehna|laga)\b/;

function sentence(text) {
  const t = String(text || "").trim().replace(/[.\s]+$/, "");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) + "." : "";
}

export function buildPhotoPrompt(instruction, referenceCount = 0) {
  const ask = sentence(instruction);
  if (referenceCount === 0) {
    return `${ask} Keep everything else in the image unchanged: same people, faces, pose, framing and background unless asked.`;
  }
  const refs = referenceCount === 1 ? "image 2" : `images 2 to ${referenceCount + 1}`;
  if (OBJECT_HINT.test(normalise(instruction))) {
    return `${ask} Take what is needed from ${refs} and place it naturally in image 1. Match lighting and perspective. Keep everything else in image 1 unchanged.`;
  }
  return `Edit image 1 so its style, colour palette, lighting and mood match ${refs}. Keep the people, faces, pose and composition of image 1. ${ask}`.trim();
}

export function buildVideoPrompt(instruction, hasReference = false) {
  const ask = sentence(instruction);
  return hasReference
    ? `${ask} Use the reference image for appearance and style. Preserve the original motion and timing.`
    : `${ask} Preserve the original motion, camera movement and timing.`;
}

export const PRESETS = [
  { label: "Anime", text: "Convert to a clean anime illustration style with cel shading, keep the same person and pose" },
  { label: "Cinematic", text: "Give it a cinematic film look with teal and orange colour grading and soft contrast" },
  { label: "Vintage film", text: "Make it look like a faded 1970s film photo with warm tones and light grain" },
  { label: "Sunset", text: "Change the lighting to a warm golden sunset" },
  { label: "Snow", text: "Make it a snowy winter day with snow on the ground and falling snowflakes" },
  { label: "Night city", text: "Change the background to a city street at night with neon lights" },
  { label: "Studio portrait", text: "Make it look like a professional studio portrait with soft lighting and a plain grey backdrop" },
  { label: "Remove background", text: "Remove the background and replace it with plain white" },
  { label: "Like the reference", text: "Edit it like the reference", needsReference: true },
];

/** Output size: keeps the photo's shape, sides are multiples of 16. */
export function outputSize(width, height, longSide = 1024) {
  const scale = longSide / Math.max(width, height);
  const round16 = (n) => Math.max(256, Math.round((n * scale) / 16) * 16);
  return { width: round16(width), height: round16(height) };
}

/** Turns a raw error from the AI host into something a person can act on. */
export function friendlyError(raw) {
  const msg = String(raw?.message || raw || "").toLowerCase();
  if (msg.includes("gpu duration") || msg.includes("maximum allowed")) {
    return { code: "needs_token", message: "This edit needs more free AI time than visitors without an account get. Add your free Hugging Face token under \"More free edits\" below and try again." };
  }
  if (msg.includes("quota")) {
    return { code: "quota_exceeded", message: "Today's free AI time is used up. Add a free Hugging Face token (see \"More free edits\" below) or try again tomorrow. Simple edits like brightness and crop still work." };
  }
  if (msg.includes("queue") && msg.includes("full")) {
    return { code: "busy", message: "The free AI server is busy right now. Try again in a minute." };
  }
  if (msg.includes("could not") && msg.includes("space") || msg.includes("not found") || msg.includes("paused") || msg.includes("sleeping") || msg.includes("building")) {
    return { code: "model_loading", message: "The AI server is offline or starting up. Try again in a few minutes." };
  }
  if (msg.includes("nsfw") || msg.includes("safety") || msg.includes("flagged")) {
    return { code: "content_blocked", message: "The AI refused this edit for safety reasons." };
  }
  if (msg.includes("failed to fetch") || msg.includes("network")) {
    return { code: "network", message: "Couldn't reach the AI server. Check your internet and try again." };
  }
  return { code: "internal", message: "The AI couldn't finish this edit. Try again, or try a simpler instruction." };
}
