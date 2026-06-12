#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Decode a ForScore `.4se` annotation-layer file.

A `.4se` is `gzip` → `bplist00` (NSKeyedArchiver). Despite the earlier hope that
it held *vector* stroke geometry, the decoded graph is a `scoreLayers`/`layers`
container of named annotation layers, and **each layer's `image` is a UIImage
wrapping a full-page RGBA PNG** — i.e. the annotations are already rasterized.
No stroke points exist in any `.4se` (verified library-wide: 0 non-PNG payloads).

What the `.4se` *does* give over the flat `aux/<file>|<page>.png` overlay is the
per-layer breakdown: a document-wide named layer (e.g. "Fingerings", with a
stable `layerID` defined in `…|template.4se`) plus a page-local default layer
("Layer 1"), each toggleable. `alpha_composite` of the visible layers reproduces
the flat overlay PNG exactly.

Usage:
    ./decode_4se.py "out/aux/3 Preludes.pdf|2.4se"            # summarize layers
    ./decode_4se.py "out/aux/3 Preludes.pdf|2.4se" -o layers/ # also dump layer PNGs
"""
from __future__ import annotations

import argparse
import gzip
import plistlib
from pathlib import Path
from plistlib import UID
from typing import Any


def load(path: Path) -> dict:
    """gunzip + parse the NSKeyedArchiver plist."""
    return plistlib.loads(gzip.decompress(path.read_bytes()))


def resolve(objs: list, node: Any, seen: dict | None = None) -> Any:
    """Dereference NSKeyedArchiver UIDs into plain Python, flattening the
    NSDictionary/NSArray ``NS.keys``/``NS.objects`` forms."""
    if seen is None:
        seen = {}
    if isinstance(node, UID):
        idx = node.data
        if idx in seen:
            return seen[idx]
        seen[idx] = None  # cycle guard
        seen[idx] = resolve(objs, objs[idx], seen)
        return seen[idx]
    if isinstance(node, dict):
        if "NS.keys" in node and "NS.objects" in node:  # NSDictionary
            keys = [resolve(objs, k, seen) for k in node["NS.keys"]]
            vals = [resolve(objs, v, seen) for v in node["NS.objects"]]
            return dict(zip(keys, vals))
        if "NS.objects" in node:  # NSArray
            return [resolve(objs, v, seen) for v in node["NS.objects"]]
        return {k: resolve(objs, v, seen) for k, v in node.items() if k != "$class"}
    if isinstance(node, list):
        return [resolve(objs, v, seen) for v in node]
    return node


def decode_layers(path: Path) -> tuple[dict, list[dict]]:
    """Return (root, layers). Each layer dict carries name/number/isVisible/
    layerID, the layer's `origin` collection, pixel `size`, and raw `png` bytes
    (None for an empty layer)."""
    pl = load(path)
    objs = pl["$objects"]
    root = resolve(objs, pl["$top"]["root"])
    layers: list[dict] = []
    for origin in ("scoreLayers", "layers"):
        for layer in root.get(origin, []) or []:
            img = layer.get("image")
            png = img.get("UIImageData") if isinstance(img, dict) else None
            layers.append(
                {
                    "origin": origin,
                    "name": layer.get("name"),
                    "number": layer.get("number"),
                    "isVisible": layer.get("isVisible"),
                    "layerID": layer.get("layerID"),
                    "size": img.get("UIImageSizeInPixels") if isinstance(img, dict) else None,
                    "png": png,
                }
            )
    return root, layers


def main() -> None:
    ap = argparse.ArgumentParser(description="Decode a ForScore .4se annotation-layer file.")
    ap.add_argument("path", type=Path, help="path to a .4se file")
    ap.add_argument("-o", "--out", type=Path, help="directory to dump each layer's PNG into")
    args = ap.parse_args()

    root, layers = decode_layers(args.path)
    active = root.get("activeLayer") if isinstance(root, dict) else None
    print(f"{args.path.name}: {len(layers)} layer(s), activeLayer={active}")
    for lyr in layers:
        n = len(lyr["png"]) if lyr["png"] else 0
        print(
            f"  [{lyr['origin']:>11}] name={lyr['name']!r:14} number={lyr['number']} "
            f"visible={lyr['isVisible']} size={lyr['size']} png={n}B layerID={lyr['layerID']}"
        )
    if args.out:
        args.out.mkdir(parents=True, exist_ok=True)
        for lyr in layers:
            if lyr["png"]:
                fn = args.out / f"{args.path.name}.{lyr['number']}_{lyr['name']}.png"
                fn.write_bytes(lyr["png"])
                print("  wrote", fn)


if __name__ == "__main__":
    main()
