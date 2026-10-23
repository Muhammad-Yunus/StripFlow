const DB_NAME = 'stripflow';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_META = 'meta';
const LS_PREFIX = 'stripflow:';
const memoryProjects = new Map();
let dbPromise = null;
let unavailable = false;

function openDB() {
  if (unavailable) return Promise.reject(new Error('IndexedDB unavailable'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      unavailable = true;
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const store = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        store.createIndex('modifiedAt', 'meta.modifiedAt');
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      unavailable = true;
      reject(req.error ?? new Error('Failed to open IndexedDB'));
    };
  });
  return dbPromise;
}

/** @param {IDBRequest} req */
function asPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @returns {Promise<{id:string,name:string,modifiedAt:number,createdAt:number}[]>} */
export async function listProjects() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    const rows = await asPromise(tx.objectStore(STORE_PROJECTS).getAll());
    return (rows ?? [])
      .map((p) => ({
        id: p.id,
        name: p.name,
        modifiedAt: p.meta?.modifiedAt ?? 0,
        createdAt: p.meta?.createdAt ?? 0,
      }))
      .sort((a, b) => b.modifiedAt - a.modifiedAt);
  } catch {
    return [...memoryProjects.values()]
      .map((p) => ({
        id: p.id,
        name: p.name,
        modifiedAt: p.meta?.modifiedAt ?? 0,
        createdAt: p.meta?.createdAt ?? 0,
      }))
      .sort((a, b) => b.modifiedAt - a.modifiedAt);
  }
}

/** @param {string} id @returns {Promise<object|null>} */
export async function getProject(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PROJECTS, 'readonly');
    return (await asPromise(tx.objectStore(STORE_PROJECTS).get(id))) ?? null;
  } catch {
    return memoryProjects.get(id) ?? null;
  }
}

/** @param {import('./types.js').Project} project */
export async function putProject(project) {
  memoryProjects.set(project.id, structuredClone(project));
  if (unavailable) return false;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    tx.objectStore(STORE_PROJECTS).put(project);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    unavailable = true;
    return false;
  }
}

/** @param {string} id */
export async function deleteProject(id) {
  memoryProjects.delete(id);
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    tx.objectStore(STORE_PROJECTS).delete(id);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* memory fallback already handled */
  }
}

/** @param {string} key @param {string} value */
export async function setMeta(key, value) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put({ key, value });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

/** @param {string} key */
export async function getMeta(key) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_META, 'readonly');
    const row = await asPromise(tx.objectStore(STORE_META).get(key));
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {unknown} fallback
 */
export function getSetting(key, fallback) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** @param {string} key @param {unknown} value */
export function setSetting(key, value) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}
