# AgroPurity repository audit — 26 Oct 2026

Repository: https://github.com/princetyagi1424/Agro-Purity

## Confirmed architecture
- The multi-grain Inspect/Demo workflow uses classical browser-side image processing: grayscale -> Otsu global threshold -> morphology -> connected components -> hand-written rule labels. It does not load a neural network in that path.
- A separate MobileNetV3-Small wheat single-kernel classifier was trained on 3,500 single-kernel images from Zenodo record 18222641, with five damage-condition classes and 500 held-out test images. The report records 76.8% accuracy and macro-F1 0.7653. This is not a mixed-photo object detector and cannot validate multi-object inspection results.
- README states heuristic labels are uncalibrated and touching grains may merge; no labelled field dataset or independent manual-count evaluation is provided.
- The class rules can assign Foreign using luminance/chroma thresholds. Shape, colour, and area heuristics do not establish biological seed identity.
- 3x3 morphology closing/opening can change connected regions; connected-component boxes represent binary regions, not learned per-grain detections.
- IoU/containment suppression can remove duplicates, but cannot reliably split joined grains and may suppress legitimate adjacent detections when boxes overlap.

## Accuracy limitations
Do not claim that every seed can be reliably recognized by tuning colour thresholds. A genuine multi-grain detector needs labelled object-level images, an appropriate detector/instance segmenter, independent test data, and deployment/runtime verification.

## Recommended work
1. Keep wheat as the only supported crop unless labelled multi-crop data supports additional species.
2. Treat outputs as heuristic candidates; use Uncertain for ambiguous regions rather than assigning every unfamiliar object to Foreign.
3. Audit segmentation polarity, morphology, box geometry, and colour sampling. Do not infer species from colour alone.
4. Evaluate on manually labelled multi-grain phone photos; report per-class precision/recall/F1, count error, duplicate rate, and missed-detection rate.
5. Do not imply the single-kernel MobileNet model is integrated into the multi-object workflow.
