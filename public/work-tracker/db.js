// work-tracker/db.js
// Storage layer - uses localStorage for shifts + IndexedDB for photos
// Photos also auto-download to phone gallery as backup

const WTDb = (() => {
  // KEY VERSIONING CONVENTION: every new localStorage key gets a "_vN" suffix so a future
  // incompatible schema change can move to "_vN+1" and migrate, without ever touching or
  // renaming a key real user data already lives under. SHIFTS/LOCATIONS/SETTINGS/ROSTER/
  // PAYMENTS already follow this. wt_tip_settings, wt_tips_<shiftId>, wt_dayoff, and
  // wt_tax_settings predate the convention and are intentionally left unrenamed — renaming
  // them now would require a data migration for zero functional benefit, purely cosmetic
  // risk for real user data. Any brand-new key going forward should use "_v1" from the start.
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
    deleteTipsForShift(id);
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

  // Removes tip records left behind by shifts deleted before deleteShift cleaned up after
  // itself. Only ever touches a wt_tips_<id> key when <id> matches no shift at all — never
  // touches anything tied to a shift that still exists. Returns how many were removed.
  function cleanOrphanedTips() {
    const validIds = new Set(getShifts().map(s => s.id));
    let removed = 0;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith('wt_tips_') && !validIds.has(key.slice(8))) {
        localStorage.removeItem(key);
        removed++;
      }
    }
    return removed;
  }

  // Day Off reasons are scoped per work profile (being off from one job says nothing about
  // another). wt_dayoff (v1) was flat by date only, predating work profiles — migrated once,
  // untouched, into wt_dayoff_v2 under 'restaurant' (the app's original, sole profile) so no
  // existing record is ever lost or silently reinterpreted.
  const DAYOFF_KEY_V1 = 'wt_dayoff';
  const DAYOFF_KEY_V2 = 'wt_dayoff_v2';

  function _migrateDayOffToV2() {
    try {
      if (localStorage.getItem(DAYOFF_KEY_V2)) return;
      const old = JSON.parse(localStorage.getItem(DAYOFF_KEY_V1) || '{}');
      localStorage.setItem(DAYOFF_KEY_V2, JSON.stringify(Object.keys(old).length ? { restaurant: old } : {}));
    } catch {}
  }

  function getDayOffReason(date, profile) {
    _migrateDayOffToV2();
    const p = profile || 'restaurant';
    try {
      const all = JSON.parse(localStorage.getItem(DAYOFF_KEY_V2) || '{}');
      return (all[p] && all[p][date]) || null;
    } catch { return null; }
  }

  function saveDayOffReason(date, profile, data) {
    _migrateDayOffToV2();
    const p = profile || 'restaurant';
    try {
      const all = JSON.parse(localStorage.getItem(DAYOFF_KEY_V2) || '{}');
      if (!all[p]) all[p] = {};
      all[p][date] = data;
      localStorage.setItem(DAYOFF_KEY_V2, JSON.stringify(all));
    } catch {}
  }

  function deleteDayOffReason(date, profile) {
    _migrateDayOffToV2();
    const p = profile || 'restaurant';
    try {
      const all = JSON.parse(localStorage.getItem(DAYOFF_KEY_V2) || '{}');
      if (all[p]) delete all[p][date];
      localStorage.setItem(DAYOFF_KEY_V2, JSON.stringify(all));
    } catch {}
  }

  function getAllDayOffReasons(profile) {
    _migrateDayOffToV2();
    const p = profile || 'restaurant';
    try {
      const all = JSON.parse(localStorage.getItem(DAYOFF_KEY_V2) || '{}');
      return all[p] || {};
    } catch { return {}; }
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

  function getBudget() {
    try {
      const raw = localStorage.getItem('wt_budget_v1');
      if (raw) return JSON.parse(raw);
    } catch {}
    return { monthlyExpenses: null };
  }

  function saveBudget(b) {
    localStorage.setItem('wt_budget_v1', JSON.stringify(b));
    return b;
  }

  function getSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
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

  function getShiftsInRange(startDate, endDate) {
    return getShifts().filter(s => s.date >= startDate && s.date <= endDate);
  }

  function getAllPayments() {
    try { return Object.values(JSON.parse(localStorage.getItem(PAYMENTS_KEY)) || {}); }
    catch { return []; }
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

  function deleteRosterMember(locationId, memberName) {
    try {
      const all = JSON.parse(localStorage.getItem(ROSTER_KEY)) || {};
      if (!all[locationId]) return;
      all[locationId] = all[locationId].filter(m =>
        (m.name || '').trim().toLowerCase() !== (memberName || '').trim().toLowerCase()
      );
      localStorage.setItem(ROSTER_KEY, JSON.stringify(all));
    } catch {}
  }

  function getLastBackupDate() {
    return localStorage.getItem('wt_last_backup');
  }

  function setLastBackupDate(iso) {
    localStorage.setItem('wt_last_backup', iso);
  }

  function exportData() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('wt_')) data[key] = localStorage.getItem(key);
    }
    return JSON.stringify({
      version: WT_VERSION,
      exportedAt: new Date().toISOString(),
      data
    }, null, 2);
  }

  function importData(jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.data && typeof parsed.data === 'object') {
        Object.entries(parsed.data).forEach(([key, value]) => {
          if (key.startsWith('wt_')) localStorage.setItem(key, value);
        });
        return true;
      }
      // Legacy fallback: older exports only had locations/shifts/settings
      if (parsed.locations) localStorage.setItem(LOCATIONS_KEY, JSON.stringify(parsed.locations));
      if (parsed.shifts) localStorage.setItem(SHIFTS_KEY, JSON.stringify(parsed.shifts));
      if (parsed.settings) localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed.settings));
      return true;
    } catch { return false; }
  }

  // Clears every wt_-prefixed localStorage key (scanned by prefix, not a hardcoded list, so
  // dynamic per-shift keys like wt_tips_<id> are correctly caught too) plus the photos
  // IndexedDB. Scoped strictly to the wt_ prefix — Study Tracker (st_) and Tempo Simple Mode
  // (tempo_v1, tempo_simple_mode) live under different prefixes and are never touched.
  function deleteAllData() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf('wt_') === 0) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    return new Promise(resolve => {
      const req = indexedDB.deleteDatabase(PHOTOS_DB);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(true);
      req.onblocked = () => resolve(true);
    });
  }

  const FLOORPLAN_KEY = 'wt_floorplan_v1';

  function getFloorPlan(locationId) {
    try {
      const all = JSON.parse(localStorage.getItem(FLOORPLAN_KEY)) || {};
      return all[locationId] || { elements: [] };
    } catch { return { elements: [] }; }
  }

  function saveFloorPlan(locationId, plan) {
    try {
      const all = JSON.parse(localStorage.getItem(FLOORPLAN_KEY)) || {};
      all[locationId] = plan;
      localStorage.setItem(FLOORPLAN_KEY, JSON.stringify(all));
    } catch {}
  }

  return {
    getLocations, saveLocation, deleteLocation,
    getShifts, saveShift, deleteShift, getShiftsForDate, getShiftsForWeek,
    getSettings, saveSettings,
    savePhoto, getPhoto,
    exportData, importData,
    getTaxSettings, saveTaxSettings,
    getBudget, saveBudget,
    getTipSettings, saveTipSettings,
    getTipsForShift, saveTipsForShift, deleteTipsForShift, cleanOrphanedTips,
    getDayOffReason, saveDayOffReason, deleteDayOffReason, getAllDayOffReasons,
    getRoster, saveRosterMember, deleteRosterMember,
    deletePhoto,
    getPayment, savePayment, deletePayment,
    getShiftsInRange, getAllPayments,
    getLastBackupDate, setLastBackupDate,
    deleteAllData,
    getFloorPlan, saveFloorPlan
  };
})();
