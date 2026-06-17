// work-tracker/db.js
// Storage layer - uses localStorage for shifts + IndexedDB for photos
// Photos also auto-download to phone gallery as backup

const WTDb = (() => {
  const SHIFTS_KEY = 'wt_shifts_v1';
  const LOCATIONS_KEY = 'wt_locations_v1';
  const SETTINGS_KEY = 'wt_settings_v1';
  const PHOTOS_DB = 'wt_photos_v1';

  function getLocations() {
    try { return JSON.parse(localStorage.getItem(LOCATIONS_KEY)) || []; }
    catch { return []; }
  }

  function saveLocation(loc) {
    const locs = getLocations();
    const idx = locs.findIndex(l => l.id === loc.id);
    if (idx >= 0) locs[idx] = loc; else locs.push(loc);
    localStorage.setItem(LOCATIONS_KEY, JSON.stringify(locs));
    return loc;
  }

  function deleteLocation(id) {
    const locs = getLocations().filter(l => l.id !== id);
    localStorage.setItem(LOCATIONS_KEY, JSON.stringify(locs));
  }

  function getShifts() {
    try { return JSON.parse(localStorage.getItem(SHIFTS_KEY)) || []; }
    catch { return []; }
  }

  function saveShift(shift) {
    const shifts = getShifts();
    const idx = shifts.findIndex(s => s.id === shift.id);
    if (idx >= 0) shifts[idx] = shift; else shifts.push(shift);
    localStorage.setItem(SHIFTS_KEY, JSON.stringify(shifts));
    return shift;
  }

  function deleteShift(id) {
    if (!confirm('Delete this shift? This cannot be undone.')) return false;
    const shifts = getShifts().filter(s => s.id !== id);
    localStorage.setItem(SHIFTS_KEY, JSON.stringify(shifts));
    return true;
  }

  function getShiftsForDate(dateStr) {
    return getShifts().filter(s => s.date === dateStr);
  }

  function getShiftsForWeek(weekStart) {
    const start = new Date(weekStart);
    const end = getWeekEnd(start);
    return getShifts().filter(s => {
      const d = new Date(s.date);
      return d >= start && d <= end;
    });
  }

  function getSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {
        payDay: 'friday',
        payPeriod: 'weekly',
        defaultHourlyRate: NYC_MIN_WAGE,
        customShiftNames: []
      };
    } catch { return {}; }
  }

  function saveSettings(s) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }

  let photoDB = null;

  function openPhotoDB() {
    return new Promise((resolve, reject) => {
      if (photoDB) { resolve(photoDB); return; }
      const req = indexedDB.open(PHOTOS_DB, 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('photos')) {
          db.createObjectStore('photos', { keyPath: 'id' });
        }
      };
      req.onsuccess = e => { photoDB = e.target.result; resolve(photoDB); };
      req.onerror = () => reject(req.error);
    });
  }

  async function savePhoto(shiftId, type, base64) {
    const db = await openPhotoDB();
    const id = `${shiftId}_${type}`;
    await new Promise((res, rej) => {
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').put({ id, shiftId, type, base64, ts: Date.now() });
      tx.oncomplete = res; tx.onerror = rej;
    });
    try {
      const a = document.createElement('a');
      a.href = base64;
      const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
      a.download = `Tempo_${type}_${now}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch(e) { console.warn('Auto-download failed:', e); }
    return id;
  }

  async function getPhoto(shiftId, type) {
    const db = await openPhotoDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('photos', 'readonly');
      const req = tx.objectStore('photos').get(`${shiftId}_${type}`);
      req.onsuccess = () => res(req.result?.base64 || null);
      req.onerror = rej;
    });
  }

  function exportData() {
    return JSON.stringify({
      version: WT_VERSION,
      exportedAt: new Date().toISOString(),
      locations: getLocations(),
      shifts: getShifts(),
      settings: getSettings()
    }, null, 2);
  }

  function importData(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (data.locations) localStorage.setItem(LOCATIONS_KEY, JSON.stringify(data.locations));
      if (data.shifts) localStorage.setItem(SHIFTS_KEY, JSON.stringify(data.shifts));
      if (data.settings) localStorage.setItem(SETTINGS_KEY, JSON.stringify(data.settings));
      return true;
    } catch { return false; }
  }

  return {
    getLocations, saveLocation, deleteLocation,
    getShifts, saveShift, deleteShift, getShiftsForDate, getShiftsForWeek,
    getSettings, saveSettings,
    savePhoto, getPhoto,
    exportData, importData
  };
})();
