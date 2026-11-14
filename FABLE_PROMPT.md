# Prompt to give Claude Fable 5.2

1. Open Claude Code, connect this GitHub repo (`reframe-ai`), and select **Fable 5.2**.
2. Paste the prompt below. Change `<N>` to the phase number: start with **0**, then 1, 2, 3…
3. One phase per session. When Fable finishes, test it yourself, then start a new session for the next phase.

---

```
You are building "Reframe AI", an AI photo and video editor. PLAN.md in this repo is the source of truth — read it fully before doing anything.

Hard rules:
- The finished app must NEVER call Claude or any Anthropic API. All AI runs on open-weight models on a Hugging Face ZeroGPU Space (PLAN.md §4–5).
- Default deployment costs $0. Paid providers only behind optional env vars.
- Never commit secrets.
- Safety rules in PLAN.md §11 are required, not optional.

This session: build Phase <N> from PLAN.md §10.

Steps:
1. Run the checks in PLAN.md §13 and tell me what you found in 5 lines. If something in the plan is out of date, update PLAN.md and explain why.
2. Make a short task list for this phase.
3. Write the code using the folder layout in PLAN.md §9.
4. Test everything you can: pytest for router and classic tools, and run the Gradio app on CPU to check the UI loads. GPU parts get tested on the Space after push.
5. Tick the finished checkboxes for Phase <N> in PLAN.md, update the "Status" line in README.md, and commit with a clear message.
6. Finish with: (a) what works now, (b) exactly what I must do by hand (tokens, clicks, settings), (c) how I can test it myself in 3 steps.
```

---

**Tip:** if a phase fails on the Space (model too big, out of quota, crash), paste the Space's error log into a new Fable session with: *"Fix this error from the Hugging Face Space. Follow PLAN.md §12 for fallbacks."*
