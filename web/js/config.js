// Where the AI runs. These are public Hugging Face Spaces owned by other
// people (the model authors). They can change or go offline: if an edit
// stops working, this file is the first place to look. See PLAN.md §0.
//
// Checked working: 15 Nov 2026.

export const GRADIO_CLIENT_URL =
  "https://cdn.jsdelivr.net/npm/@gradio/client@2.8.0/dist/index.min.js";

export const PHOTO = {
  space: "black-forest-labs/FLUX.2-klein-4B", // Apache 2.0 model, official Space
  endpoint: "/infer",
  maxReferences: 3, // source + 3 references = 4 images, the model's limit
  uploadMaxSide: 1536, // photos are shrunk to this before upload
  outputLongSide: 1024,
};

export const VIDEO = {
  space: "linyq/KiwiEdit", // Kiwi-Edit (MIT), the authors' demo Space
  endpoint: "/run_edit",
  modelWithReference: "linyq/kiwi-edit-5b-instruct-reference-diffusers",
  modelInstructOnly: "linyq/kiwi-edit-5b-instruct-only-diffusers",
  maxSeconds: 5,
  maxFrames: 81,
  steps: 30, // the Space accepts 10–50
  needsToken: true, // the Space asks for ~225 s of GPU per edit; anonymous visitors aren't allowed that much
};

export const LIMITS = {
  photoMaxBytes: 20 * 1024 * 1024,
  videoMaxBytes: 100 * 1024 * 1024,
};
