// Pure helpers that turn video operations into ffmpeg arguments.
// No browser APIs here, so it is tested with `node --test`.

/** atempo only accepts 0.5–2.0 per filter, so chain several for bigger changes. */
export function audioTempoChain(factor) {
  const parts = [];
  let f = factor;
  while (f > 2) {
    parts.push("atempo=2");
    f /= 2;
  }
  while (f < 0.5) {
    parts.push("atempo=0.5");
    f /= 0.5;
  }
  parts.push(`atempo=${+f.toFixed(4)}`);
  return parts.join(",");
}

/** Merge a list of ops into one trim window, one speed factor and a mute flag. */
export function summarise(ops) {
  let start = 0;
  let end = null; // seconds, or null for "to the end"
  let fromEnd = null; // keep the last N seconds
  let speed = 1;
  let mute = false;
  for (const op of ops) {
    if (op.op === "trim") {
      if (op.last != null) fromEnd = op.last;
      else {
        start = op.start ?? 0;
        end = op.end ?? null;
      }
    } else if (op.op === "speed") speed *= op.factor;
    else if (op.op === "mute") mute = true;
  }
  return { start, end, fromEnd, speed: +speed.toFixed(4), mute };
}

/**
 * Build the ffmpeg command for the given ops.
 * Trim happens on the input (fast seek), speed with setpts/atempo, mute drops audio.
 * Always re-encodes to H.264/AAC MP4 so the result plays everywhere.
 */
export function buildFfmpegArgs(input, output, ops, hasAudio = true) {
  const { start, end, fromEnd, speed, mute } = summarise(ops);
  const args = ["-hide_banner"];
  if (fromEnd != null) args.push("-sseof", `-${fromEnd}`);
  else if (start > 0) args.push("-ss", String(start));
  // -t BEFORE -i: the length is measured on the original video, not the sped-up output.
  if (fromEnd == null && end != null) args.push("-t", String(Math.max(0.1, +(end - start).toFixed(3))));
  args.push("-i", input);

  const vf = ["scale=trunc(iw/2)*2:trunc(ih/2)*2"]; // H.264 needs even sizes
  if (speed !== 1) vf.unshift(`setpts=PTS/${speed}`);
  args.push("-vf", vf.join(","));

  if (mute || !hasAudio) args.push("-an");
  else {
    if (speed !== 1) args.push("-af", audioTempoChain(speed));
    args.push("-c:a", "aac", "-b:a", "160k");
  }
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", output);
  return args;
}
