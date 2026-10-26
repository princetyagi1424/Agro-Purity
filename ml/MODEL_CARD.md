# Model Card — Wheat single-seed visual classifier

## Intended use
Research prototype for **single wheat seed** visual class prediction on images similar to the training set.

## Not for
Laboratory certification, germination claims, moisture, pathogen confirmation, AGMARK grades, or multi-grain phone photos without a validated detection stage.

## Data
Zenodo [18222641](https://zenodo.org/records/18222641) — 3500 images, 5 classes, author train/val/test splits. Attribute creator **Wang, DL**.

WheatVision (Mendeley) was **not** trained on (auth/download blocked here).

## Metrics (held-out test, n=500)
Accuracy **76.8%**, macro-F1 **0.765**. See `ml/reports/evaluation_report.json`.

## Reproduce
Place dataset under `ml/data/raw/wheat_zenodo/dataset/{train,val,test}/` and run training with PyTorch MobileNetV3-Small transfer learning.
