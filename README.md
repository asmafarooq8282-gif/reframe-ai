# Reframe AI

Send a photo or video, say how you want it edited, optionally add a reference photo or video — and get the edited version back.

Runs on **free open-weight models** through public Hugging Face Spaces, straight from your browser, so using it never touches a Claude usage limit:

| Job | Model | Licence |
|---|---|---|
| Photo (fast, default) | FLUX.2 [klein] 4B | Apache 2.0 |
| Photo (best quality) | Qwen-Image-Edit-2511 (Lightning) | Apache 2.0 |
| Video | Kiwi-Edit 5B (instruction + reference) | MIT |
| Brightness / contrast / B&W / rotate / flip / crop | in your browser (no AI, unlimited) | — |
| Video trim / speed / mute, keep original sound | ffmpeg.wasm in your browser | MIT wrapper, GPL-2.0 core (loaded at run time) |

- 📋 **[PLAN.md](PLAN.md)** — full architecture, models, limits, phases and tests
- 🤖 **[FABLE_PROMPT.md](FABLE_PROMPT.md)** — paste this into Claude Fable 5.2 to build each phase

- 🛠️ **[docs/SETUP.md](docs/SETUP.md)** — the one-time account steps for the owner

**Live:** https://asmafarooq8282-gif.github.io/reframe-ai/

**Status:** website built (`web/`). Photo editing works through the official FLUX.2 klein Space; video editing through the Kiwi-Edit Space (needs a free Hugging Face token). See the "Change of plan" box at the top of PLAN.md.
