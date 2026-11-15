// Talks to the public Hugging Face Spaces that run the AI models.
// This app never calls Claude or any Anthropic API.

import { GRADIO_CLIENT_URL, PHOTO, VIDEO } from "./config.js";

let libPromise;
const lib = () => (libPromise ??= import(GRADIO_CLIENT_URL));

const clients = new Map();
async function connect(space, token) {
  const key = `${space}|${token ? "t" : "anon"}`;
  if (!clients.has(key)) {
    const { Client } = await lib();
    // "status" events must be asked for, or errors and queue updates never arrive.
    const options = { events: ["data", "status"], ...(token ? { token } : {}) };
    clients.set(key, Client.connect(space, options).catch((e) => {
      clients.delete(key);
      throw e;
    }));
  }
  return clients.get(key);
}

async function run(space, endpoint, payload, token, onStatus) {
  const app = await connect(space, token);
  const job = app.submit(endpoint, payload);
  let data;
  for await (const msg of job) {
    if (msg.type === "status") {
      onStatus?.(msg);
      if (msg.stage === "error") {
        const text = typeof msg.message === "string" ? msg.message : "The AI server reported an error.";
        throw new Error(text);
      }
    } else if (msg.type === "data") {
      data = msg.data;
      break; // the result is in; stop listening
    }
  }
  if (!data) throw new Error("The AI server returned nothing.");
  return data;
}

/** Find a downloadable URL inside whatever shape the Space returned. */
function fileUrl(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.url || value.video?.url || value.image?.url || value.path || null;
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Couldn't download the result.");
  return response.blob();
}

/**
 * Edit a photo. `sourceBlob` is image 1; `referenceBlobs` become images 2, 3, 4.
 * Returns a Blob with the edited image.
 */
export async function editPhoto({ sourceBlob, referenceBlobs = [], prompt, width, height, token, onStatus }) {
  const { handle_file } = await lib();
  const images = [sourceBlob, ...referenceBlobs.slice(0, PHOTO.maxReferences)];
  const data = await run(
    PHOTO.space,
    PHOTO.endpoint,
    {
      prompt,
      input_images: images.map((blob) => ({ image: handle_file(blob), caption: null })),
      mode_choice: "Distilled (4 steps)",
      seed: 0,
      randomize_seed: true,
      width,
      height,
      num_inference_steps: 4,
      guidance_scale: 1,
      prompt_upsampling: false,
    },
    token,
    onStatus
  );
  const url = fileUrl(data[0]);
  if (!url) throw new Error("The AI server returned no image.");
  return download(url);
}

/** Edit a short video. Returns a Blob with the edited video. */
export async function editVideo({ videoFile, referenceBlob = null, prompt, token, onStatus }) {
  const { handle_file } = await lib();
  const data = await run(
    VIDEO.space,
    VIDEO.endpoint,
    {
      source_video: handle_file(videoFile),
      prompt,
      ref_image: referenceBlob ? handle_file(referenceBlob) : null,
      model_id: referenceBlob ? VIDEO.modelWithReference : VIDEO.modelInstructOnly,
      max_frames: VIDEO.maxFrames,
      steps: VIDEO.steps,
      seed: 0,
    },
    token,
    onStatus
  );
  const url = fileUrl(data[0]);
  if (!url) throw new Error(typeof data[2] === "string" && data[2] ? data[2] : "The AI server returned no video.");
  return download(url);
}
