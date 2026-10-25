export function downloadText(filename: string, text: string, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function downloadDataUrl(filename: string, dataUrl: string) {
  const anchor = document.createElement('a'); anchor.href = dataUrl; anchor.download = filename; anchor.click();
}

export function safeFilename(value: string) {
  return value.replace(/[^a-z0-9-_]/gi, '-').replace(/-+/g, '-').slice(0, 70);
}

export function friendlyDate(value: string, withTime = true) {
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' as const } : {}) }).format(new Date(value)); }
  catch { return value; }
}
