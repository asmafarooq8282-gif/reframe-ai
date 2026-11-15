// Page logic: collects the files and the instruction, asks the router what to
// do, runs simple edits on the device and AI edits on Hugging Face Spaces.

import { PHOTO, VIDEO, LIMITS } from "./config.js";
import { route, buildPhotoPrompt, buildVideoPrompt, outputSize, friendlyError, PRESETS } from "./router.js";
import { fileToCanvas, shrink, applyOps, canvasToBlob, addLabel, videoDuration, videoFrames } from "./classic.js";
import { editPhoto, editPhotoHQ, editVideo } from "./ai.js";
import { applyVideoOps, trimTo, addOriginalAudio } from "./video.js";

const $ = (id) => document.getElementById(id);
const el = {
  tabPhoto: $("tab-photo"), tabVideo: $("tab-video"), editor: $("editor"),
  sourceTitle: $("source-title"), sourceDrop: $("source-drop"), sourceInput: $("source-input"),
  sourceHint: $("source-hint"), sourceThumb: $("source-thumb"), sourceLimit: $("source-limit"),
  instruction: $("instruction"), presets: $("presets"),
  refDrop: $("ref-drop"), refInput: $("ref-input"), refHint: $("ref-hint"), refThumbs: $("ref-thumbs"),
  consent: $("consent"), go: $("go"), status: $("status"),
  result: $("result"), compare: $("compare"), beforeImg: $("before-img"), afterImg: $("after-img"),
  slider: $("slider"), plainImg: $("plain-img"), resultVideo: $("result-video"), resultNote: $("result-note"),
  download: $("download"), addLabel: $("add-label"), labelWrap: $("label-wrap"), again: $("again"),
  token: $("token"), quality: $("quality"), qualityWrap: $("quality-wrap"),
};

const state = {
  kind: "photo", // "photo" | "video"
  source: null, // File or Blob
  refs: [], // Files (images, or one video)
  busy: false,
  output: null, // { blob, canvas?, usedAI, kind }
  urls: new Set(),
};

function objectUrl(blob) {
  const url = URL.createObjectURL(blob);
  state.urls.add(url);
  return url;
}

function setStatus(text, type = "") {
  el.status.hidden = !text;
  el.status.textContent = text || "";
  el.status.className = `status ${type}`.trim();
}

function fail(code, message) {
  return Object.assign(new Error(message), { code, friendly: true });
}

// ── tabs ────────────────────────────────────────────────────────────────────

function setKind(kind) {
  if (state.busy) return;
  state.kind = kind;
  const photo = kind === "photo";
  el.tabPhoto.setAttribute("aria-selected", String(photo));
  el.tabVideo.setAttribute("aria-selected", String(!photo));
  el.editor.setAttribute("aria-labelledby", photo ? "tab-photo" : "tab-video");
  el.sourceTitle.textContent = photo ? "Your photo" : "Your video";
  el.sourceInput.accept = photo ? "image/*" : "video/*";
  el.sourceHint.textContent = photo ? "Tap to choose a photo, or drop one here" : "Tap to choose a short video, or drop one here";
  el.sourceLimit.textContent = photo
    ? "JPG, PNG or WebP, up to 20 MB."
    : `MP4, MOV or WebM, up to 200 MB. Trim, speed and mute work instantly on your device. AI video edits use the first ${VIDEO.maxSeconds} seconds, take a few minutes and need a free Hugging Face token (see "More free edits" below).`;
  el.refHint.textContent = photo
    ? "Add up to 3 photos (or a video) to copy the look from"
    : "Add a photo (or a video) to copy the look from";
  el.instruction.placeholder = photo
    ? "e.g. make it a golden sunset · turn it into anime · make it brighter and crop to square"
    : "e.g. make it a snowy day · first 5 seconds · 2x · mute · trim to 4 seconds and turn it into anime";
  el.qualityWrap.hidden = !photo;
  setSource(null);
  setRefs([]);
  setStatus("");
}
el.tabPhoto.addEventListener("click", () => setKind("photo"));
el.tabVideo.addEventListener("click", () => setKind("video"));

// ── choosing files ──────────────────────────────────────────────────────────

function thumb(file, onRemove) {
  const wrap = document.createElement("span");
  wrap.className = "thumb";
  const isVideo = file.type.startsWith("video/");
  const media = document.createElement(isVideo ? "video" : "img");
  media.src = objectUrl(file);
  if (isVideo) Object.assign(media, { muted: true, playsInline: true, preload: "metadata" });
  else media.alt = "";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "✕";
  remove.setAttribute("aria-label", "Remove");
  remove.addEventListener("click", (e) => {
    e.preventDefault();
    onRemove();
  });
  wrap.append(media, remove);
  return wrap;
}

function setSource(file) {
  state.source = file;
  el.sourceThumb.replaceChildren();
  el.sourceHint.hidden = Boolean(file);
  if (file) el.sourceThumb.append(thumb(file, () => setSource(null)));
  el.sourceInput.value = "";
}

function setRefs(files) {
  const max = state.kind === "photo" ? PHOTO.maxReferences : 1;
  const video = files.find((f) => f.type.startsWith("video/"));
  state.refs = video ? [video] : files.filter((f) => f.type.startsWith("image/")).slice(0, max);
  el.refThumbs.replaceChildren(
    ...state.refs.map((file) => thumb(file, () => setRefs(state.refs.filter((f) => f !== file))))
  );
  el.refHint.hidden = state.refs.length >= max || Boolean(video);
  el.refInput.value = "";
}

function acceptSource(file) {
  if (!file) return;
  const wanted = state.kind === "photo" ? "image/" : "video/";
  if (!file.type.startsWith(wanted)) {
    setStatus(state.kind === "photo" ? "That isn't a photo. Switch to the Video tab for videos." : "That isn't a video. Switch to the Photo tab for photos.", "error");
    return;
  }
  const limit = state.kind === "photo" ? LIMITS.photoMaxBytes : LIMITS.videoMaxBytes;
  if (file.size > limit) {
    setStatus(`That file is too large (max ${Math.round(limit / 1024 / 1024)} MB).`, "error");
    return;
  }
  setStatus("");
  setSource(file);
}

el.sourceInput.addEventListener("change", () => acceptSource(el.sourceInput.files[0]));
el.refInput.addEventListener("change", () => setRefs([...state.refs, ...el.refInput.files]));

for (const [zone, onFiles] of [
  [el.sourceDrop, (files) => acceptSource(files[0])],
  [el.refDrop, (files) => setRefs([...state.refs, ...files])],
]) {
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
    onFiles([...e.dataTransfer.files]);
  });
}

// Paste a photo straight from the clipboard.
document.addEventListener("paste", (e) => {
  const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith("image/"));
  if (file && state.kind === "photo" && !state.busy) acceptSource(file);
});

// ── presets ─────────────────────────────────────────────────────────────────

for (const preset of PRESETS) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = preset.label;
  button.addEventListener("click", () => {
    el.instruction.value = preset.text;
    if (preset.needsReference && state.refs.length === 0) setStatus("Add a reference photo in step 3, then press Edit.");
    el.instruction.focus();
  });
  el.presets.append(button);
}

// ── running an edit ─────────────────────────────────────────────────────────

function statusText(msg, kind) {
  if (msg.stage === "pending") {
    if (typeof msg.position === "number" && msg.position > 0) {
      const eta = msg.eta ? `, about ${Math.ceil(msg.eta)}s` : "";
      return `Waiting in line (position ${msg.position + 1}${eta})…`;
    }
    return kind === "video" ? "AI is editing your video. This can take a few minutes…" : "AI is editing your photo…";
  }
  if (msg.stage === "generating") return "Almost done…";
  return null;
}

function requireConsent() {
  if (!el.consent.checked) {
    el.consent.focus();
    throw fail("consent_required", "Please tick the permission box above the Edit button first.");
  }
}

function token() {
  const value = el.token.value.trim();
  return value.startsWith("hf_") ? value : undefined;
}

async function referenceImages(count) {
  const [first] = state.refs;
  if (!first) return [];
  if (first.type.startsWith("video/")) return videoFrames(first, count);
  const blobs = [];
  for (const file of state.refs.slice(0, count)) {
    blobs.push(await canvasToBlob(await fileToCanvas(file, PHOTO.uploadMaxSide), "image/jpeg", 0.92));
  }
  return blobs;
}

async function runPhoto(plan) {
  setStatus("Opening your photo…", "busy");
  const original = await fileToCanvas(state.source);
  let canvas = applyOps(original, plan.classicOps);
  let usedAI = false;
  let modelName = "FLUX.2 klein";

  if (plan.aiInstruction) {
    requireConsent();
    setStatus("Sending to the AI…", "busy");
    const upload = shrink(canvas, PHOTO.uploadMaxSide);
    const refs = await referenceImages(PHOTO.maxReferences);
    const size = outputSize(upload.width, upload.height, PHOTO.outputLongSide);
    const request = {
      sourceBlob: await canvasToBlob(upload, "image/jpeg", 0.92),
      referenceBlobs: refs,
      prompt: buildPhotoPrompt(plan.aiInstruction, refs.length),
      ...size,
      token: token(),
      onStatus: (msg) => {
        const text = statusText(msg, "photo");
        if (text) setStatus(el.quality.checked ? `${text} (best quality is slower)` : text, "busy");
      },
    };
    let blob;
    if (el.quality.checked) {
      const result = await editPhotoHQ(request);
      blob = result.blob;
      modelName = result.modelName;
    } else {
      blob = await editPhoto(request);
    }
    canvas = await fileToCanvas(blob);
    usedAI = true;
  }

  const blob = await canvasToBlob(canvas, "image/png");
  const sameShape = Math.abs(original.width / original.height - canvas.width / canvas.height) < 0.02;
  showResult({ kind: "photo", blob, canvas, usedAI, modelName, beforeBlob: sameShape ? await canvasToBlob(original, "image/jpeg", 0.9) : null });
}

async function runVideo(plan) {
  const progress = (text) => setStatus(text, "busy");
  const needsAI = Boolean(plan.aiInstruction);
  if (needsAI) {
    requireConsent();
    if (VIDEO.needsToken && !token()) {
      el.token.closest("details").open = true;
      el.token.focus();
      throw fail("needs_token", "AI video edits need a free Hugging Face token (they use about 4 minutes of AI time each). Paste one in the box below — it takes a minute to make. Trim, speed and mute work without one.");
    }
  }

  let working = state.source;
  const notes = [];
  const muted = plan.classicOps.some((op) => op.op === "mute");

  // 1. Simple tools first, on the device.
  if (plan.classicOps.length) {
    working = await applyVideoOps(working, plan.classicOps, progress);
  }

  // 2. AI edit, on a clip short enough for the free AI.
  if (needsAI) {
    setStatus("Checking your video…", "busy");
    const seconds = await videoDuration(working);
    if (Number.isFinite(seconds) && seconds > VIDEO.maxSeconds + 0.5) {
      working = await trimTo(working, VIDEO.maxSeconds, progress);
      notes.push(`The AI edited the first ${VIDEO.maxSeconds} seconds (the free AI can't do longer clips).`);
    }
    const [reference] = await referenceImages(1);
    setStatus("Sending to the AI. Video edits take a few minutes — keep this tab open…", "busy");
    const aiBlob = await editVideo({
      videoFile: working,
      referenceBlob: reference || null,
      prompt: buildVideoPrompt(plan.aiInstruction, Boolean(reference)),
      token: token(),
      onStatus: (msg) => {
        const text = statusText(msg, "video");
        if (text) progress(text);
      },
    });
    let edited = new File([aiBlob], "reframe-ai.mp4", { type: aiBlob.type || "video/mp4" });

    // 3. Put the original sound back (the AI returns a silent video).
    if (!muted) {
      try {
        const { file, hadAudio } = await addOriginalAudio(edited, working, progress);
        edited = file;
        if (hadAudio) notes.push("Original sound added back.");
      } catch (error) {
        console.warn("[Reframe] could not add sound", error);
        notes.push("The original sound couldn't be added back, so the video is silent.");
      }
    }
    working = edited;
  }

  showResult({ kind: "video", blob: working, usedAI: needsAI, notes });
  return notes;
}

async function go() {
  if (state.busy) return;
  if (!state.source) {
    setStatus(state.kind === "photo" ? "Choose a photo first." : "Choose a video first.", "error");
    return;
  }
  const plan = route({ kind: state.kind, instruction: el.instruction.value, referenceCount: state.refs.length });
  if (plan.error) {
    setStatus(plan.error.message, "error");
    return;
  }
  state.busy = true;
  el.go.disabled = true;
  el.go.textContent = "Editing…";
  try {
    const extra = state.kind === "photo" ? await runPhoto(plan) : await runVideo(plan);
    setStatus(["Done.", ...plan.notes, ...(extra || [])].join(" "), "ok");
  } catch (error) {
    console.error("[Reframe]", error);
    const shown = error.friendly || error.code === "unsupported_format" ? error : friendlyError(error);
    setStatus(shown.message, "error");
  } finally {
    state.busy = false;
    el.go.disabled = false;
    el.go.textContent = "Edit";
  }
}
el.go.addEventListener("click", go);
el.instruction.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go();
});

// ── showing and saving the result ───────────────────────────────────────────

function showResult(output) {
  state.output = output;
  el.result.hidden = false;
  el.compare.hidden = true;
  el.plainImg.hidden = true;
  el.resultVideo.hidden = true;
  const url = objectUrl(output.blob);

  if (output.kind === "video") {
    el.resultVideo.src = url;
    el.resultVideo.hidden = false;
    el.resultNote.textContent = [output.usedAI ? "Edited by AI (Kiwi-Edit)." : "Edited on your device — no AI time used.", ...(output.notes || [])].join(" ");
  } else if (output.beforeBlob) {
    el.beforeImg.src = objectUrl(output.beforeBlob);
    el.afterImg.src = url;
    el.slider.value = 50;
    el.compare.style.setProperty("--pos", "50%");
    el.compare.hidden = false;
    el.resultNote.textContent = output.usedAI ? `Drag across the picture to compare. Edited by AI (${output.modelName}).` : "Drag across the picture to compare. Edited on your device — no AI time used.";
  } else {
    el.plainImg.src = url;
    el.plainImg.hidden = false;
    el.resultNote.textContent = output.usedAI ? `Edited by AI (${output.modelName}).` : "Edited on your device — no AI time used.";
  }
  el.labelWrap.hidden = !(output.kind === "photo" && output.usedAI);
  el.addLabel.checked = false;
  el.again.hidden = false;
  el.result.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

el.slider.addEventListener("input", () => el.compare.style.setProperty("--pos", `${el.slider.value}%`));

el.download.addEventListener("click", async () => {
  const output = state.output;
  if (!output) return;
  let blob = output.blob;
  if (output.kind === "photo" && output.usedAI && el.addLabel.checked) {
    blob = await canvasToBlob(addLabel(output.canvas), "image/png");
  }
  const link = document.createElement("a");
  link.href = objectUrl(blob);
  const suffix = output.usedAI ? "ai-edited" : "edited";
  link.download = output.kind === "video" ? `reframe-${suffix}.mp4` : `reframe-${suffix}.png`;
  document.body.append(link);
  link.click();
  link.remove();
});

el.again.addEventListener("click", () => {
  if (!state.output || state.busy) return;
  const isVideo = state.output.kind === "video";
  setSource(new File([state.output.blob], isVideo ? "reframe-result.mp4" : "reframe-result.png", { type: isVideo ? "video/mp4" : "image/png" }));
  el.instruction.value = "";
  el.instruction.focus();
  el.editor.scrollIntoView({ behavior: "smooth" });
});
