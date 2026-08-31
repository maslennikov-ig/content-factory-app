"""The second ruler: two trained representations, run offline over saved text.

This is a measuring instrument, not a dependency of the product. It lives beside
the stand, it never enters `libraries/`, and the model weights never enter the
repository. Nothing here calls a paid service; the two models are downloaded
once into `weights/` and run on the CPU.

Why it exists. The stand's own ruler is character 5-grams over 800 characters,
which both answers of the research put at the lower edge of what stylometry is
reliable on — and our own numbers agree: the noise between two identical
variants is the same order as the gap being moved. Without a second,
independently trained ruler, "the voice does nothing" and "our ruler cannot see
what it does" are the same sentence.

Licences, checked against the model cards on 2026-08-25:
  * `rrivera1849/LUAR-MUD` — Apache-2.0.
  * `StyleDistance/mstyledistance` — MIT.
Both are better than either answer of the research claimed.

LUAR ships custom modelling code and needs `trust_remote_code`. That is running
somebody else's Python, so it is switched on explicitly here, for a measurement
tool on a developer's machine, and never anywhere near the product.

Usage:
    python embed.py --model luar --input items.json --output vectors.json

`items.json` is `{"items": [{"id": "...", "text": "..."}]}`; the output is
`{"model": "...", "dimensions": N, "vectors": {"id": [...]}}`.
"""

import argparse
import json
import os
import pathlib
import sys

WEIGHTS = pathlib.Path(__file__).resolve().parent / "weights"

MODELS = {
    "luar": {
        "repo": "rrivera1849/LUAR-MUD",
        "licence": "Apache-2.0",
        "trust_remote_code": True,
        # LUAR reads a batch of an author's posts at once: (authors, posts, tokens).
        "episodic": True,
        "max_tokens": 512,
    },
    "mstyledistance": {
        "repo": "StyleDistance/mstyledistance",
        "licence": "MIT",
        "trust_remote_code": False,
        "episodic": False,
        "max_tokens": 512,
    },
}


def load(name):
    import torch
    from transformers import AutoModel, AutoTokenizer

    spec = MODELS[name]
    WEIGHTS.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("HF_HOME", str(WEIGHTS))
    tokenizer = AutoTokenizer.from_pretrained(
        spec["repo"],
        cache_dir=str(WEIGHTS),
        trust_remote_code=spec["trust_remote_code"],
    )
    model = AutoModel.from_pretrained(
        spec["repo"],
        cache_dir=str(WEIGHTS),
        trust_remote_code=spec["trust_remote_code"],
    )
    model.eval()
    torch.set_grad_enabled(False)
    return spec, tokenizer, model


def embed(name, texts):
    import torch

    spec, tokenizer, model = load(name)
    vectors = []
    for text in texts:
        encoded = tokenizer(
            [text],
            padding="max_length",
            truncation=True,
            max_length=spec["max_tokens"],
            return_tensors="pt",
        )
        if spec["episodic"]:
            # One author, one post: LUAR expects (authors, posts, tokens).
            encoded = {
                key: value.reshape(1, 1, -1) for key, value in encoded.items()
            }
            output = model(**encoded)
        else:
            output = model(**encoded)
            # Mean pooling over the attention mask, the pooling mStyleDistance
            # was trained with.
            hidden = output.last_hidden_state
            mask = encoded["attention_mask"].unsqueeze(-1).float()
            output = (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1e-9)
        vector = output if isinstance(output, torch.Tensor) else output[0]
        vector = vector.reshape(-1)
        vectors.append([float(one) for one in vector])
    return spec, vectors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=sorted(MODELS), required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    payload = json.loads(pathlib.Path(args.input).read_text(encoding="utf8"))
    items = payload["items"]
    spec, vectors = embed(args.model, [one["text"] for one in items])

    pathlib.Path(args.output).write_text(
        json.dumps(
            {
                "model": args.model,
                "repo": spec["repo"],
                "licence": spec["licence"],
                "dimensions": len(vectors[0]) if vectors else 0,
                "vectors": {
                    one["id"]: vector for one, vector in zip(items, vectors)
                },
            }
        ),
        encoding="utf8",
    )
    sys.stderr.write(
        f"{args.model}: {len(vectors)} текстов, {len(vectors[0]) if vectors else 0} измерений\n"
    )


if __name__ == "__main__":
    main()
