// work-tracker/ui.js
// All UI rendering for the Work Tracker module

const WorkTracker = (() => {
  let _root = null;
  let _view = 'home';
  let _selectedDate = null;
  let _selectedWeek = null;

  function mount(container) {
    _root = container;
    _selectedWeek = getWeekStart(new Date());
    _selectedDate = new Date().toISOString().slice(0, 10);
    _view = 'home';
    _render();
  }

  function _render() {
    if (!_root) return;
    _root.innerHTML = '';
    const views = { home: _renderHome, week: _renderWeek, day: _renderDay, preview: _renderPreview, settings: _renderSettings };
    _root.appendChild((views[_view] || _renderHome)());
  }

  function _nav(view, opts) {
    if (opts) { if (opts.date) _selectedDate = opts.date; if (opts.week) _selectedWeek = opts.week; }
    _view = view;
    _render();
  }

  function _el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function _fmtTime(iso) {
    if (!iso) return '--:--';
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function _fmtDate(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function _today() { return new Date().toISOString().slice(0, 10); }

  function _findRunning() {
    for (const shift of WTDb.getShifts()) {
      const entry = (shift.entries || []).find(e => !e.clockOut);
      if (entry) return { shift, entry };
    }
    return null;
  }

  // ── HOME ──────────────────────────────────────────────────
  function _renderHome() {
    const wrap = _el('div', 'wt-screen');
    const today = _today();
    const weekShifts = WTDb.getShiftsForWeek(getWeekStart(new Date()));
    const todayShifts = WTDb.getShiftsForDate(today);
    const pay = WTRules.weeklyPay(weekShifts);
    const settings = WTDb.getSettings();
    const running = _findRunning();

    wrap.innerHTML = `
      <div class="wt-header">
        <div>
          <div class="wt-title">Work Tracker</div>
          <div class="wt-subtitle">${formatWeekLabel(getWeekStart(new Date()))}</div>
        </div>
        <button class="wt-icon-btn" id="wt-gear">⚙</button>
      </div>
      ${running ? `
      <div class="wt-active-banner">
        <div class="wt-active-dot"></div>
        <div class="wt-active-info">
          <span class="wt-active-name">${running.shift.locationName}</span>
          <span class="wt-active-shift">${running.shift.shiftType} · in ${_fmtTime(running.entry.clockIn)}</span>
        </div>
        <button class="wt-clockout-btn" id="wt-banner-out" data-sid="${running.shift.id}" data-eid="${running.entry.id}">Clock Out</button>
      </div>` : ''}
      <div class="wt-cards">
        <div class="wt-card">
          <div class="wt-card-label">This Week</div>
          <div class="wt-card-value">${WTRules.fmtHours(pay.totalHours)}</div>
          <div class="wt-card-sub">${WTRules.fmtMoney(pay.total)} earned</div>
          ${pay.isOvertime ? `<div class="wt-ot-badge">OT +${WTRules.fmtHours(pay.overtimeHours)}</div>` : ''}
        </div>
        <div class="wt-card" id="wt-pay-card" style="cursor:pointer">
          <div class="wt-card-label">Pay Day</div>
          <div class="wt-card-value wt-card-value--sm">${WTRules.getPayDate(getWeekStart(new Date()), settings)}</div>
          <div class="wt-card-sub">Tap for history</div>
        </div>
      </div>
      <div class="wt-section-hdr">
        <span class="wt-section-title">Today — ${_fmtDate(today)}</span>
        <button class="wt-text-btn" id="wt-add-today">+ Add Shift</button>
      </div>
      <div id="wt-today-shifts"></div>
      <div class="wt-bottom-actions">
        <button class="wt-btn wt-btn--secondary" id="wt-week-btn">📅 Week View</button>
        <button class="wt-btn wt-btn--primary" id="wt-preview-btn">📊 Export</button>
      </div>
    `;

    const todayDiv = wrap.querySelector('#wt-today-shifts');
    if (todayShifts.length === 0) {
      todayDiv.innerHTML = '<div class="wt-empty">No shifts today. Tap + Add Shift.</div>';
    } else {
      todayShifts.forEach(s => todayDiv.appendChild(_shiftCard(s)));
    }

    wrap.querySelector('#wt-gear').onclick = () => _nav('settings');
    wrap.querySelector('#wt-pay-card').onclick = () => _nav('week');
    wrap.querySelector('#wt-add-today').onclick = () => _showAddShift(today);
    wrap.querySelector('#wt-week-btn').onclick = () => _nav('week');
    wrap.querySelector('#wt-preview-btn').onclick = () => _nav('preview');
    const bannerOut = wrap.querySelector('#wt-banner-out');
    if (bannerOut) bannerOut.onclick = () => _doClockOut(bannerOut.dataset.sid, bannerOut.dataset.eid);

    return wrap;
  }

  // ── SHIFT CARD ────────────────────────────────────────────
  function _shiftCard(shift) {
    const card = _el('div', 'wt-shift-card');
    const totalHrs = WTRules.shiftHours(shift);
    const earnings = totalHrs * (shift.hourlyRate || NYC_MIN_WAGE);
    const locs = WTDb.getLocations();
    const loc = locs.find(l => l.id === shift.locationId);
    const color = loc ? loc.color : '#5E5CE6';

    let entriesHtml = (shift.entries || []).map(e => `
      <div class="wt-entry-row ${!e.clockOut ? 'wt-entry-running' : ''}">
        <div class="wt-entry-times">
          <div class="wt-entry-time">
            <span class="wt-time-label">IN</span>
            <span class="wt-time-val" data-sid="${shift.id}" data-eid="${e.id}" data-field="clockIn">${_fmtTime(e.clockIn)}</span>
            <button class="wt-photo-btn wt-micro" data-sid="${shift.id}" data-type="in_${e.id}">📷</button>
          </div>
          <span class="wt-entry-sep">→</span>
          <div class="wt-entry-time">
            <span class="wt-time-label">OUT</span>
            ${e.clockOut
              ? `<span class="wt-time-val" data-sid="${shift.id}" data-eid="${e.id}" data-field="clockOut">${_fmtTime(e.clockOut)}</span>
                 <button class="wt-photo-btn wt-micro" data-sid="${shift.id}" data-type="out_${e.id}">📷</button>`
              : `<button class="wt-clockout-inline" data-sid="${shift.id}" data-eid="${e.id}">Clock Out</button>`
            }
          </div>
          <span class="wt-entry-dur">${WTRules.entryHours(e) > 0 ? WTRules.fmtHours(WTRules.entryHours(e)) : '—'}</span>
        </div>
        <button class="wt-del-entry wt-micro-btn wt-danger" data-sid="${shift.id}" data-eid="${e.id}">✕</button>
      </div>`).join('');

    card.innerHTML = `
      <div class="wt-shift-header" style="border-left:4px solid ${color}">
        <div>
          <div class="wt-shift-name">${shift.locationName}</div>
          <div class="wt-shift-type">${shift.shiftType} · $${shift.hourlyRate}/hr</div>
        </div>
        <div class="wt-shift-totals">
          <div class="wt-shift-hours">${WTRules.fmtHours(totalHrs)}</div>
          <div class="wt-shift-earn">${WTRules.fmtMoney(earnings)}</div>
        </div>
      </div>
      <div class="wt-entries">${entriesHtml}</div>
      <div class="wt-shift-actions">
        <button class="wt-text-btn wt-add-period" data-sid="${shift.id}">+ Add Period</button>
        <button class="wt-text-btn wt-danger wt-del-shift" data-sid="${shift.id}">Delete Shift</button>
      </div>
    `;

    card.querySelectorAll('.wt-time-val').forEach(el => {
      el.onclick = () => _showEditTime(el.dataset.sid, el.dataset.eid, el.dataset.field);
    });
    card.querySelectorAll('.wt-clockout-inline').forEach(btn => {
      btn.onclick = () => _doClockOut(btn.dataset.sid, btn.dataset.eid);
    });
    card.querySelectorAll('.wt-del-entry').forEach(btn => {
      btn.onclick = () => _delEntry(btn.dataset.sid, btn.dataset.eid);
    });
    card.querySelectorAll('.wt-photo-btn').forEach(btn => {
      btn.onclick = () => _doPhoto(btn.dataset.sid, btn.dataset.type);
    });
    card.querySelector('.wt-add-period').onclick = () => _addPeriod(card.querySelector('.wt-add-period').dataset.sid);
    card.querySelector('.wt-del-shift').onclick = () => { if (WTDb.deleteShift(card.querySelector('.wt-del-shift').dataset.sid)) _render(); };

    return card;
  }

  // ── WEEK VIEW ─────────────────────────────────────────────
  function _renderWeek() {
    const wrap = _el('div', 'wt-screen');
    const weeks = WTRules.getRecentWeeks(12);
    const settings = WTDb.getSettings();
    const curMs = getWeekStart(new Date()).getTime();

    let rowsHtml = weeks.map(ws => {
      const shifts = WTDb.getShiftsForWeek(ws);
      const pay = WTRules.weeklyPay(shifts);
      const isCur = ws.getTime() === curMs;
      const days = [0,1,2,3,4,5,6].map(i => {
        const d = new Date(ws); d.setDate(d.getDate() + i);
        const ds = d.toISOString().slice(0,10);
        const has = shifts.some(s => s.date === ds);
        const isT = ds === _today();
        return `<div class="wt-day-dot ${has?'wt-day-dot--active':''} ${isT?'wt-day-dot--today':''}" data-date="${ds}">${['M','T','W','T','F','S','S'][i]}${has?'<span class="wt-day-pip"></span>':''}</div>`;
      }).join('');
      return `
        <div class="wt-week-row ${isCur?'wt-week-current':''}" data-ws="${ws.getTime()}">
          <div class="wt-week-label">${isCur?'<span class="wt-current-badge">Current</span>':''}${formatWeekLabel(ws)}</div>
          <div class="wt-week-stats">
            <span>${WTRules.fmtHours(pay.totalHours)}</span>
            <span class="wt-week-pay">${WTRules.fmtMoney(pay.total)}</span>
            ${pay.isOvertime?'<span class="wt-ot-pill">OT</span>':''}
          </div>
          <div class="wt-week-days">${days}</div>
          <div class="wt-week-paydate">Pay: ${WTRules.getPayDate(ws, settings)}</div>
        </div>`;
    }).join('');

    wrap.innerHTML = `
      <div class="wt-header">
        <button class="wt-back-btn" id="wt-back">← Back</button>
        <div class="wt-title">Pay History</div>
        <div></div>
      </div>
      ${rowsHtml}
    `;

    wrap.querySelector('#wt-back').onclick = () => _nav('home');
    wrap.querySelectorAll('.wt-day-dot').forEach(dot => {
      dot.onclick = () => _nav('day', { date: dot.dataset.date });
    });
    return wrap;
  }

  // ── DAY DETAIL ────────────────────────────────────────────
  function _renderDay() {
    const wrap = _el('div', 'wt-screen');
    const dateStr = _selectedDate || _today();
    const shifts = WTDb.getShiftsForDate(dateStr);
    const summary = WTRules.dailySummary(shifts);

    wrap.innerHTML = `
      <div class="wt-header">
        <button class="wt-back-btn" id="wt-back">← Back</button>
        <div class="wt-title">${_fmtDate(dateStr)}</div>
        <button class="wt-text-btn" id="wt-add-shift-day">+ Shift</button>
      </div>
      ${shifts.length > 0 ? `
      <div class="wt-summary-card">
        <div class="wt-sum-row"><span>Total Hours</span><strong>${WTRules.fmtHours(summary.totalHrs)}</strong></div>
        <div class="wt-sum-row"><span>Est. Earnings</span><strong>${WTRules.fmtMoney(summary.totalEarnings)}</strong></div>
      </div>` : '<div class="wt-empty">No shifts for this day.</div>'}
      <div id="wt-day-shifts"></div>
    `;

    const dayDiv = wrap.querySelector('#wt-day-shifts');
    shifts.forEach(s => dayDiv.appendChild(_shiftCard(s)));

    wrap.querySelector('#wt-back').onclick = () => _nav('week');
    wrap.querySelector('#wt-add-shift-day').onclick = () => _showAddShift(dateStr);
    return wrap;
  }

  // ── PREVIEW / EXPORT ──────────────────────────────────────
  function _renderPreview() {
    const wrap = _el('div', 'wt-screen');
    wrap.innerHTML = `
      <div class="wt-header">
        <button class="wt-back-btn" id="wt-back">← Back</button>
        <div class="wt-title">Preview & Export</div>
        <div></div>
      </div>
      <div class="wt-range-selector">
        <select id="wt-range" class="wt-select">
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="quarter">This Quarter</option>
          <option value="semester">This Semester</option>
          <option value="year">This Year</option>
        </select>
      </div>
      <div class="wt-table-scroll" id="wt-table-wrap"></div>
      <div class="wt-export-actions">
        <button class="wt-btn wt-btn--secondary" id="wt-backup">💾 Backup JSON</button>
        <button class="wt-btn wt-btn--primary" id="wt-pdf">📄 Export PDF</button>
      </div>
    `;

    wrap.querySelector('#wt-back').onclick = () => _nav('home');
    const tableWrap = wrap.querySelector('#wt-table-wrap');
    wrap.querySelector('#wt-range').onchange = function() { _buildTable(this.value, tableWrap); };
    wrap.querySelector('#wt-backup').onclick = () => {
      const blob = new Blob([WTDb.exportData()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Tempo_WorkBackup_${_today()}.json`;
      a.click();
    };
    wrap.querySelector('#wt-pdf').onclick = () => _exportPDF(wrap.querySelector('#wt-range').value);
    _buildTable('week', tableWrap);
    return wrap;
  }

  function _getShiftsForRange(range) {
    const now = new Date();
    let start;
    const end = new Date(now); end.setHours(23,59,59,999);
    if (range === 'week') start = getWeekStart(now);
    else if (range === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (range === 'quarter') { const q = Math.floor(now.getMonth()/3); start = new Date(now.getFullYear(), q*3, 1); }
    else if (range === 'semester') start = new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1);
    else start = new Date(now.getFullYear(), 0, 1);
    return WTDb.getShifts().filter(s => { const d = new Date(s.date); return d >= start && d <= end; })
      .sort((a,b) => new Date(a.date) - new Date(b.date));
  }

  function _buildTable(range, container) {
    const shifts = _getShiftsForRange(range);
    if (!shifts.length) { container.innerHTML = '<div class="wt-empty">No data for this period.</div>'; return; }

    const byDate = {};
    shifts.forEach(s => { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s); });

    let body = '';
    let grandHrs = 0, grandPay = 0;

    Object.entries(byDate).forEach(([date, dayShifts]) => {
      const ds = WTRules.dailySummary(dayShifts);
      let first = true;
      dayShifts.forEach(shift => {
        const hrs = WTRules.shiftHours(shift);
        const pay = hrs * (shift.hourlyRate || NYC_MIN_WAGE);
        const ins = (shift.entries||[]).map(e => _fmtTime(e.clockIn)).join('<br>');
        const outs = (shift.entries||[]).map(e => e.clockOut ? _fmtTime(e.clockOut) : '—').join('<br>');
        body += `<tr>
          ${first ? `<td rowspan="${dayShifts.length}" class="wt-td-date">${_fmtDate(date)}</td>` : ''}
          <td>${shift.locationName||'—'}</td>
          <td>${shift.shiftType||'—'}</td>
          <td class="wt-td-mono">${ins}</td>
          <td class="wt-td-mono">${outs}</td>
          <td class="wt-td-num">${WTRules.fmtHours(hrs)}</td>
          <td class="wt-td-num">$${(shift.hourlyRate||NYC_MIN_WAGE).toFixed(2)}</td>
          <td class="wt-td-num wt-td-money">${WTRules.fmtMoney(pay)}</td>
        </tr>`;
        first = false;
        grandHrs += hrs; grandPay += pay;
      });
      body += `<tr class="wt-row-subtotal">
        <td colspan="5" class="wt-td-right">Day Total</td>
        <td class="wt-td-num">${WTRules.fmtHours(ds.totalHrs)}</td>
        <td></td>
        <td class="wt-td-num wt-td-money">${WTRules.fmtMoney(ds.totalEarnings)}</td>
      </tr>`;
    });

    const wp = WTRules.weeklyPay(shifts);
    if (wp.isOvertime) {
      body += `<tr class="wt-row-ot-warning"><td colspan="8">⚠️ Overtime: ${WTRules.fmtHours(wp.overtimeHours)} × 1.5 = +${WTRules.fmtMoney(wp.overtimePay)} extra</td></tr>`;
    }
    body += `<tr class="wt-row-grand">
      <td colspan="5"><strong>TOTAL</strong></td>
      <td class="wt-td-num"><strong>${WTRules.fmtHours(grandHrs)}</strong></td>
      <td></td>
      <td class="wt-td-num wt-td-money"><strong>${WTRules.fmtMoney(wp.total)}</strong></td>
    </tr>`;

    container.innerHTML = `<table class="wt-excel-table">
      <thead><tr>
        <th>Date</th><th>Location</th><th>Shift</th>
        <th>Clock In(s)</th><th>Clock Out(s)</th>
        <th>Hours</th><th>$/hr</th><th>Subtotal</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  }

  // ── SETTINGS ──────────────────────────────────────────────
  function _renderSettings() {
    const wrap = _el('div', 'wt-screen');
    const locs = WTDb.getLocations();
    const settings = WTDb.getSettings();

    wrap.innerHTML = `
      <div class="wt-header">
        <button class="wt-back-btn" id="wt-back">← Back</button>
        <div class="wt-title">Settings</div>
        <div></div>
      </div>
      <div class="wt-settings-section">
        <div class="wt-section-title">Work Locations</div>
        <div id="wt-loc-list">
          ${locs.map(l => `
            <div class="wt-loc-row">
              <div class="wt-loc-dot" style="background:${l.color}"></div>
              <span class="wt-loc-name">${l.name}</span>
              <span class="wt-loc-rate">$${l.hourlyRate}/hr</span>
              <button class="wt-micro-btn wt-danger" data-lid="${l.id}">✕</button>
            </div>`).join('')}
        </div>
        <div class="wt-add-loc-form">
          <input id="wt-loc-name" class="wt-input" placeholder="Restaurant name" type="text">
          <input id="wt-loc-rate" class="wt-input wt-input--sm" placeholder="$/hr" type="number" step="0.5" min="16.50" value="${NYC_MIN_WAGE}">
          <input id="wt-loc-color" type="color" value="#5E5CE6" class="wt-color-pick">
          <button class="wt-btn wt-btn--primary wt-btn--sm" id="wt-add-loc">Add</button>
        </div>
      </div>
      <div class="wt-settings-section">
        <div class="wt-section-title">Pay Settings</div>
        <div class="wt-setting-row">
          <label>Pay Period</label>
          <select id="wt-pay-period" class="wt-select" style="width:auto">
            <option value="weekly" ${settings.payPeriod==='weekly'?'selected':''}>Weekly (Fri)</option>
            <option value="event" ${settings.payPeriod==='event'?'selected':''}>Per Event</option>
            <option value="biweekly" ${settings.payPeriod==='biweekly'?'selected':''}>Bi-Weekly</option>
          </select>
        </div>
        <p class="wt-setting-note">NYC minimum: $${NYC_MIN_WAGE}/hr · Overtime: 1.5× after 40h/week</p>
      </div>
      <div class="wt-settings-section">
        <div class="wt-section-title">Data</div>
        <button class="wt-btn wt-btn--secondary" id="wt-import-btn">📥 Import Backup</button>
        <input type="file" id="wt-import-file" accept=".json" style="display:none">
        <p class="wt-setting-note">Photos auto-save to Camera Roll when captured. Export JSON weekly as extra backup.</p>
      </div>
    `;

    wrap.querySelector('#wt-back').onclick = () => _nav('home');
    wrap.querySelectorAll('[data-lid]').forEach(btn => {
      btn.onclick = () => { WTDb.deleteLocation(btn.dataset.lid); _nav('settings'); };
    });
    wrap.querySelector('#wt-add-loc').onclick = () => {
      const name = wrap.querySelector('#wt-loc-name').value.trim();
      const rate = parseFloat(wrap.querySelector('#wt-loc-rate').value) || NYC_MIN_WAGE;
      const color = wrap.querySelector('#wt-loc-color').value;
      if (!name) { alert('Enter a name.'); return; }
      WTDb.saveLocation({ id: generateId(), name, hourlyRate: rate, color });
      _nav('settings');
    };
    wrap.querySelector('#wt-pay-period').onchange = function() {
      const s = WTDb.getSettings(); s.payPeriod = this.value; WTDb.saveSettings(s);
    };
    wrap.querySelector('#wt-import-btn').onclick = () => wrap.querySelector('#wt-import-file').click();
    wrap.querySelector('#wt-import-file').onchange = function() {
      const file = this.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = e => { if (WTDb.importData(e.target.result)) { alert('Imported!'); _nav('home'); } else alert('Import failed.'); };
      reader.readAsText(file);
    };
    return wrap;
  }

  // ── MODALS ────────────────────────────────────────────────
  function _showAddShift(dateStr) {
    const locs = WTDb.getLocations();
    if (!locs.length) { alert('Add a location in Settings first.'); _nav('settings'); return; }
    const modal = _el('div', 'wt-modal-overlay');
    modal.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-title">New Shift — ${_fmtDate(dateStr)}</div>
        <label class="wt-label">Location</label>
        <select id="wt-ml" class="wt-select">
          ${locs.map(l => `<option value="${l.id}" data-rate="${l.hourlyRate}">${l.name} ($${l.hourlyRate}/hr)</option>`).join('')}
        </select>
        <label class="wt-label">Shift Type</label>
        <select id="wt-ms" class="wt-select">
          ${DEFAULT_SHIFTS.map(s => `<option>${s}</option>`).join('')}
          <option value="__custom">Custom…</option>
        </select>
        <div id="wt-mc-wrap" style="display:none;margin-top:8px">
          <input id="wt-mc" class="wt-input" placeholder="Shift name" type="text">
        </div>
        <label class="wt-label">Hourly Rate</label>
        <input id="wt-mr" class="wt-input" type="number" step="0.50" value="${NYC_MIN_WAGE}">
        <div class="wt-modal-actions">
          <button class="wt-btn wt-btn--secondary" id="wt-mcancel">Cancel</button>
          <button class="wt-btn wt-btn--primary" id="wt-msave">Clock In Now</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#wt-ml').onchange = function() {
      const opt = this.options[this.selectedIndex];
      modal.querySelector('#wt-mr').value = opt.dataset.rate;
    };
    modal.querySelector('#wt-ms').onchange = function() {
      modal.querySelector('#wt-mc-wrap').style.display = this.value === '__custom' ? 'block' : 'none';
    };
    modal.querySelector('#wt-mcancel').onclick = () => modal.remove();
    modal.querySelector('#wt-msave').onclick = () => {
      const locId = modal.querySelector('#wt-ml').value;
      const loc = locs.find(l => l.id === locId);
      const sSel = modal.querySelector('#wt-ms');
      const shiftType = sSel.value === '__custom'
        ? (modal.querySelector('#wt-mc').value || 'Custom') : sSel.value;
      const rate = parseFloat(modal.querySelector('#wt-mr').value) || NYC_MIN_WAGE;
      WTDb.saveShift({
        id: generateId(), date: dateStr,
        locationId: locId, locationName: loc.name,
        hourlyRate: rate, shiftType,
        entries: [{ id: generateId(), clockIn: new Date().toISOString(), clockOut: null, breakMinutes: 0 }]
      });
      modal.remove();
      _nav('home');
    };
  }

  function _showEditTime(shiftId, entryId, field) {
    const shift = WTDb.getShifts().find(s => s.id === shiftId);
    const entry = shift && shift.entries.find(e => e.id === entryId);
    if (!entry) return;
    const cur = entry[field] ? new Date(entry[field]) : new Date();
    const modal = _el('div', 'wt-modal-overlay');
    modal.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-title">Edit ${field === 'clockIn' ? 'Clock In' : 'Clock Out'}</div>
        <input type="time" id="wt-et" class="wt-input wt-input--time" value="${cur.toTimeString().slice(0,5)}">
        <div class="wt-modal-actions">
          <button class="wt-btn wt-btn--secondary" id="wt-ecancel">Cancel</button>
          <button class="wt-btn wt-btn--primary" id="wt-esave">Save</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#wt-ecancel').onclick = () => modal.remove();
    modal.querySelector('#wt-esave').onclick = () => {
      const [h, m] = modal.querySelector('#wt-et').value.split(':');
      const d = new Date(entry[field] || new Date());
      d.setHours(parseInt(h), parseInt(m), 0, 0);
      entry[field] = d.toISOString();
      WTDb.saveShift(shift);
      modal.remove();
      _render();
    };
  }

  // ── ACTIONS ───────────────────────────────────────────────
  function _doClockOut(shiftId, entryId) {
    const shift = WTDb.getShifts().find(s => s.id === shiftId);
    if (!shift) return;
    const entry = shift.entries.find(e => e.id === entryId);
    if (entry) { entry.clockOut = new Date().toISOString(); WTDb.saveShift(shift); }
    _render();
  }

  function _addPeriod(shiftId) {
    const shift = WTDb.getShifts().find(s => s.id === shiftId);
    if (!shift) return;
    shift.entries.push({ id: generateId(), clockIn: new Date().toISOString(), clockOut: null, breakMinutes: 0 });
    WTDb.saveShift(shift);
    _render();
  }

  function _delEntry(shiftId, entryId) {
    if (!confirm('Delete this period? Cannot be undone.')) return;
    const shift = WTDb.getShifts().find(s => s.id === shiftId);
    if (!shift) return;
    shift.entries = shift.entries.filter(e => e.id !== entryId);
    WTDb.saveShift(shift);
    _render();
  }

  async function _doPhoto(shiftId, type) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async e => {
        await WTDb.savePhoto(shiftId, type, e.target.result);
        alert('Photo saved ✓\nAlso downloaded to Camera Roll as backup.');
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  // ── PDF EXPORT ────────────────────────────────────────────
  async function _exportPDF(range) {
    if (!window.jspdf) {
      await new Promise((res, rej) => {
        const s1 = document.createElement('script');
        s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s1.onload = () => {
          const s2 = document.createElement('script');
          s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
          s2.onload = res; s2.onerror = rej;
          document.head.appendChild(s2);
        };
        s1.onerror = rej; document.head.appendChild(s1);
      });
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const shifts = _getShiftsForRange(range);
    const pay = WTRules.weeklyPay(shifts);

    doc.setFillColor(0,0,0); doc.rect(0,0,297,30,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(18);
    doc.text('TEMPO — Work Log', 14, 12);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}`, 14, 20);
    doc.text(`Period: ${range.charAt(0).toUpperCase()+range.slice(1)}  |  Total: ${WTRules.fmtHours(pay.totalHours)}  |  Est. Pay: ${WTRules.fmtMoney(pay.total)}${pay.isOvertime?' (OT included)':''}`, 14, 27);

    const byDate = {};
    shifts.forEach(s => { if(!byDate[s.date]) byDate[s.date]=[]; byDate[s.date].push(s); });
    const body = [];
    Object.entries(byDate).forEach(([date, dayShifts]) => {
      dayShifts.forEach(shift => {
        const hrs = WTRules.shiftHours(shift);
        const earn = hrs * (shift.hourlyRate||NYC_MIN_WAGE);
        body.push([
          _fmtDate(date), shift.locationName||'—', shift.shiftType||'—',
          (shift.entries||[]).map(e=>_fmtTime(e.clockIn)).join(', '),
          (shift.entries||[]).map(e=>e.clockOut?_fmtTime(e.clockOut):'—').join(', '),
          WTRules.fmtHours(hrs), `$${(shift.hourlyRate||NYC_MIN_WAGE).toFixed(2)}`, WTRules.fmtMoney(earn)
        ]);
      });
      const ds = WTRules.dailySummary(dayShifts);
      body.push(['','','','','Day Total →', WTRules.fmtHours(ds.totalHrs),'', WTRules.fmtMoney(ds.totalEarnings)]);
    });
    body.push(['','','','','TOTAL', WTRules.fmtHours(pay.totalHours),'', WTRules.fmtMoney(pay.total)]);

    doc.autoTable({
      startY: 34,
      head: [['Date','Location','Shift','Clock In(s)','Clock Out(s)','Hours','$/hr','Subtotal']],
      body,
      theme: 'grid',
      headStyles: { fillColor:[30,30,30], textColor:255, fontStyle:'bold' },
      styles: { fontSize:9, cellPadding:2 },
      didParseCell: d => {
        if (d.row.raw[4]==='Day Total →') { d.cell.styles.fontStyle='bold'; d.cell.styles.fillColor=[240,240,240]; }
        if (d.row.raw[4]==='TOTAL') { d.cell.styles.fontStyle='bold'; d.cell.styles.fillColor=[0,0,0]; d.cell.styles.textColor=255; }
      }
    });
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text('Generated by Tempo — personal reference only.', 14, doc.lastAutoTable.finalY + 8);
    doc.save(`Tempo_WorkLog_${range}_${_today()}.pdf`);
  }

  return { mount };
})();
