import type { Detection } from '../vision/core.mjs';

export interface InspectionRecord {
  id: string;
  createdAt: string;
  crop: 'Wheat';
  source: 'camera' | 'upload' | 'demo';
  demo: boolean;
  algorithmVersion: string;
  settings: { processingWidth: number; processingHeight: number; threshold: number; polarity: string; foregroundRatio: number; connectivity: number };
  initialCounts: { whole: number; broken: number; foreign: number; uncertain: number; reviewedTotal: number };
  counts: { whole: number; broken: number; foreign: number; uncertain: number; reviewedTotal: number };
  ignored: number;
  detections: Detection[];
  warnings: string[];
  quality: { acceptable: boolean; severity: string; warnings: string[]; meanBrightness: number | null; contrast: number | null };
  sourceImageDataUrl: string;
  annotatedImageDataUrl: string;
  disclaimer: string;
}

const DB_NAME = 'agropurity-local';
const STORE = 'inspections';
const DB_VERSION = 1;
const MAX_RECORDS = 20;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('This browser does not support local inspection storage.'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local browser storage.'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Local storage transaction failed.'));
    tx.onabort = () => reject(tx.error || new Error('Local storage transaction was cancelled.'));
  });
}

export async function listRecords(): Promise<InspectionRecord[]> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    const records = await new Promise<InspectionRecord[]>((resolve, reject) => {
      request.onsuccess = () => resolve((request.result as InspectionRecord[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      request.onerror = () => reject(request.error || new Error('Could not read inspection history.'));
    });
    return records;
  } finally { db.close(); }
}

export async function saveRecord(record: InspectionRecord): Promise<void> {
  const db = await openDb();
  try {
    // Bound retained history so local evidence cannot grow without limit.
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const allRequest = store.getAll();
    const oldRecords = await new Promise<InspectionRecord[]>((resolve, reject) => {
      allRequest.onsuccess = () => resolve(allRequest.result as InspectionRecord[]);
      allRequest.onerror = () => reject(allRequest.error || new Error('Could not check storage usage.'));
    });
    oldRecords.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    oldRecords.slice(MAX_RECORDS - 1).forEach((old) => store.delete(old.id));
    store.put(record);
    await transactionDone(tx);
  } finally { db.close(); }
}

export async function deleteRecord(id: string): Promise<void> {
  const db = await openDb();
  try { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).delete(id); await transactionDone(tx); }
  finally { db.close(); }
}

export async function clearRecords(): Promise<void> {
  const db = await openDb();
  try { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); await transactionDone(tx); }
  finally { db.close(); }
}

export function downloadableRecord(record: InspectionRecord) {
  const { sourceImageDataUrl, annotatedImageDataUrl, ...metadata } = record;
  return {
    ...metadata,
    sourceImage: 'Stored in this browser record; exported separately as source-image.jpg where requested.',
    annotatedImage: 'Export the annotated PNG separately using the record detail controls.',
    dataScope: 'Local-first preliminary visual screening. Data remain in this browser unless the user exports them.',
  };
}
