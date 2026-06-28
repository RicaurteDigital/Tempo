// work-tracker/ui.js — Premium Work Tracker UI

const WorkTracker = (() => {
  let _root = null;
  let _view = 'home';
  let _date = null;
  let _heroTimer = null;
  let _breakStart = localStorage.getItem('wt_break_start') || null;

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
        <div class="wt-hero-shift" id="wt-hero-shift-edit" style="cursor:pointer">
          ${run.shift.shiftType} · $${run.shift.hourlyRate}/hr
        </div>
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
    const shiftEditBtn = w.querySelector('#wt-hero-shift-edit');
    if (shiftEditBtn) shiftEditBtn.onclick = () => _showEditShift(run.shift);

    const breakBtn = w.querySelector('#wt-hero-break');
    if (breakBtn) breakBtn.onclick = () => {
      if (_breakStart === null) {
        // START BREAK: record time, close current entry
        _breakStart = new Date().toISOString();
        localStorage.setItem('wt_break_start', _breakStart);
        const shift = WTDb.getShifts().find(s => s.id === run.shift.id);
        if (shift) {
          const openEntry = shift.entries.find(e => !e.clockOut);
          if (openEntry) { openEntry.clockOut = _breakStart; WTDb.saveShift(shift); }
        }
        // Show photo prompt first, then update DOM
        const breakStartTime = _breakStart;
        const heroEl = breakBtn.closest('.wt-hero');
        const photoOvBreak = document.createElement('div');
        photoOvBreak.className = 'wt-overlay';
        photoOvBreak.innerHTML = `
          <div class="wt-modal">
            <div class="wt-modal-handle"></div>
            <div class="wt-modal-title">📷 Starting break</div>
            <p style="color:#98989D;font-size:14px;margin-bottom:18px">
              Take a photo as proof you clocked out at ${_fmtTime(breakStartTime)}.
            </p>
            <div style="display:flex;gap:10px">
              <button class="wt-btn wt-btn-primary" id="wt-take-photo-bs" style="flex:2">📷 Take Photo</button>
              <button class="wt-btn wt-btn-secondary" id="wt-skip-photo-bs" style="flex:1">Skip (<span id="wt-skip-count-bs">5</span>)</button>
            </div>
          </div>`;
        document.body.appendChild(photoOvBreak);

        const activateBreakUI = () => {
          if (heroEl) {
            heroEl.classList.add('wt-hero-break');
            heroEl.querySelector('.wt-hero-label').textContent = 'ON BREAK';
            heroEl.querySelector('.wt-hero-timer').classList.add('wt-timer-break');
            heroEl.querySelector('#wt-htimer').textContent = '00:00';
            const outBtn2 = heroEl.querySelector('#wt-hero-out');
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
        };

        let bsCount = 5;
        const bsCountdown = setInterval(() => {
          bsCount--;
          const el = document.getElementById('wt-skip-count-bs');
          if (el) el.textContent = bsCount;
          if (bsCount <= 0) {
            clearInterval(bsCountdown);
            photoOvBreak.remove();
            activateBreakUI();
          }
        }, 1000);

        photoOvBreak.querySelector('#wt-take-photo-bs').onclick = () => {
          clearInterval(bsCountdown);
          photoOvBreak.remove();
          // Take photo of the break start (clock out proof)
          const shiftForPhoto = WTDb.getShifts().find(s => s.id === run.shift.id);
          const closedEntry = shiftForPhoto && shiftForPhoto.entries.find(e => e.clockOut === breakStartTime);
          if (shiftForPhoto && closedEntry) {
            _doPhotoThenCallback(
              shiftForPhoto.id,
              `${shiftForPhoto.id}_out_${closedEntry.id}`,
              activateBreakUI
            );
          } else {
            activateBreakUI();
          }
        };
        photoOvBreak.querySelector('#wt-skip-photo-bs').onclick = () => {
          clearInterval(bsCountdown);
          photoOvBreak.remove();
          activateBreakUI();
        };
      } else {
        // END BREAK: open new entry, record break duration as note
        const breakEnd = new Date().toISOString();
        const breakMins = Math.round((new Date(breakEnd) - new Date(_breakStart)) / 60000);
        const shift = WTDb.getShifts().find(s => s.id === run.shift.id);
        const newEntryId = generateId();
        if (shift) {
          const s = WTDb.getSettings();
          const locSettings = (s.locationSettings || {})[shift.locationId] || {};
          const paidBreak = locSettings.paidBreaks || false;
          shift.entries.push({
            id: newEntryId,
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
        localStorage.removeItem('wt_break_start');

        // Show immediate photo prompt for break end proof
        const photoOv = document.createElement('div');
        photoOv.className = 'wt-overlay';
        photoOv.innerHTML = `
          <div class="wt-modal">
            <div class="wt-modal-handle"></div>
            <div class="wt-modal-title">📷 Back from break</div>
            <p style="color:#98989D;font-size:14px;margin-bottom:18px">
              ${breakMins}m break ended at ${_fmtTime(breakEnd)}. Take a photo as proof you're back on the clock.
            </p>
            <div style="display:flex;gap:10px">
              <button class="wt-btn wt-btn-primary" id="wt-take-photo-break" style="flex:2">📷 Take Photo</button>
              <button class="wt-btn wt-btn-secondary" id="wt-skip-photo-break" style="flex:1">Skip (<span id="wt-skip-count-break">5</span>)</button>
            </div>
          </div>`;
        document.body.appendChild(photoOv);

        let count = 5;
        const countdown = setInterval(() => {
          count--;
          const el = document.getElementById('wt-skip-count-break');
          if (el) el.textContent = count;
          if (count <= 0) { clearInterval(countdown); photoOv.remove(); _go('home'); }
        }, 1000);

        photoOv.querySelector('#wt-take-photo-break').onclick = () => {
          clearInterval(countdown);
          photoOv.remove();
          if (shift) _doPhotoThenHome(shift.id, `${shift.id}_in_${newEntryId}`);
          else _go('home');
        };
        photoOv.querySelector('#wt-skip-photo-break').onclick = () => {
          clearInterval(countdown);
          photoOv.remove();
          _go('home');
        };
      }
    };
  }

  function _ShiftCard(shift, forceExpanded) {
    const locs = WTDb.getLocations();
    const loc = locs.find(l => l.id === shift.locationId);
    const color = loc ? loc.color : '#5E5CE6';
    const hrs = WTRules.shiftHours(shift);
    const earn = hrs * (shift.hourlyRate || NYC_MIN_WAGE);
    const isRunning = (shift.entries || []).some(e => !e.clockOut);
    const isExpanded = forceExpanded || isRunning;

    const card = document.createElement('div');
    card.className = 'wt-shift' + (isExpanded ? ' wt-shift-expanded' : ' wt-shift-collapsed');

    // ── HEADER (always visible) ──
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
        ${!isRunning ? `<div class="wt-shift-chevron">${isExpanded ? '▲' : '▼'}</div>` : ''}
      </div>`;
    card.appendChild(top);

    // ── BODY (collapsible) ──
    const body = document.createElement('div');
    body.className = 'wt-shift-body';
    body.style.display = isExpanded ? 'block' : 'none';

    const entriesDiv = document.createElement('div');
    entriesDiv.className = 'wt-entries';

    const reversed = [...(shift.entries || [])].reverse();
    const first = reversed[0];
    const older = reversed.slice(1);

    if (first) {
      const built = _buildEntryRow(shift, first);
      entriesDiv.appendChild(built.row);
      entriesDiv.appendChild(built.photoRow);
    }

    if (older.length > 0) {
      const collapseWrap = document.createElement('div');
      collapseWrap.className = 'wt-entries-collapse';
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'wt-collapse-btn';
      toggleBtn.textContent = `+ Ver ${older.length} anterior${older.length > 1 ? 'es' : ''}`;
      let expanded = false;
      const olderDiv = document.createElement('div');
      olderDiv.className = 'wt-entries-older';
      olderDiv.style.display = 'none';
      older.forEach(e => {
        const built = _buildEntryRow(shift, e);
        olderDiv.appendChild(built.row);
        olderDiv.appendChild(built.photoRow);
      });
      toggleBtn.onclick = () => {
        expanded = !expanded;
        olderDiv.style.display = expanded ? 'block' : 'none';
        toggleBtn.textContent = expanded
          ? '▲ Ocultar anteriores'
          : `+ Ver ${older.length} anterior${older.length > 1 ? 'es' : ''}`;
      };
      collapseWrap.appendChild(toggleBtn);
      collapseWrap.appendChild(olderDiv);
      entriesDiv.appendChild(collapseWrap);
    }

    body.appendChild(entriesDiv);

    const footer = document.createElement('div');
    footer.className = 'wt-shift-footer';
    footer.innerHTML = `
      <button class="wt-add-period" data-sid="${shift.id}">+ Add period</button>
      <button class="wt-del-shift" data-sid="${shift.id}">Delete shift</button>`;
    footer.querySelector('.wt-add-period').onclick = () => _addPeriod(shift.id);
    footer.querySelector('.wt-del-shift').onclick = () => {
      if (!confirm('Delete this shift and ALL its proof photos? This cannot be undone.')) return;
      if (!confirm('Are you sure? This is permanent.')) return;
      if (WTDb.deleteShift(shift.id)) _go('home');
    };
    body.appendChild(footer);
    card.appendChild(body);

    // ── TAP TO EXPAND (only non-running shifts) ──
    if (!isRunning) {
      top.style.cursor = 'pointer';
      top.onclick = () => {
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        const chev = top.querySelector('.wt-shift-chevron');
        if (chev) chev.textContent = open ? '▼' : '▲';
        card.classList.toggle('wt-shift-expanded', !open);
        card.classList.toggle('wt-shift-collapsed', open);
      };
    }

    return card;
  }

  function _buildEntryRow(shift, e) {
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
      WTDb.getPhoto(shift.id, b.dataset.pid).then(base64 => {
        if (base64) {
          b.textContent = '✓ View proof';
          b.classList.add('has-photo');
          b.onclick = () => _viewOrReplacePhoto(shift.id, b.dataset.pid, base64);
        }
      });
    });

    return { row, photoRow };
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
        dot.onclick = (e) => {
          e.stopPropagation();
          _go('day', { date: dot.dataset.date });
        };
      });

      // Click on week totals row → show daily accordion
      const numsRow = row.querySelector('.wt-week-nums');
      if (numsRow) {
        numsRow.style.cursor = 'pointer';
        let breakdownEl = null;
        numsRow.onclick = () => {
          if (breakdownEl && breakdownEl.parentNode) {
            breakdownEl.remove(); breakdownEl = null; return;
          }
          breakdownEl = document.createElement('div');
          breakdownEl.style.cssText = 'margin-top:10px;padding-top:10px;border-top:1px solid #2C2C2E;font-size:13px';
          const days = [0,1,2,3,4,5,6].map(i => {
            const d = new Date(ws); d.setDate(d.getDate() + i);
            return d.toISOString().slice(0,10);
          });
          const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
          days.forEach((ds, i) => {
            const dayShifts = shifts.filter(s => s.date === ds);
            const dayPay = WTRules.weeklyPay(dayShifts);
            const hasWork = dayShifts.length > 0;
            const div = document.createElement('div');
            div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #1C1C1E;cursor:' + (hasWork ? 'pointer' : 'default');
            div.innerHTML = `
              <span style="color:${hasWork?'#fff':'#636366'}">${dayNames[i]} ${new Date(ds+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
              <span style="color:${hasWork?'#30D158':'#636366'};font-weight:700">${hasWork ? WTRules.fmtMoney(dayPay.total) : '$0.00'}</span>`;
            if (hasWork) {
              div.onclick = (e) => { e.stopPropagation(); _go('day', { date: ds }); };
            }
            breakdownEl.appendChild(div);
          });
          numsRow.after(breakdownEl);
        };
      }
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
        <div class="wt-sum-row" id="wt-earnings-row" style="cursor:pointer">
          <span>Est. earnings</span>
          <strong style="color:#30D158">${WTRules.fmtMoney(summary.totalEarnings)} <span id="wt-earn-chevron" style="font-size:11px;color:#636366">▼</span></strong>
        </div>
        <div id="wt-earn-breakdown" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid #2C2C2E;font-size:13px;color:#98989D;line-height:1.8">
          ${(() => {
            const lines = [];
            shifts.forEach(s => {
              const loc = WTDb.getLocations().find(l => l.id === s.locationId);
              const rate = loc ? loc.hourlyRate : 0;
              const locSettings = ((WTDb.getSettings().locationSettings||{})[s.locationId]||{});
              const paidBreaks = locSettings.paidBreaks || false;
              const shiftPay = WTRules.weeklyPay([s]);
              lines.push(`<div style="display:flex;justify-content:space-between"><span>${s.locationName||'Shift'} · ${WTRules.fmtHours(shiftPay.totalHours)}</span><span style="color:#fff">${WTRules.fmtMoney(shiftPay.total)}</span></div>`);
              if (shiftPay.regularHours > 0) lines.push(`<div style="display:flex;justify-content:space-between;padding-left:12px"><span>Regular ${WTRules.fmtHours(shiftPay.regularHours)} × $${rate}/hr</span><span>${WTRules.fmtMoney(shiftPay.regularPay)}</span></div>`);
              if (shiftPay.overtimePay > 0) lines.push(`<div style="display:flex;justify-content:space-between;padding-left:12px"><span style="color:#FF9F0A">OT ${WTRules.fmtHours(shiftPay.overtimeHours)} × ${shiftPay.otMultiplier}×</span><span style="color:#FF9F0A">${WTRules.fmtMoney(shiftPay.overtimePay)}</span></div>`);
              if (!paidBreaks) {
                const breakMins = (s.entries||[]).reduce((a,e) => a + (e.breakMinutes||0), 0);
                if (breakMins > 0) lines.push(`<div style="display:flex;justify-content:space-between;padding-left:12px"><span style="color:#FF453A">Breaks deducted ${WTRules.fmtHours(breakMins/60)}</span><span style="color:#FF453A">−${WTRules.fmtMoney((breakMins/60)*rate)}</span></div>`);
              }
            });
            const taxSettings = WTDb.getTaxSettings();
            const netData = WTRules.estimateNet(summary.totalEarnings, taxSettings);
            if (netData) {
              lines.push(`<div style="margin-top:12px;padding-top:10px;border-top:1px solid #38383A;font-size:11px;font-weight:700;color:#636366;text-transform:uppercase;letter-spacing:.5px">Est. Net Pay</div>`);
              netData.lines.forEach(l => {
                lines.push(`<div style="display:flex;justify-content:space-between;padding:2px 0"><span style="color:#98989D">${l.label}</span><span style="color:#FF453A">−${WTRules.fmtMoney(l.amount)}</span></div>`);
              });
              lines.push(`<div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid #2C2C2E;margin-top:6px"><span style="color:#fff;font-weight:700">Est. Net</span><span style="color:#64D2FF;font-weight:800">${WTRules.fmtMoney(netData.net)}</span></div>`);
              lines.push(`<div style="font-size:11px;color:#636366;margin-top:6px;line-height:1.5">Estimate only. Configure rates in Settings → Tax Estimate. Does not account for filing status, dependents, or multi-state situations.</div>`);
            }
            return lines.join('') || '<div style="color:#636366;font-size:13px">No breakdown available</div>';
          })()}
        </div>`;
      sumCard.querySelector('#wt-earnings-row').onclick = () => {
        const bd = sumCard.querySelector('#wt-earn-breakdown');
        const ch = sumCard.querySelector('#wt-earn-chevron');
        const open = bd.style.display !== 'none';
        bd.style.display = open ? 'none' : 'block';
        ch.textContent = open ? '▼' : '▲';
      };
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
              const ot = l.overtimeRules || DEFAULT_OT_RULES.restaurant;
              const otSummary = ot.levels && ot.levels.length > 0
                ? `OT: ${ot.levels[0].after}h/${ot.levels[0].per} ×${ot.levels[0].multiplier}`
                : 'No OT';
              return `<div class="wt-loc-row" style="cursor:pointer" data-edit-loc="${l.id}">
                <div class="wt-loc-dot" style="background:${l.color}"></div>
                <div style="flex:1">
                  <span class="wt-loc-name">${l.name}</span>
                  <div style="font-size:11px;color:#636366;margin-top:2px">${locS.paidBreaks ? '· Paid breaks · ' : ''}${otSummary}</div>
                </div>
                <span class="wt-loc-rate">$${l.hourlyRate}/hr</span>
                <button class="wt-loc-del" data-lid="${l.id}" style="z-index:2">✕</button>
              </div>`;
            }).join('')}
        </div>
        <div class="wt-add-form" style="margin-top:14px">
          <input id="wt-loc-name" class="wt-input" placeholder="Work location name" type="text" autocapitalize="words">
          <input id="wt-loc-rate" class="wt-input wt-input-sm" placeholder="$/hr" type="number" step="0.50" min="0" inputmode="decimal">
          <input id="wt-loc-color" type="color" value="#5E5CE6" class="wt-color-input">
        </div>
        <label style="display:flex;align-items:center;gap:10px;font-size:14px;color:#98989D;margin-top:10px;cursor:pointer">
          <input type="checkbox" id="wt-loc-paid-break" style="width:18px;height:18px;accent-color:#5E5CE6">
          Breaks are paid at this location
        </label>

        <div class="wt-settings-block" style="margin-top:12px;background:rgba(255,255,255,0.04)">
          <div class="wt-settings-title">Overtime Rules for this location</div>
          <div class="wt-setting-row">
            <label>Calculate OT by</label>
            <select class="wt-select-sm" id="wt-ot-calcby">
              <option value="week">Week total</option>
              <option value="day">Day total</option>
              <option value="both">Both (use best for worker)</option>
            </select>
          </div>
          <div class="wt-setting-row">
            <label>Level 1: after</label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="number" id="wt-ot1-after" class="wt-input" style="width:64px;flex:none" value="40" min="1" inputmode="numeric">
              <select class="wt-select-sm" id="wt-ot1-per">
                <option value="week">hrs/week</option>
                <option value="day">hrs/day</option>
              </select>
              <span style="color:#98989D;font-size:13px">→</span>
              <input type="number" id="wt-ot1-mult" class="wt-input" style="width:64px;flex:none" value="1.5" min="1" step="0.25" inputmode="decimal">
              <span style="color:#98989D;font-size:13px">×</span>
            </div>
          </div>
          <div class="wt-setting-row" id="wt-ot2-row" style="display:none">
            <label>Level 2: after</label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="number" id="wt-ot2-after" class="wt-input" style="width:64px;flex:none" value="12" min="1" inputmode="numeric">
              <select class="wt-select-sm" id="wt-ot2-per">
                <option value="day">hrs/day</option>
                <option value="week">hrs/week</option>
              </select>
              <span style="color:#98989D;font-size:13px">→</span>
              <input type="number" id="wt-ot2-mult" class="wt-input" style="width:64px;flex:none" value="2.0" min="1" step="0.25" inputmode="decimal">
              <span style="color:#98989D;font-size:13px">×</span>
            </div>
          </div>
          <button class="wt-text-btn" id="wt-add-ot2" style="margin-top:8px">+ Add Level 2 (double time)</button>
          <p class="wt-note" style="margin-top:8px">No OT? Leave Level 1 empty and set multiplier to 1.0</p>
        </div>

        <button class="wt-btn wt-btn-primary" style="margin-top:12px;width:100%" id="wt-add-loc">Add Location</button>
      </div>
      <div class="wt-settings-block">
        <div class="wt-settings-title">Work Profile & Pay Rules</div>
        <div class="wt-setting-row">
          <label>Work Profile</label>
          <select class="wt-select-sm" id="wt-work-profile">
            ${Object.entries(WORK_PROFILES).map(([key, p]) =>
              `<option value="${key}" ${settings.workProfile===key?'selected':''}>${p.label}</option>`
            ).join('')}
          </select>
        </div>
        <p class="wt-note" id="wt-profile-note" style="margin-bottom:8px">
          ${(() => {
            const p = WORK_PROFILES[settings.workProfile] || WORK_PROFILES.restaurant;
            return p.shifts.length > 0
              ? `Shifts: ${p.shifts.slice(0,3).join(', ')}… · Suggested rate: $${p.suggestedRate}/hr`
              : 'Define your own shift names when adding a location.';
          })()}
        </p>
        <div class="wt-setting-row">
          <label>Pay Period</label>
          <select class="wt-select-sm" id="wt-pay-period">
            <option value="weekly" ${settings.payPeriod==='weekly'?'selected':''}>Weekly (Fri)</option>
            <option value="event" ${settings.payPeriod==='event'?'selected':''}>Per Event</option>
            <option value="biweekly" ${settings.payPeriod==='biweekly'?'selected':''}>Bi-Weekly</option>
          </select>
        </div>
        <p class="wt-note" id="wt-labor-note">
          Overtime kicks in after ${settings.overtimeThreshold||40}h/week at ${settings.overtimeMultiplier||1.5}× rate.
          Update these values in this section when your local laws change.
        </p>
      </div>
      <div class="wt-settings-block">
        <div class="wt-settings-title">Data & Backup</div>
        <button class="wt-btn wt-btn-secondary" id="wt-import-btn" style="margin-bottom:10px">📥 Import Backup JSON</button>
        <input type="file" id="wt-import-file" accept=".json" style="display:none">
        <p class="wt-note">Photos auto-download to Camera Roll when captured. Export JSON regularly.</p>
      </div>`;
    const taxSettings = WTDb.getTaxSettings();
    const taxBlock = document.createElement('div');
    taxBlock.className = 'wt-settings-block';
    taxBlock.innerHTML = `
      <div class="wt-settings-title">Tax Estimate (2026)</div>
      <div class="wt-setting-row">
        <label>State / Profile</label>
        <select class="wt-select-sm" id="wt-tax-profile" style="max-width:200px">
          ${Object.entries(DEFAULT_TAX_PROFILES).map(([k,v]) =>
            `<option value="${k}" ${taxSettings.profile===k?'selected':''}>${v.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="wt-setting-row"><label>Federal %</label><input type="text" inputmode="decimal" id="wt-tax-fed" class="wt-input" style="width:80px;flex:none" value="${taxSettings.federal}" onclick="this.select()" onfocus="this.select()"></div>
      <div class="wt-setting-row"><label>Social Security %</label><input type="text" inputmode="decimal" id="wt-tax-ss" class="wt-input" style="width:80px;flex:none" value="${taxSettings.socialSecurity}" onclick="this.select()" onfocus="this.select()"></div>
      <div class="wt-setting-row"><label>Medicare %</label><input type="text" inputmode="decimal" id="wt-tax-med" class="wt-input" style="width:80px;flex:none" value="${taxSettings.medicare}" onclick="this.select()" onfocus="this.select()"></div>
      <div class="wt-setting-row"><label>State %</label><input type="text" inputmode="decimal" id="wt-tax-state" class="wt-input" style="width:80px;flex:none" value="${taxSettings.state}" onclick="this.select()" onfocus="this.select()"></div>
      <div class="wt-setting-row"><label>Local/City %</label><input type="text" inputmode="decimal" id="wt-tax-local" class="wt-input" style="width:80px;flex:none" value="${taxSettings.local}" onclick="this.select()" onfocus="this.select()"></div>
      <div class="wt-setting-row"><label>PFL/SDI %</label><input type="text" inputmode="decimal" id="wt-tax-pfl" class="wt-input" style="width:80px;flex:none" value="${taxSettings.pfl}" onclick="this.select()" onfocus="this.select()"></div>
      <div class="wt-setting-row"><label>Other label</label><input type="text" id="wt-tax-other-label" class="wt-input" style="width:110px;flex:none" value="${taxSettings.otherLabel||''}" placeholder="e.g. SDI"></div>
      <div class="wt-setting-row"><label>Other %</label><input type="text" inputmode="decimal" id="wt-tax-other" class="wt-input" style="width:80px;flex:none" value="${taxSettings.other||0}" onclick="this.select()" onfocus="this.select()"></div>
      <div class="wt-setting-row">
        <label>Show net estimate</label>
        <input type="checkbox" id="wt-tax-show" style="width:18px;height:18px;accent-color:#5E5CE6" ${taxSettings.showEstimate?'checked':''}>
      </div>
      <div style="font-size:11px;color:#636366;margin-top:8px;line-height:1.5">Estimate only — not tax advice. Rates are user-editable. Does not account for filing status, dependents, or multi-state situations.</div>
      <button class="wt-btn wt-btn-primary" style="margin-top:14px;width:100%" id="wt-tax-save">Save Tax Settings</button>`;
    w.appendChild(taxBlock);

    taxBlock.querySelector('#wt-tax-profile').onchange = function() {
      const p = DEFAULT_TAX_PROFILES[this.value];
      if (!p) return;
      taxBlock.querySelector('#wt-tax-fed').value        = p.federal;
      taxBlock.querySelector('#wt-tax-ss').value         = p.socialSecurity;
      taxBlock.querySelector('#wt-tax-med').value        = p.medicare;
      taxBlock.querySelector('#wt-tax-state').value      = p.state;
      taxBlock.querySelector('#wt-tax-local').value      = p.local;
      taxBlock.querySelector('#wt-tax-pfl').value        = p.pfl;
      taxBlock.querySelector('#wt-tax-other-label').value = p.otherLabel||'';
      taxBlock.querySelector('#wt-tax-other').value      = p.other||0;
    };

    taxBlock.querySelector('#wt-tax-save').onclick = () => {
      WTDb.saveTaxSettings({
        profile:        taxBlock.querySelector('#wt-tax-profile').value,
        federal:        parseFloat(taxBlock.querySelector('#wt-tax-fed').value)         || 0,
        socialSecurity: parseFloat(taxBlock.querySelector('#wt-tax-ss').value)          || 0,
        medicare:       parseFloat(taxBlock.querySelector('#wt-tax-med').value)         || 0,
        state:          parseFloat(taxBlock.querySelector('#wt-tax-state').value)       || 0,
        local:          parseFloat(taxBlock.querySelector('#wt-tax-local').value)       || 0,
        pfl:            parseFloat(taxBlock.querySelector('#wt-tax-pfl').value)         || 0,
        otherLabel:     taxBlock.querySelector('#wt-tax-other-label').value.trim(),
        other:          parseFloat(taxBlock.querySelector('#wt-tax-other').value)       || 0,
        showEstimate:   taxBlock.querySelector('#wt-tax-show').checked
      });
      alert('Tax settings saved.');
    };

    taxBlock.querySelectorAll('input').forEach(i => {
      i.addEventListener('focus', () => i.select && i.select());
      i.addEventListener('click', () => i.select && i.select());
    });

    _root.appendChild(w);
    w.querySelector('#wt-back').onclick = () => _go('home');
    w.querySelectorAll('.wt-loc-del').forEach(b => { b.onclick = () => { WTDb.deleteLocation(b.dataset.lid); _go('settings'); }; });
    w.querySelectorAll('[data-edit-loc]').forEach(row => {
      row.onclick = (e) => {
        if (e.target.classList.contains('wt-loc-del')) return;
        _showEditLocation(row.dataset.editLoc);
      };
    });
    w.querySelector('#wt-add-loc').onclick = () => {
      const name = w.querySelector('#wt-loc-name').value.trim();
      const rate = parseFloat(w.querySelector('#wt-loc-rate').value);
      const color = w.querySelector('#wt-loc-color').value;
      const paidBreaks = w.querySelector('#wt-loc-paid-break').checked;
      if (!name) { alert('Enter a work location name.'); return; }
      if (!rate || rate <= 0) { alert('Enter a valid hourly rate.'); return; }

      const calcBy = w.querySelector('#wt-ot-calcby').value;
      const ot1After = parseFloat(w.querySelector('#wt-ot1-after').value) || 40;
      const ot1Per = w.querySelector('#wt-ot1-per').value;
      const ot1Mult = parseFloat(w.querySelector('#wt-ot1-mult').value) || 1.5;
      const showOT2 = w.querySelector('#wt-ot2-row').style.display !== 'none';
      const levels = [{ after: ot1After, per: ot1Per, multiplier: ot1Mult }];
      if (showOT2) {
        const ot2After = parseFloat(w.querySelector('#wt-ot2-after').value);
        const ot2Per = w.querySelector('#wt-ot2-per').value;
        const ot2Mult = parseFloat(w.querySelector('#wt-ot2-mult').value) || 2.0;
        if (ot2After > 0) levels.push({ after: ot2After, per: ot2Per, multiplier: ot2Mult });
      }

      const loc = {
        id: generateId(), name, hourlyRate: rate, color,
        overtimeRules: { calculateBy: calcBy, levels }
      };
      WTDb.saveLocation(loc);
      const s = WTDb.getSettings();
      if (!s.locationSettings) s.locationSettings = {};
      s.locationSettings[loc.id] = { paidBreaks };
      WTDb.saveSettings(s);
      _go('settings');
    };

    // Show/hide OT level 2
    w.querySelector('#wt-add-ot2')?.addEventListener('click', () => {
      const row = w.querySelector('#wt-ot2-row');
      const btn = w.querySelector('#wt-add-ot2');
      const visible = row.style.display !== 'none';
      row.style.display = visible ? 'none' : 'flex';
      btn.textContent = visible ? '+ Add Level 2 (double time)' : '− Remove Level 2';
    });

    // Work profile change — suggest rate only if field is empty
    w.querySelector('#wt-work-profile')?.addEventListener('change', function() {
      const s = WTDb.getSettings();
      s.workProfile = this.value;
      WTDb.saveSettings(s);
      const p = WORK_PROFILES[this.value] || WORK_PROFILES.restaurant;
      const note = document.getElementById('wt-profile-note');
      if (note) note.textContent = p.shifts.length > 0
        ? `Shifts: ${p.shifts.slice(0,3).join(', ')}…`
        : 'Define your own shift names.';
      // Only suggest rate if field is empty
      const rateInput = w.querySelector('#wt-loc-rate');
      if (rateInput && (!rateInput.value || rateInput.value === '0')) {
        rateInput.value = p.suggestedRate > 0 ? p.suggestedRate : '';
      }
    });
    w.querySelector('#wt-pay-period').onchange = function() {
      const s = WTDb.getSettings(); s.payPeriod = this.value; WTDb.saveSettings(s);
    };
    w.querySelector('#wt-work-profile')?.addEventListener('change', function() {
      const s = WTDb.getSettings();
      s.workProfile = this.value;
      WTDb.saveSettings(s);
      const p = WORK_PROFILES[this.value] || WORK_PROFILES.restaurant;
      const note = document.getElementById('wt-profile-note');
      if (note) note.textContent = p.shifts.length > 0
        ? `Shifts: ${p.shifts.slice(0,3).join(', ')}… · Suggested rate: $${p.suggestedRate}/hr`
        : 'Define your own shift names when adding a location.';
      const rateInput = document.getElementById('wt-loc-rate');
      if (rateInput && p.suggestedRate > 0) rateInput.value = p.suggestedRate;
    });
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

  function _suggestShiftType(profile) {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    const dow = now.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6;

    const suggestions = {
      restaurant: () => {
        if (hour >= 0 && hour < 5)   return 'Late Night';
        if (hour >= 5 && hour < 10)  return 'Breakfast';
        if (isWeekend && hour >= 10 && hour < 15) return 'Brunch';
        if (hour >= 10 && hour < 16) return 'Lunch';
        if (hour >= 16 || hour < 0)  return 'Dinner';
        return 'Breakfast';
      },
      office: () => {
        if (hour >= 6 && hour < 12)  return 'Morning';
        if (hour >= 12 && hour < 17) return 'Afternoon';
        if (hour >= 17 && hour < 22) return 'Evening';
        return 'Full Day';
      },
      freelance: () => {
        if (hour >= 6 && hour < 13)  return 'Half Day';
        if (hour >= 13 && hour < 19) return 'Afternoon';
        if (hour >= 19)              return 'Evening';
        return 'Full Day';
      },
      construction: () => {
        if (hour >= 5 && hour < 15)  return 'Day Shift';
        if (hour >= 15 || hour < 5)  return 'Night Shift';
        return 'Day Shift';
      },
      custom: () => ''
    };

    const fn = suggestions[profile] || suggestions.restaurant;
    return fn();
  }

  function _showAddShift(dateStr) {
    const locs = WTDb.getLocations();
    if (!locs.length) { alert('Add a location in Settings first.'); _go('settings'); return; }

    const settings = WTDb.getSettings();
    const profile = settings.workProfile || 'restaurant';
    const suggested = _suggestShiftType(profile);
    const profileShifts = (WORK_PROFILES[profile]||WORK_PROFILES.restaurant).shifts;
    // Get rate from first location as default
    const firstLoc = locs[0];
    const initialRate = firstLoc ? firstLoc.hourlyRate : 16.50;

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
        <label class="wt-modal-label">Shift Type <span style="font-size:10px;color:#5E5CE6;font-weight:700;letter-spacing:.5px">AUTO-DETECTED</span></label>
        <select class="wt-input" id="wt-ms">
          ${profileShifts.map(s => `<option ${s===suggested?'selected':''}>${s}</option>`).join('')}
          <option value="__custom">Custom…</option>
        </select>
        <div id="wt-custom-wrap" style="display:none;margin-top:8px">
          <input id="wt-mc" class="wt-input" placeholder="Shift name" type="text">
        </div>
        <label class="wt-modal-label">Hourly Rate ($/hr)</label>
        <div style="display:flex;align-items:center;gap:0;background:#2C2C2E;border-radius:14px;overflow:hidden;border:1px solid #38383A">
          <button id="wt-rate-minus" style="width:52px;height:52px;background:none;border:none;color:#98989D;font-size:28px;font-weight:200;cursor:pointer;flex-shrink:0;line-height:1;padding-bottom:2px;transition:all .1s;border-radius:0" onpointerdown="this.style.background='rgba(255,255,255,0.12)';this.style.color='#fff'" onpointerup="this.style.background='none';this.style.color='#98989D'" onpointerleave="this.style.background='none';this.style.color='#98989D'">−</button>
          <input id="wt-mr" type="text" inputmode="decimal" pattern="[0-9]*\.?[0-9]*"
            value="${initialRate}"
            style="flex:1;background:none;border:none;color:#fff;font-size:22px;font-weight:800;text-align:center;font-variant-numeric:tabular-nums;padding:0;outline:none;-moz-appearance:textfield;-webkit-appearance:none;appearance:none;cursor:text;user-select:text;-webkit-user-select:text">
          <button id="wt-rate-plus" style="width:52px;height:52px;background:none;border:none;color:#98989D;font-size:24px;font-weight:200;cursor:pointer;flex-shrink:0;line-height:1;transition:all .1s;border-radius:0" onpointerdown="this.style.background='rgba(255,255,255,0.12)';this.style.color='#fff'" onpointerup="this.style.background='none';this.style.color='#98989D'" onpointerleave="this.style.background='none';this.style.color='#98989D'">+</button>
        </div>
        <div class="wt-modal-actions">
          <button class="wt-btn wt-btn-secondary" id="wt-cancel">Cancel</button>
          <button class="wt-btn wt-btn-primary" id="wt-clockin-now">⏱ Clock In Now</button>
        </div>
      </div>`;
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    ov.querySelectorAll('input').forEach(i => { i.addEventListener('focus', () => i.select()); i.addEventListener('click', () => i.select()); });

    // Location change → update rate
    ov.querySelector('#wt-ml').onchange = function() {
      const rate = this.options[this.selectedIndex].dataset.rate;
      if (rate) ov.querySelector('#wt-mr').value = rate;
    };
    // Trigger on load to set initial rate from first location
    ov.querySelector('#wt-ml').dispatchEvent(new Event('change'));

    ov.querySelector('#wt-ms').onchange = function() {
      ov.querySelector('#wt-custom-wrap').style.display = this.value === '__custom' ? 'block' : 'none';
    };

    // Stepper buttons
    ov.querySelector('#wt-rate-minus').onclick = () => {
      const input = ov.querySelector('#wt-mr');
      const val = parseFloat(input.value.replace(',','.')) || 0;
      input.value = Math.max(0, val - 0.25).toFixed(2);
    };
    ov.querySelector('#wt-rate-plus').onclick = () => {
      const input = ov.querySelector('#wt-mr');
      const val = parseFloat(input.value.replace(',','.')) || 0;
      input.value = (val + 0.25).toFixed(2);
    };

    // Single tap = select all, double tap = edit in place  
    const mrInput = ov.querySelector('#wt-mr');
    mrInput.addEventListener('focus', () => mrInput.select());
    mrInput.addEventListener('click', () => mrInput.select());

    ov.querySelector('#wt-cancel').onclick = () => ov.remove();
    ov.querySelector('#wt-clockin-now').onclick = () => {
      const locId = ov.querySelector('#wt-ml').value;
      const loc = locs.find(l => l.id === locId);
      const sSel = ov.querySelector('#wt-ms');
      const shiftType = sSel.value === '__custom'
        ? (ov.querySelector('#wt-mc').value.trim() || 'Custom') : sSel.value;
      const rate = parseFloat(ov.querySelector('#wt-mr').value);
      if (!rate || rate <= 0) { alert('Enter a valid hourly rate.'); return; }
      const entryId = generateId();
      const shiftId = generateId();
      const clockInTime = new Date().toISOString();
      WTDb.saveShift({
        id: shiftId, date: dateStr,
        locationId: locId, locationName: loc.name,
        hourlyRate: rate, shiftType,
        entries: [{ id: entryId, clockIn: clockInTime, clockOut: null, breakMinutes: 0 }]
      });
      ov.remove();
      const photoOv = document.createElement('div');
      photoOv.className = 'wt-overlay';
      photoOv.innerHTML = `
        <div class="wt-modal">
          <div class="wt-modal-handle"></div>
          <div class="wt-modal-title">📷 Clock In proof</div>
          <p style="color:#98989D;font-size:14px;margin-bottom:18px">Take a photo as proof of your clock in at ${_fmtTime(clockInTime)}.</p>
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
        clearInterval(countdown); photoOv.remove();
        _doPhotoThenHome(shiftId, `${shiftId}_in_${entryId}`);
      };
      photoOv.querySelector('#wt-skip-photo').onclick = () => {
        clearInterval(countdown); photoOv.remove(); _go('home');
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
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    ov.querySelectorAll('input').forEach(i => { i.addEventListener('focus', () => i.select()); i.addEventListener('click', () => i.select()); });
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
    const clockOutTime = new Date().toISOString();
    if (entry) { entry.clockOut = clockOutTime; WTDb.saveShift(shift); }
    _breakStart = null;
    localStorage.removeItem('wt_break_start');

    // Show immediate photo prompt with 5-second skip countdown
    const photoOv = document.createElement('div');
    photoOv.className = 'wt-overlay';
    photoOv.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">📷 Clock Out proof</div>
        <p style="color:#98989D;font-size:14px;margin-bottom:18px">Take a photo as proof of your clock out at ${_fmtTime(clockOutTime)}. This is your timestamp evidence.</p>
        <div style="display:flex;gap:10px">
          <button class="wt-btn wt-btn-primary" id="wt-take-photo-out" style="flex:2">📷 Take Photo</button>
          <button class="wt-btn wt-btn-secondary" id="wt-skip-photo-out" style="flex:1">Skip (<span id="wt-skip-count-out">5</span>)</button>
        </div>
      </div>`;
    document.body.appendChild(photoOv);

    let count = 5;
    const countdown = setInterval(() => {
      count--;
      const el = document.getElementById('wt-skip-count-out');
      if (el) el.textContent = count;
      if (count <= 0) { clearInterval(countdown); photoOv.remove(); _go('home'); }
    }, 1000);

    photoOv.querySelector('#wt-take-photo-out').onclick = () => {
      clearInterval(countdown);
      photoOv.remove();
      _doPhotoThenHome(shiftId, `${shiftId}_out_${entryId}`);
    };
    photoOv.querySelector('#wt-skip-photo-out').onclick = () => {
      clearInterval(countdown);
      photoOv.remove();
      _go('home');
    };
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
    if (!confirm('Delete this period and its proof photos? Cannot be undone.')) return;
    if (!confirm('Are you sure? This is permanent.')) return;
    const shift = WTDb.getShifts().find(s => s.id === shiftId);
    if (!shift) return;
    shift.entries = shift.entries.filter(e => e.id !== entryId);
    WTDb.saveShift(shift);
    _go('home');
  }

  async function _doPhoto(shiftId, photoKey) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
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

    // Extract metadata from photoKey (format: shiftId_clockin / shiftId_clockout / shiftId_break_N)
    const shifts = WTDb.getShifts();
    const shift = shifts.find(s => s.id === shiftId);
    const settings = WTDb.getSettings();
    const locs = WTDb.getLocations();
    const loc = shift ? locs.find(l => l.id === shift.locationId) : null;
    const locName = loc ? loc.name : 'Work';
    const shiftType = shift ? (shift.shiftType || 'Shift') : 'Shift';
    const entries = shift ? (shift.entries || []) : [];
    const firstIn = entries.length > 0 ? entries[0].clockIn : null;
    const lastOut = entries.length > 0 ? entries[entries.length-1].clockOut : null;
    const fmtDt = iso => iso ? new Date(iso).toLocaleString('en-US', {
      month:'short', day:'numeric', year:'numeric',
      hour:'2-digit', minute:'2-digit', hour12:true
    }) : '—';
    const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('en-US', {
      hour:'2-digit', minute:'2-digit', hour12:true
    }) : '—';

    let photoLabel = 'Proof';
    if (photoKey && photoKey.includes('clockin')) photoLabel = 'Clock In';
    else if (photoKey && photoKey.includes('clockout')) photoLabel = 'Clock Out';
    else if (photoKey && photoKey.includes('break')) photoLabel = 'Break';

    ov.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">Proof photo · ${photoLabel}</div>
        <img id="wt-proof-img" src="${currentBase64}" style="width:100%;border-radius:14px;max-height:300px;object-fit:cover;margin-bottom:12px">
        <div style="background:rgba(28,28,30,0.8);border-radius:12px;padding:12px 14px;margin-bottom:16px;font-size:13px;line-height:1.7">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px;color:#fff">${locName} · ${shiftType}</div>
          <div style="color:#98989D">📍 <span style="color:#fff">IN:</span> ${fmtDt(firstIn)}</div>
          <div style="color:#98989D">🏁 <span style="color:#fff">OUT:</span> ${lastOut ? fmtDt(lastOut) : '<span style="color:#64D2FF">Running</span>'}</div>
        </div>
        <div style="display:flex;gap:10px;margin-bottom:10px">
          <button class="wt-btn wt-btn-primary" id="wt-vp-download">⬇ Download with stamp</button>
        </div>
        <div style="display:flex;gap:10px">
          <button class="wt-btn wt-btn-secondary" id="wt-vp-close">Close</button>
          <button class="wt-btn wt-btn-secondary" id="wt-vp-replace">📷 Replace</button>
        </div>
      </div>`;

    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });

    ov.querySelector('#wt-vp-close').onclick = () => ov.remove();

    ov.querySelector('#wt-vp-download').onclick = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const W = img.naturalWidth || 1080;
        const H = img.naturalHeight || 1080;
        const stampH = Math.round(H * 0.22);
        canvas.width = W;
        canvas.height = H + stampH;
        const ctx = canvas.getContext('2d');

        // Draw original photo
        ctx.drawImage(img, 0, 0, W, H);

        // Stamp background
        ctx.fillStyle = 'rgba(10,10,12,0.95)';
        ctx.fillRect(0, H, W, stampH);

        // Accent bar top of stamp
        ctx.fillStyle = '#5E5CE6';
        ctx.fillRect(0, H, W, Math.round(stampH * 0.04));

        const pad = Math.round(W * 0.05);
        const lineH = Math.round(stampH * 0.22);

        // Location + shift type
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold ${Math.round(stampH * 0.18)}px -apple-system, SF Pro Display, Inter, sans-serif`;
        ctx.fillText(locName + ' · ' + shiftType, pad, H + lineH);

        // IN label + time
        ctx.fillStyle = '#98989D';
        ctx.font = `${Math.round(stampH * 0.14)}px -apple-system, SF Pro Display, Inter, sans-serif`;
        ctx.fillText('IN', pad, H + lineH * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(fmtDt(firstIn), pad + Math.round(W * 0.07), H + lineH * 2);

        // OUT label + time
        ctx.fillStyle = '#98989D';
        ctx.fillText('OUT', pad, H + lineH * 3);
        ctx.fillStyle = lastOut ? '#FFFFFF' : '#64D2FF';
        ctx.fillText(lastOut ? fmtDt(lastOut) : 'Still running', pad + Math.round(W * 0.07), H + lineH * 3);

        // Photo type label (Clock In / Clock Out / Break)
        ctx.fillStyle = '#5E5CE6';
        ctx.font = `bold ${Math.round(stampH * 0.13)}px -apple-system, SF Pro Display, Inter, sans-serif`;
        ctx.fillText('Tempo · ' + photoLabel + ' proof', pad, H + lineH * 3.9);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        const date = firstIn ? new Date(firstIn).toISOString().slice(0,10) : new Date().toISOString().slice(0,10);
        const filename = `Tempo_${locName.replace(/\s+/g,'_')}_${photoLabel.replace(/\s+/g,'_')}_${date}.jpg`;

        // On iOS Safari, link.download doesn't save to Camera Roll — open full screen so user can long-press save
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
          const previewOv = document.createElement('div');
          previewOv.style.cssText = 'position:fixed;inset:0;background:#000;z-index:999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px';
          previewOv.innerHTML = `
            <p style="color:#98989D;font-size:13px;margin-bottom:16px;text-align:center">
              Mantén presionada la imagen → <strong style="color:#fff">Añadir a fotos</strong>
            </p>
            <img src="${dataUrl}" style="max-width:100%;max-height:75vh;border-radius:12px;object-fit:contain">
            <button style="margin-top:20px;background:#2C2C2E;border:none;color:#fff;padding:14px 32px;border-radius:14px;font-size:15px;font-weight:700">Cerrar</button>`;
          previewOv.querySelector('button').onclick = () => previewOv.remove();
          document.body.appendChild(previewOv);
        } else {
          // Android and desktop — direct download works
          const link = document.createElement('a');
          link.download = filename;
          link.href = dataUrl;
          link.click();
        }
      };
      img.src = currentBase64;
    };

    ov.querySelector('#wt-vp-replace').onclick = () => {
      ov.remove();
      _doPhoto(shiftId, photoKey);
    };
  }

  function _doPhotoThenHome(shiftId, photoKey) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
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

  function _showEditLocation(locId) {
    const locs = WTDb.getLocations();
    const loc = locs.find(l => l.id === locId);
    if (!loc) return;
    const settings = WTDb.getSettings();
    const locS = ((settings.locationSettings||{})[loc.id]||{});
    const ot = loc.overtimeRules || DEFAULT_OT_RULES.restaurant;
    const level1 = (ot.levels && ot.levels[0]) ? ot.levels[0] : { after: 40, per: 'week', multiplier: 1.5 };
    const level2 = (ot.levels && ot.levels[1]) ? ot.levels[1] : null;

    const ov = document.createElement('div');
    ov.className = 'wt-overlay';
    ov.innerHTML = `
      <div class="wt-modal" style="max-height:85vh;overflow-y:auto">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">Edit Location</div>
        <label class="wt-modal-label">Name</label>
        <input id="wt-el-name" class="wt-input" type="text" value="${loc.name}" autocapitalize="words">
        <label class="wt-modal-label">Hourly Rate ($/hr)</label>
        <div style="display:flex;align-items:center;gap:0;background:#2C2C2E;border-radius:14px;overflow:hidden;border:1px solid #38383A">
          <button id="wt-el-minus" style="width:52px;height:52px;background:none;border:none;color:#98989D;font-size:28px;font-weight:200;cursor:pointer;line-height:1"
            onpointerdown="this.style.background='rgba(255,255,255,0.12)';this.style.color='#fff'"
            onpointerup="this.style.background='none';this.style.color='#98989D'"
            onpointerleave="this.style.background='none';this.style.color='#98989D'">−</button>
          <input id="wt-el-rate" type="text" inputmode="decimal" value="${loc.hourlyRate}"
            style="flex:1;background:none;border:none;color:#fff;font-size:22px;font-weight:800;text-align:center;font-variant-numeric:tabular-nums;padding:0;outline:none;cursor:text">
          <button id="wt-el-plus" style="width:52px;height:52px;background:none;border:none;color:#98989D;font-size:24px;font-weight:200;cursor:pointer;line-height:1"
            onpointerdown="this.style.background='rgba(255,255,255,0.12)';this.style.color='#fff'"
            onpointerup="this.style.background='none';this.style.color='#98989D'"
            onpointerleave="this.style.background='none';this.style.color='#98989D'">+</button>
        </div>
        <label class="wt-modal-label">Color</label>
        <input id="wt-el-color" type="color" value="${loc.color}" style="width:100%;height:44px;border-radius:12px;border:none;cursor:pointer">
        <label style="display:flex;align-items:center;gap:10px;font-size:14px;color:#98989D;margin-top:14px;cursor:pointer">
          <input type="checkbox" id="wt-el-paid-break" style="width:18px;height:18px;accent-color:#5E5CE6" ${locS.paidBreaks?'checked':''}>
          Breaks are paid at this location
        </label>
        <div style="margin-top:16px;background:rgba(255,255,255,0.04);border-radius:14px;padding:14px">
          <div style="font-size:11px;font-weight:700;color:#636366;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Overtime Rules</div>
          <div class="wt-setting-row">
            <label>Calculate OT by</label>
            <select class="wt-select-sm" id="wt-el-calcby">
              <option value="week" ${ot.calculateBy==='week'?'selected':''}>Week total</option>
              <option value="day" ${ot.calculateBy==='day'?'selected':''}>Day total</option>
              <option value="both" ${ot.calculateBy==='both'?'selected':''}>Both (best for worker)</option>
            </select>
          </div>
          <div class="wt-setting-row">
            <label>Level 1: after</label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="number" id="wt-el-ot1-after" class="wt-input" style="width:64px;flex:none" value="${level1.after}" inputmode="numeric">
              <select class="wt-select-sm" id="wt-el-ot1-per">
                <option value="week" ${level1.per==='week'?'selected':''}>hrs/week</option>
                <option value="day" ${level1.per==='day'?'selected':''}>hrs/day</option>
              </select>
              <span style="color:#98989D;font-size:13px">→</span>
              <input type="number" id="wt-el-ot1-mult" class="wt-input" style="width:64px;flex:none" value="${level1.multiplier}" step="0.25" inputmode="decimal">
              <span style="color:#98989D;font-size:13px">×</span>
            </div>
          </div>
          <div class="wt-setting-row" id="wt-el-ot2-row" style="${level2?'display:flex':'display:none'}">
            <label>Level 2: after</label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="number" id="wt-el-ot2-after" class="wt-input" style="width:64px;flex:none" value="${level2?level2.after:12}" inputmode="numeric">
              <select class="wt-select-sm" id="wt-el-ot2-per">
                <option value="day" ${level2&&level2.per==='day'?'selected':''}>hrs/day</option>
                <option value="week" ${level2&&level2.per==='week'?'selected':''}>hrs/week</option>
              </select>
              <span style="color:#98989D;font-size:13px">→</span>
              <input type="number" id="wt-el-ot2-mult" class="wt-input" style="width:64px;flex:none" value="${level2?level2.multiplier:2.0}" step="0.25" inputmode="decimal">
              <span style="color:#98989D;font-size:13px">×</span>
            </div>
          </div>
          <button id="wt-el-add-ot2" style="margin-top:8px;color:#5E5CE6;font-size:13px;font-weight:600;background:none;border:none;cursor:pointer;padding:0">
            ${level2 ? '− Remove Level 2' : '+ Add Level 2 (double time)'}
          </button>
        </div>
        <div class="wt-modal-actions" style="margin-top:20px">
          <button class="wt-btn wt-btn-secondary" id="wt-el-cancel">Cancel</button>
          <button class="wt-btn wt-btn-primary" id="wt-el-save">Save</button>
        </div>
      </div>`;

    document.body.appendChild(ov);
    ov.querySelectorAll('input').forEach(i => { i.addEventListener('focus', () => i.select()); i.addEventListener('click', () => i.select()); });
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });

    const rateInput = ov.querySelector('#wt-el-rate');
    rateInput.addEventListener('focus', () => rateInput.select());
    rateInput.addEventListener('click', () => rateInput.select());
    ov.querySelector('#wt-el-minus').onclick = () => {
      const v = parseFloat(rateInput.value.replace(',','.')) || 0;
      rateInput.value = Math.max(0, v - 0.25).toFixed(2);
    };
    ov.querySelector('#wt-el-plus').onclick = () => {
      const v = parseFloat(rateInput.value.replace(',','.')) || 0;
      rateInput.value = (v + 0.25).toFixed(2);
    };
    ov.querySelector('#wt-el-add-ot2').onclick = () => {
      const row = ov.querySelector('#wt-el-ot2-row');
      const btn = ov.querySelector('#wt-el-add-ot2');
      const visible = row.style.display !== 'none';
      row.style.display = visible ? 'none' : 'flex';
      btn.textContent = visible ? '+ Add Level 2 (double time)' : '− Remove Level 2';
    };
    ov.querySelector('#wt-el-cancel').onclick = () => ov.remove();
    ov.querySelector('#wt-el-save').onclick = () => {
      const name = ov.querySelector('#wt-el-name').value.trim();
      const rate = parseFloat(rateInput.value.replace(',','.'));
      const color = ov.querySelector('#wt-el-color').value;
      const paidBreaks = ov.querySelector('#wt-el-paid-break').checked;
      if (!name) { alert('Enter a location name.'); return; }
      if (!rate || rate <= 0) { alert('Enter a valid rate.'); return; }
      const calcBy = ov.querySelector('#wt-el-calcby').value;
      const ot1After = parseFloat(ov.querySelector('#wt-el-ot1-after').value) || 40;
      const ot1Per = ov.querySelector('#wt-el-ot1-per').value;
      const ot1Mult = parseFloat(ov.querySelector('#wt-el-ot1-mult').value) || 1.5;
      const showOT2 = ov.querySelector('#wt-el-ot2-row').style.display !== 'none';
      const levels = [{ after: ot1After, per: ot1Per, multiplier: ot1Mult }];
      if (showOT2) {
        const ot2After = parseFloat(ov.querySelector('#wt-el-ot2-after').value);
        const ot2Per = ov.querySelector('#wt-el-ot2-per').value;
        const ot2Mult = parseFloat(ov.querySelector('#wt-el-ot2-mult').value) || 2.0;
        if (ot2After > 0) levels.push({ after: ot2After, per: ot2Per, multiplier: ot2Mult });
      }
      loc.name = name; loc.hourlyRate = rate; loc.color = color;
      loc.overtimeRules = { calculateBy: calcBy, levels };
      WTDb.saveLocation(loc);
      const s = WTDb.getSettings();
      if (!s.locationSettings) s.locationSettings = {};
      s.locationSettings[loc.id] = { paidBreaks };
      WTDb.saveSettings(s);
      ov.remove(); _go('settings');
    };
  }

  function _doPhotoThenCallback(shiftId, photoKey, callback) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) { callback(); return; }
      const reader = new FileReader();
      reader.onload = async ev => {
        await WTDb.savePhoto(shiftId, photoKey, ev.target.result);
        const a = document.createElement('a');
        a.href = ev.target.result;
        const now = new Date().toISOString().replace(/[:.]/g,'-').slice(0,16);
        a.download = 'Tempo_break_' + now + '.jpg';
        a.click();
        callback();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function _showEditShift(shift) {
    const settings = WTDb.getSettings();
    const profile = settings.workProfile || 'restaurant';
    const profileShifts = (WORK_PROFILES[profile]||WORK_PROFILES.restaurant).shifts;
    const ov = document.createElement('div');
    ov.className = 'wt-overlay';
    ov.style.zIndex = '400';
    ov.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">Edit Current Shift</div>
        <label class="wt-modal-label">Shift Type</label>
        <select class="wt-input" id="wt-es-type">
          ${profileShifts.map(s => `<option ${s===shift.shiftType?'selected':''}>${s}</option>`).join('')}
          <option value="__custom" ${!profileShifts.includes(shift.shiftType)?'selected':''}>Custom…</option>
        </select>
        <div id="wt-es-custom-wrap" style="${!profileShifts.includes(shift.shiftType)?'':'display:none'};margin-top:8px">
          <input id="wt-es-custom" class="wt-input" placeholder="Shift name"
            value="${!profileShifts.includes(shift.shiftType)?shift.shiftType:''}" type="text">
        </div>
        <label class="wt-modal-label">Hourly Rate ($/hr)</label>
        <div style="display:flex;align-items:center;gap:0;background:#2C2C2E;border-radius:14px;overflow:hidden;border:1px solid #38383A">
          <button id="wt-es-minus" style="width:52px;height:52px;background:none;border:none;color:#98989D;font-size:28px;font-weight:200;cursor:pointer;line-height:1;padding-bottom:2px;transition:all .1s;border-radius:0" onpointerdown="this.style.background='rgba(255,255,255,0.12)';this.style.color='#fff'" onpointerup="this.style.background='none';this.style.color='#98989D'" onpointerleave="this.style.background='none';this.style.color='#98989D'">−</button>
          <input id="wt-es-rate" type="text" inputmode="decimal" pattern="[0-9]*\.?[0-9]*"
            value="${shift.hourlyRate}"
            style="flex:1;background:none;border:none;color:#fff;font-size:22px;font-weight:800;text-align:center;font-variant-numeric:tabular-nums;padding:0;outline:none;-moz-appearance:textfield;-webkit-appearance:none;appearance:none;cursor:text;user-select:text;-webkit-user-select:text">
          <button id="wt-es-plus" style="width:52px;height:52px;background:none;border:none;color:#98989D;font-size:24px;font-weight:200;cursor:pointer;line-height:1;transition:all .1s;border-radius:0" onpointerdown="this.style.background='rgba(255,255,255,0.12)';this.style.color='#fff'" onpointerup="this.style.background='none';this.style.color='#98989D'" onpointerleave="this.style.background='none';this.style.color='#98989D'">+</button>
        </div>
        <div class="wt-modal-actions">
          <button class="wt-btn wt-btn-secondary" id="wt-es-cancel">Cancel</button>
          <button class="wt-btn wt-btn-primary" id="wt-es-save">Save</button>
        </div>
      </div>`;
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    ov.querySelectorAll('input').forEach(i => { i.addEventListener('focus', () => i.select()); i.addEventListener('click', () => i.select()); });
    ov.querySelector('#wt-es-type').onchange = function() {
      ov.querySelector('#wt-es-custom-wrap').style.display = this.value === '__custom' ? 'block' : 'none';
    };
    ov.querySelector('#wt-es-minus').onclick = () => {
      const i = ov.querySelector('#wt-es-rate');
      const v = parseFloat(i.value.replace(',','.')) || 0;
      i.value = Math.max(0, v - 0.25).toFixed(2);
    };
    ov.querySelector('#wt-es-plus').onclick = () => {
      const i = ov.querySelector('#wt-es-rate');
      const v = parseFloat(i.value.replace(',','.')) || 0;
      i.value = (v + 0.25).toFixed(2);
    };
    // Single tap = select all, double tap = edit in place
    const esRateInput = ov.querySelector('#wt-es-rate');
    esRateInput.addEventListener('focus', () => esRateInput.select());
    esRateInput.addEventListener('click', () => esRateInput.select());

    ov.querySelector('#wt-es-cancel').onclick = () => ov.remove();
    ov.querySelector('#wt-es-save').onclick = () => {
      const typeSel = ov.querySelector('#wt-es-type');
      const newType = typeSel.value === '__custom'
        ? (ov.querySelector('#wt-es-custom').value.trim() || shift.shiftType)
        : typeSel.value;
      const newRate = parseFloat(ov.querySelector('#wt-es-rate').value) || shift.hourlyRate;
      const saved = WTDb.getShifts().find(s => s.id === shift.id);
      if (saved) {
        saved.shiftType = newType;
        saved.hourlyRate = newRate;
        WTDb.saveShift(saved);
      }
      ov.remove();
      _go('home');
    };
  }

  return { mount };
})();
