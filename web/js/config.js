// Where the AI runs. These are public Hugging Face Spaces owned by other
// people (the model authors). They can change or go offline: if an edit
// stops working, this file is the first place to look. See PLAN.md §0.
//
// Checked working: 15 Nov 2026.

export const GRADIO_CLIENT_URL =
  "https://cdn.jsdelivr.net/npm/@gradio/client@2.8.0/dist/index.min.js";

export const FFMPEG_CORE_BASE =
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm"; // GPL-2.0, loaded at run time only

export const PHOTO = {
  space: "black-forest-labs/FLUX.2-klein-4B", // Apache 2.0 model, official Space
  endpoint: "/infer",
  maxReferences: 3, // source + 3 references = 4 images, the model's limit
  uploadMaxSide: 1536, // photos are shrunk to this before upload
  outputLongSide: 1024,
};

// "Best quality" mode. Tried in order; the next one is used only if the
// previous Space is offline or errors (not when the visitor is out of quota).
export const PHOTO_HQ = [
  {
    name: "Qwen-Image-Edit-2511",
    space: "linoyts/Qwen-Image-Edit-2511-Fast", // Apache 2.0 model, 4-step Lightning
    endpoint: "/infer",
    maxReferences: 2, // source + 2 = 3 images works best with Qwen
    payload: (images, prompt, width, height) => ({
      images,
      prompt,
      seed: 0,
      randomize_seed: true,
      true_guidance_scale: 1,
      num_inference_steps: 4,
      height,
      width,
      rewrite_prompt: false,
    }),
  },
  {
    name: "FLUX.2 klein (Base, 50 steps)",
    space: "black-forest-labs/FLUX.2-klein-4B",
    endpoint: "/infer",
    maxReferences: 3,
    payload: (images, prompt, width, height) => ({
      prompt,
      input_images: images,
      mode_choice: "Base (50 steps)",
      seed: 0,
      randomize_seed: true,
      width,
      height,
      num_inference_steps: 50,
      guidance_scale: 4,
      prompt_upsampling: false,
    }),
  },
];

export const VIDEO = {
  space: "linyq/KiwiEdit", // Kiwi-Edit (MIT), the authors' demo Space
  endpoint: "/run_edit",
  modelWithReference: "linyq/kiwi-edit-5b-instruct-reference-diffusers",
  modelInstructOnly: "linyq/kiwi-edit-5b-instruct-only-diffusers",
  maxSeconds: 5, // longer clips are trimmed to this before AI editing
  maxFrames: 81,
  steps: 30, // the Space accepts 10–50
  needsToken: true, // the Space asks for ~225 s of GPU per edit; anonymous visitors aren't allowed that much
};

export const LIMITS = {
  photoMaxBytes: 20 * 1024 * 1024,
  videoMaxBytes: 200 * 1024 * 1024,
};
