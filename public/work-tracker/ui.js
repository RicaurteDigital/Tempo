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

  function _today() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

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
    const realToday = _today();
    const today = _date || realToday;
    const isToday = today === realToday;
    const selectedDate = new Date(today + 'T12:00:00');
    const ws = getWeekStart(selectedDate);
    const settings = WTDb.getSettings();
    const currentProfile = settings.workProfile || 'restaurant';
    const weekShifts = WTDb.getShiftsForWeek(ws).filter(s => (s.workProfile || 'restaurant') === currentProfile);
    const todayShifts = WTDb.getShiftsForDate(today).filter(s => (s.workProfile || 'restaurant') === currentProfile);
    const pay = WTRules.weeklyPay(weekShifts);
    const run = _running();
    const locs = WTDb.getLocations().filter(l => (l.workProfile || 'restaurant') === currentProfile);
    const onBreak = _breakStart !== null;
    // Day navigation helpers
    const _navDay = (offset) => {
      const d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() + offset);
      const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      if (ds > realToday) return; // never go beyond today
      _date = ds;
      _go('home');
    };
    const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const dayLabel = dayNames[selectedDate.getDay()];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateLabel = `${monthNames[selectedDate.getMonth()]} ${selectedDate.getDate()}`;

    const w = document.createElement('div');
    w.className = 'wt-screen';

    w.innerHTML = `
      <div class="wt-hdr">
        <div class="wt-hdr-left">
          <h2>Work Tracker</h2>
          <p>${formatWeekLabel(ws)}</p>
        </div>
        <button class="wt-hdr-btn" id="wt-settings-btn">⚙</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0 16px;gap:12px">
        <button id="wt-nav-prev" style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0"
          onpointerdown="this.style.background='rgba(255,255,255,0.15)'" onpointerup="this.style.background='rgba(255,255,255,0.08)'" onpointerleave="this.style.background='rgba(255,255,255,0.08)'">‹</button>
        <div style="flex:1;text-align:center">
          <div style="font-size:26px;font-weight:800;color:#fff;letter-spacing:-.5px;line-height:1">${dayLabel}</div>
          <div style="font-size:13px;color:#98989D;margin-top:2px">${dateLabel}${isToday ? ' · Today' : ''}</div>
        </div>
        <button id="wt-nav-next" style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:${isToday ? '#3a3a3c' : '#fff'};font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;${isToday ? 'opacity:0.3;pointer-events:none' : ''}"
          onpointerdown="this.style.background='rgba(255,255,255,0.15)'" onpointerup="this.style.background='rgba(255,255,255,0.08)'" onpointerleave="this.style.background='rgba(255,255,255,0.08)'">›</button>
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
    } else if (isToday) {
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

    // ── DAILY TIP BLOCK ──────────────────────────────────
    const tipSettings = WTDb.getTipSettings();
    const feePercent = tipSettings.processingFeePercent || 3;
    const tipBlock = document.createElement('div');
    tipBlock.style.cssText = 'margin-bottom:14px';

    const homeProfile = WORK_PROFILES[settings.workProfile || 'restaurant'] || WORK_PROFILES.restaurant;
    // Aggregate tips from ALL shifts today
    const shiftsWithTips = todayShifts.filter(s => {
      const t = WTDb.getTipsForShift(s.id);
      return t && (t.creditCardTotal > 0 || t.cashTotal > 0);
    });

    if (shiftsWithTips.length > 0) {
      let totalMyCCCut = 0;
      let totalMyCash = 0;
      let totalUnallocated = 0;
      let hasAnyRemainder = false;

      const shiftTipRows = shiftsWithTips.map(s => {
        const t = WTDb.getTipsForShift(s.id);
        const result = TipRules.calculatePayouts(
          t.creditCardTotal || 0, t.cashTotal || 0,
          t.workers || [], feePercent, t.manualFee
        );
        const meIdx = t.workers ? t.workers.findIndex(w => w.isMe) : -1;
        const myPayout = meIdx >= 0 ? result.payouts[meIdx] : null;
        const myCash = meIdx >= 0 && result.totalPoints > 0
          ? Math.floor((result.payouts[meIdx].points / result.totalPoints) * (t.cashTotal||0))
          : 0;
        if (myPayout) totalMyCCCut += myPayout.amount;
        totalMyCash += myCash;
        if (result.remainder > 0) { hasAnyRemainder = true; totalUnallocated += result.remainder; }

        return `
          <div style="border-top:1px solid rgba(255,149,0,.15);margin-top:8px;padding-top:8px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-size:13px;font-weight:700;color:#fff">${s.locationName||'Shift'} · <span style="color:#98989D;font-size:12px;font-weight:500">${s.shiftType||''}</span></div>
                <div style="font-size:11px;color:#636366">CC ${TipRules.fmtMoney(result.creditCard.gross)} − fee ${TipRules.fmtMoney(result.creditCard.fee)}</div>
              </div>
              ${myPayout ? `<div style="text-align:right">
                <div style="font-size:15px;font-weight:800;color:#30D158">$${myPayout.amount}</div>
                ${myCash > 0 ? `<div style="font-size:11px;color:#636366">+$${myCash} cash</div>` : ''}
              </div>` : `<div style="font-size:12px;color:#636366">no cut set</div>`}
            </div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">
              ${result.payouts.map(p => `
                <div style="background:rgba(28,28,30,0.8);border-radius:8px;padding:4px 8px;font-size:11px">
                  <span style="color:${p.isMe?'#30D158':'#98989D'};font-weight:700">${p.name}</span>
                  <span style="color:#636366"> · </span>
                  <span style="color:#fff;font-weight:700">$${p.amount}</span>
                </div>`).join('')}
            </div>
          </div>`;
      }).join('');

      tipBlock.innerHTML = `
        <div style="background:rgba(255,149,0,.08);border:1px solid rgba(255,149,0,.2);border-radius:20px;padding:16px 18px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
            <div>
              <div style="font-size:11px;font-weight:700;color:#FF9F0A;text-transform:uppercase;letter-spacing:.5px">${isToday ? "Today's Tips" : dayLabel + "'s Tips"}</div>
              <div style="font-size:11px;color:#636366;margin-top:2px">${shiftsWithTips.length} shift${shiftsWithTips.length>1?'s':''} with tips</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:11px;color:#636366">Your CC cut</div>
              <div style="font-size:24px;font-weight:800;color:#30D158">$${totalMyCCCut}</div>
              ${totalMyCash > 0 ? `<div style="font-size:11px;color:#636366">+$${totalMyCash} cash</div>` : ''}
            </div>
          </div>
          ${shiftTipRows}
          ${hasAnyRemainder ? `<div style="font-size:12px;color:#FF9F0A;margin-top:8px;font-weight:600">⚠ $${totalUnallocated.toFixed(2)} unallocated across shifts</div>` : ''}
        </div>`;
    } else if (homeProfile.hasTips) {
      tipBlock.innerHTML = `
        <button id="wt-tip-new" style="width:100%;background:rgba(255,149,0,.08);border:1px dashed rgba(255,149,0,.3);border-radius:20px;padding:16px;color:#FF9F0A;font-size:15px;font-weight:700;cursor:pointer;text-align:center">
          💰 Add Today's Tips
        </button>`;
      tipBlock.querySelector('#wt-tip-new').onclick = () => {
        if (todayShifts.length === 1) {
          _showTipPool(todayShifts[0].id);
        } else if (todayShifts.length > 1) {
          _showShiftSelector(todayShifts, _showTipPool);
        }
      };
    }
    w.appendChild(tipBlock);

    const secHdr = document.createElement('div');
    secHdr.className = 'wt-sec-hdr';
    secHdr.innerHTML = `
      <span class="wt-sec-title">${isToday ? 'Today' : dayLabel} · ${_fmtDate(today)}</span>
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
    w.querySelector('#wt-nav-prev').onclick = () => _navDay(-1);
    const nextBtn = w.querySelector('#wt-nav-next');
    if (nextBtn && !isToday) nextBtn.onclick = () => _navDay(1);
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
    const tipsData = WTDb.getTipsForShift(shift.id);
    const hasTips = tipsData && (tipsData.creditCardTotal > 0 || tipsData.cashTotal > 0);
    const cardProfile = WORK_PROFILES[WTDb.getSettings().workProfile || 'restaurant'] || WORK_PROFILES.restaurant;
    footer.innerHTML = `
      <button class="wt-add-period" data-sid="${shift.id}">+ Add period</button>
      ${cardProfile.hasTips ? `<button class="wt-tips-btn" data-sid="${shift.id}" style="background:${hasTips?'rgba(255,149,0,.15)':'rgba(28,28,30,0.8)'};border:none;border-radius:12px;color:${hasTips?'#FF9F0A':'#98989D'};font-size:13px;font-weight:700;padding:8px 14px;cursor:pointer">` : ''}
        💰 ${hasTips ? TipRules.fmtMoney(tipsData.myPayout||0) + ' tips' : 'Tips'}
      ${cardProfile.hasTips ? `</button>` : ''}
      <button class="wt-del-shift" data-sid="${shift.id}">Delete shift</button>`;
    footer.querySelector('.wt-add-period').onclick = () => _addPeriod(shift.id);
    if (cardProfile.hasTips) {
      const tipsBtn = footer.querySelector('.wt-tips-btn');
      if (tipsBtn) tipsBtn.onclick = () => _showTipPool(shift.id);
    }
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
      const activeProf = (WTDb.getSettings().workProfile || 'restaurant');
      const shifts = WTDb.getShiftsForWeek(ws).filter(s => (s.workProfile || 'restaurant') === activeProf);
      const pay = WTRules.weeklyPay(shifts);
      const isCur = ws.getTime() === curMs;
      const row = document.createElement('div');
      row.className = 'wt-week' + (isCur ? ' wt-week-cur' : '');
      const dots = [0,1,2,3,4,5,6].map(i => {
        const d = new Date(ws); d.setDate(d.getDate() + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
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
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          });
          const dayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
          days.forEach((ds, i) => {
            const dayShifts = shifts.filter(s => s.date === ds);
            const dayPay = WTRules.weeklyPay(dayShifts);
            const hasWork = dayShifts.length > 0;
            const div = document.createElement('div');
            div.style.cssText = 'border-bottom:1px solid #1C1C1E';
            const dayRow = document.createElement('div');
            dayRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 0;cursor:' + (hasWork ? 'pointer' : 'default');
            dayRow.innerHTML = `
              <span style="color:${hasWork?'#fff':'#636366'}">${dayNames[i]} ${new Date(ds+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
              <div style="display:flex;align-items:center;gap:8px">
                ${hasWork ? `<span style="font-size:12px;color:#636366">${WTRules.fmtHours(dayPay.totalHours)}</span>` : ''}
                <span style="color:${hasWork?'#30D158':'#636366'};font-weight:700">${hasWork ? WTRules.fmtMoney(dayPay.total) : '$0.00'}</span>
                ${hasWork ? '<span style="font-size:10px;color:#636366">▼</span>' : ''}
              </div>`;
            div.appendChild(dayRow);

            if (hasWork) {
              const detailEl = document.createElement('div');
              detailEl.style.cssText = 'display:none;background:rgba(28,28,30,0.6);border-radius:12px;padding:10px 12px;margin-bottom:6px;font-size:13px';
              
              // Tips data for this day — aggregate all shifts
              const tipSettings = WTDb.getTipSettings();
              const feePercent = tipSettings.processingFeePercent || 3;
              const dayShiftsAll = WTDb.getShiftsForDate(ds);
              const shiftsWithTips = dayShiftsAll.filter(s => {
                const t = WTDb.getTipsForShift(s.id);
                return t && (t.creditCardTotal > 0 || t.cashTotal > 0);
              });
              let tipHtml = '';
              if (shiftsWithTips.length > 0) {
                let totalMyCCCut = 0;
                let totalMyCash = 0;
                const shiftRows = shiftsWithTips.map(s => {
                  const t = WTDb.getTipsForShift(s.id);
                  const tipResult = TipRules.calculatePayouts(
                    t.creditCardTotal||0, t.cashTotal||0,
                    t.workers||[], feePercent, t.manualFee
                  );
                  const meIdx = t.workers ? t.workers.findIndex(w => w.isMe) : -1;
                  const myPayout = meIdx >= 0 ? tipResult.payouts[meIdx] : null;
                  const myCash = meIdx >= 0 && tipResult.totalPoints > 0
                    ? Math.floor((tipResult.payouts[meIdx].points / tipResult.totalPoints) * (t.cashTotal||0))
                    : 0;
                  if (myPayout) totalMyCCCut += myPayout.amount;
                  totalMyCash += myCash;
                  return `
                    <div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #2C2C2E">
                      <div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:4px">${s.locationName||'Shift'} · <span style="color:#98989D;font-weight:500">${s.shiftType||''}</span></div>
                      <div style="display:flex;justify-content:space-between;color:#98989D;font-size:12px;margin-bottom:2px">
                        <span>CC ${WTRules.fmtMoney(t.creditCardTotal)} − fee ${WTRules.fmtMoney(tipResult.creditCard.fee)}</span>
                        <span style="color:#fff">${WTRules.fmtMoney(tipResult.creditCard.net)}</span>
                      </div>
                      ${t.cashTotal > 0 ? `<div style="display:flex;justify-content:space-between;color:#98989D;font-size:12px;margin-bottom:2px">
                        <span>Cash (separate)</span><span style="color:#30D158">${WTRules.fmtMoney(t.cashTotal)}</span>
                      </div>` : ''}
                      ${myPayout ? `<div style="display:flex;justify-content:space-between;margin-top:4px">
                        <span style="font-size:12px;color:#64D2FF">⭐ Your cut</span>
                        <span style="color:#64D2FF;font-weight:700">$${myPayout.amount}${myCash>0?' + $'+myCash+' cash':''}</span>
                      </div>` : ''}
                    </div>`;
                }).join('');

                tipHtml = `
                  <div style="border-top:1px solid #2C2C2E;margin-top:8px;padding-top:8px">
                    <div style="color:#FF9F0A;font-weight:700;margin-bottom:8px">💰 Tips (${shiftsWithTips.length} shift${shiftsWithTips.length>1?'s':''})</div>
                    ${shiftRows}
                    <div style="display:flex;justify-content:space-between;font-weight:700;padding-top:6px;margin-top:4px">
                      <span style="color:#fff">Hours + CC tips</span>
                      <span style="color:#30D158;font-size:15px;font-weight:800">${WTRules.fmtMoney(dayPay.total + totalMyCCCut)}</span>
                    </div>
                    ${totalMyCash > 0 ? `<div style="display:flex;justify-content:space-between;margin-top:4px">
                      <span style="font-size:12px;color:#636366">+ Cash tips</span>
                      <span style="font-size:13px;color:#636366;font-weight:600">${WTRules.fmtMoney(dayPay.total + totalMyCCCut + totalMyCash)}</span>
                    </div>` : ''}
                    <div style="font-size:11px;color:#636366;margin-top:2px">Cash not included in Hours + CC total</div>
                  </div>`;
              }



              detailEl.innerHTML = `
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                  <span style="color:#636366">Hours</span>
                  <span style="color:#fff;font-weight:700">${WTRules.fmtHours(dayPay.totalHours)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                  <span style="color:#636366">Gross pay</span>
                  <span style="color:#30D158;font-weight:700">${WTRules.fmtMoney(dayPay.total)}</span>
                </div>

                ${tipHtml}
                <div style="display:flex;gap:8px;margin-top:10px">
                  <button data-go-day="${ds}" style="flex:1;background:rgba(94,92,230,.15);border:none;border-radius:10px;color:#5E5CE6;font-size:13px;font-weight:700;padding:8px;cursor:pointer">
                    View full day →
                  </button>
                </div>`;

              div.appendChild(detailEl);

              let open = false;
              dayRow.onclick = (e) => {
                e.stopPropagation();
                open = !open;
                detailEl.style.display = open ? 'block' : 'none';
                const chev = dayRow.querySelector('span:last-child');
                if (chev) chev.textContent = open ? '▲' : '▼';
              };

              detailEl.querySelector('[data-go-day]').onclick = (e) => {
                e.stopPropagation();
                _go('day', { date: ds });
              };
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
    const activeProf2 = (WTDb.getSettings().workProfile || 'restaurant');
    const shifts = WTDb.getShiftsForDate(dateStr).filter(s => (s.workProfile || 'restaurant') === activeProf2);
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
    const _ds = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const startStr = _ds(start);
    const endStr = _ds(end);
    return WTDb.getShifts().filter(s => s.date >= startStr && s.date <= endStr)
      .sort((a,b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
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
    const settings = WTDb.getSettings();
    const currentProfile = settings.workProfile || 'restaurant';
    const locs = WTDb.getLocations().filter(l => (l.workProfile || 'restaurant') === currentProfile);
    const w = document.createElement('div');
    w.className = 'wt-screen';
    w.innerHTML = `
      <div class="wt-hdr">
        <button class="wt-back" id="wt-back">‹ Back</button>
        <div style="font-size:18px;font-weight:800">Settings</div>
        <div style="width:36px"></div>
      </div>
      <div class="wt-settings-block" id="wt-profile-block">
        <div class="wt-settings-title">Work Profile & Pay Rules</div>
        <div class="wt-setting-row">
          <label>Work Profile</label>
          <select class="wt-select-sm" id="wt-work-profile-top">
            ${Object.entries(WORK_PROFILES).map(([key, p]) =>
              `<option value="${key}" ${settings.workProfile===key?'selected':''}>${p.label}</option>`
            ).join('')}
          </select>
        </div>
        <p class="wt-note" id="wt-profile-note-top" style="margin-bottom:8px">
          ${(() => {
            const p = WORK_PROFILES[settings.workProfile] || WORK_PROFILES.restaurant;
            return p.shifts.length > 0
              ? `Shifts: ${p.shifts.slice(0,3).join(', ')}… · Suggested rate: $${p.suggestedRate}/hr`
              : 'Define your own shift names.';
          })()}
        </p>
        <div class="wt-setting-row">
          <label>Pay Period</label>
          <select class="wt-select-sm" id="wt-pay-period-top">
            <option value="weekly" ${settings.payPeriod==='weekly'?'selected':''}>Weekly (Fri)</option>
            <option value="event" ${settings.payPeriod==='event'?'selected':''}>Per Event</option>
            <option value="biweekly" ${settings.payPeriod==='biweekly'?'selected':''}>Bi-Weekly</option>
          </select>
        </div>
        <button class="wt-btn wt-btn-primary" style="margin-top:12px;width:100%" id="wt-save-profile-top">Save Profile & Pay Period</button>
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
        <div class="wt-settings-title">Data & Backup</div>
        <button class="wt-btn wt-btn-secondary" id="wt-import-btn" style="margin-bottom:10px">📥 Import Backup JSON</button>
        <input type="file" id="wt-import-file" accept=".json" style="display:none">
        <p class="wt-note">Photos auto-download to Camera Roll when captured. Export JSON regularly.</p>
      </div>`;
    // ── TIP POOL SETTINGS ────────────────────────────────
    const currentProfileObj = WORK_PROFILES[settings.workProfile || 'restaurant'] || WORK_PROFILES.restaurant;
    if (!currentProfileObj.hasTips) {
      // Skip tip pool settings for profiles without tips
    } else {
    const tipSettings = WTDb.getTipSettings();
    const tipBlock = document.createElement('div');
    tipBlock.className = 'wt-settings-block';
    const tipPositions = tipSettings.positions && tipSettings.positions.length > 0
      ? tipSettings.positions
      : (currentProfileObj.tipPositions && currentProfileObj.tipPositions.length > 0
        ? currentProfileObj.tipPositions
        : DEFAULT_TIP_POSITIONS);
    tipBlock.innerHTML = `
      <div class="wt-settings-title">Tip Pool Settings</div>

      <div style="font-size:11px;font-weight:700;color:#FF9F0A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Processing Fee</div>
      <div class="wt-setting-row">
        <label>Credit card fee % <span style="font-size:11px;color:#636366;font-weight:400">(deducted from CC tips before split)</span></label>
        <div style="display:flex;align-items:center;gap:0;background:#2C2C2E;border-radius:12px;overflow:hidden;border:1px solid #38383A;width:140px;flex-shrink:0">
          <button id="wt-tip-fee-minus" style="width:40px;height:40px;background:none;border:none;color:#98989D;font-size:22px;cursor:pointer"
            onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
            onpointerup="this.style.background='none'"
            onpointerleave="this.style.background='none'">−</button>
          <input id="wt-tip-fee" type="text" inputmode="decimal" value="${tipSettings.processingFeePercent||3}"
            style="flex:1;background:none;border:none;color:#fff;font-size:16px;font-weight:700;text-align:center;padding:0;outline:none"
            onclick="this.select()" onfocus="this.select()">
          <button id="wt-tip-fee-plus" style="width:40px;height:40px;background:none;border:none;color:#98989D;font-size:20px;cursor:pointer"
            onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
            onpointerup="this.style.background='none'"
            onpointerleave="this.style.background='none'">+</button>
        </div>
      </div>

      <div style="font-size:11px;font-weight:700;color:#FF9F0A;text-transform:uppercase;letter-spacing:.5px;margin:14px 0 10px">Rounding</div>
      <div class="wt-setting-row">
        <label>Rounding mode</label>
        <select class="wt-select-sm" id="wt-tip-rounding">
          ${TIP_ROUNDING_OPTIONS.map(o =>
            `<option value="${o.value}" ${tipSettings.roundingMode===o.value?'selected':''}>${o.label}</option>`
          ).join('')}
        </select>
      </div>
      <div class="wt-setting-row">
        <label>Round each person individually</label>
        <input type="checkbox" id="wt-tip-round-ind" style="width:18px;height:18px;accent-color:#5E5CE6" ${tipSettings.roundIndividual!==false?'checked':''}>
      </div>

      <div style="font-size:11px;font-weight:700;color:#FF9F0A;text-transform:uppercase;letter-spacing:.5px;margin:14px 0 10px">Positions & Points</div>
      <div id="wt-tip-positions-list">
        ${tipPositions.map((p, i) => `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #2C2C2E">
            <input type="text" value="${p.label}" data-pos-label="${i}" class="wt-input" style="flex:1;padding:8px 10px"
              onclick="this.select()" onfocus="this.select()">
            <div style="display:flex;align-items:center;background:#2C2C2E;border-radius:10px;overflow:hidden;border:1px solid #38383A">
              <button data-pos-minus="${i}" style="width:36px;height:36px;background:none;border:none;color:#98989D;font-size:20px;cursor:pointer"
                onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
                onpointerup="this.style.background='none'"
                onpointerleave="this.style.background='none'">−</button>
              <input type="text" inputmode="decimal" value="${p.points}" data-pos-pts="${i}"
                style="width:48px;background:none;border:none;color:#fff;font-size:14px;font-weight:700;text-align:center;padding:0;outline:none"
                onclick="this.select()" onfocus="this.select()">
              <button data-pos-plus="${i}" style="width:36px;height:36px;background:none;border:none;color:#98989D;font-size:18px;cursor:pointer"
                onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
                onpointerup="this.style.background='none'"
                onpointerleave="this.style.background='none'">+</button>
            </div>
            <button data-pos-del="${i}" style="background:none;border:none;color:#FF453A;font-size:16px;cursor:pointer;padding:4px">✕</button>
          </div>`).join('')}
      </div>
      <button class="wt-btn wt-btn-secondary" style="margin-top:10px;width:100%" id="wt-tip-add-pos">+ Add Position</button>
      <button class="wt-btn wt-btn-primary" style="margin-top:10px;width:100%" id="wt-tip-save">Save Tip Settings</button>`;
    w.appendChild(tipBlock);

    // Fee stepper
    tipBlock.querySelector('#wt-tip-fee-minus').onclick = () => {
      const i = tipBlock.querySelector('#wt-tip-fee');
      i.value = Math.max(0, (parseFloat(i.value)||3) - 0.25).toFixed(2);
    };
    tipBlock.querySelector('#wt-tip-fee-plus').onclick = () => {
      const i = tipBlock.querySelector('#wt-tip-fee');
      i.value = ((parseFloat(i.value)||3) + 0.25).toFixed(2);
    };

    // Position steppers
    tipBlock.querySelectorAll('[data-pos-minus]').forEach(btn => {
      btn.onclick = () => {
        const i = tipBlock.querySelector(`[data-pos-pts="${btn.dataset.posMinus}"]`);
        i.value = Math.max(0.25, (parseFloat(i.value)||1) - 0.25).toFixed(2);
      };
    });
    tipBlock.querySelectorAll('[data-pos-plus]').forEach(btn => {
      btn.onclick = () => {
        const i = tipBlock.querySelector(`[data-pos-pts="${btn.dataset.posPlus}"]`);
        i.value = ((parseFloat(i.value)||1) + 0.25).toFixed(2);
      };
    });
    tipBlock.querySelectorAll('[data-pos-del]').forEach(btn => {
      btn.onclick = () => {
        tipSettings.positions.splice(parseInt(btn.dataset.posDel), 1);
        WTDb.saveTipSettings(tipSettings);
        _go('settings');
      };
    });

    tipBlock.querySelector('#wt-tip-add-pos').onclick = () => {
      tipSettings.positions.push({ id: 'custom_' + Date.now(), label: 'New Position', points: 1.0 });
      WTDb.saveTipSettings(tipSettings);
      _go('settings');
    };

    tipBlock.querySelector('#wt-tip-save').onclick = () => {
      const labels = tipBlock.querySelectorAll('[data-pos-label]');
      const pts    = tipBlock.querySelectorAll('[data-pos-pts]');
      tipSettings.positions = Array.from(labels).map((l, i) => ({
        id: tipSettings.positions[i]?.id || 'pos_' + i,
        label: l.value.trim() || 'Position',
        points: parseFloat(pts[i].value) || 1
      }));
      tipSettings.processingFeePercent = parseFloat(tipBlock.querySelector('#wt-tip-fee').value) || 3;
      tipSettings.roundingMode         = tipBlock.querySelector('#wt-tip-rounding').value;
      tipSettings.roundIndividual      = tipBlock.querySelector('#wt-tip-round-ind').checked;
      WTDb.saveTipSettings(tipSettings);
      alert('Tip settings saved.');
    };

    tipBlock.querySelectorAll('input').forEach(i => {
      i.addEventListener('focus', () => i.select && i.select());
      i.addEventListener('click', () => i.select && i.select());
    });
    } // end hasTips check

    const taxSettings = WTDb.getTaxSettings();
    const taxBlock = document.createElement('div');
    taxBlock.className = 'wt-settings-block';
    taxBlock.innerHTML = `
      <div class="wt-settings-title">Tax Estimate (2026)</div>

      <div style="font-size:11px;font-weight:700;color:#5E5CE6;text-transform:uppercase;letter-spacing:.5px;margin:0 0 8px">Federal — same in all states</div>
      <div class="wt-setting-row"><label>Federal income tax % <span style="font-size:11px;color:#636366;font-weight:400">(withholding rate)</span></label><input type="text" inputmode="decimal" id="wt-tax-fed" class="wt-input" style="width:80px;flex:none" value="${taxSettings.federal}" onclick="this.select()" onfocus="this.select()"></div>
      <div class="wt-setting-row"><label>Social Security % <span style="font-size:11px;color:#636366;font-weight:400">(FICA — 6.2% fixed)</span></label><input type="text" inputmode="decimal" id="wt-tax-ss" class="wt-input" style="width:80px;flex:none" value="${taxSettings.socialSecurity}" onclick="this.select()" onfocus="this.select()"></div>
      <div class="wt-setting-row"><label>Medicare % <span style="font-size:11px;color:#636366;font-weight:400">(FICA — 1.45% fixed)</span></label><input type="text" inputmode="decimal" id="wt-tax-med" class="wt-input" style="width:80px;flex:none" value="${taxSettings.medicare}" onclick="this.select()" onfocus="this.select()"></div>

      <div style="font-size:11px;font-weight:700;color:#FF9F0A;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 8px">State & Local — varies by state</div>
      <div class="wt-setting-row">
        <label>State / Profile</label>
        <select class="wt-select-sm" id="wt-tax-profile" style="max-width:200px">
          ${Object.entries(DEFAULT_TAX_PROFILES).map(([k,v]) =>
            `<option value="${k}" ${taxSettings.profile===k?'selected':''}>${v.label}</option>`
          ).join('')}
        </select>
      </div>
      <div id="wt-tax-profile-note" style="font-size:12px;color:#636366;margin-bottom:8px;display:none"></div>
      <div class="wt-setting-row"><label>State %</label><input type="text" inputmode="decimal" id="wt-tax-state" class="wt-input" style="width:80px;flex:none" value="${taxSettings.state}" onclick="this.select()" onfocus="this.select()"></div>
      <div class="wt-setting-row"><label>Local/City %</label><input type="text" inputmode="decimal" id="wt-tax-local" class="wt-input" style="width:80px;flex:none" value="${taxSettings.local}" onclick="this.select()" onfocus="this.select()"></div>
      <div class="wt-setting-row"><label>PFL/SDI % <span style="font-size:11px;color:#636366;font-weight:400">(Paid Family Leave / State Disability)</span></label><input type="text" inputmode="decimal" id="wt-tax-pfl" class="wt-input" style="width:80px;flex:none" value="${taxSettings.pfl}" onclick="this.select()" onfocus="this.select()"></div>
      <div class="wt-setting-row"><label>Other label <span style="font-size:11px;color:#636366;font-weight:400">(optional extra deduction)</span></label><input type="text" id="wt-tax-other-label" class="wt-input" style="width:110px;flex:none" value="${taxSettings.otherLabel||''}" placeholder="e.g. SDI"></div>
      <div class="wt-setting-row"><label>Other %</label><input type="text" inputmode="decimal" id="wt-tax-other" class="wt-input" style="width:80px;flex:none" value="${taxSettings.other||0}" onclick="this.select()" onfocus="this.select()"></div>

      <div style="font-size:11px;font-weight:700;color:#636366;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 8px">Display</div>
      <div class="wt-setting-row">
        <label>Show net estimate in breakdown</label>
        <input type="checkbox" id="wt-tax-show" style="width:18px;height:18px;accent-color:#5E5CE6" ${taxSettings.showEstimate?'checked':''}>
      </div>
      <div style="font-size:11px;color:#636366;margin-top:8px;line-height:1.5">Estimate only — not tax advice. All rates are editable. Does not account for filing status, dependents, or multi-state situations. Update rates each year as laws change.</div>
      <button class="wt-btn wt-btn-primary" style="margin-top:14px;width:100%" id="wt-tax-save">Save Tax Settings</button>`;
    w.appendChild(taxBlock);

    taxBlock.querySelector('#wt-tax-profile').onchange = function() {
      const p = DEFAULT_TAX_PROFILES[this.value];
      if (!p) return;
      // Federal rates don't auto-fill — user keeps their own federal rate
      // Only state/local rates update automatically
      taxBlock.querySelector('#wt-tax-state').value       = p.state;
      taxBlock.querySelector('#wt-tax-local').value       = p.local;
      taxBlock.querySelector('#wt-tax-pfl').value         = p.pfl;
      taxBlock.querySelector('#wt-tax-other-label').value = p.otherLabel||'';
      taxBlock.querySelector('#wt-tax-other').value       = p.other||0;
      // Show note for NYC
      const note = taxBlock.querySelector('#wt-tax-profile-note');
      if (this.value === 'NY_NYC') {
        note.textContent = '📍 NYC workers pay state tax (6.85%) + city tax (3.876%). Select this if your workplace is in any of the 5 boroughs.';
        note.style.display = 'block';
      } else if (this.value === 'NY') {
        note.textContent = '📍 Upstate/Outside NYC: You only pay the state tax rate (6.85%).';
        note.style.display = 'block';
      } else {
        note.style.display = 'none';
      }
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
    // Top profile & pay period save
    const saveProfileTop = w.querySelector('#wt-save-profile-top');
    if (saveProfileTop) {
      saveProfileTop.onclick = () => {
        const newProfile = w.querySelector('#wt-work-profile-top').value;
        const newPayPeriod = w.querySelector('#wt-pay-period-top').value;
        const s = WTDb.getSettings();
        s.workProfile = newProfile;
        s.payPeriod = newPayPeriod;
        WTDb.saveSettings(s);
        _go('settings');
      };
      // Update note on profile change
      w.querySelector('#wt-work-profile-top').onchange = function() {
        const p = WORK_PROFILES[this.value] || WORK_PROFILES.restaurant;
        const note = w.querySelector('#wt-profile-note-top');
        if (note) note.textContent = p.shifts.length > 0
          ? `Shifts: ${p.shifts.slice(0,3).join(', ')}… · Suggested rate: $${p.suggestedRate}/hr`
          : 'Define your own shift names.';
      };
    }
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
        workProfile: settings.workProfile || 'restaurant',
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

  function _showQuickAddLocation(onDone) {
    const ov = document.createElement('div');
    ov.className = 'wt-overlay';
    document.body.appendChild(ov);
    ov.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">Add Work Location</div>
        <label class="wt-modal-label">Location name</label>
        <input id="wt-ql-name" class="wt-input" type="text" placeholder="e.g. Downtown Restaurant, Main St Cafe..."
          autocapitalize="words" onclick="this.select()" onfocus="this.select()">
        <label class="wt-modal-label">Hourly rate</label>
        <div style="display:flex;align-items:center;background:#2C2C2E;border-radius:14px;overflow:hidden;border:1px solid #38383A;margin-bottom:6px">
          <span style="padding:0 10px;color:#98989D;font-size:15px">$</span>
          <input id="wt-ql-rate" class="wt-input" type="text" inputmode="decimal" value="16.50"
            style="flex:1;background:none;border:none;padding:12px 0"
            onclick="this.select()" onfocus="this.select()">
        </div>
        <div class="wt-modal-actions">
          <button class="wt-btn wt-btn-secondary" id="wt-ql-cancel">Cancel</button>
          <button class="wt-btn wt-btn-primary" id="wt-ql-save">Add Location</button>
        </div>
      </div>`;

    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.querySelector('#wt-ql-cancel').onclick = () => {
      if (ov._cleanupVV) ov._cleanupVV();
      ov.remove();
    };
    ov.querySelectorAll('input').forEach(i => {
      i.addEventListener('focus', () => i.select && i.select());
    });
    if (window.visualViewport) {
      const __vvHandler = () => {
        const vh = window.visualViewport.height;
        ov.style.height = vh + 'px';
        ov.style.top = window.visualViewport.offsetTop + 'px';
        const modal = ov.querySelector('.wt-modal');
        if (modal) modal.style.maxHeight = (vh * 0.92) + 'px';
        const activeEl = document.activeElement;
        if (activeEl && activeEl.tagName === 'INPUT' && ov.contains(activeEl)) {
          setTimeout(() => activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
        }
      };
      window.visualViewport.addEventListener('resize', __vvHandler);
      window.visualViewport.addEventListener('scroll', __vvHandler);
      ov._cleanupVV = () => {
        window.visualViewport.removeEventListener('resize', __vvHandler);
        window.visualViewport.removeEventListener('scroll', __vvHandler);
      };
    }

    ov.querySelector('#wt-ql-save').onclick = () => {
      if (ov._cleanupVV) ov._cleanupVV();
      const name = ov.querySelector('#wt-ql-name').value.trim();
      const rate = parseFloat(ov.querySelector('#wt-ql-rate').value) || 16.50;
      if (!name) { ov.querySelector('#wt-ql-name').focus(); return; }
      const settings = WTDb.getSettings();
      const loc = {
        id: 'loc_' + Date.now(),
        name,
        hourlyRate: rate,
        color: '#5E5CE6',
        workProfile: settings.workProfile || 'restaurant',
        overtimeRules: JSON.parse(JSON.stringify(DEFAULT_OT_RULES))
      };
      WTDb.saveLocation(loc);
      ov.remove();
      if (onDone) onDone();
    };
  }

  function _showAddShift(dateStr) {
    const settings = WTDb.getSettings();
    const currentProfile = (WTDb.getSettings().workProfile || 'restaurant');
    const locs = WTDb.getLocations().filter(l => (l.workProfile || 'restaurant') === currentProfile);
    if (!locs.length) { _showQuickAddLocation(() => _showAddShift(dateStr)); return; }
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
        <select class="wt-input" id="wt-ml" style="display:block;width:100%">
          ${locs.map(l => `<option value="${l.id}" data-rate="${l.hourlyRate}">${l.name} — $${l.hourlyRate}/hr</option>`).join('')}
        </select>
        <button id="wt-ml-add" type="button" style="display:block;width:100%;background:none;border:none;color:#5E5CE6;font-size:13px;font-weight:600;padding:8px 0 4px;cursor:pointer;text-align:left">+ Add new location</button>
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
    ov.querySelector('#wt-ml-add').onclick = () => {
      ov.remove();
      _showQuickAddLocation(() => _showAddShift(dateStr));
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
        workProfile: WTDb.getSettings().workProfile || 'restaurant',
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
        const d2 = firstIn ? new Date(firstIn) : new Date();
        const date = `${d2.getFullYear()}-${String(d2.getMonth()+1).padStart(2,'0')}-${String(d2.getDate()).padStart(2,'0')}`;
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

  function _showShiftSelector(shifts, callback) {
    const ov = document.createElement('div');
    ov.className = 'wt-overlay';
    ov.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">Which shift?</div>
        ${shifts.map(s => `
          <button data-sid="${s.id}" style="width:100%;background:rgba(44,44,46,0.8);border:1px solid #38383A;border-radius:14px;color:#fff;font-size:15px;font-weight:700;padding:14px;cursor:pointer;margin-bottom:8px;text-align:left">
            ${s.locationName||'Shift'} · ${s.shiftType||''} · $${s.hourlyRate}/hr
          </button>`).join('')}
        <button class="wt-btn wt-btn-secondary" id="wt-ss-cancel" style="margin-top:4px">Cancel</button>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.querySelectorAll('[data-sid]').forEach(btn => {
      btn.onclick = () => { ov.remove(); callback(btn.dataset.sid); };
    });
    ov.querySelector('#wt-ss-cancel').onclick = () => ov.remove();
  }

  function _showTipPool(dayKey) {
    const __shifts = WTDb.getShifts();
    const __shift = __shifts.find(s => s.id === dayKey);
    const locationId = __shift ? __shift.locationId : null;
    const tipSettings = WTDb.getTipSettings();
    const feePercent = tipSettings.processingFeePercent || 3;
    const saved = WTDb.getTipsForShift(dayKey) || {
      creditCardTotal: 0, cashTotal: 0, workers: []
    };

    const ov = document.createElement('div');
    ov.className = 'wt-overlay';

    const render = () => {
      const __modal = ov.querySelector('.wt-modal');
      const __scrollTop = __modal ? __modal.scrollTop : 0;
      // Preserve input values before re-render
      const ccInput = ov.querySelector('#wt-tp-cc');
      const cashInput = ov.querySelector('#wt-tp-cash');
      if (ccInput && ccInput.value) {
        const parsed = parseFloat(ccInput.value.replace(',','.'));
        if (!isNaN(parsed)) saved.creditCardTotal = parsed;
      }
      if (cashInput && cashInput.value) {
        const parsed = parseFloat(cashInput.value.replace(',','.'));
        if (!isNaN(parsed)) saved.cashTotal = parsed;
      }

      // Always render isMe first, then by points descending — regardless of insertion order
      const workers = [...(saved.workers || [])].sort((a, b) => {
        if (a.isMe && !b.isMe) return -1;
        if (!a.isMe && b.isMe) return 1;
        return (b.points || 0) - (a.points || 0);
      });
      const ccTotal = parseFloat(saved.creditCardTotal) || 0;
      const cashTotal = parseFloat(saved.cashTotal) || 0;
      const result = TipRules.calculatePayouts(ccTotal, cashTotal, workers, feePercent, saved.manualFee);
      const hasSplit = saved.ccBreakdown && saved.ccBreakdown.length > 1;
      // Ensure exactFee is always calculated correctly:
      // if split, only fee-applicable amounts count toward the exact fee.
      if (result.creditCard) {
        if (hasSplit) {
          const splitCalc = TipRules.applyProcessingFeeMulti(saved.ccBreakdown, feePercent);
          result.creditCard.exactFee = splitCalc.exactFee;
        } else {
          result.creditCard.exactFee = ccTotal * (feePercent / 100);
        }
      }

      ov.innerHTML = `
        <div class="wt-modal" style="max-height:92vh;overflow-y:auto">
          <div class="wt-modal-handle"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
            <div class="wt-modal-title" style="margin:0">💰 Tip Pool</div>
            <div style="font-size:12px;color:#636366">${dayKey}</div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
            <div>
              <label class="wt-modal-label">Credit Card Tips</label>
              <div style="display:flex;align-items:center;background:#2C2C2E;border-radius:14px;overflow:hidden;border:1px solid #38383A">
                <span style="padding:0 10px;color:#98989D;font-size:15px">$</span>
                <input id="wt-tp-cc" type="text" inputmode="decimal"
                  value="${ccTotal||''}" placeholder="0.00"
                  style="flex:1;background:none;border:none;color:#fff;font-size:18px;font-weight:700;padding:12px 0;outline:none;width:0"
                  onclick="this.select()" onfocus="this.select()">
              </div>
              <button id="wt-tp-reverse-cc" type="button" style="background:none;border:none;color:#5E5CE6;font-size:11px;padding:4px 0 0;cursor:pointer;text-align:left">I know my amount instead</button>
              <button id="wt-tp-split" type="button" style="background:none;border:none;color:#FF9F0A;font-size:11px;padding:2px 0 0;cursor:pointer;text-align:left">${saved.ccBreakdown && saved.ccBreakdown.length > 1 ? `✓ Split (${saved.ccBreakdown.length} amounts)` : '+ Split into multiple amounts'}</button>
            </div>
            <div>
              <label class="wt-modal-label">Cash Tips</label>
              <div style="display:flex;align-items:center;background:#2C2C2E;border-radius:14px;overflow:hidden;border:1px solid #38383A">
                <span style="padding:0 10px;color:#98989D;font-size:15px">$</span>
                <input id="wt-tp-cash" type="text" inputmode="decimal"
                  value="${cashTotal||''}" placeholder="0.00"
                  style="flex:1;background:none;border:none;color:#fff;font-size:18px;font-weight:700;padding:12px 0;outline:none;width:0"
                  onclick="this.select()" onfocus="this.select()">
              </div>
              <button id="wt-tp-reverse-cash" type="button" style="background:none;border:none;color:#5E5CE6;font-size:11px;padding:4px 0 0;cursor:pointer;text-align:left">I know my amount instead</button>
            </div>
          </div>

          ${ccTotal > 0 || cashTotal > 0 ? `
          <div style="background:rgba(28,28,30,0.8);border-radius:14px;padding:12px 14px;margin-bottom:14px;font-size:13px">
            ${hasSplit ? `
            <div style="background:rgba(255,159,10,.06);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:11px">
              ${saved.ccBreakdown.map(a => `
                <div style="display:flex;justify-content:space-between;padding:2px 0">
                  <span style="color:#98989D">$${(parseFloat(a.amount)||0).toFixed(2)} ${a.feeExempt ? '<span style="color:#30D158">· no fee</span>' : `<span style="color:#FF9F0A">· ${feePercent}% fee</span>`}</span>
                </div>`).join('')}
            </div>` : ''}
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <div style="display:flex;justify-content:space-between;align-items:center;width:100%;gap:8px">
                <span style="color:#98989D">CC fee ${feePercent}% = <span style="color:#FF453A">$${(result.creditCard.exactFee||0).toFixed(2)} exact</span></span>
                <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                ${result.creditCard.fee > result.creditCard.exactFee
                  ? `<span style="font-size:11px;color:#FF9F0A">↑ +$${(result.creditCard.fee - result.creditCard.exactFee).toFixed(2)}</span>`
                  : result.creditCard.fee < result.creditCard.exactFee
                  ? `<span style="font-size:11px;color:#64D2FF">↓ −$${(result.creditCard.exactFee - result.creditCard.fee).toFixed(2)}</span>`
                  : `<span style="font-size:11px;color:#636366">exact</span>`}
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:0;background:#1C1C1E;border-radius:10px;overflow:hidden;border:1px solid #38383A">
                <button id="wt-tp-fee-minus" style="width:32px;height:32px;background:none;border:none;color:#98989D;font-size:18px;cursor:pointer;line-height:1"
                  onpointerdown="this.style.background='rgba(255,255,255,0.1)'"
                  onpointerup="this.style.background='none'"
                  onpointerleave="this.style.background='none'">−</button>
                <span style="color:#fff;font-weight:700;font-size:14px;padding:0 4px;min-width:44px;text-align:center">$${result.creditCard.fee}</span>
                <button id="wt-tp-fee-plus" style="width:32px;height:32px;background:none;border:none;color:#98989D;font-size:16px;cursor:pointer;line-height:1"
                  onpointerdown="this.style.background='rgba(255,255,255,0.1)'"
                  onpointerup="this.style.background='none'"
                  onpointerleave="this.style.background='none'">+</button>
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="color:#98989D">CC net after fee</span>
              <span style="color:#fff;font-weight:700">${TipRules.fmtMoney(result.creditCard.net)}</span>
            </div>
            ${cashTotal > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="color:#98989D">Cash (distributed separately by points)</span>
              <span style="color:#30D158;font-weight:700">${TipRules.fmtMoney(result.cash)}</span>
            </div>` : ''}
            <div style="display:flex;justify-content:space-between;border-top:1px solid #38383A;padding-top:8px;margin-top:4px">
              <span style="color:#FF9F0A;font-weight:700">Total to distribute</span>
              <span style="color:#FF9F0A;font-size:16px;font-weight:800">${TipRules.fmtMoney(result.creditCard.net)}</span>
            </div>
            ${cashTotal > 0 && workers.length > 0 ? `
            <div style="background:rgba(48,209,88,.06);border-radius:8px;padding:8px 10px;margin-top:6px;font-size:12px">
              <div style="color:#636366;margin-bottom:6px;font-weight:700">Cash split by points:</div>
              ${result.payouts.map((p, i) => {
                const exactCashShare = result.totalPoints > 0 ? (p.points / result.totalPoints) * cashTotal : 0;
                const cashShare = saved.cashAdjustments && saved.cashAdjustments[i] !== undefined
                  ? saved.cashAdjustments[i]
                  : Math.floor(exactCashShare);
                const diff = cashShare - exactCashShare;
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">
                  <span style="color:#98989D">${p.name} · <span style="color:#FF9F0A">$${exactCashShare.toFixed(2)}</span></span>
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-size:11px;color:${diff>0?'#FF9F0A':diff<0?'#64D2FF':'#636366'}">
                      ${diff<0?'↓ −$'+Math.abs(diff).toFixed(2):diff>0?'↑ +$'+diff.toFixed(2):''}
                    </span>
                    <div style="display:flex;align-items:center;background:#1C1C1E;border-radius:8px;overflow:hidden;border:1px solid #38383A">
                      <button data-cash-minus="${i}" style="width:28px;height:28px;background:none;border:none;color:#98989D;font-size:16px;cursor:pointer;line-height:1"
                        onpointerdown="this.style.background='rgba(255,255,255,0.1)'"
                        onpointerup="this.style.background='none'"
                        onpointerleave="this.style.background='none'">−</button>
                      <span style="color:#30D158;font-weight:700;min-width:32px;text-align:center;font-size:14px">$${cashShare}</span>
                      <button data-cash-plus="${i}" style="width:28px;height:28px;background:none;border:none;color:#98989D;font-size:14px;cursor:pointer;line-height:1"
                        onpointerdown="this.style.background='rgba(255,255,255,0.1)'"
                        onpointerup="this.style.background='none'"
                        onpointerleave="this.style.background='none'">+</button>
                    </div>
                  </div>
                </div>`;
              }).join('')}
            ${(() => {
              if (!saved.cashAdjustments) return '';
              const totalCashDistributed = result.payouts.reduce((sum, p, i) => {
                return sum + (saved.cashAdjustments[i] !== undefined
                  ? saved.cashAdjustments[i]
                  : Math.floor(result.totalPoints > 0 ? (p.points / result.totalPoints) * cashTotal : 0));
              }, 0);
              const cashRemainder = cashTotal - totalCashDistributed;
              if (cashRemainder === 0) return '<div style="font-size:12px;color:#30D158;margin-top:4px;font-weight:600">✓ Cash balanced</div>';
              return `<div style="font-size:12px;color:${cashRemainder>0?'#FF9F0A':'#FF453A'};margin-top:4px;font-weight:600">
                ${cashRemainder>0?`$${cashRemainder.toFixed(2)} cash unallocated`:`Over by $${Math.abs(cashRemainder).toFixed(2)}`}
              </div>`;
            })()}
            </div>` : ''}
            ${workers.length > 0 ? `
            <div style="display:flex;justify-content:space-between;margin-top:4px">
              <span style="color:#636366">${result.totalPoints} pts total</span>
              <span style="color:#636366">$${(result.creditCard.net / (result.totalPoints || 1)).toFixed(2)}/pt CC</span>
            </div>` : ''}
          </div>` : ''}

          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px">
            <div style="font-size:14px;font-weight:700;flex:1">Workers (${workers.length})</div>
            ${locationId ? `<button id="wt-tp-roster" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#98989D;font-size:13px;font-weight:700;padding:7px 12px;cursor:pointer">👥 Roster</button>` : ''}
            <button id="wt-tp-add" style="background:rgba(94,92,230,.15);border:none;border-radius:10px;color:#5E5CE6;font-size:13px;font-weight:700;padding:7px 14px;cursor:pointer">+ Add</button>
          </div>

          <div id="wt-tp-workers-list">
          ${workers.length === 0
            ? '<div style="color:#636366;font-size:13px;text-align:center;padding:20px 0">No workers yet.<br>Add yourself first with ⭐</div>'
            : result.payouts.map((p, i) => `
              <div style="background:rgba(28,28,30,0.6);border-radius:14px;padding:12px 14px;margin-bottom:8px">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                  <div style="cursor:pointer" data-edit="${i}">
                    <span style="font-size:15px;font-weight:700;color:${p.isMe?'#64D2FF':'#fff'}">${p.name} ${p.isMe?'⭐':''} <span style="font-size:11px;color:#5E5CE6">edit</span></span>
                    <div style="font-size:12px;color:#636366;margin-top:2px">${p.position} · ${p.points} pts · CC exact: <span style="color:#FF9F0A">$${(p.ccExact||p.exact).toFixed(2)}</span></div>
                  </div>
                  <button data-del="${i}" style="background:none;border:none;color:#FF453A;font-size:16px;cursor:pointer;padding:4px 8px">✕</button>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between">
                  <div style="display:flex;align-items:center;gap:0;background:#1C1C1E;border-radius:12px;overflow:hidden;border:1px solid #38383A">
                    <button data-minus="${i}" style="width:44px;height:44px;background:none;border:none;color:#98989D;font-size:24px;font-weight:200;cursor:pointer;line-height:1"
                      onpointerdown="this.style.background='rgba(255,255,255,0.1)'"
                      onpointerup="this.style.background='none'"
                      onpointerleave="this.style.background='none'">−</button>
                    <span style="width:60px;text-align:center;font-size:22px;font-weight:800;color:${p.isMe?'#30D158':'#fff'};font-variant-numeric:tabular-nums">$${p.ccAmount !== undefined ? p.ccAmount : p.amount}</span>
                    <button data-plus="${i}" style="width:44px;height:44px;background:none;border:none;color:#98989D;font-size:20px;font-weight:200;cursor:pointer;line-height:1"
                      onpointerdown="this.style.background='rgba(255,255,255,0.1)'"
                      onpointerup="this.style.background='none'"
                      onpointerleave="this.style.background='none'">+</button>
                  </div>
                  <div style="text-align:right">
                    ${(() => {
                      const disp = p.ccAmount !== undefined ? p.ccAmount : p.amount;
                      const ref = p.ccExact !== undefined ? p.ccExact : p.exact;
                      return disp > ref
                        ? `<div style="font-size:11px;color:#FF9F0A">↑ +$${(disp-ref).toFixed(2)}</div>`
                        : disp < ref
                        ? `<div style="font-size:11px;color:#64D2FF">↓ −$${(ref-disp).toFixed(2)}</div>`
                        : `<div style="font-size:11px;color:#636366">base</div>`;
                    })()}
                  </div>
                </div>
              </div>`).join('')
          }
          </div>

          ${workers.length > 0 ? `
          <div style="background:${result.ccRemainder===0?'rgba(48,209,88,.1)':result.ccRemainder>0?'rgba(255,149,0,.1)':'rgba(255,69,58,.1)'};
               border:1px solid ${result.ccRemainder===0?'rgba(48,209,88,.3)':result.ccRemainder>0?'rgba(255,149,0,.3)':'rgba(255,69,58,.3)'};
               border-radius:12px;padding:12px 14px;margin-top:4px;display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:14px;font-weight:700;color:${result.ccRemainder===0?'#30D158':result.ccRemainder>0?'#FF9F0A':'#FF453A'}">
              ${result.ccRemainder===0 ? '✓ CC Pool balanced' : result.ccRemainder>0 ? `$${result.ccRemainder.toFixed(2)} CC unallocated` : `Over by $${Math.abs(result.ccRemainder).toFixed(2)}`}
            </span>
            <span style="font-size:12px;color:#636366">${TipRules.fmtMoney(result.ccDistributed)} / ${TipRules.fmtMoney(result.creditCard.net)}</span>
          </div>` : ''}

          <div class="wt-modal-actions" style="margin-top:16px">
            <button class="wt-btn wt-btn-secondary" id="wt-tp-cancel">Cancel</button>
            <button class="wt-btn wt-btn-primary" id="wt-tp-save" ${result.ccRemainder!==0&&workers.length>0?'style="background:#FF9F0A"':''}>
              ${result.ccRemainder===0||workers.length===0 ? 'Save' : `Save ($${result.ccRemainder.toFixed(2)} CC unallocated)`}
            </button>
          </div>
        </div>`;

      const __modalAfter = ov.querySelector('.wt-modal');
      if (__modalAfter && __scrollTop) requestAnimationFrame(() => { __modalAfter.scrollTop = __scrollTop; });
      ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
      ov.querySelectorAll('input').forEach(i => {
        i.addEventListener('focus', () => {
          i.select && i.select();
          setTimeout(() => {
            const modal = ov.querySelector('.wt-modal');
            if (modal) i.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 350);
        });
        i.addEventListener('click', () => i.select && i.select());
      });

      // Recalc on blur (not on input — prevents re-render interrupting typing)
      const doRecalc = () => {
        const ccVal = parseFloat(ov.querySelector('#wt-tp-cc').value.replace(',','.')) || 0;
        const cashVal = parseFloat(ov.querySelector('#wt-tp-cash').value.replace(',','.')) || 0;
        // Don't wipe manualFee if it matches the gross from an active split —
        // a split's fee is intentional, not a stale leftover from a prior manual edit.
        const splitMatchesCC = saved.ccBreakdown && saved.ccBreakdown.length > 1
          && Math.abs(TipRules.applyProcessingFeeMulti(saved.ccBreakdown, feePercent).gross - ccVal) < 0.005;
        if (ccVal !== saved.creditCardTotal && !splitMatchesCC) delete saved.manualFee;
        if (ccVal !== saved.creditCardTotal && !splitMatchesCC) delete saved.ccBreakdown;
        saved.creditCardTotal = ccVal;
        saved.cashTotal = cashVal;
        saved.workers.forEach(w => { delete w.manualAmount; delete w.ccManualAmount; });
        render();
      };
      ov.querySelector('#wt-tp-cc').addEventListener('blur', doRecalc);
      ov.querySelector('#wt-tp-cash').addEventListener('blur', doRecalc);
      ov.querySelector('#wt-tp-cc').addEventListener('keydown', e => { if(e.key==='Enter') e.target.blur(); });
      ov.querySelector('#wt-tp-cash').addEventListener('keydown', e => { if(e.key==='Enter') e.target.blur(); });

      const __splitBtn = ov.querySelector('#wt-tp-split');
      if (__splitBtn) __splitBtn.onclick = () => _showSplitAmounts(saved, feePercent, () => { render(); });
      const __reverseCC = ov.querySelector('#wt-tp-reverse-cc');
      if (__reverseCC) __reverseCC.onclick = () => _showReverseAmount('cc', feePercent, workers, (reconstructedGross) => {
        ov.querySelector('#wt-tp-cc').value = reconstructedGross.toFixed(2);
        doRecalc();
      });
      const __reverseCash = ov.querySelector('#wt-tp-reverse-cash');
      if (__reverseCash) __reverseCash.onclick = () => _showReverseAmount('cash', feePercent, workers, (reconstructedGross) => {
        ov.querySelector('#wt-tp-cash').value = reconstructedGross.toFixed(2);
        doRecalc();
      });

      // +/- buttons — adjust CC amount only (cash is separate)
      ov.querySelectorAll('[data-minus]').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.dataset.minus);
          const cur = result.payouts[i].ccAmount !== undefined ? result.payouts[i].ccAmount : result.payouts[i].amount;
          saved.workers[i].ccManualAmount = Math.max(0, cur - 1);
          render();
        };
      });
      ov.querySelectorAll('[data-plus]').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.dataset.plus);
          const cur = result.payouts[i].ccAmount !== undefined ? result.payouts[i].ccAmount : result.payouts[i].amount;
          saved.workers[i].ccManualAmount = cur + 1;
          render();
        };
      });

      // Delete worker
      ov.querySelectorAll('[data-del]').forEach(btn => {
        btn.onclick = () => {
          saved.workers.splice(parseInt(btn.dataset.del), 1);
          render();
        };
      });

      ov.querySelectorAll('[data-edit]').forEach(el => {
        el.onclick = () => _showAddWorker(saved, tipSettings, render, parseInt(el.dataset.edit), locationId);
      });

      // Cash per-person adjustment buttons
      if (!saved.cashAdjustments) saved.cashAdjustments = {};
      ov.querySelectorAll('[data-cash-minus]').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.dataset.cashMinus);
          const result2 = TipRules.calculatePayouts(
            saved.creditCardTotal||0, saved.cashTotal||0, saved.workers||[], feePercent, saved.manualFee
          );
          const exactCashShare = result2.totalPoints > 0
            ? (result2.payouts[i].points / result2.totalPoints) * (saved.cashTotal||0)
            : 0;
          const cur = saved.cashAdjustments[i] !== undefined
            ? saved.cashAdjustments[i]
            : Math.floor(exactCashShare);
          saved.cashAdjustments[i] = Math.max(0, cur - 1);
          render();
        };
      });
      ov.querySelectorAll('[data-cash-plus]').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.dataset.cashPlus);
          const result2 = TipRules.calculatePayouts(
            saved.creditCardTotal||0, saved.cashTotal||0, saved.workers||[], feePercent, saved.manualFee
          );
          const exactCashShare = result2.totalPoints > 0
            ? (result2.payouts[i].points / result2.totalPoints) * (saved.cashTotal||0)
            : 0;
          const cur = saved.cashAdjustments[i] !== undefined
            ? saved.cashAdjustments[i]
            : Math.floor(exactCashShare);
          saved.cashAdjustments[i] = cur + 1;
          render();
        };
      });

      // Fee manual adjustment
      const feeMinusBtn = ov.querySelector('#wt-tp-fee-minus');
      const feePlusBtn = ov.querySelector('#wt-tp-fee-plus');
      if (feeMinusBtn) feeMinusBtn.onclick = () => {
        saved.manualFee = Math.max(0, (saved.manualFee !== undefined ? saved.manualFee : result.creditCard.fee) - 1);
        render();
      };
      if (feePlusBtn) feePlusBtn.onclick = () => {
        saved.manualFee = (saved.manualFee !== undefined ? saved.manualFee : result.creditCard.fee) + 1;
        render();
      };

      ov.querySelector('#wt-tp-add').onclick = () => _showAddWorker(saved, tipSettings, render, undefined, locationId);
      const __rosterBtn = ov.querySelector('#wt-tp-roster');
      if (__rosterBtn) __rosterBtn.onclick = () => _showRosterPicker(locationId, saved, render);
      ov.querySelector('#wt-tp-cancel').onclick = () => {
        if (ov._cleanupVV) ov._cleanupVV();
        ov.remove();
      };
      ov.querySelector('#wt-tp-save').onclick = () => {
        saved.creditCardTotal = parseFloat(ov.querySelector('#wt-tp-cc').value) || 0;
        saved.cashTotal = parseFloat(ov.querySelector('#wt-tp-cash').value) || 0;
        const finalResult = TipRules.calculatePayouts(
          saved.creditCardTotal, saved.cashTotal, saved.workers, feePercent, saved.manualFee
        );
        const me = finalResult.payouts.find((p, i) => saved.workers[i] && saved.workers[i].isMe);
        saved.myPayout = me ? me.amount : 0;
        WTDb.saveTipsForShift(dayKey, saved);
        ov.remove();
        _go('home');
      };
    };

    render();
    document.body.appendChild(ov);
    // iOS keyboard fix: adjust overlay and modal max-height to visible viewport
    if (window.visualViewport) {
      const __vvHandler = () => {
        const vh = window.visualViewport.height;
        ov.style.height = vh + 'px';
        ov.style.top = window.visualViewport.offsetTop + 'px';
        const modal = ov.querySelector('.wt-modal');
        if (modal) modal.style.maxHeight = (vh * 0.92) + 'px';
        const activeEl = document.activeElement;
        if (activeEl && activeEl.tagName === 'INPUT' && ov.contains(activeEl)) {
          setTimeout(() => activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
        }
      };
      window.visualViewport.addEventListener('resize', __vvHandler);
      window.visualViewport.addEventListener('scroll', __vvHandler);
      ov._cleanupVV = () => {
        window.visualViewport.removeEventListener('resize', __vvHandler);
        window.visualViewport.removeEventListener('scroll', __vvHandler);
      };
    }
  }

  function _showSplitAmounts(saved, feePercent, onSave) {
    let amounts = (saved.ccBreakdown && saved.ccBreakdown.length > 0)
      ? saved.ccBreakdown.map(a => ({ ...a }))
      : [{ amount: saved.creditCardTotal || 0, feeExempt: false }];

    const ov = document.createElement('div');
    ov.className = 'wt-overlay';
    document.body.appendChild(ov);

    function paint() {
      const breakdown = TipRules.applyProcessingFeeMulti(amounts, feePercent);
      ov.innerHTML = `
        <div class="wt-modal">
          <div class="wt-modal-handle"></div>
          <div class="wt-modal-title">Split CC Amounts</div>
          <div style="color:#636366;font-size:12px;margin-bottom:14px">Add each amount and mark which ones are exempt from the processing fee.</div>
          <div id="wt-sa-list">
            ${amounts.map((a, i) => `
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <div style="display:flex;align-items:center;background:#2C2C2E;border-radius:12px;overflow:hidden;border:1px solid #38383A;flex:1">
                  <span style="padding:0 8px;color:#98989D;font-size:14px">$</span>
                  <input data-sa-amount="${i}" type="text" inputmode="decimal" value="${a.amount||''}" placeholder="0.00"
                    style="flex:1;background:none;border:none;color:#fff;font-size:16px;font-weight:700;padding:10px 0;outline:none;width:0"
                    onclick="this.select()" onfocus="this.select()">
                </div>
                <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:#98989D;cursor:pointer;flex-shrink:0">
                  <input data-sa-exempt="${i}" type="checkbox" ${a.feeExempt?'checked':''} style="width:16px;height:16px;cursor:pointer">
                  No fee
                </label>
                ${amounts.length > 1 ? `<button data-sa-del="${i}" style="background:none;border:none;color:#FF453A;font-size:16px;cursor:pointer;padding:4px">✕</button>` : ''}
              </div>`).join('')}
          </div>
          <button id="wt-sa-add" type="button" style="background:rgba(94,92,230,.15);border:none;border-radius:10px;color:#5E5CE6;font-size:13px;font-weight:700;padding:8px 14px;cursor:pointer;margin-bottom:14px">+ Add amount</button>
          <div style="background:rgba(28,28,30,0.8);border-radius:12px;padding:10px 12px;margin-bottom:14px;font-size:13px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:#98989D">Total gross</span><span style="color:#fff;font-weight:700">$${breakdown.gross.toFixed(2)}</span></div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:#98989D">Fee-applicable</span><span style="color:#fff">$${breakdown.feeApplicableGross.toFixed(2)}</span></div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:#98989D">Fee (${feePercent}%)</span><span style="color:#FF453A">$${breakdown.fee.toFixed(2)}</span></div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid #38383A;padding-top:6px;margin-top:4px"><span style="color:#FF9F0A;font-weight:700">Net</span><span style="color:#FF9F0A;font-weight:800">$${breakdown.net.toFixed(2)}</span></div>
          </div>
          <div class="wt-modal-actions">
            <button class="wt-btn wt-btn-secondary" id="wt-sa-cancel">Cancel</button>
            <button class="wt-btn wt-btn-primary" id="wt-sa-save">Use This</button>
          </div>
        </div>`;

      ov.querySelectorAll('[data-sa-amount]').forEach(inp => {
        inp.addEventListener('blur', () => {
          const i = parseInt(inp.dataset.saAmount);
          amounts[i].amount = parseFloat(inp.value.replace(',','.')) || 0;
          paint();
        });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      });
      ov.querySelectorAll('[data-sa-exempt]').forEach(chk => {
        chk.onchange = () => {
          amounts[parseInt(chk.dataset.saExempt)].feeExempt = chk.checked;
          paint();
        };
      });
      ov.querySelectorAll('[data-sa-del]').forEach(btn => {
        btn.onclick = () => {
          amounts.splice(parseInt(btn.dataset.saDel), 1);
          paint();
        };
      });
      ov.querySelector('#wt-sa-add').onclick = () => {
        amounts.push({ amount: 0, feeExempt: false });
        paint();
      };
      ov.querySelector('#wt-sa-cancel').onclick = () => ov.remove();
      ov.querySelector('#wt-sa-save').onclick = () => {
        const hasManualAdjustments = (saved.workers || []).some(w => typeof w.manualAmount === 'number');
        if (hasManualAdjustments) {
          const resetThem = confirm(
            'You have manual amount adjustments on some workers.\n\n' +
            'Press OK to reset everyone to the new automatic split, or Cancel to keep your manual adjustments (the pool total will update, but individual amounts stay as you set them).'
          );
          if (resetThem) {
            saved.workers.forEach(w => delete w.manualAmount);
          }
        }
        const final = TipRules.applyProcessingFeeMulti(amounts, feePercent);
        saved.creditCardTotal = final.gross;
        saved.manualFee = final.fee;
        saved.ccBreakdown = amounts.map(a => ({ ...a }));
        ov.remove();
        onSave();
      };
    }
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    paint();
  }

  function _showReverseAmount(type, feePercent, workers, onResolve) {
    const ov = document.createElement('div');
    ov.className = 'wt-overlay';
    document.body.appendChild(ov);
    const label = type === 'cc' ? 'Credit Card' : 'Cash';

    ov.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">My ${label} Amount</div>
        <div style="color:#636366;font-size:12px;margin-bottom:14px">Enter what you actually received and your points — we'll work out the total pool.</div>
        <label class="wt-modal-label">My amount</label>
        <div style="display:flex;align-items:center;background:#2C2C2E;border-radius:14px;overflow:hidden;border:1px solid #38383A;margin-bottom:14px">
          <span style="padding:0 10px;color:#98989D;font-size:15px">$</span>
          <input id="wt-rv-amount" type="text" inputmode="decimal" placeholder="ej: 511.64 (con centavos si los sabes)"
            style="flex:1;background:none;border:none;color:#fff;font-size:18px;font-weight:700;padding:12px 0;outline:none;width:0"
            onclick="this.select()" onfocus="this.select()">
        </div>
        <label class="wt-modal-label">My points</label>
        <div style="display:flex;align-items:center;gap:0;background:#2C2C2E;border-radius:14px;overflow:hidden;border:1px solid #38383A;margin-bottom:6px">
          <button id="wt-rv-minus" style="width:52px;height:52px;background:none;border:none;color:#98989D;font-size:28px;font-weight:200;cursor:pointer"
            onpointerdown="this.style.background='rgba(255,255,255,0.12)'" onpointerup="this.style.background='none'" onpointerleave="this.style.background='none'">−</button>
          <input id="wt-rv-points" type="text" inputmode="decimal" value="1"
            style="flex:1;background:none;border:none;color:#fff;font-size:22px;font-weight:800;text-align:center;padding:0;outline:none"
            onclick="this.select()" onfocus="this.select()">
          <button id="wt-rv-plus" style="width:52px;height:52px;background:none;border:none;color:#98989D;font-size:24px;font-weight:200;cursor:pointer"
            onpointerdown="this.style.background='rgba(255,255,255,0.12)'" onpointerup="this.style.background='none'" onpointerleave="this.style.background='none'">+</button>
        </div>
        <div id="wt-rv-preview" style="color:#636366;font-size:12px;margin-bottom:10px;min-height:16px"></div>
        <div class="wt-modal-actions">
          <button class="wt-btn wt-btn-secondary" id="wt-rv-cancel">Cancel</button>
          <button class="wt-btn wt-btn-primary" id="wt-rv-apply">Use This</button>
        </div>
      </div>`;

    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.querySelector('#wt-rv-cancel').onclick = () => ov.remove();

    ov.querySelector('#wt-rv-minus').onclick = () => {
      const i = ov.querySelector('#wt-rv-points');
      const cur = parseFloat(i.value) || 1;
      i.value = Math.max(0.25, Math.round((cur - 0.05) * 100) / 100).toFixed(2);
      updatePreview();
    };
    ov.querySelector('#wt-rv-plus').onclick = () => {
      const i = ov.querySelector('#wt-rv-points');
      const cur = parseFloat(i.value) || 1;
      i.value = (Math.round((cur + 0.05) * 100) / 100).toFixed(2);
      updatePreview();
    };

    function updatePreview() {
      const amount = parseFloat(ov.querySelector('#wt-rv-amount').value) || 0;
      const points = parseFloat(ov.querySelector('#wt-rv-points').value) || 0;
      const preview = ov.querySelector('#wt-rv-preview');
      if (amount <= 0 || points <= 0) { preview.textContent = ''; return; }
      const result = TipRules.reverseFromKnownAmount(amount, points, workers, feePercent, type);
      if (!result) { preview.textContent = ''; return; }
      preview.innerHTML = type === 'cc'
        ? `Reconstructed CC total (before fee): <span style="color:#FF9F0A;font-weight:700">$${result.reconstructedGross.toFixed(2)}</span>`
        : `Reconstructed cash total: <span style="color:#FF9F0A;font-weight:700">$${result.reconstructedGross.toFixed(2)}</span>`;
    }
    ov.querySelector('#wt-rv-amount').addEventListener('input', updatePreview);
    ov.querySelector('#wt-rv-points').addEventListener('input', updatePreview);

    ov.querySelector('#wt-rv-apply').onclick = () => {
      const amount = parseFloat(ov.querySelector('#wt-rv-amount').value) || 0;
      const points = parseFloat(ov.querySelector('#wt-rv-points').value) || 0;
      if (amount <= 0 || points <= 0) { alert('Enter your amount and points.'); return; }
      const result = TipRules.reverseFromKnownAmount(amount, points, workers, feePercent, type);
      if (!result) { alert('Could not calculate — check points.'); return; }
      ov.remove();
      onResolve(result.reconstructedGross);
    };
  }

  function _showRosterPicker(locationId, saved, onSave) {
    const roster = WTDb.getRoster(locationId);
    const ov = document.createElement('div');
    ov.className = 'wt-overlay';
    document.body.appendChild(ov);

    ov.innerHTML = `
      <div class="wt-modal" style="max-height:80vh;overflow-y:auto">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">👥 From Roster</div>
        ${roster.length === 0
          ? '<div style="color:#636366;font-size:13px;text-align:center;padding:24px 0">No saved coworkers yet for this location.<br>Add workers normally and they will appear here next time.</div>'
          : roster.map((m, i) => {
              const already = TipRules.isAlreadyInWorkers(m.name, saved.workers || []);
              return `
              <div style="display:flex;align-items:center;justify-content:space-between;background:rgba(28,28,30,0.6);border-radius:14px;padding:12px 14px;margin-bottom:8px;${already?'opacity:0.4':''}">
                <div>
                  <div style="font-size:15px;font-weight:700;color:${m.isMe?'#64D2FF':'#fff'}">${m.name} ${m.isMe?'⭐':''}</div>
                  <div style="font-size:12px;color:#636366;margin-top:2px">${m.position || ''} · ${m.points || 1} pts</div>
                </div>
                <button data-roster-add="${i}" ${already?'disabled':''} style="background:${already?'rgba(255,255,255,0.05)':'rgba(48,209,88,.15)'};border:none;border-radius:10px;color:${already?'#636366':'#30D158'};font-size:13px;font-weight:700;padding:8px 14px;cursor:${already?'default':'pointer'}">
                  ${already ? 'Added' : '+ Add'}
                </button>
              </div>`;
            }).join('')
        }
        <div class="wt-modal-actions" style="margin-top:12px">
          <button class="wt-btn wt-btn-secondary" id="wt-roster-close">Close</button>
        </div>
      </div>`;

    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.querySelector('#wt-roster-close').onclick = () => ov.remove();

    ov.querySelectorAll('[data-roster-add]').forEach(btn => {
      btn.onclick = () => {
        const i = parseInt(btn.dataset.rosterAdd);
        const member = roster[i];
        if (!member || TipRules.isAlreadyInWorkers(member.name, saved.workers || [])) return;
        if (!saved.workers) saved.workers = [];
        saved.workers.push(TipRules.rosterMemberToWorker(member));
        // Same sort as manual add: isMe first, then by points descending
        saved.workers = [
          ...saved.workers.filter(w => w.isMe),
          ...saved.workers.filter(w => !w.isMe).sort((a, b) => (b.points || 0) - (a.points || 0))
        ];
        ov.remove();
        onSave();
      };
    });
  }

  function _showAddWorker(saved, tipSettings, onSave, editIndex, locationId) {
    const positions = tipSettings.positions || DEFAULT_TIP_POSITIONS;
    const addOv = document.createElement('div');
    addOv.className = 'wt-overlay';
    addOv.style.zIndex = '500';
    addOv.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">${typeof editIndex === 'number' ? 'Edit Worker' : 'Add Worker'}</div>
        <label class="wt-modal-label">Name</label>
        <input id="wt-aw-name" class="wt-input" type="text" placeholder="e.g. Maria, John..." autocapitalize="words"
          value="${typeof editIndex === 'number' && saved.workers[editIndex] ? saved.workers[editIndex].name : ''}"
          onclick="this.select()" onfocus="this.select()"
          onkeydown="if(event.key==='Enter'){event.preventDefault();this.closest('.wt-modal').querySelector('#wt-aw-add').click();}">
        ${(() => {
          const alreadyClaimed = saved.workers.some((w, i) => w.isMe && i !== editIndex);
          const isCurrentlyMe = typeof editIndex === 'number' && saved.workers[editIndex] && saved.workers[editIndex].isMe;
          return alreadyClaimed && !isCurrentlyMe
            ? `<input type="checkbox" id="wt-aw-isme" style="display:none">`
            : `<label style="display:flex;align-items:center;gap:8px;margin-top:10px;font-size:14px;color:#98989D;cursor:pointer">
                 <input type="checkbox" id="wt-aw-isme" style="width:18px;height:18px;accent-color:#5E5CE6" ${isCurrentlyMe?'checked':''}>
                 This is me ⭐
               </label>`;
        })()}
        <label class="wt-modal-label">Position</label>
        <select class="wt-input" id="wt-aw-pos">
          ${(() => {
            const curWorker = typeof editIndex === 'number' ? saved.workers[editIndex] : null;
            const curPos = curWorker ? curWorker.position : null;
            return positions.map(p => `<option value="${p.id}" data-points="${p.points}" ${curPos && p.label === curPos ? 'selected' : ''}>${p.label} (${p.points} pts)</option>`).join('');
          })()}
        </select>
        <label class="wt-modal-label">Points</label>
        <div style="display:flex;align-items:center;gap:0;background:#2C2C2E;border-radius:14px;overflow:hidden;border:1px solid #38383A">
          <button id="wt-aw-minus" style="width:52px;height:52px;background:none;border:none;color:#98989D;font-size:28px;font-weight:200;cursor:pointer"
            onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
            onpointerup="this.style.background='none'"
            onpointerleave="this.style.background='none'">−</button>
          <input id="wt-aw-pts" type="text" inputmode="decimal" value="${typeof editIndex === 'number' && saved.workers[editIndex] ? saved.workers[editIndex].points : positions[0].points}"
            style="flex:1;background:none;border:none;color:#fff;font-size:22px;font-weight:800;text-align:center;padding:0;outline:none"
            onclick="this.select()" onfocus="this.select()">
          <button id="wt-aw-plus" style="width:52px;height:52px;background:none;border:none;color:#98989D;font-size:24px;font-weight:200;cursor:pointer"
            onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
            onpointerup="this.style.background='none'"
            onpointerleave="this.style.background='none'">+</button>
        </div>
        <div class="wt-modal-actions" style="margin-top:20px">
          <button class="wt-btn wt-btn-secondary" id="wt-aw-cancel">Cancel</button>
          <button class="wt-btn wt-btn-primary" id="wt-aw-add">${typeof editIndex === 'number' ? 'Save Changes' : 'Add Worker'}</button>
        </div>
      </div>`;

    document.body.appendChild(addOv);
    addOv.addEventListener('click', e => { if (e.target === addOv) addOv.remove(); });

    // Auto-fill points when position changes
    addOv.querySelector('#wt-aw-pos').onchange = function() {
      const opt = this.options[this.selectedIndex];
      addOv.querySelector('#wt-aw-pts').value = opt.dataset.points;
    };

    const __autoDetectPos = () => {
      const ptsVal = parseFloat(addOv.querySelector('#wt-aw-pts').value) || 0;
      const posEl = addOv.querySelector('#wt-aw-pos');
      const match = positions.find(p => Math.abs(p.points - ptsVal) < 0.001);
      if (match) {
        for (let i = 0; i < posEl.options.length; i++) {
          if (posEl.options[i].value === match.id) { posEl.selectedIndex = i; break; }
        }
      }
    };
    addOv.querySelector('#wt-aw-minus').onclick = () => {
      const i = addOv.querySelector('#wt-aw-pts');
      const cur = parseFloat(i.value) || 1;
      i.value = Math.max(0.25, Math.round((cur - 0.05) * 100) / 100).toFixed(2);
      __autoDetectPos();
    };
    addOv.querySelector('#wt-aw-plus').onclick = () => {
      const i = addOv.querySelector('#wt-aw-pts');
      const cur = parseFloat(i.value) || 1;
      i.value = (Math.round((cur + 0.05) * 100) / 100).toFixed(2);
      __autoDetectPos();
    };

    // iOS keyboard fix: adjust overlay height to visible viewport when keyboard opens
    if (window.visualViewport) {
      const __vvHandler = () => {
        const offset = window.innerHeight - window.visualViewport.height;
        addOv.style.height = window.visualViewport.height + 'px';
        addOv.style.top = window.visualViewport.offsetTop + 'px';
      };
      window.visualViewport.addEventListener('resize', __vvHandler);
      window.visualViewport.addEventListener('scroll', __vvHandler);
      addOv._cleanupVV = () => {
        window.visualViewport.removeEventListener('resize', __vvHandler);
        window.visualViewport.removeEventListener('scroll', __vvHandler);
      };
    }
    addOv.querySelector('#wt-aw-cancel').onclick = () => {
      if (addOv._cleanupVV) addOv._cleanupVV();
      addOv.remove();
    };
    addOv.querySelector('#wt-aw-add').onclick = () => {
      const name = addOv.querySelector('#wt-aw-name').value.trim();
      if (!name) { alert('Enter a name.'); return; }
      const posEl = addOv.querySelector('#wt-aw-pos');
      const posLabel = posEl.options[posEl.selectedIndex].text.split(' (')[0];
      const workerData = {
        name,
        isMe: addOv.querySelector('#wt-aw-isme').checked,
        position: posLabel,
        points: parseFloat(addOv.querySelector('#wt-aw-pts').value) || 1
      };
      if (typeof editIndex === 'number') {
        saved.workers[editIndex] = workerData;
      } else {
        saved.workers.push(workerData);
        // Reset all manual overrides when pool composition changes
        saved.workers.forEach(w => delete w.manualAmount);
        delete saved.cashAdjustments;
      }
      // Sort: isMe always first, then by points descending
      const meIdx = saved.workers.findIndex(w => w.isMe);
      if (meIdx > 0) {
        const me = saved.workers.splice(meIdx, 1)[0];
        saved.workers.unshift(me);
      }
      saved.workers = [
        ...saved.workers.filter(w => w.isMe),
        ...saved.workers.filter(w => !w.isMe).sort((a, b) => (b.points || 0) - (a.points || 0))
      ];
      if (locationId) {
        WTDb.saveRosterMember(locationId, {
          name: workerData.name,
          position: workerData.position,
          points: workerData.points,
          isMe: workerData.isMe
        });
      }
      addOv.remove();
      onSave();
    };
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
        <label class="wt-modal-label">Work Profile</label>
        <select class="wt-input" id="wt-el-profile">
          ${Object.entries(WORK_PROFILES).map(([k,v]) =>
            `<option value="${k}" ${(loc.workProfile||'restaurant')===k?'selected':''}>${v.label}</option>`
          ).join('')}
        </select>
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
      loc.workProfile = ov.querySelector('#wt-el-profile').value;
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
