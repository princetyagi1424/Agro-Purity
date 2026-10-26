import type { ClassificationCounts, ComponentFeatures } from '../types';

export interface ReportPayload {
  id?: string;
  createdAt: string;
  grainType: string;
  inputSource: string;
  algorithmVersion: string;
  synthetic: boolean;
  counts: ClassificationCounts;
  adjustedCounts?: ClassificationCounts;
  detections: ComponentFeatures[];
  disclaimer: string;
  qualityMessages?: string[];
}

function csvEscape(v: string | number | boolean | undefined | null): string {
  const s = v === undefined || v === null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Flat CSV: one summary row + one row per non-noise detection. */
export function buildInspectionCsv(p: ReportPayload): string {
  const counts = p.adjustedCounts ?? p.counts;
  const lines: string[] = [];
  lines.push(
    [
      'kind', 'id', 'createdAt', 'grainType', 'inputSource', 'algorithmVersion',
      'synthetic', 'whole', 'broken', 'foreign', 'uncertain', 'disclaimer',
    ].join(',')
  );
  lines.push(
    [
      'summary', csvEscape(p.id), csvEscape(p.createdAt), csvEscape(p.grainType),
      csvEscape(p.inputSource), csvEscape(p.algorithmVersion),
      p.synthetic ? 'true' : 'false',
      counts.whole, counts.broken, counts.foreign, counts.uncertain,
      csvEscape(p.disclaimer),
    ].join(',')
  );
  lines.push('');
  lines.push(
    [
      'detectionId', 'label', 'originalLabel', 'manuallyAdjusted', 'area',
      'aspectRatio', 'meanLuminance', 'bboxX', 'bboxY', 'bboxW', 'bboxH', 'labelReason',
    ].join(',')
  );
  for (const d of p.detections.filter((x) => x.label !== 'noise')) {
    lines.push(
      [
        d.id, csvEscape(d.label), csvEscape(d.originalLabel ?? ''),
        d.manuallyAdjusted ? 'true' : 'false', d.area, d.aspectRatio.toFixed(3),
        d.meanLuminance.toFixed(1), d.bbox.x, d.bbox.y, d.bbox.width, d.bbox.height,
        csvEscape(d.labelReason),
      ].join(',')
    );
  }
  return lines.join('\n');
}

export function downloadTextFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function printInspectionReport(opts: {
  title: string;
  disclaimer: string;
  meta: Array<[string, string]>;
  counts: ClassificationCounts;
  labels: { whole: string; broken: string; foreign: string; uncertain: string };
  imageSrc?: string | null;
  synthetic?: boolean;
  syntheticLabel?: string;
}): void {
  const rows = opts.meta
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join('');
  const img = opts.imageSrc
    ? `<img src="${opts.imageSrc}" alt="inspection" style="max-width:100%;height:auto;border:1px solid #ccc;margin-top:12px" />`
    : '';
  const banner = opts.synthetic
    ? `<p style="background:#fff3cd;padding:8px;border:1px solid #ffc107"><strong>${escapeHtml(opts.syntheticLabel ?? 'Synthetic')}</strong></p>`
    : '';
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(opts.title)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#192a20}
h1{font-size:1.4rem} table{border-collapse:collapse;width:100%;margin:12px 0}
th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:13px}
th{background:#f0f3ec;width:40%} .counts span{display:inline-block;margin-right:12px;font-weight:600}
.disclaimer{font-size:12px;color:#555;margin-top:16px;border-top:1px solid #ddd;padding-top:12px}
@media print{body{margin:0}}
</style></head><body>
<h1>${escapeHtml(opts.title)}</h1>
${banner}
<table>${rows}</table>
<p class="counts">
<span>${escapeHtml(opts.labels.whole)}: ${opts.counts.whole}</span>
<span>${escapeHtml(opts.labels.broken)}: ${opts.counts.broken}</span>
<span>${escapeHtml(opts.labels.foreign)}: ${opts.counts.foreign}</span>
<span>${escapeHtml(opts.labels.uncertain)}: ${opts.counts.uncertain}</span>
</p>
${img}
<p class="disclaimer">${escapeHtml(opts.disclaimer)}</p>
<script>window.onload=function(){window.print();}</script>
</body></html>`;
  const w = window.open('', '_blank', 'noopener,noreferrer,width=800,height=900');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
