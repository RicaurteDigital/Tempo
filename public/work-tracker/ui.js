// work-tracker/ui.js — Premium Work Tracker UI

const WorkTracker = (() => {
  let _root = null;
  let _view = 'home';
  let _date = null;
  let _heroTimer = null;
  let _breakStart = null;

  function mount(el) {
    _root = el;
    _date = _today();
    _view = 'home';
    _go('home');
  }

  function _go(view, opts) {
    _view = view;
    if (opts && opts.date) _date = opts.date;
    clearInterval(_heroTimer);
    if (!_root) return;
    _root.innerHTML = '';
    ({ home: _Home, week: _Week, day: _Day, preview: _Preview, settings: _Settings }[view] || _Home)();
  }

  function _today() { return new Date().toISOString().slice(0, 10); }

  function _fmtTime(iso) {
    if (!iso) return '--:--';
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function _fmtDate(ds) {
    return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function _running() {
    for (const s of WTDb.getShifts()) {
      const e = (s.entries || []).find(e => !e.clockOut);
      if (e) return { shift: s, entry: e };
    }
    return null;
  }

  function _elapsed(iso) {
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`
      : `${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`;
  }

  function _Home() {
    const today = _today();
    const ws = getWeekStart(new Date());
    const weekShifts = WTDb.getShiftsForWeek(ws);
    const todayShifts = WTDb.getShiftsForDate(today);
    const pay = WTRules.weeklyPay(weekShifts);
    const settings = WTDb.getSettings();
    const run = _running();
    const locs = WTDb.getLocations();
    const onBreak = _breakStart !== null;

    const w = document.createElement('div');
    w.className = 'wt-screen';

    w.innerHTML = `
      <div class="wt-hdr">
        <div class="wt-hdr-left">
          <h2>Work Tracker</h2>
          <p>${formatWeekLabel(ws)}</p>
        </div>
        <button class="wt-hdr-btn" id="wt-settings-btn">⚙</button>
      </div>`;

    if (run) {
      const hero = document.createElement('div');
      hero.className = 'wt-hero' + (onBreak ? ' wt-hero-break' : '');
      hero.innerHTML = `
        <div class="wt-hero-label">${onBreak ? 'ON BREAK' : 'CLOCKED IN'}</div>
        <div class="wt-hero-location">${run.shift.locationName}</div>
        <div class="wt-hero-shift">${run.shift.shiftType} · $${run.shift.hourlyRate}/hr</div>
        <div class="wt-hero-timer${onBreak ? ' wt-timer-break' : ''}" id="wt-htimer">
          ${onBreak ? _elapsed(_breakStart) : _elapsed(run.entry.clockIn)}
        </div>
        <div class="wt-hero-accumulated" id="wt-accumulated">
          Total shift: ${WTRules.fmtHours(WTRules.shiftHours(run.shift))}
        </div>
        <div class="wt-hero-since">
          ${onBreak ? 'Break since ' + _fmtTime(_breakStart) : 'Since ' + _fmtTime(run.entry.clockIn)}
        </div>
        <div class="wt-hero-actions">
          <button class="wt-clockout-hero" id="wt-hero-out"
            ${onBreak ? 'disabled style="opacity:.4"' : ''}>
            Clock Out
          </button>
          <button class="${onBreak ? 'wt-breakend-btn' : 'wt-breakstart-btn'}" id="wt-hero-break">
            ${onBreak ? '▶ End Break' : '⏸ Start Break'}
          </button>
        </div>`;
      w.appendChild(hero);

      _heroTimer = setInterval(() => {
        const el = document.getElementById('wt-htimer');
        const acc = document.getElementById('wt-accumulated');
        if (!el) { clearInterval(_heroTimer); return; }
        el.textContent = onBreak ? _elapsed(_breakStart) : _elapsed(run.entry.clockIn);
        if (acc && !onBreak) {
          const completedSecs = (run.shift.entries || [])
            .filter(e => e.clockOut)
            .reduce((sum, e) => sum + (new Date(e.clockOut) - new Date(e.clockIn)) / 1000, 0);
          const currentSecs = (Date.now() - new Date(run.entry.clockIn)) / 1000;
          acc.textContent = 'Total shift: ' + WTRules.fmtHours((completedSecs + currentSecs) / 3600);
        }
      }, 1000);
    } else {
      const cta = document.createElement('button');
      cta.className = 'wt-clockin-cta';
      cta.id = 'wt-clockin-main';
      cta.innerHTML = `<div class="wt-clockin-dot"></div> Clock In`;
      w.appendChild(cta);
    }

    const stats = document.createElement('div');
    stats.className = 'wt-stats-row';
    stats.innerHTML = `
      <div class="wt-stat-card">
        <div class="wt-stat-label">This Week</div>
        <div class="wt-stat-value">${WTRules.fmtHours(pay.totalHours)}</div>
        <div class="wt-stat-sub">${WTRules.fmtMoney(pay.total)}</div>
        ${pay.isOvertime ? `<div class="wt-ot-tag">OT +${WTRules.fmtHours(pay.overtimeHours)}</div>` : ''}
      </div>
      <div class="wt-stat-card" id="wt-pay-card" style="cursor:pointer">
        <div class="wt-stat-label">Pay Day</div>
        <div class="wt-stat-value" style="font-size:16px;line-height:1.3">${WTRules.getPayDate(ws, settings)}</div>
        <div class="wt-stat-sub">Tap for history</div>
      </div>`;
    w.appendChild(stats);

    const secHdr = document.createElement('div');
    secHdr.className = 'wt-sec-hdr';
    secHdr.innerHTML = `
      <span class="wt-sec-title">Today · ${_fmtDate(today)}</span>
      <button class="wt-sec-action" id="wt-add-shift">+ Shift</button>`;
    w.appendChild(secHdr);

    todayShifts.reverse();
    if (todayShifts.length === 0) {
      const emp = document.createElement('div');
      emp.className = 'wt-empty';
      emp.innerHTML = `<strong>No shifts yet</strong>${locs.length === 0 ? 'Add a location in Settings first.' : 'Tap Clock In or + Shift to start.'}`;
      w.appendChild(emp);
    } else {
      todayShifts.forEach(s => w.appendChild(_ShiftCard(s)));
    }

    const acts = document.createElement('div');
    acts.className = 'wt-actions';
    acts.innerHTML = `
      <button class="wt-btn wt-btn-secondary" id="wt-week-btn">📅 History</button>
      <button class="wt-btn wt-btn-primary" id="wt-export-btn">📊 Export</button>`;
    w.appendChild(acts);

    _root.appendChild(w);

    w.querySelector('#wt-settings-btn').onclick = () => _go('settings');
    w.querySelector('#wt-pay-card').onclick = () => _go('week');
    w.querySelector('#wt-week-btn').onclick = () => _go('week');
    w.querySelector('#wt-export-btn').onclick = () => _go('preview');
    const addBtn = w.querySelector('#wt-add-shift');
    if (addBtn) addBtn.onclick = () => _showAddShift(today);
    const ciBtn = w.querySelector('#wt-clockin-main');
    if (ciBtn) {
      ciBtn.onclick = locs.length === 0
        ? () => { alert('Add a work location in Settings first.'); _go('settings'); }
        : () => _showAddShift(today);
    }
    const outBtn = w.querySelector('#wt-hero-out');
    if (outBtn) outBtn.onclick = () => _doClockOut(run.shift.id, run.entry.id);

    const breakBtn = w.querySelector('#wt-hero-break');
    if (breakBtn) breakBtn.onclick = () => {
      if (_breakStart === null) {
        // START BREAK: record time, close current entry
        _breakStart = new Date().toISOString();
        const shift = WTDb.getShifts().find(s => s.id === run.shift.id);
        if (shift) {
          const openEntry = shift.entries.find(e => !e.clockOut);
          if (openEntry) { openEntry.clockOut = _breakStart; WTDb.saveShift(shift); }
        }
        // Update DOM in place — no navigation
        const hero = breakBtn.closest('.wt-hero');
        if (hero) {
          hero.classList.add('wt-hero-break');
          hero.querySelector('.wt-hero-label').textContent = 'ON BREAK';
          hero.querySelector('.wt-hero-timer').classList.add('wt-timer-break');
          hero.querySelector('#wt-htimer').textContent = '00:00';
          const outBtn2 = hero.querySelector('#wt-hero-out');
          if (outBtn2) { outBtn2.disabled = true; outBtn2.style.opacity = '0.4'; }
          breakBtn.className = 'wt-breakend-btn';
          breakBtn.innerHTML = '▶ End Break';
          clearInterval(_heroTimer);
          _heroTimer = setInterval(() => {
            const el = document.getElementById('wt-htimer');
            if (el) el.textContent = _elapsed(_breakStart);
            else clearInterval(_heroTimer);
          }, 1000);
        }
      } else {
        // END BREAK: open new entry, record break duration as note
        const breakEnd = new Date().toISOString();
        const breakMins = Math.round((new Date(breakEnd) - new Date(_breakStart)) / 60000);
        const shift = WTDb.getShifts().find(s => s.id === run.shift.id);
        if (shift) {
          const s = WTDb.getSettings();
          const locSettings = (s.locationSettings || {})[shift.locationId] || {};
          const paidBreak = locSettings.paidBreaks || false;
          shift.entries.push({
            id: generateId(),
            clockIn: breakEnd,
            clockOut: null,
            breakMinutes: 0,
            note: paidBreak
              ? `${run.shift.shiftType} break · ${breakMins}m · +$${((breakMins/60)*(run.shift.hourlyRate||NYC_MIN_WAGE)).toFixed(2)} paid`
              : `${run.shift.shiftType} break · ${breakMins}m unpaid · missed $${((breakMins/60)*(run.shift.hourlyRate||NYC_MIN_WAGE)).toFixed(2)}`
          });
          WTDb.saveShift(shift);
        }
        _breakStart = null;
        _go('home');
      }
    };
  }

  function _ShiftCard(shift) {
    const locs = WTDb.getLocations();
    const loc = locs.find(l => l.id === shift.locationId);
    const color = loc ? loc.color : '#5E5CE6';
    const hrs = WTRules.shiftHours(shift);
    const earn = hrs * (shift.hourlyRate || NYC_MIN_WAGE);

    const card = document.createElement('div');
    card.className = 'wt-shift';

    const top = document.createElement('div');
    top.className = 'wt-shift-top';
    top.style.borderLeftColor = color;
    top.innerHTML = `
      <div>
        <div class="wt-shift-loc">${shift.locationName}</div>
        <div class="wt-shift-meta">${shift.shiftType} · $${shift.hourlyRate}/hr</div>
      </div>
      <div class="wt-shift-right">
        <div class="wt-shift-hrs">${WTRules.fmtHours(hrs)}</div>
        <div class="wt-shift-earn">${WTRules.fmtMoney(earn)}</div>
      </div>`;
    card.appendChild(top);

    const entriesDiv = document.createElement('div');
    entriesDiv.className = 'wt-entries';
    [...(shift.entries || [])].reverse().forEach(e => {
      const row = document.createElement('div');
      row.className = 'wt-entry' + (!e.clockOut ? ' wt-entry-live' : '');
      const eHrs = WTRules.entryHours(e);
      row.innerHTML = `
        <div class="wt-time-group">
          <div class="wt-time-pill">
            <span class="wt-time-lbl">IN</span>
            <button class="wt-time-val" data-sid="${shift.id}" data-eid="${e.id}" data-f="clockIn">${_fmtTime(e.clockIn)}</button>
          </div>
          <span class="wt-time-sep">→</span>
          <div class="wt-time-pill">
            <span class="wt-time-lbl">OUT</span>
            ${e.clockOut
              ? `<button class="wt-time-val" data-sid="${shift.id}" data-eid="${e.id}" data-f="clockOut">${_fmtTime(e.clockOut)}</button>`
              : `<span class="wt-time-running">Running</span>`}
          </div>
          <span class="wt-entry-dur">${eHrs > 0 ? WTRules.fmtHours(eHrs) : '—'}</span>
        </div>
        <button class="wt-entry-del" data-sid="${shift.id}" data-eid="${e.id}">✕</button>`;

      if (e.note) {
        const noteEl = document.createElement('div');
        noteEl.style.cssText = 'font-size:11px;color:#636366;padding:2px 0 6px;';
        noteEl.textContent = e.note;
        row.appendChild(noteEl);
      }

      row.querySelectorAll('.wt-time-val').forEach(b => {
        b.onclick = () => _showEditTime(b.dataset.sid, b.dataset.eid, b.dataset.f);
      });
      row.querySelector('.wt-entry-del').onclick = () => _delEntry(shift.id, e.id);

      const photoRow = document.createElement('div');
      photoRow.className = 'wt-photo-row';
      photoRow.innerHTML = `
        <button class="wt-photo-btn" data-pid="${shift.id}_in_${e.id}">📷 In proof</button>
        ${e.clockOut ? `<button class="wt-photo-btn" data-pid="${shift.id}_out_${e.id}">📷 Out proof</button>` : ''}`;
      photoRow.querySelectorAll('.wt-photo-btn').forEach(b => {
        b.onclick = () => _doPhoto(shift.id, b.dataset.pid);
        // Load saved photo if exists
        WTDb.getPhoto(shift.id, b.dataset.pid).then(base64 => {
          if (base64) {
            b.textContent = '✓ View proof';
            b.classList.add('has-photo');
            b.onclick = () => _viewOrReplacePhoto(shift.id, b.dataset.pid, base64);
          }
        });
      });

      entriesDiv.appendChild(row);
      entriesDiv.appendChild(photoRow);
    });
    card.appendChild(entriesDiv);

    const footer = document.createElement('div');
    footer.className = 'wt-shift-footer';
    footer.innerHTML = `
      <button class="wt-add-period" data-sid="${shift.id}">+ Add period</button>
      <button class="wt-del-shift" data-sid="${shift.id}">Delete shift</button>`;
    footer.querySelector('.wt-add-period').onclick = () => _addPeriod(shift.id);
    footer.querySelector('.wt-del-shift').onclick = () => { if (WTDb.deleteShift(shift.id)) _go('home'); };
    card.appendChild(footer);
    return card;
  }

  function _Week() {
    const w = document.createElement('div');
    w.className = 'wt-screen';
    const settings = WTDb.getSettings();
    const curMs = getWeekStart(new Date()).getTime();
    const weeks = WTRules.getRecentWeeks(12);

    w.innerHTML = `
      <div class="wt-hdr">
        <button class="wt-back" id="wt-back">‹ Back</button>
        <div style="font-size:18px;font-weight:800">Pay History</div>
        <div style="width:36px"></div>
      </div>`;

    weeks.forEach(ws => {
      const shifts = WTDb.getShiftsForWeek(ws);
      const pay = WTRules.weeklyPay(shifts);
      const isCur = ws.getTime() === curMs;
      const row = document.createElement('div');
      row.className = 'wt-week' + (isCur ? ' wt-week-cur' : '');
      const dots = [0,1,2,3,4,5,6].map(i => {
        const d = new Date(ws); d.setDate(d.getDate() + i);
        const ds = d.toISOString().slice(0,10);
        const has = shifts.some(s => s.date === ds);
        const isT = ds === _today();
        return `<div class="wt-dot ${has?'wt-dot-on':''} ${isT?'wt-dot-today':''}" data-date="${ds}">${['M','T','W','T','F','S','S'][i]}${has?'<span class="wt-dot-pip"></span>':''}</div>`;
      }).join('');
      row.innerHTML = `
        ${isCur ? '<div class="wt-week-badge">Current Week</div>' : ''}
        <div class="wt-week-range">${formatWeekLabel(ws)}</div>
        <div class="wt-week-nums">
          <span>${WTRules.fmtHours(pay.totalHours)}</span>
          <span class="wt-week-pay">${WTRules.fmtMoney(pay.total)}</span>
          ${pay.isOvertime ? '<span class="wt-ot-pill">OT</span>' : ''}
        </div>
        <div class="wt-week-dots">${dots}</div>
        <div class="wt-week-paydate">Pay: ${WTRules.getPayDate(ws, settings)}</div>`;
      row.querySelectorAll('.wt-dot').forEach(dot => {
        dot.onclick = () => _go('day', { date: dot.dataset.date });
      });
      w.appendChild(row);
    });

    _root.appendChild(w);
    w.querySelector('#wt-back').onclick = () => _go('home');
  }

  function _Day() {
    const dateStr = _date || _today();
    const shifts = WTDb.getShiftsForDate(dateStr);
    const summary = WTRules.dailySummary(shifts);
    const w = document.createElement('div');
    w.className = 'wt-screen';
    w.innerHTML = `
      <div class="wt-hdr">
        <button class="wt-back" id="wt-back">‹ Back</button>
        <div style="font-size:18px;font-weight:800">${_fmtDate(dateStr)}</div>
        <button class="wt-sec-action" id="wt-add-shift-day">+ Shift</button>
      </div>`;
    if (shifts.length > 0) {
      const sumCard = document.createElement('div');
      sumCard.className = 'wt-summary';
      sumCard.innerHTML = `
        <div class="wt-sum-row"><span>Total hours</span><strong>${WTRules.fmtHours(summary.totalHrs)}</strong></div>
        <div class="wt-sum-row"><span>Est. earnings</span><strong style="color:#30D158">${WTRules.fmtMoney(summary.totalEarnings)}</strong></div>`;
      w.appendChild(sumCard);
      shifts.forEach(s => w.appendChild(_ShiftCard(s)));
    } else {
      const emp = document.createElement('div');
      emp.className = 'wt-empty';
      emp.innerHTML = '<strong>No shifts</strong>Nothing recorded for this day.';
      w.appendChild(emp);
    }
    _root.appendChild(w);
    w.querySelector('#wt-back').onclick = () => _go('week');
    w.querySelector('#wt-add-shift-day').onclick = () => _showAddShift(dateStr);
  }

  function _Preview() {
    const w = document.createElement('div');
    w.className = 'wt-screen';
    w.innerHTML = `
      <div class="wt-hdr">
        <button class="wt-back" id="wt-back">‹ Back</button>
        <div style="font-size:18px;font-weight:800">Preview & Export</div>
        <div style="width:36px"></div>
      </div>
      <select class="wt-range-sel" id="wt-range">
        <option value="week">This Week</option>
        <option value="month">This Month</option>
        <option value="quarter">This Quarter</option>
        <option value="semester">This Semester</option>
        <option value="year">This Year</option>
      </select>
      <div class="wt-table-wrap" id="wt-tbl"></div>
      <div class="wt-actions">
        <button class="wt-btn wt-btn-secondary" id="wt-backup">💾 Backup</button>
        <button class="wt-btn wt-btn-cyan" id="wt-pdf">📄 PDF</button>
      </div>`;
    _root.appendChild(w);
    const tbl = w.querySelector('#wt-tbl');
    _buildTable('week', tbl);
    w.querySelector('#wt-back').onclick = () => _go('home');
    w.querySelector('#wt-range').onchange = function() { _buildTable(this.value, tbl); };
    w.querySelector('#wt-backup').onclick = () => {
      const b = new Blob([WTDb.exportData()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `Tempo_WorkBackup_${_today()}.json`;
      a.click();
    };
    w.querySelector('#wt-pdf').onclick = () => _exportPDF(w.querySelector('#wt-range').value);
  }

  function _rangeShifts(range) {
    const now = new Date();
    let start;
    const end = new Date(now); end.setHours(23,59,59,999);
    if (range === 'week') start = getWeekStart(now);
    else if (range === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (range === 'quarter') start = new Date(now.getFullYear(), Math.floor(now.getMonth()/3)*3, 1);
    else if (range === 'semester') start = new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1);
    else start = new Date(now.getFullYear(), 0, 1);
    return WTDb.getShifts().filter(s => { const d = new Date(s.date); return d >= start && d <= end; })
      .sort((a,b) => new Date(a.date) - new Date(b.date));
  }

  function _buildTable(range, container) {
    const shifts = _rangeShifts(range);
    if (!shifts.length) { container.innerHTML = '<div class="wt-empty"><strong>No data</strong>No shifts in this period.</div>'; return; }
    const byDate = {};
    shifts.forEach(s => { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s); });
    let rows = '', gHrs = 0;
    Object.entries(byDate).forEach(([date, ds]) => {
      const daySumm = WTRules.dailySummary(ds);
      let first = true;
      ds.forEach(shift => {
        const hrs = WTRules.shiftHours(shift);
        const pay = hrs * (shift.hourlyRate || NYC_MIN_WAGE);
        const ins = (shift.entries||[]).map(e => _fmtTime(e.clockIn)).join('<br>');
        const outs = (shift.entries||[]).map(e => e.clockOut ? _fmtTime(e.clockOut) : '—').join('<br>');
        rows += `<tr>
          ${first ? `<td rowspan="${ds.length}" class="wt-td-date">${_fmtDate(date)}</td>` : ''}
          <td>${shift.locationName}</td><td>${shift.shiftType}</td>
          <td class="wt-td-mono">${ins}</td><td class="wt-td-mono">${outs}</td>
          <td class="wt-td-num">${WTRules.fmtHours(hrs)}</td>
          <td class="wt-td-num">$${(shift.hourlyRate||NYC_MIN_WAGE).toFixed(2)}</td>
          <td class="wt-td-num wt-td-green">${WTRules.fmtMoney(pay)}</td>
        </tr>`;
        first = false; gHrs += hrs;
      });
      rows += `<tr class="wt-row-sub">
        <td colspan="5" class="wt-td-right">Day Total</td>
        <td class="wt-td-num">${WTRules.fmtHours(daySumm.totalHrs)}</td>
        <td></td><td class="wt-td-num wt-td-green">${WTRules.fmtMoney(daySumm.totalEarnings)}</td>
      </tr>`;
    });
    const wp = WTRules.weeklyPay(shifts);
    if (wp.isOvertime) rows += `<tr class="wt-row-ot"><td colspan="8">⚠️ OT: ${WTRules.fmtHours(wp.overtimeHours)} × 1.5 = +${WTRules.fmtMoney(wp.overtimePay)}</td></tr>`;
    rows += `<tr class="wt-row-total"><td colspan="5"><strong>TOTAL</strong></td><td class="wt-td-num"><strong>${WTRules.fmtHours(gHrs)}</strong></td><td></td><td class="wt-td-num"><strong>${WTRules.fmtMoney(wp.total)}</strong></td></tr>`;
    container.innerHTML = `<table class="wt-table"><thead><tr><th>Date</th><th>Location</th><th>Shift</th><th>In</th><th>Out</th><th>Hrs</th><th>Rate</th><th>Pay</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function _Settings() {
    const locs = WTDb.getLocations();
    const settings = WTDb.getSettings();
    const w = document.createElement('div');
    w.className = 'wt-screen';
    w.innerHTML = `
      <div class="wt-hdr">
        <button class="wt-back" id="wt-back">‹ Back</button>
        <div style="font-size:18px;font-weight:800">Settings</div>
        <div style="width:36px"></div>
      </div>
      <div class="wt-settings-block">
        <div class="wt-settings-title">Work Locations</div>
        <div id="wt-loc-list">
          ${locs.length === 0 ? '<div style="color:#636366;font-size:14px;padding:8px 0">No locations yet.</div>' :
            locs.map(l => {
              const locS = ((settings.locationSettings||{})[l.id]||{});
              return `<div class="wt-loc-row">
                <div class="wt-loc-dot" style="background:${l.color}"></div>
                <div style="flex:1">
                  <span class="wt-loc-name">${l.name}</span>
                  <span style="font-size:11px;color:#636366;margin-left:6px">${locS.paidBreaks ? '· Paid breaks' : ''}</span>
                </div>
                <span class="wt-loc-rate">$${l.hourlyRate}/hr</span>
                <button class="wt-loc-del" data-lid="${l.id}">✕</button>
              </div>`;
            }).join('')}
        </div>
        <div class="wt-add-form" style="margin-top:14px">
          <input id="wt-loc-name" class="wt-input" placeholder="Work location name" type="text" autocapitalize="words">
          <input id="wt-loc-rate" class="wt-input wt-input-sm" placeholder="$/hr" type="number" step="0.50" min="16.50" value="${NYC_MIN_WAGE}" inputmode="decimal">
          <input id="wt-loc-color" type="color" value="#5E5CE6" class="wt-color-input">
        </div>
        <label style="display:flex;align-items:center;gap:10px;font-size:14px;color:#98989D;margin-top:10px;cursor:pointer">
          <input type="checkbox" id="wt-loc-paid-break" style="width:18px;height:18px;accent-color:#5E5CE6">
          Breaks are paid at this location
        </label>
        <button class="wt-btn wt-btn-primary" style="margin-top:12px;width:100%" id="wt-add-loc">Add Location</button>
      </div>
      <div class="wt-settings-block">
        <div class="wt-settings-title">Pay Settings</div>
        <div class="wt-setting-row">
          <label>Pay Period</label>
          <select class="wt-select-sm" id="wt-pay-period">
            <option value="weekly" ${settings.payPeriod==='weekly'?'selected':''}>Weekly (Fri)</option>
            <option value="event" ${settings.payPeriod==='event'?'selected':''}>Per Event</option>
            <option value="biweekly" ${settings.payPeriod==='biweekly'?'selected':''}>Bi-Weekly</option>
          </select>
        </div>
        <p class="wt-note">NYC minimum wage 2026: $${NYC_MIN_WAGE}/hr<br>Overtime: 1.5× after 40 hours/week</p>
      </div>
      <div class="wt-settings-block">
        <div class="wt-settings-title">Data & Backup</div>
        <button class="wt-btn wt-btn-secondary" id="wt-import-btn" style="margin-bottom:10px">📥 Import Backup JSON</button>
        <input type="file" id="wt-import-file" accept=".json" style="display:none">
        <p class="wt-note">Photos auto-download to Camera Roll when captured. Export JSON regularly.</p>
      </div>`;
    _root.appendChild(w);
    w.querySelector('#wt-back').onclick = () => _go('home');
    w.querySelectorAll('.wt-loc-del').forEach(b => { b.onclick = () => { WTDb.deleteLocation(b.dataset.lid); _go('settings'); }; });
    w.querySelector('#wt-add-loc').onclick = () => {
      const name = w.querySelector('#wt-loc-name').value.trim();
      const rate = parseFloat(w.querySelector('#wt-loc-rate').value) || NYC_MIN_WAGE;
      const color = w.querySelector('#wt-loc-color').value;
      const paidBreaks = w.querySelector('#wt-loc-paid-break').checked;
      if (!name) { alert('Enter a work location name.'); return; }
      const loc = { id: generateId(), name, hourlyRate: rate, color };
      WTDb.saveLocation(loc);
      const s = WTDb.getSettings();
      if (!s.locationSettings) s.locationSettings = {};
      s.locationSettings[loc.id] = { paidBreaks };
      WTDb.saveSettings(s);
      _go('settings');
    };
    w.querySelector('#wt-pay-period').onchange = function() {
      const s = WTDb.getSettings(); s.payPeriod = this.value; WTDb.saveSettings(s);
    };
    w.querySelector('#wt-import-btn').onclick = () => w.querySelector('#wt-import-file').click();
    w.querySelector('#wt-import-file').onchange = function() {
      const file = this.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        if (WTDb.importData(e.target.result)) { alert('Imported successfully.'); _go('home'); }
        else alert('Import failed.');
      };
      reader.readAsText(file);
    };
  }

  function _showAddShift(dateStr) {
    const locs = WTDb.getLocations();
    if (!locs.length) { alert('Add a location in Settings first.'); _go('settings'); return; }
    const ov = document.createElement('div');
    ov.className = 'wt-overlay';
    ov.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">New Shift · ${_fmtDate(dateStr)}</div>
        <label class="wt-modal-label">Location</label>
        <select class="wt-input" id="wt-ml">
          ${locs.map(l => `<option value="${l.id}" data-rate="${l.hourlyRate}">${l.name} — $${l.hourlyRate}/hr</option>`).join('')}
        </select>
        <label class="wt-modal-label">Shift Type</label>
        <select class="wt-input" id="wt-ms">
          ${DEFAULT_SHIFTS.map(s => `<option>${s}</option>`).join('')}
          <option value="__custom">Custom…</option>
        </select>
        <div id="wt-custom-wrap" style="display:none;margin-top:8px">
          <input id="wt-mc" class="wt-input" placeholder="Shift name" type="text">
        </div>
        <label class="wt-modal-label">Hourly Rate ($/hr)</label>
        <input id="wt-mr" class="wt-input" type="number" step="0.50" value="${NYC_MIN_WAGE}" inputmode="decimal">
        <div class="wt-modal-actions">
          <button class="wt-btn wt-btn-secondary" id="wt-cancel">Cancel</button>
          <button class="wt-btn wt-btn-primary" id="wt-clockin-now">⏱ Clock In Now</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#wt-ml').onchange = function() {
      ov.querySelector('#wt-mr').value = this.options[this.selectedIndex].dataset.rate;
    };
    ov.querySelector('#wt-ms').onchange = function() {
      ov.querySelector('#wt-custom-wrap').style.display = this.value === '__custom' ? 'block' : 'none';
    };
    ov.querySelector('#wt-cancel').onclick = () => ov.remove();
    ov.querySelector('#wt-clockin-now').onclick = () => {
      const locId = ov.querySelector('#wt-ml').value;
      const loc = locs.find(l => l.id === locId);
      const sSel = ov.querySelector('#wt-ms');
      const shiftType = sSel.value === '__custom' ? (ov.querySelector('#wt-mc').value.trim() || 'Custom') : sSel.value;
      const rate = parseFloat(ov.querySelector('#wt-mr').value) || NYC_MIN_WAGE;
      const entryId = generateId();
      const shiftId = generateId();
      const clockInTime = new Date().toISOString();
      WTDb.saveShift({ id: shiftId, date: dateStr, locationId: locId, locationName: loc.name, hourlyRate: rate, shiftType, entries: [{ id: entryId, clockIn: clockInTime, clockOut: null, breakMinutes: 0 }] });
      ov.remove();
      // Show immediate photo prompt with 5-second skip countdown
      const photoOv = document.createElement('div');
      photoOv.className = 'wt-overlay';
      photoOv.innerHTML = `
        <div class="wt-modal">
          <div class="wt-modal-handle"></div>
          <div class="wt-modal-title">📷 Clock In proof</div>
          <p style="color:#98989D;font-size:14px;margin-bottom:18px">Take a photo as proof of your clock in at ${_fmtTime(clockInTime)}. This is your timestamp evidence.</p>
          <div style="display:flex;gap:10px">
            <button class="wt-btn wt-btn-primary" id="wt-take-photo" style="flex:2">📷 Take Photo</button>
            <button class="wt-btn wt-btn-secondary" id="wt-skip-photo" style="flex:1">Skip (<span id="wt-skip-count">5</span>)</button>
          </div>
        </div>`;
      document.body.appendChild(photoOv);
      let count = 5;
      const countdown = setInterval(() => {
        count--;
        const el = document.getElementById('wt-skip-count');
        if (el) el.textContent = count;
        if (count <= 0) { clearInterval(countdown); photoOv.remove(); _go('home'); }
      }, 1000);
      photoOv.querySelector('#wt-take-photo').onclick = () => {
        clearInterval(countdown);
        photoOv.remove();
        _doPhotoThenHome(shiftId, `${shiftId}_in_${entryId}`);
      };
      photoOv.querySelector('#wt-skip-photo').onclick = () => {
        clearInterval(countdown);
        photoOv.remove();
        _go('home');
      };
    };
  }

  function _showEditTime(shiftId, entryId, field) {
    const shift = WTDb.getShifts().find(s => s.id === shiftId);
    const entry = shift && shift.entries.find(e => e.id === entryId);
    if (!entry) return;
    const cur = new Date(entry[field] || new Date());
    const ov = document.createElement('div');
    ov.className = 'wt-overlay';
    ov.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">Edit ${field === 'clockIn' ? 'Clock In' : 'Clock Out'}</div>
        <input type="time" id="wt-etime" class="wt-input" style="font-size:28px;font-weight:800;text-align:center;font-variant-numeric:tabular-nums" value="${cur.toTimeString().slice(0,5)}">
        <div class="wt-modal-actions">
          <button class="wt-btn wt-btn-secondary" id="wt-ec">Cancel</button>
          <button class="wt-btn wt-btn-primary" id="wt-es">Save</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#wt-ec').onclick = () => ov.remove();
    ov.querySelector('#wt-es').onclick = () => {
      const [h, m] = ov.querySelector('#wt-etime').value.split(':');
      const d = new Date(entry[field] || new Date());
      d.setHours(+h, +m, 0, 0);
      entry[field] = d.toISOString();
      WTDb.saveShift(shift);
      ov.remove();
      _go('home');
    };
  }

  function _doClockOut(shiftId, entryId) {
    const shift = WTDb.getShifts().find(s => s.id === shiftId);
    if (!shift) return;
    const entry = shift.entries.find(e => e.id === entryId);
    if (entry) { entry.clockOut = new Date().toISOString(); WTDb.saveShift(shift); }
    _breakStart = null;
    _go('home');
  }

  function _addPeriod(shiftId) {
    const shift = WTDb.getShifts().find(s => s.id === shiftId);
    if (!shift) return;
    if (shift.entries.some(e => !e.clockOut)) { alert('Clock out the current period first.'); return; }
    shift.entries.push({ id: generateId(), clockIn: new Date().toISOString(), clockOut: null, breakMinutes: 0 });
    WTDb.saveShift(shift);
    _go('home');
  }

  function _delEntry(shiftId, entryId) {
    if (!confirm('Delete this period? Cannot be undone.')) return;
    const shift = WTDb.getShifts().find(s => s.id === shiftId);
    if (!shift) return;
    shift.entries = shift.entries.filter(e => e.id !== entryId);
    WTDb.saveShift(shift);
    _go('home');
  }

  async function _doPhoto(shiftId, photoKey) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async ev => {
        await WTDb.savePhoto(shiftId, photoKey, ev.target.result);
        const btn = document.querySelector(`[data-pid="${photoKey}"]`);
        if (btn) {
          const img = document.createElement('img');
          img.src = ev.target.result;
          img.style.cssText = 'width:100%;border-radius:10px;margin-top:8px;max-height:200px;object-fit:cover';
          btn.parentNode.insertBefore(img, btn.nextSibling);
          btn.textContent = '✓ Proof saved';
          btn.classList.add('has-photo');
        }
        const a = document.createElement('a');
        a.href = ev.target.result;
        const now = new Date().toISOString().replace(/[:.]/g,'-').slice(0,16);
        a.download = 'Tempo_proof_' + now + '.jpg';
        a.click();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

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
    const shifts = _rangeShifts(range);
    const pay = WTRules.weeklyPay(shifts);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.setFillColor(0,0,0); doc.rect(0,0,297,34,'F');
    doc.setTextColor(255,255,255); doc.setFontSize(20); doc.setFont(undefined,'bold');
    doc.text('TEMPO — Work Log', 14, 14);
    doc.setFontSize(10); doc.setFont(undefined,'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}`, 14, 22);
    doc.text(`Period: ${range}  |  Hours: ${WTRules.fmtHours(pay.totalHours)}  |  Pay: ${WTRules.fmtMoney(pay.total)}${pay.isOvertime?' (OT included)':''}`, 14, 29);
    const byDate = {};
    shifts.forEach(s => { if(!byDate[s.date]) byDate[s.date]=[]; byDate[s.date].push(s); });
    const body = [];
    Object.entries(byDate).forEach(([date, ds]) => {
      ds.forEach(shift => {
        const hrs = WTRules.shiftHours(shift);
        const earn = hrs * (shift.hourlyRate||NYC_MIN_WAGE);
        body.push([_fmtDate(date), shift.locationName||'—', shift.shiftType||'—',
          (shift.entries||[]).map(e=>_fmtTime(e.clockIn)).join(', '),
          (shift.entries||[]).map(e=>e.clockOut?_fmtTime(e.clockOut):'—').join(', '),
          WTRules.fmtHours(hrs), `$${(shift.hourlyRate||NYC_MIN_WAGE).toFixed(2)}`, WTRules.fmtMoney(earn)]);
      });
      const ds2 = WTRules.dailySummary(ds);
      body.push(['','','','','Day Total →', WTRules.fmtHours(ds2.totalHrs),'', WTRules.fmtMoney(ds2.totalEarnings)]);
    });
    body.push(['','','','','TOTAL', WTRules.fmtHours(pay.totalHours),'', WTRules.fmtMoney(pay.total)]);
    doc.autoTable({
      startY: 38,
      head: [['Date','Location','Shift','Clock In(s)','Clock Out(s)','Hours','Rate','Pay']],
      body, theme: 'grid',
      headStyles: { fillColor:[20,20,20], textColor:200, fontStyle:'bold', fontSize:9 },
      styles: { fontSize:9, cellPadding:2.5 },
      didParseCell: d => {
        if (d.row.raw[4]==='Day Total →') { d.cell.styles.fontStyle='bold'; d.cell.styles.fillColor=[240,240,240]; }
        if (d.row.raw[4]==='TOTAL') { d.cell.styles.fontStyle='bold'; d.cell.styles.fillColor=[0,0,0]; d.cell.styles.textColor=255; }
      }
    });
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text('Generated by Tempo · Personal reference only · Not an official payroll document', 14, doc.lastAutoTable.finalY + 8);
    doc.save(`Tempo_Work_${range}_${_today()}.pdf`);
  }

  function _viewOrReplacePhoto(shiftId, photoKey, currentBase64) {
    const ov = document.createElement('div');
    ov.className = 'wt-overlay';
    ov.style.zIndex = '400';
    ov.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">Proof photo</div>
        <img src="${currentBase64}" style="width:100%;border-radius:14px;max-height:300px;object-fit:cover;margin-bottom:16px">
        <div style="display:flex;gap:10px">
          <button class="wt-btn wt-btn-secondary" id="wt-vp-close">Close</button>
          <button class="wt-btn wt-btn-primary" id="wt-vp-replace">📷 Replace</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#wt-vp-close').onclick = () => ov.remove();
    ov.querySelector('#wt-vp-replace').onclick = () => { ov.remove(); _doPhoto(shiftId, photoKey); };
  }

  function _doPhotoThenHome(shiftId, photoKey) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) { _go('home'); return; }
      const reader = new FileReader();
      reader.onload = async ev => {
        await WTDb.savePhoto(shiftId, photoKey, ev.target.result);
        const a = document.createElement('a');
        a.href = ev.target.result;
        const now = new Date().toISOString().replace(/[:.]/g,'-').slice(0,16);
        a.download = 'Tempo_clockin_' + now + '.jpg';
        a.click();
        _go('home');
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  return { mount };
})();
