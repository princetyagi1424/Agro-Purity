# AgroPurity

AgroPurity is a local-first, browser-based **preliminary visual grain-screening and evidence-recording prototype**, with wheat as the first target. It processes a grain photo on the device and produces candidate-region boxes, measured features, warnings, and a locally saved review record.

> **Important scope boundary:** AgroPurity is not an official or certified grading machine. It does not determine AGMARK/government grades, procurement eligibility, MSP entitlement, legal deductions, moisture, toxins, pesticide residues, weight-based impurity percentages, internal damage, or legal admissibility. The classifier uses provisional, uncalibrated heuristics; touching grains may merge and fragments may split.

## Intended workflow

1. Spread wheat in a thin, non-overlapping layer on plain white A4 paper.
2. Capture a photo using the browser camera or upload a JPG/PNG/WebP image.
3. Run browser-side pixel analysis: grayscale luminance → Otsu threshold → binary mask → two-pass connected-component labeling with disjoint-set union → feature extraction → provisional candidate labels.
4. Review the original and annotated image, read warnings, inspect measured features, and adjust detection labels where needed.
5. Save a record in this browser's IndexedDB. Export the record as JSON and the source/annotated images separately.

The bundled **demo fixture is synthetic** and is provided to exercise the software pipeline. It is not a real farmer sample, field-trial result, accuracy benchmark, or product claim.

## Implementation status

### Implemented in source

- React + Vite + TypeScript responsive interface.
- Camera capture that requests permission only after the user action; rear-camera preference where supported; camera tracks are stopped when no longer needed.
- Image upload with file-size/dimension checks, decode errors and safe processing bounds.
- Grayscale conversion using `0.299R + 0.587G + 0.114B`.
- Otsu histogram thresholding, uniform-image rejection, foreground polarity estimation and quality warnings.
- Two-pass connected-component labeling with dynamic label storage and 4-/8-connectivity support in the engine.
- Per-component pixel area, bounding box, centroid, mean RGB, covariance-derived principal-axis ratio and eccentricity estimate.
- Explainable candidate labels: whole-grain, broken-fragment, foreign-material, or uncertain/review required. These labels are uncalibrated heuristics, not a trained or validated agricultural classifier.
- Real annotated image drawn from detected regions; detection selection and manual label correction while retaining original algorithm labels.
- IndexedDB inspection history, bounded to 20 recent records; open details, delete one, clear all with confirmation; JSON and image exports.
- PWA web manifest, 192/512 PNG icons, service worker app-shell/runtime caching, install prompt handling when the browser supports it, and manual instructions for platforms without `beforeinstallprompt`.
- Automated Node unit tests and GitHub Actions workflow for tests, TypeScript checks and production build.

### Experimental / not validated

- Whole/broken/foreign rules and size filters are provisional engineering heuristics.
- Connected components represent connected pixel regions, not necessarily individual physical grains.
- No labelled field dataset, independent manual-count comparison, precision/recall, accuracy, count-error, or latency benchmark is provided.
- Offline functionality depends on prior successful asset caching, browser support, and retained site storage; first-time use requires a network connection.

### Not implemented / not verified

- Android APK is **not built, signed, published, or device-tested**. See [ANDROID-STATUS.md](./ANDROID-STATUS.md). Do not treat PWA installation as APK distribution.
- No cloud sync, user accounts, server API, analytics, or remote image processing.
- No official grade/deduction computation, weight/mass measurement, moisture/toxin/residue analysis, or government certification.
- Production deployment and real-device PWA installation/offline tests must be verified on the target Vercel project before they are claimed complete.

## Technical architecture

- `src/App.tsx`: responsive inspection, review, history, exports, and installation flows.
- `src/vision/core.mjs`: pure, browser/Node-compatible vision algorithms.
- `src/vision/analyze.worker.ts`: worker-based pixel processing to keep the interface responsive.
- `src/lib/records.ts`: IndexedDB records and bounded retention.
- `public/manifest.webmanifest`, `public/sw.js`, `public/icons/`: PWA metadata, icons and offline asset caching.

### Algorithm caveats

- **Grayscale** estimates pixel luminance only; it is not grain-quality evidence.
- **Otsu** selects a global histogram threshold, which may fail under mixed lighting, shadows, reflective grains, white grain on a light background, or textured paper.
- **Connected-component labeling** merges touching foreground regions. It is not watershed segmentation or a learned instance detector.
- **Shape/colour rules** can be affected by variety, orientation, focus, exposure and camera white balance. `principalAxisRatio` is an estimate from pixel-coordinate covariance; it is not a biological species identifier.
- Object counts are **not mass percentages**. Never compute legal grade or financial deductions directly from these counts.

## Local development

Requirements: Node.js 22 or a compatible modern Node release and npm.

```bash
npm install
npm run dev
```

Open the local Vite URL printed in the terminal. Camera access works on localhost or a secure HTTPS deployment and requires user permission.

## Tests and build

```bash
npm test
npm run typecheck
npm run build
npm run preview
```

The vision unit tests use synthetic image buffers. Passing these tests verifies algorithm behavior for the tested cases; it does **not** validate agricultural accuracy on real wheat samples. The GitHub Actions workflow runs the test, type-check and build commands on push and pull request.

## PWA installation / offline

- Serve the app over HTTPS (localhost is also permitted for camera access).
- After the first successful online load, the service worker caches the app shell and same-origin assets as they are requested.
- Supported Chromium browsers can expose a native install prompt; the custom Install button uses it only when available.
- On iOS Safari, use **Share → Add to Home Screen**. Some browsers require using their own menu to install.
- Offline reopening depends on the service worker having installed successfully and core app assets being cached. Browser data may be evicted or cleared. No claim is made that a first visit can work without a network connection.

## Data storage and privacy

- Image analysis runs on the device; the app has no backend image-processing endpoint or third-party analytics.
- Saved source and annotation images, inspection metadata, and manual adjustments are stored in this browser's IndexedDB, with retention limited to 20 recent records.
- Browser storage is not a permanent archive and is not cryptographically tamper-proof. Export important records and images for your own safekeeping.
- Camera capture is initiated by the user, and camera tracks are stopped when the camera is closed or the component is left.

## Vercel deployment

Import `princetyagi1424/Agro-Purity` into Vercel and use the Vite defaults: install `npm install`, build `npm run build`, output directory `dist`. No secrets or environment variables are required for core analysis. `vercel.json` sets service-worker and manifest headers. Do not mark deployment complete until the actual production URL, fresh-page load, image upload/camera permissions, history/export and offline reload are tested.

## APK distribution

A real Android APK has not been published. Do not advertise a fake or empty download link. When a Capacitor Android wrapper is built and its signed release APK is tested on a compatible device, attach that file to a GitHub Release and add a website link to the actual release asset. Keep signing keys and passwords out of source control.

## Original project scope

The project builds on the AgroPurity hackathon proposal and engineering blueprint while correcting unsafe overclaims in the blueprint. It retains the explainable, browser-based, low-cost visual-screening concept but deliberately excludes unverified AGMARK calculations, official deduction amounts and unsupported accuracy/performance claims.
