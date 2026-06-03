#!/usr/bin/env python3
"""embed_gemma.py — batch embedding via google/embeddinggemma-300m.

Reads JSON from stdin:  {"texts": ["question 1", "question 2", ...]}
Writes JSON to stdout:  {"model": "...", "dim": 768, "embeddings": [[...], ...]}

Loads the model ONCE from the shared HuggingFace cache (offline) and embeds the
whole batch in a single process, so the layered resolver pays the model-load
cost at most once per prepare run. L2-normalised so a dot product equals cosine
similarity — matching the EMOTE LocalEmbedder behaviour this mirrors.

This file only READS the shared HF cache (~/.cache/huggingface). It does not
touch the EMOTE project. It is invoked with an interpreter that already has
sentence-transformers + torch (see embed.mjs for interpreter resolution).
"""

import json
import os
import sys

# embeddinggemma query prompt — identical to EMOTE's GEMMA_QUERY_PROMPT so
# vectors live in the same space the user already trusts.
GEMMA_QUERY_PROMPT = "task: search result | query: "
MODEL_NAME = "google/embeddinggemma-300m"

# Force offline: the model is already in the HF cache; never hit the network.
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")


def _default_device():
    try:
        import torch
        if torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError as exc:
        json.dump({"error": f"bad json on stdin: {exc}"}, sys.stdout)
        return 1

    texts = payload.get("texts") or []
    if not isinstance(texts, list):
        json.dump({"error": "texts must be a list"}, sys.stdout)
        return 1
    if not texts:
        json.dump({"model": MODEL_NAME, "dim": 0, "embeddings": []}, sys.stdout)
        return 0

    try:
        from sentence_transformers import SentenceTransformer
    except Exception as exc:  # pragma: no cover - environment guard
        json.dump({"error": f"sentence-transformers unavailable: {exc}"}, sys.stdout)
        return 2

    model = SentenceTransformer(MODEL_NAME, device=_default_device())
    prompted = [GEMMA_QUERY_PROMPT + str(t) for t in texts]
    vecs = model.encode(
        prompted,
        normalize_embeddings=True,   # L2 norm → dot product == cosine
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    embeddings = [[round(float(x), 6) for x in row] for row in vecs]
    json.dump(
        {"model": MODEL_NAME, "dim": len(embeddings[0]), "embeddings": embeddings},
        sys.stdout,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
