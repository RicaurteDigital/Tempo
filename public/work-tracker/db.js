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
      if (raw) {
        const b = JSON.parse(raw);
        if (b.includeCashInBreakEven === undefined) b.includeCashInBreakEven = false;
        if (b.cycleStartDay === undefined) b.cycleStartDay = 1;
        return b;
      }
    } catch {}
    return { monthlyExpenses: null, includeCashInBreakEven: false, cycleStartDay: 1 };
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

  const BAR_CATALOG_KEY = 'wt_bar_catalog_v1';
  const BAR_HH_KEY = 'wt_bar_hh_settings_v1';

  function getBarCatalog() {
    try {
      const raw = localStorage.getItem(BAR_CATALOG_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  }

  function saveBarCatalog(items) {
    localStorage.setItem(BAR_CATALOG_KEY, JSON.stringify(items));
    return items;
  }

  function getBarHHSettings() {
    try {
      const raw = localStorage.getItem(BAR_HH_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    // Default matches AtoZ Rooftop's posted hours — editable in Settings and overridable
    // per-session from the POS screen, per Fernando's confirmed requirement.
    return {
      enabled: true,
      days: [1, 2, 3, 4, 5], // Mon-Fri (0=Sun...6=Sat)
      startTime: '16:30',
      endTime: '18:30',
      prices: { wine: 12, cocktail: 14, beer: 8 },
      sessionOverride: null // { active: true/false } set from the POS for a one-off day change
    };
  }

  function saveBarHHSettings(settings) {
    localStorage.setItem(BAR_HH_KEY, JSON.stringify(settings));
    return settings;
  }

  // Curated starting catalog for AtoZ Rooftop's bar menu. Verified classic cocktails cite a
  // real source (IBA official list, or another named published recipe); house originals are
  // left with empty ingredients until the real recipe is provided — never guessed at.
  function getDefaultBarCatalogSeed() {
    return [
      // --- Cocktails ---
      {
        id: 'aperol_spritz', name: 'Aperol Spritz', category: 'cocktail', price: 20,
        isHouseOriginal: false, source: 'IBA Official Cocktail (Spritz Veneziano)',
        glass: 'Wine glass',
        ingredients: [
          { name: 'Prosecco', amount: 3, unit: 'oz' },
          { name: 'Aperol', amount: 2, unit: 'oz' },
          { name: 'Soda water', amount: 0, unit: 'splash' }
        ],
        garnish: 'Orange slice',
        method: 'Build into a wine glass filled with ice. Stir gently.'
      },
      {
        id: 'margarita', name: 'Margarita', category: 'cocktail', price: 19,
        isHouseOriginal: false, source: 'IBA Official Cocktail',
        glass: 'Margarita glass (salt rim)',
        ingredients: [
          { name: 'Tequila', amount: 1.25, unit: 'oz' },
          { name: 'Triple Sec (Cointreau)', amount: 0.75, unit: 'oz' },
          { name: 'Lime juice', amount: 0.5, unit: 'oz' }
        ],
        garnish: 'Salt rim',
        method: 'Shake with ice. Strain into a salt-rimmed cocktail glass.'
      },
      {
        id: 'negroni', name: 'Negroni', category: 'cocktail', price: 20,
        isHouseOriginal: false, source: 'IBA Official Cocktail',
        glass: 'Old-fashioned',
        ingredients: [
          { name: 'Gin', amount: 1, unit: 'oz' },
          { name: 'Campari', amount: 1, unit: 'oz' },
          { name: 'Sweet red vermouth', amount: 1, unit: 'oz' }
        ],
        garnish: 'Half an orange slice',
        method: 'Build into an old-fashioned glass filled with ice. Stir gently.'
      },
      {
        id: 'alexander', name: 'Alexander', category: 'cocktail', price: 20,
        isHouseOriginal: false, source: 'IBA Official Cocktail',
        glass: 'Cocktail glass',
        ingredients: [
          { name: 'Cognac', amount: 1, unit: 'oz' },
          { name: 'Brown crème de cacao', amount: 1, unit: 'oz' },
          { name: 'Cream', amount: 1, unit: 'oz' }
        ],
        garnish: 'Fresh grated nutmeg',
        method: 'Shake and strain into a chilled cocktail glass. Sprinkle with nutmeg.'
      },
      {
        id: 'penicillin', name: 'Penicillin', category: 'cocktail', price: 21,
        isHouseOriginal: false, source: 'IBA Official Cocktail (created by Sam Ross, 2005)',
        glass: 'Old-fashioned',
        ingredients: [
          { name: 'Blended Scotch whisky', amount: 2, unit: 'oz' },
          { name: 'Fresh lemon juice', amount: 0.75, unit: 'oz' },
          { name: 'Honey-ginger syrup', amount: 0.75, unit: 'oz' },
          { name: 'Fresh ginger slices', amount: 3, unit: 'piece' },
          { name: 'Islay single malt (float)', amount: 0.25, unit: 'oz' }
        ],
        garnish: 'Candied ginger',
        method: 'Muddle ginger in shaker. Add lemon juice, honey-ginger syrup and blended Scotch. Shake with ice, double-strain into old-fashioned glass with ice. Float the Islay whisky on top.'
      },
      {
        id: 'hugo_spritz', name: 'Hugo Spritz', category: 'cocktail', price: 20,
        isHouseOriginal: false, source: 'Published classic recipe (created by Roland Gruber, 2005; LCBO recipe card)',
        glass: 'Wine glass',
        ingredients: [
          { name: 'Prosecco', amount: 4, unit: 'oz' },
          { name: 'St-Germain elderflower liqueur', amount: 1, unit: 'oz' },
          { name: 'Club soda', amount: 1, unit: 'oz' }
        ],
        garnish: 'Lime wheels and mint sprig',
        method: 'Fill a wine glass three-quarters with ice. Pour in Prosecco, then liqueur. Top with club soda. Stir gently, garnish.'
      },
      {
        id: 'lychee_gin_fizz', name: 'Lychee Gin Fizz', category: 'cocktail', price: 20,
        isHouseOriginal: false, source: 'Published named recipe (Food52) — not an IBA-official cocktail',
        glass: 'Old-fashioned',
        ingredients: [
          { name: 'Gin', amount: 1, unit: 'oz' },
          { name: 'Fresh lychees, muddled', amount: 3, unit: 'piece' },
          { name: 'Orange juice', amount: 1, unit: 'oz' },
          { name: 'Simple syrup', amount: 0.5, unit: 'oz' },
          { name: 'Soda water', amount: 0, unit: 'top' }
        ],
        garnish: 'Lychee, orange slice, mint leaves',
        method: 'Muddle lychees in shaker. Add remaining ingredients except soda, shake with ice. Strain into old-fashioned glass with crushed ice. Top with soda water.'
      },
      { id: 'florence', name: 'Florence', category: 'cocktail', price: 20, isHouseOriginal: true, source: 'House recipe — needs verification from AtoZ Rooftop', glass: null, ingredients: [], garnish: null, method: null },
      { id: 'single_with_my_pal', name: 'Single With My Pal', category: 'cocktail', price: 19, isHouseOriginal: true, source: 'House recipe — needs verification from AtoZ Rooftop', glass: null, ingredients: [], garnish: null, method: null },
      { id: 'chivalry_isnt_dead', name: "Chivalry Isn't Dead", category: 'cocktail', price: 20, isHouseOriginal: true, source: 'House recipe — needs verification from AtoZ Rooftop', glass: null, ingredients: [], garnish: null, method: null },
      { id: 'drunk_in_love', name: 'Drunk In Love', category: 'cocktail', price: 20, isHouseOriginal: true, source: 'House recipe — needs verification from AtoZ Rooftop', glass: null, ingredients: [], garnish: null, method: null },
      { id: 'the_sling', name: 'The Sling', category: 'cocktail', price: 19, isHouseOriginal: true, source: 'House recipe — needs verification from AtoZ Rooftop', glass: null, ingredients: [], garnish: null, method: null },
      {
        id: 'high_noon_watermelon', name: "High Noon Vodka Seltzer – Watermelon", category: 'cocktail', price: 14,
        isHouseOriginal: false, source: 'Commercial canned product — no recipe, served as-is',
        glass: 'Can', ingredients: [], garnish: null, method: 'Serve chilled, in the can.'
      },
      // --- Wine by the glass ---
      { id: 'pinot_grigio', name: 'Pinot Grigio, Ponticello (Delle Venezie)', category: 'wine', price: 17, isHouseOriginal: false, source: 'Menu item — no recipe needed (bottle pour)', ingredients: [] },
      { id: 'sauvignon_blanc', name: 'Sauvignon Blanc, Château les Rexilles (Bordeaux)', category: 'wine', price: 17, isHouseOriginal: false, source: 'Menu item — no recipe needed (bottle pour)', ingredients: [] },
      { id: 'chardonnay', name: 'Chardonnay, Sea Sun by Wagner Family (Carneros Napa Valley)', category: 'wine', price: 20, isHouseOriginal: false, source: 'Menu item — no recipe needed (bottle pour)', ingredients: [] },
      { id: 'sancerre', name: 'Sancerre, La Villandière (Loire Valley, France)', category: 'wine', price: 28, isHouseOriginal: false, source: 'Menu item — no recipe needed (bottle pour)', ingredients: [] },
      { id: 'rose', name: 'Rosé, Jas Des Vignes (Alpes de Haute, Italy)', category: 'wine', price: 19, isHouseOriginal: false, source: 'Menu item — no recipe needed (bottle pour)', ingredients: [] },
      { id: 'prosecco_glass', name: 'Prosecco, Ruffino (Veneto, Italy)', category: 'wine', price: 17, isHouseOriginal: false, source: 'Menu item — no recipe needed (bottle pour)', ingredients: [] },
      { id: 'montepulciano', name: 'Montepulciano, Fendi (Abruzzo, Italy)', category: 'wine', price: 19, isHouseOriginal: false, source: 'Menu item — no recipe needed (bottle pour)', ingredients: [] },
      { id: 'pinot_noir', name: 'Pinot Noir, Cherry Pie (Santa Barbara, California)', category: 'wine', price: 20, isHouseOriginal: false, source: 'Menu item — no recipe needed (bottle pour)', ingredients: [] },
      { id: 'cabernet', name: 'Cabernet Sauvignon, Ghost Pines (Sonoma, California)', category: 'wine', price: 20, isHouseOriginal: false, source: 'Menu item — no recipe needed (bottle pour)', ingredients: [] },
      // --- Beer ---
      { id: 'peroni', name: 'Peroni', category: 'beer', price: 11, isHouseOriginal: false, source: 'Menu item — bottled', ingredients: [] },
      { id: 'lagunitas', name: 'Lagunitas IPA', category: 'beer', price: null, isHouseOriginal: false, source: 'Menu item — bottled', ingredients: [] },
      { id: 'brooklyn_lager', name: 'Brooklyn Lager', category: 'beer', price: null, isHouseOriginal: false, source: 'Menu item — bottled', ingredients: [] },
      { id: 'asahi', name: 'Asahi', category: 'beer', price: null, isHouseOriginal: false, source: 'Menu item — draft/reserve', ingredients: [] },
      { id: 'heineken_0', name: 'Heineken 0.0 (Alcohol-Free)', category: 'beer', price: null, isHouseOriginal: false, source: 'Menu item — bottled, non-alcoholic', ingredients: [] },
      // --- Non-alcoholic ---
      { id: 'virgin_mojito', name: 'Virgin Mojito', category: 'nonalcoholic', price: 9, isHouseOriginal: false, source: 'Menu item', ingredients: [] },
      { id: 'dry_florida', name: 'Dry Florida', category: 'nonalcoholic', price: 8, isHouseOriginal: false, source: 'Menu item', ingredients: [] },
      { id: 'passion_fruit_spritz', name: 'Passion Fruit Spritz', category: 'nonalcoholic', price: 9, isHouseOriginal: false, source: 'Menu item', ingredients: [] }
    ];
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
    getFloorPlan, saveFloorPlan,
    getBarCatalog, saveBarCatalog,
    getBarHHSettings, saveBarHHSettings,
    getDefaultBarCatalogSeed
  };
})();
