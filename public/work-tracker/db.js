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
    const _ds = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const startStr = _ds(start);
    const endStr = _ds(end);
    return getShifts().filter(s => s.date >= startStr && s.date <= endStr);
  }

  function getTipSettings() {
    try {
      const raw = localStorage.getItem('wt_tip_settings');
      if (raw) return JSON.parse(raw);
    } catch {}
    return JSON.parse(JSON.stringify(DEFAULT_TIP_SETTINGS));
  }

  function saveTipSettings(s) {
    localStorage.setItem('wt_tip_settings', JSON.stringify(s));
    return s;
  }

  function getTipsForShift(shiftId) {
    try {
      const raw = localStorage.getItem('wt_tips_' + shiftId);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveTipsForShift(shiftId, tipsData) {
    localStorage.setItem('wt_tips_' + shiftId, JSON.stringify(tipsData));
    return tipsData;
  }

  function deleteTipsForShift(shiftId) {
    localStorage.removeItem('wt_tips_' + shiftId);
  }

  async function deletePhoto(shiftId, photoKey) {
    const db = await openPhotoDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('photos', 'readwrite');
      tx.objectStore('photos').delete(`${shiftId}_${photoKey}`);
      tx.oncomplete = res; tx.onerror = rej;
    });
  }

  function getTaxSettings() {
    try {
      const raw = localStorage.getItem('wt_tax_settings');
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      profile: 'CUSTOM',
      federal: 22,
      socialSecurity: 6.2,
      medicare: 1.45,
      state: 0,
      local: 0,
      pfl: 0,
      otherLabel: '',
      other: 0,
      showEstimate: true,
      mode: 'detailed',
      simplePercent: 25
    };
  }

  function saveTaxSettings(t) {
    localStorage.setItem('wt_tax_settings', JSON.stringify(t));
    return t;
  }

  function getSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {
        payDay: 'friday',
        payPeriod: 'weekly',
        defaultHourlyRate: 16.50,
        workProfile: 'restaurant',
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

  // ── ROSTER (NEW — ADDITIVE, scoped per work location) ──
  // Storage shape: { [locationId]: [{ name, position, points, isMe }, ...] }
  const ROSTER_KEY = 'wt_worker_roster_v1';

  // ── PAYMENT RECORDS (NEW — wt_payments_v1) ──────────
  // Shape: { [locationId_weekStart]: { receivedDate, amount, notes, photoCount } }
  const PAYMENTS_KEY = 'wt_payments_v1';

  function getPayment(locationId, weekStart) {
    try {
      const all = JSON.parse(localStorage.getItem(PAYMENTS_KEY)) || {};
      return all[locationId + '_' + weekStart] || null;
    } catch { return null; }
  }

  function savePayment(locationId, weekStart, data) {
    try {
      const all = JSON.parse(localStorage.getItem(PAYMENTS_KEY)) || {};
      all[locationId + '_' + weekStart] = { ...data, locationId, weekStart };
      localStorage.setItem(PAYMENTS_KEY, JSON.stringify(all));
    } catch {}
    return data;
  }

  function deletePayment(locationId, weekStart) {
    try {
      const all = JSON.parse(localStorage.getItem(PAYMENTS_KEY)) || {};
      delete all[locationId + '_' + weekStart];
      localStorage.setItem(PAYMENTS_KEY, JSON.stringify(all));
    } catch {}
  }

  function getRoster(locationId) {
    try {
      const all = JSON.parse(localStorage.getItem(ROSTER_KEY)) || {};
      return all[locationId] || [];
    } catch { return []; }
  }

  function saveRosterMember(locationId, member) {
    try {
      const all = JSON.parse(localStorage.getItem(ROSTER_KEY)) || {};
      if (!all[locationId]) all[locationId] = [];
      const idx = all[locationId].findIndex(m =>
        (m.name || '').trim().toLowerCase() === (member.name || '').trim().toLowerCase()
      );
      if (idx >= 0) all[locationId][idx] = member; else all[locationId].push(member);
      localStorage.setItem(ROSTER_KEY, JSON.stringify(all));
    } catch {}
    return member;
  }

  function deleteRosterMember(locationId, name) {
    try {
      const all = JSON.parse(localStorage.getItem(ROSTER_KEY)) || {};
      if (!all[locationId]) return;
      all[locationId] = all[locationId].filter(m =>
        (m.name || '').trim().toLowerCase() !== (name || '').trim().toLowerCase()
      );
      localStorage.setItem(ROSTER_KEY, JSON.stringify(all));
    } catch {}
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
    exportData, importData,
    getTaxSettings, saveTaxSettings,
    getTipSettings, saveTipSettings,
    getTipsForShift, saveTipsForShift, deleteTipsForShift,
    getRoster, saveRosterMember, deleteRosterMember,
    deletePhoto,
    getPayment, savePayment, deletePayment
  };
})();
