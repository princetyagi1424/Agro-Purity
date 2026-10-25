import test from 'node:test';
import assert from 'node:assert/strict';
import { toGrayscale, otsuThreshold, buildMask, connectedComponents, analyzePixels, countLabels, MAX_PROCESSING_PIXELS } from '../src/vision/core.mjs';

function rgbaImage(width, height, fill = [255,255,255,255]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(fill, i * 4);
  return data;
}
function rect(data, imageWidth, x, y, w, h, color) {
  for (let yy=y; yy<y+h; yy++) for (let xx=x; xx<x+w; xx++) data.set([...color,255], (yy*imageWidth+xx)*4);
}

test('grayscale uses luminance weighting and returns a byte array', () => {
  const gray = toGrayscale(new Uint8ClampedArray([255,0,0,255, 0,255,0,255, 0,0,255,255]), 3, 1);
  assert.equal(gray.length, 3);
  assert.ok(Math.abs(gray[0] - 76) <= 1);
  assert.ok(Math.abs(gray[1] - 150) <= 1);
  assert.ok(Math.abs(gray[2] - 29) <= 1);
});

test('grayscale rejects mismatched dimensions and malformed pixels', () => {
  assert.throws(() => toGrayscale(new Uint8Array(8), 2, 2), /length/);
  assert.throws(() => toGrayscale(new Uint8Array(4), 0, 1), /positive/);
});

test('Otsu returns a stable non-separable result for a uniform image', () => {
  const result = otsuThreshold(new Uint8Array(100).fill(200));
  assert.equal(result.threshold, 200);
  assert.equal(result.separable, false);
});

test('Otsu finds a useful threshold for two intensity groups', () => {
  const gray = new Uint8Array(100).fill(240);
  gray.fill(45, 0, 25);
  const result = otsuThreshold(gray);
  assert.ok(result.separable);
  assert.ok(result.threshold >= 45 && result.threshold < 240);
});

test('binary mask handles dark and bright foreground polarities', () => {
  const gray = new Uint8Array([0,0,240,240]);
  const dark = buildMask(gray, 10, 'dark');
  const bright = buildMask(gray, 10, 'bright');
  assert.equal(dark.foreground, 2);
  assert.equal(bright.foreground, 2);
  assert.deepEqual(Array.from(dark.mask), [1,1,0,0]);
  assert.deepEqual(Array.from(bright.mask), [0,0,1,1]);
});

test('connected components measure area and inclusive bounding boxes', () => {
  const mask = new Uint8Array(8 * 6);
  mask[1 * 8 + 2] = 1; mask[1 * 8 + 3] = 1; mask[2 * 8 + 2] = 1;
  mask[4 * 8 + 6] = 1;
  const comps = connectedComponents(mask, 8, 6, 4).sort((a,b) => b.area-a.area);
  assert.equal(comps.length, 2);
  assert.equal(comps[0].area, 3);
  assert.deepEqual([comps[0].minX,comps[0].maxX,comps[0].minY,comps[0].maxY], [2,3,1,2]);
  assert.equal(comps[0].boxWidth, 2);
  assert.equal(comps[0].boxHeight, 2);
  assert.equal(comps[1].area, 1);
});

test('connected components resolve equivalences and diagonal connectivity', () => {
  const mask = new Uint8Array(5*4);
  // Two runs initially labelled separately; a later bridge merges them.
  for (const [x,y] of [[0,0],[1,0],[3,0],[3,1],[2,1],[1,1]]) mask[y*5+x]=1;
  assert.equal(connectedComponents(mask,5,4,4).length, 1);
  const diagonals = new Uint8Array([1,0,0,1]);
  assert.equal(connectedComponents(diagonals,2,2,4).length, 2);
  assert.equal(connectedComponents(diagonals,2,2,8).length, 1);
});

test('connected-component labeling rejects invalid masks and unsafe images', () => {
  assert.throws(() => connectedComponents(new Uint8Array(3), 2, 2), /match/);
  assert.throws(() => connectedComponents(new Uint8Array(MAX_PROCESSING_PIXELS+1), MAX_PROCESSING_PIXELS+1, 1), /processing limit/);
});

test('analysis generates measured candidates and honest labels from known synthetic pixels', () => {
  const width=160, height=120;
  const pixels=rgbaImage(width,height,[245,245,240,255]);
  rect(pixels,width,20,20,24,7,[188,132,57]); // elongated warm object
  rect(pixels,width,70,30,10,8,[186,130,55]); // compact warm object
  rect(pixels,width,112,70,7,6,[45,42,39]);   // dark neutral object
  const result=analyzePixels(pixels,width,height);
  assert.ok(result.detections.length >= 3);
  assert.equal(result.counts.reviewedTotal, result.detections.length);
  assert.ok(result.detections.every((d) => d.id && d.box.width > 0 && d.areaPx > 0));
  assert.equal(result.algorithmVersion, 'agropurity-cv-0.1.0');
  assert.ok(result.notes.some((n) => n.includes('mass percentages')));
});

test('analysis rejects uniform/low-information images instead of faking a result', () => {
  const pixels=rgbaImage(160,160,[244,244,244,255]);
  assert.throws(() => analyzePixels(pixels,160,160), /uniform|separation|low contrast/i);
});

test('empty input and bad dimensions are rejected', () => {
  assert.throws(() => otsuThreshold(new Uint8Array()), /non-empty/);
  assert.throws(() => analyzePixels(new Uint8Array(0), 10, 10), /dimensions|length/);
});

test('class counts reflect corrected labels', () => {
  const counts = countLabels([{label:'whole'},{label:'broken'},{label:'uncertain'},{label:'whole'}]);
  assert.deepEqual(counts,{whole:2,broken:1,foreign:0,uncertain:1,reviewedTotal:4});
});
