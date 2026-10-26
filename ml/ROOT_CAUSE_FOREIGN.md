# Root cause: genuine seeds labelled Foreign

## What the browser actually runs
AgroPurity's multi-object Inspect/Demo path does not load the separate neural-network classifier. It uses browser-side classical computer vision:
grayscale -> Otsu global threshold -> binary mask -> morphology -> connected components -> rule-based `classify()`.

A separate MobileNetV3-Small model was reported as trained on single-kernel wheat damage-condition images from Zenodo. It reports 76.8% accuracy on a held-out set of 500 single-kernel images, but those weights are not used by the multi-grain photo inspection path. These metrics do not validate multi-object grain detection or mixed seed images.

## Why genuine seeds can be labelled Foreign
The multi-object classifier uses provisional colour/brightness and shape heuristics. Dark, underexposed, brown, discoloured, or partially shadowed regions can resemble debris under these rules. Otsu is a global threshold and morphology/connected components can merge touching objects or produce fragmented regions. Axis-aligned components and box-level deduplication are not reliable instance-level seed detection.

## Current scope
Only wheat is documented as supported for on-device classical screening. Rice, pulses, maize, mustard, and other crops are unsupported until labelled multi-object data is trained and independently evaluated.

## Correct interpretation
- Whole/Broken/Foreign/Uncertain are provisional candidate labels, not validated biological identifications.
- Foreign must not be assigned to every low-confidence or unfamiliar region.
- Ambiguous, shadowed, merged, clipped, or unsupported regions should remain Uncertain/review-required where the heuristic cannot establish a reliable class.
- Do not convert object counts to mass percentages or official grades.

## Next steps for real accuracy
1. Collect or obtain properly licensed labelled multi-grain images representative of phones, lighting, backgrounds, varieties, touching objects, and contaminants.
2. Annotate each visible object (class plus bounding box or instance mask) and separate train/validation/test by capture session or source.
3. Compare a suitable object detector/instance segmenter against the heuristic baseline using per-class precision, recall, F1, duplicate and missed-detection rates, and count error.
4. Integrate the selected trained detector into the actual browser inference path; verify preprocessing, class mapping, runtime and production weights.
5. Publish only measured held-out results and document limitations. Do not claim universal seed recognition or 100% accuracy.
