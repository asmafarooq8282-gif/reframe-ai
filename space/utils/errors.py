"""Error codes shared by every endpoint (PLAN.md §8).

The frontend shows `message` to the user and can branch on `error`.
"""

MESSAGES = {
    "quota_exceeded": "You've used today's free GPU time. Sign in to Hugging Face for more free edits, or try again tomorrow.",
    "video_too_long": "That video is too long for the free tier. Trim it to 5 seconds or less.",
    "file_too_large": "That file is too large. Photos up to 20 MB, videos up to 100 MB.",
    "unsupported_format": "That file type isn't supported. Use JPG, PNG or WebP for photos and MP4, MOV or WebM for videos.",
    "content_blocked": "This content can't be edited here.",
    "consent_required": "Please confirm you have permission from everyone shown before making this edit.",
    "model_loading": "The model is still starting up. Try again in a minute.",
    "internal": "Something went wrong on our side. Please try again.",
}


class ReframeError(Exception):
    """Raise with one of the codes above; convert with `.to_dict()`."""

    def __init__(self, code: str, message: str | None = None):
        if code not in MESSAGES:
            raise ValueError(f"Unknown error code: {code}")
        self.code = code
        self.message = message or MESSAGES[code]
        super().__init__(self.message)

    def to_dict(self) -> dict:
        return {"error": self.code, "message": self.message}
