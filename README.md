# Reframe AI

Send a photo or video, say how you want it edited, optionally add a reference photo or video — and get the edited version back.

Runs on **free open-weight models** on a Hugging Face ZeroGPU Space, so using it never touches a Claude usage limit:

| Job | Model | Licence |
|---|---|---|
| Photo (fast, default) | FLUX.2 [klein] 4B | Apache 2.0 |
| Photo (best quality) | Qwen-Image-Edit-2511 + Lightning | Apache 2.0 |
| Video | Kiwi-Edit 5B (instruction + reference) | MIT |
| Trim / crop / speed / brightness | ffmpeg + Pillow (no GPU) | — |

- 📋 **[PLAN.md](PLAN.md)** — full architecture, models, limits, phases and tests
- 🤖 **[FABLE_PROMPT.md](FABLE_PROMPT.md)** — paste this into Claude Fable 5.2 to build each phase

- 🛠️ **[docs/SETUP.md](docs/SETUP.md)** — the one-time account steps for the owner

**Status:** Phase 0 code done (project skeleton, hello app, tests, auto-sync to Hugging Face). Waiting on the owner's Hugging Face setup in docs/SETUP.md, then Phase 1 (photo editing).
