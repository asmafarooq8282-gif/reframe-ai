"""Reframe AI — Hugging Face Space entry point.

Phase 0: a "hello" app that proves the Space builds, the API answers and
ZeroGPU can hand us a GPU. The real editors arrive in Phase 1 (photo) and
Phase 3 (video). See PLAN.md.

Rule: this app never calls Claude or any Anthropic API.
"""

import os
import platform

import gradio as gr

try:
    import spaces  # provided on Hugging Face ZeroGPU Spaces
except ImportError:  # local development / CI: make @spaces.GPU a no-op

    class spaces:  # noqa: N801 - mimic the real module name
        @staticmethod
        def GPU(*args, **kwargs):
            if len(args) == 1 and callable(args[0]) and not kwargs:
                return args[0]
            return lambda fn: fn


VERSION = "0.0.1"
PHASE = 0
PAID_FALLBACK_KEYS = ("FAL_KEY", "REPLICATE_API_TOKEN", "DASHSCOPE_API_KEY")


def health() -> dict:
    """Status for the frontend. No GPU used."""
    return {
        "app": "reframe-ai",
        "version": VERSION,
        "phase": PHASE,
        "models_loaded": [],
        "paid_fallback": any(os.environ.get(k) for k in PAID_FALLBACK_KEYS),
        "python": platform.python_version(),
    }


@spaces.GPU(duration=15)
def gpu_check() -> str:
    """Ask ZeroGPU for a GPU for a moment and report what we got."""
    try:
        import torch
    except ImportError:
        return "PyTorch is not installed here (fine for local UI testing)."
    if not torch.cuda.is_available():
        return "No GPU available (running on CPU)."
    name = torch.cuda.get_device_name(0)
    total_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
    return f"GPU ready: {name} ({total_gb:.0f} GB)"


with gr.Blocks(title="Reframe AI") as demo:
    gr.Markdown(
        "# 🎞️ Reframe AI\n"
        "Hello! The Space is alive. Photo editing arrives in **Phase 1**, "
        "video editing in **Phase 3**."
    )
    with gr.Row():
        health_btn = gr.Button("Check status")
        gpu_btn = gr.Button("Check GPU")
    health_out = gr.JSON(label="Status")
    gpu_out = gr.Textbox(label="GPU")
    health_btn.click(health, outputs=health_out, api_name="health")
    gpu_btn.click(gpu_check, outputs=gpu_out, api_name="gpu_check")

if __name__ == "__main__":
    demo.queue(max_size=20).launch()
