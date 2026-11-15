# Reframe AI — Build Plan (v2)

> **What it is:** an AI editor. Upload a photo or video, type what you want ("make it sunset", "turn this into anime", "edit it like this"), optionally add a **reference photo or video**, and get the edited result back.
>
> **Who builds it:** Claude **Fable 5.2** in Claude Code, one phase per session, following this file.
>
> **Why it doesn't use your Claude limit:** Fable only *writes* the code. The finished app runs on **free open-weight models** on a Hugging Face ZeroGPU Space. It never calls Claude.
>
> *Facts in this plan were checked on 14 Nov 2026. Fable: re-verify model IDs and quotas at the start of each phase (§13).*

---

## ⚠️ Change of plan (15 Nov 2026) — read this first

Hugging Face stopped letting free accounts create Gradio Spaces (July 2026: *"Gradio and Docker Spaces require a paid plan"*; only Static Spaces stay free). The owner's new account can't host its own ZeroGPU Space, and even a 30-day-old account isn't guaranteed to.

**Owner chose option 1:** the website calls **public Spaces that already run the models**, straight from the visitor's browser with `@gradio/client`. No backend of our own, $0.

| Job | Public Space used | Endpoint | Checked |
|---|---|---|---|
| Photo | `black-forest-labs/FLUX.2-klein-4B` (official) | `/infer` — `prompt`, `input_images` (list, source first), 4 steps | ✅ edit returned in ~8 s, anonymous |
| Video | `linyq/KiwiEdit` (Kiwi-Edit authors) | `/run_edit` — `source_video`, `prompt`, `ref_image`, `model_id`, `max_frames`, `steps` (10–50) | ⚠️ asks for ~225 s GPU per call → refused for anonymous visitors; **needs the visitor's free HF token** |

What this means:
- The site lives in `web/` and is published by GitHub Pages (`.github/workflows/pages.yml`). `web/js/config.js` is the one place that names the Spaces — fix it there if a Space changes or goes offline.
- Simple edits (brightness, contrast, saturation, B&W, sepia, invert, rotate, flip, crop) run in the browser: instant, unlimited, nothing uploaded.
- Each visitor uses their **own** daily free GPU time (more if they paste a free HF token on the page).
- Not possible in this mode yet: video trim/speed/mute, keeping a video's sound, the "HQ" Qwen mode, server-side NSFW image checks (we block by instruction text and rely on the Spaces' own filters).
- `space/` (our own Gradio Space) is **parked**. If the owner later gets PRO or Hugging Face allows the free ZeroGPU Space again, Phases 1–3 below still apply and `sync-space.yml` deploys it.

Status of option 1: **live at https://asmafarooq8282-gif.github.io/reframe-ai/** (15 Nov 2026). Photo AI edit verified end to end on the live site (~15 s). Video needs a visitor token and is not yet tested end to end.

---

## Table of contents
1. Ground rules
2. What the user can do
3. Architecture
4. Hosting and free limits
5. Models (exact IDs)
6. The router — how an instruction becomes an edit
7. Prompt templates
8. API contract
9. Folder layout and code skeletons
10. Build phases with acceptance tests
11. Safety
12. Risks and fallbacks
13. Checks Fable must run first
14. Owner checklist

---

## 1. Ground rules (Fable, read first)

1. **No Claude / Anthropic API calls in the app. Ever.** All AI is open-weight models on Hugging Face, or an optional paid provider the owner adds a key for.
2. **$0 by default.** Paid things only behind optional environment variables.
3. **Fast model first.** Each visitor gets only a few free GPU minutes per day (§4). The default path must use the fastest model that gives good results, so users get as many edits as possible.
4. **Be honest about limits in the UI.** Show remaining-quota hints and clear messages, never a silent failure.
5. **One phase per session.** Finish, test, tick the boxes in §10, commit. Then stop and report.
6. **No secrets in git.** Tokens go in HF Space secrets or a local `.env` listed in `.gitignore`.
7. If anything in this plan is out of date or wrong, **say so and propose the fix** before coding around it.

---

## 2. What the user can do

| Input | Example instruction | Optional reference | Output |
|---|---|---|---|
| Photo | "Remove the background and put me on a beach" | — | Photo |
| Photo | "Edit it like this" | Reference photo (style, colours, lighting) | Photo in that style |
| Photo | "Put this jacket on me" | Photo of the jacket | Photo with object added |
| Photo | "Make me look like this person's outfit and pose" | Up to 3 reference photos | Photo |
| Video (short) | "Make it look like winter" | — | Video |
| Video | "Edit it like this" | Reference **photo** | Restyled video |
| Video | "Edit it like this" | Reference **video** | Restyled video (key frames + colour match, §5.4) |
| Photo/Video | "Trim to 5 seconds", "make it brighter", "crop to square", "2× speed" | — | Instant, no GPU used |

**Presets (one-tap chips):** Anime · Cinematic · Vintage film · Sunset · Snow · Night city · Studio portrait · Remove background · Edit like reference.

---

## 3. Architecture

```
          ┌───────────────────────────────┐
 user ──► │ Frontend (GitHub Pages)       │
          │ upload · instruction · refs   │
          │ before/after · history        │
          └──────────────┬────────────────┘
                         │  @gradio/client (JS)
                         ▼
          ┌───────────────────────────────────────────────┐
          │ Backend: Hugging Face Space (Gradio + ZeroGPU)│
          │                                               │
          │  router.py ──► classic.py  (ffmpeg/Pillow, CPU, no quota)
          │      │                                        │
          │      ├──► image_edit.py  FAST: FLUX.2 klein 4B│
          │      │                   HQ:   Qwen-Image-Edit-2511 + Lightning
          │      │                                        │
          │      └──► video_edit.py  Kiwi-Edit 5B (instruct+reference)
          │                                               │
          │  safety.py (NSFW check in + out, consent)     │
          └──────────────┬────────────────────────────────┘
                         │ only if owner sets a key
                         ▼
          Optional paid fallback: hosted Wan 2.7 edit / fal / Replicate
```

- **Phase 1 ships the Gradio UI only** — it already has upload boxes and a public link.
- **Phase 4** adds the custom website on GitHub Pages, talking to the same Space.

---

## 4. Hosting and free limits

### Backend — Hugging Face ZeroGPU Space
- Hardware: ZeroGPU gives each call a slice of an **NVIDIA RTX Pro 6000 Blackwell**: `large` = 48 GB VRAM (default, 1× quota), `xlarge` = 96 GB (2× quota). Use `large` unless a model doesn't fit.
- **Hosting:** free accounts in good standing (verified email, **account older than 30 days**) can host up to **2 ZeroGPU Spaces**. If the account is too new → create a CPU Space, code it for ZeroGPU, and request a community GPU grant.
- **Quota is per visitor, not the owner:** unauthenticated 2 min/day · free HF account 5 min/day · PRO 40 min/day. Resets 24 h after first use.
- **Rules to follow in code:**
  - Load models onto `cuda` **at module level**, not inside the GPU function.
  - Decorate GPU work with `@spaces.GPU(duration=...)`. Default is 60 s; use a **dynamic duration function** (based on steps, resolution, frames) so short jobs reserve less quota and get better queue priority.
  - `torch.compile` is **not supported**; ahead-of-time (AoT) compilation is (torch ≥ 2.8). Do this in Phase 5 for speed.
  - Gradio SDK only. Python 3.10 or 3.12.

**What a free visitor gets per day (rough targets to design for):**
| Job | Target GPU time | Edits per day (free account, 5 min) |
|---|---|---|
| Photo, fast mode (klein 4B, 1024px) | 3–8 s | ~30+ |
| Photo, HQ mode (Qwen 2511, 4 steps) | 15–30 s | ~10 |
| Video, 5 s at 480p (Kiwi-Edit) | 90–180 s | ~2 |

### Frontend — GitHub Pages (free, static).

### Optional paid fallback
If the owner wants unlimited use later: put a provider key in Space secrets (`FAL_KEY`, `REPLICATE_API_TOKEN`, or `DASHSCOPE_API_KEY` for hosted Wan 2.7). The router uses it **only** when the free quota error happens **and** the key exists.

---

## 5. Models (exact IDs — verify in §13)

### 5.1 Photo — FAST mode (default)
**`black-forest-labs/FLUX.2-klein-4B`** — Apache 2.0 (commercial OK), ~13 GB VRAM, step-distilled (~4 steps), sub-second on good GPUs. One model does editing **and multi-reference** (up to 4 reference images). Supported in diffusers.

### 5.2 Photo — HQ mode ("Best quality" toggle)
**`Qwen/Qwen-Image-Edit-2511`** + Lightning LoRA **`lightx2v/Qwen-Image-Edit-2511-Lightning`** (4-step, ~10× faster than 40-step). Apache 2.0. Accepts a **list of images** (source + references), best consistency for faces/products and text in images.
- 20B model — may not fit 48 GB in bf16 with its text encoder. Try in order: bf16 on `large` → FP8 weights on `large` → `xlarge`. Document which worked.

### 5.3 Video
**`linyq/kiwi-edit-5b-instruct-reference-diffusers`** — Kiwi-Edit (ShowLab), MIT, built on Wan 2.2 5B + Qwen2.5-VL-3B. Does **instruction-only and instruction+reference-image** video editing, up to 81 frames, 720p. Uses a custom diffusers pipeline (`pipeline_kiwi_edit.py` in the repo → load with `trust_remote_code` / custom pipeline; follow the official repo `github.com/showlab/Kiwi-Edit`).
- Free-tier limits: **≤ 5 s, 480p, 16 fps (≤ 81 frames)**. Auto-trim/resize uploads and tell the user.
- Alternatives if Kiwi doesn't work on ZeroGPU: `linyq/kiwi-edit-5b-instruct-only-diffusers` (lighter, no reference), Bernini (ByteDance, Apache 2.0, has reference-guided video editing — heavier), hosted Wan 2.7 edit (paid fallback; up to 3 reference images).

### 5.4 Reference **video** (not just a photo)
No free model takes a whole reference video well. Pipeline:
1. ffmpeg scene detection → pick 3 key frames (start, middle, end) from the reference video.
2. Use the clearest frame (sharpness score = Laplacian variance) as Kiwi-Edit's reference image; or make a 3-frame grid.
3. **Colour match** (CPU, no quota): match the output's colour histogram/LAB statistics to the reference video, then apply as a LUT to every frame.
4. For photo edits with a reference video: pass up to 3 key frames as references to klein/Qwen.

### 5.5 Instruction understanding ("the brain")
- **Phase 1–3:** rule-based router (§6). Zero GPU cost.
- **Phase 5:** optional small vision-language model (e.g. Qwen2.5-VL-3B, already part of Kiwi-Edit) to (a) turn vague instructions into a precise edit prompt and (b) describe the reference's style in words. Must fit in ≤ 5 s of GPU.

### 5.6 Helper models (all CPU or tiny)
- Background removal: `briaai/RMBG-2.0` (check licence — non-commercial) or `rembg` (MIT) — Phase 2.
- NSFW check: an open image classifier, e.g. `Falconsai/nsfw_image_detection` — Phase 1.
- Upscale (optional Phase 5): Real-ESRGAN.

---

## 6. The router

```
inputs: media (photo|video), instruction, refs[], mode (fast|hq)

1. Validate: file type, size (photo ≤ 20 MB, video ≤ 100 MB), duration.
2. Safety check on inputs (§11). Block → error "content_blocked".
3. Classic match? (regex/keywords, both English and Urdu/Roman-Urdu words)
     trim|cut|first N sec        → classic.trim
     crop|square|9:16|16:9       → classic.crop
     rotate|flip                 → classic.rotate
     speed|slow|fast|2x          → classic.speed
     bright|dark|contrast|saturat→ classic.adjust
     black and white|b&w|grey    → classic.filter
     remove background           → helper.rmbg
     add text "..."              → classic.text
   If the instruction is ONLY classic ops → run them, return. (No GPU.)
   If mixed ("trim to 5s and make it anime") → classic first, then AI.
4. AI path:
     photo + mode=fast → klein 4B      (refs: up to 4)
     photo + mode=hq   → Qwen 2511     (refs: up to 2, plus source = 3)
     video             → Kiwi-Edit     (ref: 1 image; ref video → §5.4)
5. Safety check on output. Add AI-edited metadata.
6. Return result + "gpu_seconds_used".
```

Write unit tests for the router with at least 30 example instructions.

---

## 7. Prompt templates

Keep templates in `space/prompts.py` so they're easy to tune.

```python
NO_REF = "{instruction}. Keep everything else in the image unchanged: same people, faces, pose, framing and background unless asked."

STYLE_REF = ("Edit image 1 so its style, colour palette, lighting and mood match image 2. "
             "Keep the people, faces, pose and composition of image 1. {instruction}")

OBJECT_REF = ("Take the {object} from image 2 and place it naturally in image 1. "
              "Match lighting and perspective. Keep everything else in image 1 unchanged. {instruction}")

VIDEO_NO_REF = "{instruction}. Preserve the original motion, camera movement and timing."
VIDEO_REF    = "{instruction}. Use the reference image for appearance and style. Preserve the original motion and timing."
```
Router picks STYLE_REF when the instruction contains "like this / same style / same vibe / match"; OBJECT_REF when it contains "put / add / wear / place this". Default with a reference = STYLE_REF.

Presets map to fixed, tested prompts (e.g. *Anime* → "Convert to a clean anime illustration style with cel shading, keep the same person and pose").

---

## 8. API contract (Gradio endpoints)

| Endpoint | Inputs | Returns |
|---|---|---|
| `/edit_image` | `image`, `instruction: str`, `references: list[image]` (0–4), `mode: "fast"\|"hq"`, `seed: int\|None` | `{image, gpu_seconds, model, seed}` |
| `/edit_video` | `video`, `instruction`, `reference_image?`, `reference_video?`, `seed?` | `{video, gpu_seconds, model, trimmed: bool}` |
| `/classic` | `media`, `operation`, `params: dict` | `{media}` |
| `/health` | — | `{models_loaded, paid_fallback: bool, version}` |

Error codes (JSON `{"error": code, "message": "..."}`): `quota_exceeded`, `video_too_long`, `file_too_large`, `unsupported_format`, `content_blocked`, `consent_required`, `model_loading`, `internal`.

---

## 9. Folder layout and code skeletons

```
reframe-ai/
├── space/                    # Hugging Face Space (backend)
│   ├── README.md             # Space card: sdk: gradio, python_version, hardware: zero-gpu
│   ├── app.py                # Gradio Blocks UI + API endpoints
│   ├── router.py
│   ├── prompts.py
│   ├── pipelines/
│   │   ├── image_fast.py     # FLUX.2 klein 4B
│   │   ├── image_hq.py       # Qwen-Image-Edit-2511 + Lightning
│   │   ├── video_edit.py     # Kiwi-Edit
│   │   └── classic.py        # ffmpeg / Pillow
│   ├── utils/
│   │   ├── media.py          # resize, probe, trim, key frames, colour match
│   │   ├── safety.py
│   │   └── errors.py
│   ├── packages.txt          # ffmpeg
│   ├── requirements.txt
│   └── tests/
│       ├── test_router.py
│       ├── test_classic.py
│       └── samples/          # tiny test.jpg, test.mp4 (≤ 1 MB)
├── web/                      # GitHub Pages site
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── .github/workflows/
│   ├── pages.yml             # deploy web/ to Pages
│   ├── tests.yml             # run pytest on CPU on every push
│   └── sync-space.yml        # push space/ to the HF Space (uses HF_TOKEN secret)
├── docs/SETUP.md
├── PLAN.md
├── FABLE_PROMPT.md
└── README.md
```

### `space/app.py` (skeleton — Fable fills in)
```python
import gradio as gr, spaces, torch
from pipelines import image_fast   # loads model to cuda at import time
from router import route_image

def image_duration(image, instruction, refs, mode, seed):
    return 20 if mode == "fast" else 60   # tune after measuring

@spaces.GPU(duration=image_duration)
def edit_image(image, instruction, refs, mode="fast", seed=None):
    return route_image(image, instruction, refs or [], mode, seed)

with gr.Blocks(title="Reframe AI") as demo:
    with gr.Tab("Photo"):
        src = gr.Image(type="pil", label="Your photo")
        refs = gr.Gallery(label="Reference photos (optional, up to 4)", type="pil")
        instr = gr.Textbox(label="How should I edit it?")
        mode = gr.Radio(["fast", "hq"], value="fast", label="Mode")
        out = gr.ImageSlider(label="Before / After")
        gr.Button("Edit").click(edit_image, [src, instr, refs, mode], out, api_name="edit_image")
    # Tab("Video") added in Phase 3

demo.queue(max_size=20).launch()
```

### `space/requirements.txt` (starting point — pin exact versions once working)
```
torch>=2.8
diffusers @ git+https://github.com/huggingface/diffusers
transformers
accelerate
safetensors
spaces
gradio>=5
pillow
opencv-python-headless
av
decord
einops
numpy
```

---

## 10. Build phases with acceptance tests

> Fable: tick each box when done. A phase is done only when **all** its tests pass.

### Phase 0 — Setup (owner + Fable, ~30 min)
- [x] Verify everything in §13 and update this file if anything changed. *(14 Nov 2026 — see "Phase 0 findings" below)*
- [x] Create folder layout, `.gitignore`, `tests.yml` CI.
- [ ] Owner creates the HF Space (§14) and adds the `HF_TOKEN` secret **and the `HF_SPACE_ID` variable** on GitHub — steps in `docs/SETUP.md`.
- [x] `sync-space.yml` pushes `space/` to the Space on every push to `main` (skips itself until the secret and variable exist).
- **Test:** pushing a trivial `app.py` ("Hello") makes the Space show it. *(Hello app passes locally and in CI; the Space half waits on the owner step above.)*

**Phase 0 findings (for Phase 1+):**
- FLUX.2 klein 4B: repo live, Apache 2.0, not gated. Diffusers class **`Flux2KleinPipeline`**, 4 steps, `guidance_scale=1.0`, needs diffusers from GitHub main. The model card shows single-image editing via `image=`; **how to pass several reference images isn't on the card — confirm in the diffusers docs / `black-forest-labs/flux2` repo first thing in Phase 1.**
- Qwen-Image-Edit-2511: repo live, Apache 2.0. Class **`QwenImageEditPlusPipeline`**, images passed as a **list** under `image=`; card defaults are 40 steps, `true_cfg_scale=4.0` (Lightning LoRA brings it to 4 steps).
- Kiwi-Edit: model page couldn't be opened from the build session; details from search still stand (custom `pipeline_kiwi_edit.py`, wants `transformers==4.57.0`, `decord`, `einops`, `av`). Re-check at the start of Phase 3.
- Gradio is now **6.x** (Space pinned to 6.32.0). The §9 skeleton was written for 5.x — check `gr.ImageSlider` and Gallery-as-input behaviour in 6.x in Phase 1.
- A ZeroGPU Space must contain at least one `@spaces.GPU` function, so the hello app has a tiny `gpu_check`.
- `space/requirements.txt` is kept minimal in Phase 0; model libraries get added in Phase 1.

### Phase 1 — Photo editing MVP
- [ ] `image_fast.py` with FLUX.2 klein 4B: single image + 0–4 references.
- [ ] `prompts.py` + reference-type detection (§7).
- [ ] Gradio Photo tab, before/after slider, seed control, download.
- [ ] `safety.py`: NSFW check on input and output.
- [ ] Friendly quota-exceeded message with "Sign in to Hugging Face for more free edits".
- [ ] Measure real GPU seconds; set `image_duration` to measured × 1.5.
- **Tests:**
  - "make the sky purple" on `samples/test.jpg` → sky visibly purple, person unchanged.
  - Same photo + a Van Gogh-style reference + "edit it like this" → style clearly transferred.
  - A photo with no reference uses < 10 s GPU.

### Phase 2 — Classic tools + HQ mode
- [ ] `classic.py`: trim, crop (incl. 1:1, 9:16, 16:9), rotate/flip, speed, brightness/contrast/saturation, B&W, text overlay, resize — ffmpeg for video, Pillow for photo.
- [ ] Background removal helper.
- [ ] Router with ≥ 30 unit tests (English + Roman Urdu, e.g. "isko bright karo", "pehle 5 second").
- [ ] `image_hq.py`: Qwen-Image-Edit-2511 + Lightning 4-step; "Best quality" toggle.
- **Tests:** "trim to first 3 seconds" and "make it brighter" return in < 3 s with 0 GPU seconds; HQ mode keeps a face recognisably the same person.

### Phase 3 — Video editing
- [ ] `utils/media.py`: probe, auto-trim to 5 s, resize to 480p, fps to 16, extract audio, re-mux audio.
- [ ] `video_edit.py` with Kiwi-Edit instruct+reference.
- [ ] Reference **video** support (§5.4): key frames + colour match.
- [ ] Video tab in Gradio with progress updates.
- [ ] Dynamic `duration` from frame count.
- **Tests:** 4 s clip + "make it a snowy day" → coherent mp4 with original audio; same clip + reference photo → colours/style follow the reference; GPU time within ZeroGPU limits.

### Phase 4 — Custom website (GitHub Pages)
- [ ] `web/`: drag-and-drop upload, instruction box, reference uploads, preset chips, Fast/HQ toggle.
- [ ] Calls the Space via `@gradio/client` (ES module from a CDN), shows queue position and progress.
- [ ] Before/after slider, download, share; local history in `localStorage` (wrapped in try/catch).
- [ ] Mobile-first layout, dark/light mode, Urdu + English UI text.
- [ ] `pages.yml` deploys automatically.
- **Tests:** full photo edit and video edit work from a phone on the Pages URL; Lighthouse accessibility ≥ 90.

### Phase 5 — Quality and speed
- [ ] AoT compilation for klein and Kiwi-Edit (HF ZeroGPU AoT guide) — measure the speed-up.
- [ ] Optional VLM prompt rewriter (§5.5) behind a toggle.
- [ ] Videos > 5 s: split into overlapping 5 s chunks, use the last frame of each edited chunk as extra reference for the next, crossfade 0.5 s, stitch.
- [ ] Optional upscale (Real-ESRGAN).
- [ ] Optional paid fallback (hosted Wan 2.7 edit) behind `DASHSCOPE_API_KEY`.

### Phase 6 — Polish and launch
- [ ] README with screenshots/GIF, live links, how to run locally.
- [ ] `docs/SETUP.md` written for a beginner.
- [ ] Queue limits, max file sizes, simple per-IP rate limit on the Space.
- [ ] Example gallery on the website (owner's own photos only).
- [ ] Submit the Space to HF so it's searchable; add the Pages URL to Google Search Console.

---

## 11. Safety (ships in Phase 1, not later)

- **Block sexual content and anything involving minors** — classifier on inputs and outputs; refuse edits that sexualise anyone.
- **Real people:** edits that change someone's identity, put a real person's face on another body, or make them appear to do something they didn't → require a consent checkbox ("I have permission from everyone shown"). No face-swap feature.
- **Label outputs:** write `"AI-edited with Reframe AI"` into image metadata (EXIF/XMP) and video metadata; offer an optional visible watermark.
- **Licences:** default models (klein 4B, Qwen 2511, Kiwi-Edit) are Apache 2.0 / MIT → commercial use OK. Avoid FLUX.1 Kontext dev and klein 9B in the default path (non-commercial licences).
- Don't store users' uploads after the job finishes (Gradio temp files cleaned on a timer).

---

## 12. Risks and fallbacks

| Risk | What to do |
|---|---|
| Owner's HF account < 30 days old | CPU Space + request community GPU grant; or wait; or use PRO |
| Qwen 2511 doesn't fit 48 GB | FP8 weights → `xlarge` → drop HQ mode until Phase 5 |
| Kiwi-Edit pipeline won't run on ZeroGPU | Try instruct-only variant → Bernini → paid Wan 2.7 fallback; ship photo-only first |
| Video takes longer than quota | Lower to 33–49 frames, 384p; show "video needs a free HF login" |
| ZeroGPU queue busy | Show queue position; suggest fast mode |
| Model updates break code | Pin versions in `requirements.txt` once working |
| Users upload harmful content | §11 checks; Gradio `concurrency_limit`; report button |

---

## 13. Checks Fable must run first (every phase)

1. Open each model page on Hugging Face and confirm: repo still exists, licence, diffusers support, recommended steps/settings.
2. Check for a newer, better open model for the same job (released after 14 Nov 2026). If one is clearly better **and** Apache/MIT **and** fits ZeroGPU, propose switching.
3. Re-read the ZeroGPU docs (`huggingface.co/docs/hub/spaces-zerogpu`) for current quotas, GPU sizes and supported torch/Python versions.
4. Report findings to the owner in 5 lines before coding.

---

## 14. Owner checklist (only you can do these)

1. **Hugging Face:** make a free account at huggingface.co, verify your email. (ZeroGPU hosting needs the account to be 30+ days old.)
2. **Create the Space:** New Space → name `reframe-ai` → SDK **Gradio** → hardware **ZeroGPU** → public.
3. **Token:** HF Settings → Access Tokens → new token with **write** access. Add it to the GitHub repo as secret `HF_TOKEN` (Settings → Secrets and variables → Actions). In the same place, tab **Variables**, add `HF_SPACE_ID` = `your-hf-username/reframe-ai`. Full walkthrough: `docs/SETUP.md`.
4. **GitHub Pages:** repo Settings → Pages → Source: **GitHub Actions**.
5. **Licences:** if any model page asks you to accept terms, click accept while logged in.
6. **Optional:** add a paid provider key as a Space secret for unlimited use.

---

### Sources used for this plan
- Hugging Face ZeroGPU docs — huggingface.co/docs/hub/spaces-zerogpu
- FLUX.2 [klein] — bfl.ai/blog/flux2-klein-towards-interactive-visual-intelligence, huggingface.co/black-forest-labs/FLUX.2-klein-4B
- Qwen-Image-Edit-2511 — huggingface.co/Qwen/Qwen-Image-Edit-2511; Lightning LoRA — huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning
- Kiwi-Edit — showlab.github.io/Kiwi-Edit, huggingface.co/linyq/kiwi-edit-5b-instruct-reference-diffusers
- Wan 2.7 edit (paid fallback) — docs.magnific.com/api-reference/video-edit/wan-2-7/overview
- Bernini — studio.aifilms.ai/blog/bernini-bytedance-video-generation-editing
