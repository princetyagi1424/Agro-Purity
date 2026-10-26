# Root cause: genuine seeds labelled Foreign

## What the browser actually runs
AgroPurity’s multi-object **Inspect/Demo path does not load a neural network**. It uses:
grayscale → Otsu → connected components → **rule-based `classify()`**.

An offline MobileNetV3 was trained on Zenodo single-kernel images (~77% held-out accuracy on that set). Those weights are **not** the browser multi-grain path.

## Failure mechanism
Foreign rules previously fired **before** whole/broken checks using:
- `lum < 85` OR
- mid-dark + low chroma (`lum < 110 && chroma < 28`)

Underexposed or brown wheat can meet those thresholds and was labelled **foreign**.

## Fix (v1.1.0-prototype)
- **Foreign** requires stone-like darkness (very low luma + low chroma), not merely brown.
- Warm grain-shaped regions prefer **whole** / **uncertain**, not foreign.
- Black debris still → foreign when segmented (regression tested).

## Multi-crop status
Only **wheat** is `supported` for on-device classical screening. Rice, pulses, maize, mustard are **unsupported** until labelled multi-object data is trained and evaluated.
