// Simple video tools that run in the visitor's browser with ffmpeg.wasm:
// trim, speed, mute, and putting the original sound back on an AI-edited
// video. Nothing is uploaded. The ~32 MB ffmpeg core downloads the first
// time a video tool is used, then the browser caches it.

import { FFMPEG_CORE_BASE } from "./config.js";
import { buildFfmpegArgs, audioTempoChain } from "./videoplan.js";

let ffmpegPromise;

async function blobUrl(url, type) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Couldn't download the video tools. Check your internet and try again.");
  return URL.createObjectURL(new Blob([await response.arrayBuffer()], { type }));
}

/** Load ffmpeg once. `onProgress(text)` gets human-readable updates. */
export function loadFfmpeg(onProgress) {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      onProgress?.("Loading the video tools (first time only, about 30 MB)…");
      const { FFmpeg } = await import(new URL("../vendor/ffmpeg/index.js", import.meta.url).href);
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await blobUrl(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await blobUrl(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ffmpeg;
    })().catch((error) => {
      ffmpegPromise = undefined;
      throw error;
    });
  }
  return ffmpegPromise;
}

function extensionOf(file) {
  const fromName = /\.([a-z0-9]{2,4})$/i.exec(file.name || "")?.[1];
  if (fromName) return fromName.toLowerCase();
  if ((file.type || "").includes("webm")) return "webm";
  if ((file.type || "").includes("quicktime")) return "mov";
  return "mp4";
}

async function writeInput(ffmpeg, name, file) {
  await ffmpeg.writeFile(name, new Uint8Array(await file.arrayBuffer()));
}

async function exec(ffmpeg, args, onProgress, label) {
  const handler = ({ progress }) => {
    if (progress > 0 && progress <= 1) onProgress?.(`${label} ${Math.round(progress * 100)}%`);
  };
  ffmpeg.on("progress", handler);
  try {
    const code = await ffmpeg.exec(args);
    if (code !== 0) throw new Error(`The video tool stopped with error ${code}.`);
  } finally {
    ffmpeg.off("progress", handler);
  }
}

async function readOutput(ffmpeg, name, type = "video/mp4") {
  const data = await ffmpeg.readFile(name);
  return new Blob([data.buffer], { type });
}

async function cleanup(ffmpeg, names) {
  for (const name of names) {
    try {
      await ffmpeg.deleteFile(name);
    } catch {
      /* already gone */
    }
  }
}

/** Does the file have a sound track? (ffmpeg prints "Audio:" in its stream list.) */
async function hasAudio(ffmpeg, name) {
  let found = false;
  const handler = ({ message }) => {
    if (/Stream #.*Audio:/.test(message)) found = true;
  };
  ffmpeg.on("log", handler);
  try {
    await ffmpeg.exec(["-hide_banner", "-i", name]); // exits non-zero (no output file); that's fine
  } finally {
    ffmpeg.off("log", handler);
  }
  return found;
}

/**
 * Apply trim / speed / mute operations to a video file.
 * @param {File|Blob} file
 * @param {object[]} ops  from the router, e.g. [{op:"trim", start:0, end:5}, {op:"speed", factor:2}]
 * @returns {Promise<File>} an MP4 file
 */
export async function applyVideoOps(file, ops, onProgress) {
  const ffmpeg = await loadFfmpeg(onProgress);
  const input = `in.${extensionOf(file)}`;
  const output = "out.mp4";
  await writeInput(ffmpeg, input, file);
  try {
    const withAudio = await hasAudio(ffmpeg, input);
    onProgress?.("Editing the video on your device…");
    await exec(ffmpeg, buildFfmpegArgs(input, output, ops, withAudio), onProgress, "Editing the video on your device…");
    const blob = await readOutput(ffmpeg, output);
    return new File([blob], "reframe-edited.mp4", { type: "video/mp4" });
  } finally {
    await cleanup(ffmpeg, [input, output]);
  }
}

/** Cut a video down to at most `seconds` from the start (used before AI editing). */
export async function trimTo(file, seconds, onProgress) {
  return applyVideoOps(file, [{ op: "trim", start: 0, end: seconds }], onProgress);
}

/**
 * Put the sound from `original` onto `edited` (the AI result, which has no sound).
 * Returns the edited video unchanged if the original has no sound.
 */
export async function addOriginalAudio(edited, original, onProgress) {
  const ffmpeg = await loadFfmpeg(onProgress);
  const v = `ai.${extensionOf(edited)}`;
  const a = `src.${extensionOf(original)}`;
  const output = "with-sound.mp4";
  await writeInput(ffmpeg, v, edited);
  await writeInput(ffmpeg, a, original);
  try {
    if (!(await hasAudio(ffmpeg, a))) return { file: edited, hadAudio: false };
    onProgress?.("Adding the original sound back…");
    // Copy the AI video as-is, take the sound from the original, stop at the shorter one.
    await exec(
      ffmpeg,
      ["-i", v, "-i", a, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", output],
      onProgress,
      "Adding the original sound back…"
    ).catch(async () => {
      // Some AI outputs can't be copied into MP4 directly; re-encode the picture instead.
      await exec(
        ffmpeg,
        ["-i", v, "-i", a, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", output],
        onProgress,
        "Adding the original sound back…"
      );
    });
    const blob = await readOutput(ffmpeg, output);
    return { file: new File([blob], "reframe-ai-edited.mp4", { type: "video/mp4" }), hadAudio: true };
  } finally {
    await cleanup(ffmpeg, [v, a, output]);
  }
}

export { audioTempoChain };
