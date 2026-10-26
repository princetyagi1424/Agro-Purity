/**
 * IndexedDB storage for inspection records and image blobs.
 */
import { openDB, type IDBPDatabase } from 'idb';
import type { InspectionRecord } from '../../types';

const DB_NAME = 'agropurity-db';
const DB_VERSION = 1;
const RECORDS_STORE = 'records';
const IMAGES_STORE = 'images';
const MAX_RECORDS = 50;

interface AgroDB {
  records: {
    key: string;
    value: InspectionRecord;
    indexes: { 'by-date': string };
  };
  images: {
    key: string;
    value: Blob;
  };
}

let dbPromise: Promise<IDBPDatabase<AgroDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<AgroDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(RECORDS_STORE)) {
          const store = db.createObjectStore(RECORDS_STORE, { keyPath: 'id' });
          store.createIndex('by-date', 'createdAt');
        }
        if (!db.objectStoreNames.contains(IMAGES_STORE)) {
          db.createObjectStore(IMAGES_STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function saveRecord(
  record: InspectionRecord,
  originalBlob?: Blob,
  annotatedBlob?: Blob
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([RECORDS_STORE, IMAGES_STORE], 'readwrite');

  if (originalBlob && record.originalImageKey) {
    await tx.objectStore(IMAGES_STORE).put(originalBlob, record.originalImageKey);
  }
  if (annotatedBlob && record.annotatedImageKey) {
    await tx.objectStore(IMAGES_STORE).put(annotatedBlob, record.annotatedImageKey);
  }
  await tx.objectStore(RECORDS_STORE).put(record);
  await tx.done;

  const all = await db.getAllFromIndex(RECORDS_STORE, 'by-date');
  if (all.length > MAX_RECORDS) {
    const toDelete = all.slice(0, all.length - MAX_RECORDS);
    const delTx = db.transaction([RECORDS_STORE, IMAGES_STORE], 'readwrite');
    for (const r of toDelete) {
      if (r.originalImageKey) await delTx.objectStore(IMAGES_STORE).delete(r.originalImageKey);
      if (r.annotatedImageKey) await delTx.objectStore(IMAGES_STORE).delete(r.annotatedImageKey);
      await delTx.objectStore(RECORDS_STORE).delete(r.id);
    }
    await delTx.done;
  }
}

export async function listRecords(): Promise<InspectionRecord[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex(RECORDS_STORE, 'by-date');
  return all.reverse();
}

export async function getRecord(id: string): Promise<InspectionRecord | undefined> {
  const db = await getDb();
  return db.get(RECORDS_STORE, id);
}

export async function getImageBlob(key: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get(IMAGES_STORE, key);
}

export async function deleteRecord(id: string): Promise<void> {
  const db = await getDb();
  const record = await db.get(RECORDS_STORE, id);
  const tx = db.transaction([RECORDS_STORE, IMAGES_STORE], 'readwrite');
  if (record?.originalImageKey) await tx.objectStore(IMAGES_STORE).delete(record.originalImageKey);
  if (record?.annotatedImageKey) await tx.objectStore(IMAGES_STORE).delete(record.annotatedImageKey);
  await tx.objectStore(RECORDS_STORE).delete(id);
  await tx.done;
}

export async function clearAllRecords(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([RECORDS_STORE, IMAGES_STORE], 'readwrite');
  await tx.objectStore(RECORDS_STORE).clear();
  await tx.objectStore(IMAGES_STORE).clear();
  await tx.done;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0]?.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bstr = atob(parts[1] ?? '');
  const u8 = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

export function generateId(): string {
  return `insp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
