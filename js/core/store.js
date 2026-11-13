// تخزين محلي آمن: كل قراءة وكتابة داخل try/catch حتى لا يتعطل التطبيق في التصفح الخاص
const PREFIX = 'um.';

export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
  },
  del(key) {
    try { localStorage.removeItem(PREFIX + key); } catch { /* تجاهل */ }
  },
};

// IndexedDB بسيط (للمحرر: نسخة العمل والصور المرفوعة)
export function idb(dbName = 'um-admin', stores = ['kv', 'media']) {
  let dbp;
  const open = () => dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(dbName, 1);
    r.onupgradeneeded = () => stores.forEach(s => { if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async (store, mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const out = fn(s);
      t.oncomplete = () => res(out instanceof IDBRequest ? out.result : out);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    get: (store, key) => tx(store, 'readonly', s => s.get(key)),
    put: (store, key, val) => tx(store, 'readwrite', s => s.put(val, key)),
    del: (store, key) => tx(store, 'readwrite', s => s.delete(key)),
    keys: (store) => tx(store, 'readonly', s => s.getAllKeys()),
    clear: (store) => tx(store, 'readwrite', s => s.clear()),
  };
}
