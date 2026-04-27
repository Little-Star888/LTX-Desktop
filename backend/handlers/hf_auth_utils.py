"""Shared HuggingFace authentication utilities."""

from __future__ import annotations

import time
from threading import RLock

from _routes._errors import HTTPError
from state.app_state_types import AppState, HfAuthenticated


def require_hf_token(state: AppState, lock: RLock) -> str:
    """Return a valid HuggingFace OAuth token or raise HTTPError(403)."""
    with lock:
        match state.hf_auth_state:
            case HfAuthenticated(access_token=token, expires_at=exp):
                if time.time() <= exp:
                    return token
            case _:
                pass
    raise HTTPError(403, "HuggingFace authentication required for gated models")
