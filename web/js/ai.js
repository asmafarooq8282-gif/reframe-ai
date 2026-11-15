// Talks to the public Hugging Face Spaces that run the AI models.
// This app never calls Claude or any Anthropic API.

import { GRADIO_CLIENT_URL, PHOTO, PHOTO_HQ, VIDEO } from "./config.js";

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
  if (Array.isArray(value)) return fileUrl(value[0]); // galleries return a list
  if (typeof value === "string") return value;
  return value.url || value.video?.url || value.image?.url || value.path || null;
}

/** Errors that mean "this visitor is out of free time", where trying another Space won't help. */
function isQuotaError(error) {
  return /quota|runs limit|gpu duration|maximum allowed/i.test(String(error?.message || error));
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

/**
 * "Best quality" photo edit: tries each Space in PHOTO_HQ in order.
 * Returns { blob, modelName }.
 */
export async function editPhotoHQ({ sourceBlob, referenceBlobs = [], prompt, width, height, token, onStatus }) {
  const { handle_file } = await lib();
  let lastError;
  for (const option of PHOTO_HQ) {
    try {
      const images = [sourceBlob, ...referenceBlobs.slice(0, option.maxReferences)].map((blob) => ({ image: handle_file(blob), caption: null }));
      const data = await run(option.space, option.endpoint, option.payload(images, prompt, width, height), token, onStatus);
      const url = fileUrl(data[0]);
      if (!url) throw new Error("The AI server returned no image.");
      return { blob: await download(url), modelName: option.name };
    } catch (error) {
      if (isQuotaError(error)) throw error;
      console.warn(`[Reframe] ${option.name} failed, trying the next option`, error);
      lastError = error;
    }
  }
  throw lastError || new Error("No best-quality option is available.");
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
