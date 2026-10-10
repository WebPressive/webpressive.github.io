import { ClipData, ClipSummary, RecordingMeta } from '../types';

/**
 * Talk recordings, kept in this browser's IndexedDB (they never leave the computer).
 *   recordings: RecordingMeta, by id (index: deckKey)
 *   clips:      ClipData (timeline included), by id (index: recordingId)
 *   chunks:     { clipId, seq, blob }, by [clipId, seq]: the clip's audio/video, written every second while recording
 */
const DB_NAME = 'webpressive_recordings';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('This browser cannot store recordings (no IndexedDB).'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('recordings')) {
          db.createObjectStore('recordings', { keyPath: 'id' }).createIndex('deckKey', 'deckKey');
        }
        if (!db.objectStoreNames.contains('clips')) {
          db.createObjectStore('clips', { keyPath: 'id' }).createIndex('recordingId', 'recordingId');
        }
        if (!db.objectStoreNames.contains('chunks')) {
          db.createObjectStore('chunks', { keyPath: ['clipId', 'seq'] });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('The recordings database is busy in another WebPressive tab.'));
    });
    dbPromise.catch(() => {
      dbPromise = null; // Allow a later retry
    });
  }
  return dbPromise;
}

const asPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });

const chunkRange = (clipId: string) => IDBKeyRange.bound([clipId, 0], [clipId, Number.MAX_SAFE_INTEGER]);

export async function listRecordings(deckKey: string): Promise<RecordingMeta[]> {
  const db = await openDb();
  const list = await asPromise<RecordingMeta[]>(db.transaction('recordings').objectStore('recordings').index('deckKey').getAll(deckKey));
  return list.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getRecording(id: string): Promise<RecordingMeta | undefined> {
  const db = await openDb();
  return asPromise<RecordingMeta | undefined>(db.transaction('recordings').objectStore('recordings').get(id));
}

export async function putRecording(recording: RecordingMeta): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('recordings', 'readwrite');
  tx.objectStore('recordings').put(recording);
  await done(tx);
}

/** Read-modify-write of one recording in a single transaction. */
export async function updateRecording(id: string, change: (recording: RecordingMeta) => RecordingMeta): Promise<RecordingMeta | undefined> {
  const db = await openDb();
  const tx = db.transaction('recordings', 'readwrite');
  const store = tx.objectStore('recordings');
  const current = await asPromise<RecordingMeta | undefined>(store.get(id));
  let next: RecordingMeta | undefined;
  if (current) {
    next = { ...change(current), updatedAt: Date.now() };
    store.put(next);
  }
  await done(tx);
  return next;
}

export async function putClip(clip: ClipData): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('clips', 'readwrite');
  tx.objectStore('clips').put(clip);
  await done(tx);
}

export async function getClip(id: string): Promise<ClipData | undefined> {
  const db = await openDb();
  return asPromise<ClipData | undefined>(db.transaction('clips').objectStore('clips').get(id));
}

export async function putChunk(clipId: string, seq: number, blob: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction('chunks', 'readwrite');
  tx.objectStore('chunks').put({ clipId, seq, blob });
  await done(tx);
}

/** The clip's audio/video as one file. */
export async function getClipBlob(clipId: string, mimeType: string): Promise<Blob> {
  const db = await openDb();
  const rows = await asPromise<{ blob: Blob }[]>(db.transaction('chunks').objectStore('chunks').getAll(chunkRange(clipId)));
  return new Blob(rows.map((row) => row.blob), { type: mimeType.split(';')[0] });
}

export async function deleteClips(clipIds: string[]): Promise<void> {
  if (clipIds.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(['clips', 'chunks'], 'readwrite');
  clipIds.forEach((id) => {
    tx.objectStore('clips').delete(id);
    tx.objectStore('chunks').delete(chunkRange(id));
  });
  await done(tx);
}

export async function deleteRecording(id: string): Promise<void> {
  const db = await openDb();
  const clipIds = await asPromise<IDBValidKey[]>(db.transaction('clips').objectStore('clips').index('recordingId').getAllKeys(id));
  await deleteClips(clipIds as string[]);
  const tx = db.transaction('recordings', 'readwrite');
  tx.objectStore('recordings').delete(id);
  await done(tx);
}

export const recordingDuration = (recording: RecordingMeta) => recording.clips.reduce((sum, c) => sum + c.durationMs, 0);
export const recordingBytes = (recording: RecordingMeta) => recording.clips.reduce((sum, c) => sum + c.bytes, 0);

/** Space used by this site and still available, when the browser tells. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate && estimate.quota) return { usage: estimate.usage ?? 0, quota: estimate.quota };
  } catch {
    // Not available
  }
  return null;
}

/** Asks the browser not to clear recordings under storage pressure (granted silently or not at all). */
export function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {});
}

export function summaryOf(clip: ClipData): ClipSummary {
  return { id: clip.id, slideIndex: clip.slideIndex, durationMs: clip.durationMs, bytes: clip.bytes, hasVideo: clip.hasVideo };
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = (total % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
