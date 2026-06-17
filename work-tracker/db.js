// work-tracker/db.js
const WT_DB_NAME = 'TempoWorkTracker';
const WT_DB_VERSION = 1;
const WT_STORE_SHIFTS = 'shifts';
const WT_STORE_PHOTOS = 'photos';

const WT_DB = {
  db: null,
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(WT_DB_NAME, WT_DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(WT_STORE_SHIFTS)) {
          const shiftStore = db.createObjectStore(WT_STORE_SHIFTS, { keyPath: 'id' });
          shiftStore.createIndex('weekStart', 'weekStart', { unique: false });
        }
        if (!db.objectStoreNames.contains(WT_STORE_PHOTOS)) {
          db.createObjectStore(WT_STORE_PHOTOS, { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => { this.db = e.target.result; resolve(); };
      request.onerror = (e) => reject(e);
    });
  },
  async saveShift(shift) {
    return new Promise((resolve) => {
      const tx = this.db.transaction([WT_STORE_SHIFTS], 'readwrite');
      tx.objectStore(WT_STORE_SHIFTS).put(shift);
      tx.oncomplete = resolve;
    });
  },
  async getShiftsByWeek(weekStartMs) {
    return new Promise((resolve) => {
      const tx = this.db.transaction([WT_STORE_SHIFTS], 'readonly');
      const store = tx.objectStore(WT_STORE_SHIFTS);
      const index = store.index('weekStart');
      const req = index.getAll(weekStartMs);
      req.onsuccess = () => resolve(req.result || []);
    });
  },
  async savePhoto(id, dataUrl) {
    return new Promise((resolve) => {
      const tx = this.db.transaction([WT_STORE_PHOTOS], 'readwrite');
      tx.objectStore(WT_STORE_PHOTOS).put({ id, dataUrl });
      tx.oncomplete = resolve;
    });
  },
  async getPhoto(id) {
    return new Promise((resolve) => {
      const tx = this.db.transaction([WT_STORE_PHOTOS], 'readonly');
      const req = tx.objectStore(WT_STORE_PHOTOS).get(id);
      req.onsuccess = () => resolve(req.result ? req.result.dataUrl : null);
    });
  },
  async deleteShift(id) {
    return new Promise((resolve) => {
      const tx = this.db.transaction([WT_STORE_SHIFTS], 'readwrite');
      tx.objectStore(WT_STORE_SHIFTS).delete(id);
      tx.oncomplete = resolve;
    });
  }
};
