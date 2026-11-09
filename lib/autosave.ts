import type { CustomFont, DocState } from "./types";

/** An editing session kept in this browser's IndexedDB; nothing leaves the device. */
export interface SavedSession {
  /** SHA-256 of the original PDF, so reopening the same file restores its edits. */
  id: string;
  fileName: string;
  pdf: ArrayBuffer;
  doc: DocState;
  fonts: CustomFont[];
  updatedAt: number;
}

export interface SessionSummary {
  id: string;
  fileName: string;
  updatedAt: number;
  editCount: number;
}

const DB_NAME = "pdf-editor";
const STORE = "sessions";
const MAX_SESSIONS = 5;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb() {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function fingerprint(bytes: ArrayBuffer) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const countEdits = (doc: DocState) =>
  Object.keys(doc.textEdits).length + Object.keys(doc.linkEdits).length + doc.objects.length + Object.keys(doc.crops).length;

export async function loadSession(id: string): Promise<SavedSession | undefined> {
  return run("readonly", (s) => s.get(id) as IDBRequest<SavedSession | undefined>);
}

export async function saveSession(session: SavedSession) {
  await run("readwrite", (s) => s.put(session));
  const all = await run("readonly", (s) => s.getAll() as IDBRequest<SavedSession[]>);
  const stale = all.sort((a, b) => b.updatedAt - a.updatedAt).slice(MAX_SESSIONS);
  for (const old of stale) await deleteSession(old.id);
}

export async function deleteSession(id: string) {
  await run("readwrite", (s) => s.delete(id));
}

export async function listSessions(): Promise<SessionSummary[]> {
  const all = await run("readonly", (s) => s.getAll() as IDBRequest<SavedSession[]>);
  return all
    .map((s) => ({ id: s.id, fileName: s.fileName, updatedAt: s.updatedAt, editCount: countEdits(s.doc) }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
