// work-tracker/ui.js — Premium Work Tracker UI

const WorkTracker = (() => {
  let _root = null;
  let _view = 'home';
  let _date = null;
  let _weekFocusDate = null; // set by Day view's Back button so History highlights the week
                              // you were actually looking at, not always "today's" week —
                              // read once and cleared, so any other path back into History
                              // (switching tabs, tapping Home, etc.) resets to the current week
  let _floorPlanLocationId = null;
  let _heroTimer = null;
  let _weekHistoryCount = 12;
  let _settingsOpenSection = 'profile';
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
    ({ home: _Home, week: _Week, day: _Day, preview: _Preview, settings: _Settings, stats: _Stats, floorplan: _FloorPlan }[view] || _Home)();
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

  // Basic word-list filter for names — catches obvious/casual offensive entries in
  // English, Spanish, and (limited coverage) Albanian. Not foolproof: creative
  // misspellings or spaced-out letters can still slip through a list like this.
  function _containsProfanity(text) {
    if (!text) return false;
    const normalized = text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z]/g, '');
    const blocked = [
      // English
      'fuck','shit','bitch','cunt','nigger','nigga','faggot','fag','whore','slut','asshole','retard','bastard','pussy',
      // Spanish
      'puta','puto','mierda','pendejo','cabron','maricon','marica','verga','cono','joder','gilipollas','chingar','chinga',
      // Albanian (limited confidence — best-effort only)
      'kurva','pidh'
    ];
    return blocked.some(term => normalized.includes(term));
  }

  // Shared by every place that computes a tip payout: picks calculatePayoutsWithFixed
  // when anyone has a fixed amount or a cash-side override, otherwise the plain engine.
  // Consolidates 5 previously-identical copies of this exact decision.
  function _computeTipResult(creditCardTotal, cashTotal, workers, feePercent, manualFee, cashFlatAmounts, cashPointOverrides, cashManualAmounts) {
    const hasFixed = (workers || []).some(w => typeof w.fixedAmount === 'number');
    const cashOptions = {
      flatAmounts: cashFlatAmounts || {},
      pointOverrides: cashPointOverrides || {},
      manualAmounts: cashManualAmounts || {}
    };
    const hasCashOverrides = Object.keys(cashOptions.flatAmounts).length > 0 || Object.keys(cashOptions.pointOverrides).length > 0 || Object.keys(cashOptions.manualAmounts).length > 0;
    return (hasFixed || hasCashOverrides)
      ? TipRules.calculatePayoutsWithFixed(creditCardTotal || 0, cashTotal || 0, workers, feePercent, manualFee, cashOptions)
      : TipRules.calculatePayouts(creditCardTotal || 0, cashTotal || 0, workers, feePercent, manualFee);
  }

  // A worker's exact cash share before flooring — reused wherever cash rows are built.
  function _exactCashShare(p) {
    return typeof p.cashExact === 'number' ? p.cashExact : (p.amount - (p.ccAmount !== undefined ? p.ccAmount : 0));
  }

  // Each location can set its own CC processing fee %; falls back to the global
  // Tip Pool Settings default when a location hasn't set one.
  function _getLocationFeePercent(locationId) {
    const loc = WTDb.getLocations().find(l => l.id === locationId);
    if (loc && typeof loc.processingFeePercent === 'number') return loc.processingFeePercent;
    return WTDb.getTipSettings().processingFeePercent || 3;
  }

  // This shift's own tip cut (CC + cash), for reports/exports. Reuses the same engine as
  // everywhere else so a report never disagrees with what the Tip Pool itself shows.
  function _shiftTipCut(shift) {
    const t = WTDb.getTipsForShift(shift.id);
    const tWorkers = t ? (t.workers || []) : [];
    const meIdx = tWorkers.findIndex(w => w.isMe);
    if (!t || meIdx < 0) return { cc: 0, cash: 0 };
    const result = _computeTipResult(t.creditCardTotal, t.cashTotal, tWorkers, _getLocationFeePercent(shift.locationId), t.manualFee, t.cashFlatAmounts, t.cashPointOverrides, t.cashManualAmounts);
    const mp = result.payouts[meIdx];
    const cc = mp.ccAmount || 0;
    return { cc, cash: typeof mp.cashAmount === 'number' ? mp.cashAmount : (mp.amount - cc) };
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
    const todayMarkedOff = todayShifts.length === 0 && !!WTDb.getDayOffReason(today, currentProfile);
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
          Total shift: ${WTRules.fmtHours(WTRules.shiftHours(run.shift))} · ${WTRules.fmtMoney(WTRules.shiftHours(run.shift) * (run.shift.hourlyRate || NYC_MIN_WAGE))}
        </div>
        <div class="wt-hero-since">
          ${onBreak ? 'Break since ' + _fmtTime(_breakStart) : 'Since ' + _fmtTime(run.entry.clockIn)}
        </div>
        <div id="wt-hero-warn" style="display:none;background:rgba(255,149,0,.15);border-radius:10px;padding:8px 12px;margin:10px 0 0;font-size:12px;color:#FF9F0A;font-weight:600;text-align:center"></div>
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
        const warnEl = document.getElementById('wt-hero-warn');
        if (!el) { clearInterval(_heroTimer); return; }
        el.textContent = onBreak ? _elapsed(_breakStart) : _elapsed(run.entry.clockIn);
        if (warnEl) {
          const hoursIn = (Date.now() - new Date(run.entry.clockIn)) / 3600000;
          if (!onBreak && hoursIn >= 12) {
            warnEl.style.display = 'block';
            warnEl.textContent = `⚠️ Clocked in for ${hoursIn.toFixed(1)}h — still working?`;
          } else {
            warnEl.style.display = 'none';
          }
        }
        if (acc && !onBreak) {
          const completedSecs = (run.shift.entries || [])
            .filter(e => e.clockOut)
            .reduce((sum, e) => sum + (new Date(e.clockOut) - new Date(e.clockIn)) / 1000, 0);
          const paidBreakSecs = (run.shift.entries || []).reduce((sum, e) => {
            if (typeof e.breakDurationMinutes === 'number') return sum + (e.breakPaid ? e.breakDurationMinutes * 60 : 0);
            return sum + ((e.paidBreakMinutes || 0) * 60);
          }, 0);
          const currentSecs = (Date.now() - new Date(run.entry.clockIn)) / 1000;
          const liveHrs = (completedSecs + paidBreakSecs + currentSecs) / 3600;
          const livePay = liveHrs * (run.shift.hourlyRate || NYC_MIN_WAGE);
          acc.textContent = 'Total shift: ' + WTRules.fmtHours(liveHrs) + ' · ' + WTRules.fmtMoney(livePay);
        }
      }, 1000);
    } else if (isToday) {
      if (todayShifts.length === 0) {
        const dayOffReason = WTDb.getDayOffReason(today, currentProfile);
        if (dayOffReason) {
          const card = document.createElement('div');
          card.className = 'wt-empty';
          card.innerHTML = `<strong>Day off</strong>${_dayOffLabel(dayOffReason)}<button id="wt-dayoff-edit-home" style="display:block;margin:10px auto 0;background:rgba(94,92,230,.15);border:none;border-radius:10px;color:#5E5CE6;font-size:13px;font-weight:700;padding:8px 16px;cursor:pointer;transition:transform .1s"
            onpointerdown="this.style.transform='scale(.96)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">Edit</button>`;
          w.appendChild(card);
        } else {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;gap:10px';
          const cta = document.createElement('button');
          cta.className = 'wt-clockin-cta';
          cta.id = 'wt-clockin-main';
          cta.style.cssText = 'width:auto;flex:2';
          cta.innerHTML = `<div class="wt-clockin-dot"></div> Clock In`;
          row.appendChild(cta);
          const dayOffBtn = document.createElement('button');
          dayOffBtn.id = 'wt-dayoff-today';
          dayOffBtn.style.cssText = 'flex:1;background:#2C2C2E;border:none;border-radius:20px;color:#98989D;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .1s,background .1s';
          dayOffBtn.textContent = 'Day off?';
          dayOffBtn.addEventListener('pointerdown', () => { dayOffBtn.style.transform = 'scale(.97)'; dayOffBtn.style.background = '#3A3A3C'; });
          dayOffBtn.addEventListener('pointerup', () => { dayOffBtn.style.transform = 'scale(1)'; dayOffBtn.style.background = '#2C2C2E'; });
          dayOffBtn.addEventListener('pointerleave', () => { dayOffBtn.style.transform = 'scale(1)'; dayOffBtn.style.background = '#2C2C2E'; });
          row.appendChild(dayOffBtn);
          w.appendChild(row);
          requestAnimationFrame(() => {
            const h = cta.getBoundingClientRect().height;
            if (h) dayOffBtn.style.height = h + 'px';
          });
        }
      } else {
        const cta = document.createElement('button');
        cta.className = 'wt-clockin-cta';
        cta.id = 'wt-clockin-main';
        cta.innerHTML = `<div class="wt-clockin-dot"></div> Clock In`;
        w.appendChild(cta);
      }
    } else if (today < realToday && todayShifts.length === 0) {
      const dayOffReason = WTDb.getDayOffReason(today, currentProfile);
      const card = document.createElement('div');
      card.className = 'wt-empty';
      if (dayOffReason) {
        card.innerHTML = `<strong>Day off</strong>${_dayOffLabel(dayOffReason)}<button id="wt-dayoff-edit-nav" style="display:block;margin:10px auto 0;background:rgba(94,92,230,.15);border:none;border-radius:10px;color:#5E5CE6;font-size:13px;font-weight:700;padding:8px 16px;cursor:pointer;transition:transform .1s"
          onpointerdown="this.style.transform='scale(.96)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">Edit</button>`;
      } else {
        card.innerHTML = `<strong>No shift</strong>Nothing recorded for this day.
          <div style="display:flex;gap:8px;justify-content:center;margin-top:10px">
            <button id="wt-log-past-nav" style="background:rgba(94,92,230,.15);border:none;border-radius:10px;color:#5E5CE6;font-size:13px;font-weight:700;padding:8px 16px;cursor:pointer;transition:transform .1s"
              onpointerdown="this.style.transform='scale(.96)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">Log past data</button>
            <button id="wt-dayoff-add-nav" style="background:rgba(28,28,30,0.8);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#98989D;font-size:13px;font-weight:700;padding:8px 16px;cursor:pointer;transition:transform .1s"
              onpointerdown="this.style.transform='scale(.96)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">Mark day off</button>
          </div>`;
      }
      w.appendChild(card);
    }

    const stats = document.createElement('div');
    stats.className = 'wt-stats-row';
    // Get unique locations that have shifts this week
    const weekLocIds = [...new Set(weekShifts.map(s => s.locationId).filter(Boolean))];
    const weekLocs = locs.filter(l => weekLocIds.includes(l.id));
    // Whether the day being viewed (which may differ from today via the ‹ › arrows) falls in
    // the real current calendar week — determines the card's label and accent color below.
    const isCurrentCalendarWeek = ws.getTime() === getWeekStart(new Date(realToday + 'T12:00:00')).getTime();
    const weekCardStyle = isCurrentCalendarWeek ? '' : 'background:rgba(100,210,255,.12);border-color:rgba(100,210,255,.35);';
    const weekLabelStyle = isCurrentCalendarWeek ? '' : 'color:#64D2FF;';
    const weekCardTitle = isCurrentCalendarWeek ? 'This Week' : formatWeekLabel(ws);
    // Gross components shown separately — the hourly figure alone was easy to mistake for a
    // total, when it's actually just the wage portion, with CC and cash tips as separate gross
    // amounts on top (none of these are net; fees/splits are handled in the tip pool itself).
    const weekCCCut = weekShifts.reduce((sum, s) => sum + _shiftTipCut(s).cc, 0);
    const weekCashCut = weekShifts.reduce((sum, s) => sum + _shiftTipCut(s).cash, 0);
    const grossParts = [`H ${WTRules.fmtMoney(pay.total)}`];
    if (weekCCCut > 0) grossParts.push(`<span style="color:#FF9F0A">CC ${WTRules.fmtMoney(weekCCCut)}</span>`);
    if (weekCashCut > 0) grossParts.push(`<span style="color:#30D158">Cash ${WTRules.fmtMoney(weekCashCut)}</span>`);
    const grossLine = grossParts.join(' <span style="color:#3a3a3c">|</span> ');
    stats.innerHTML = `
      <div class="wt-stat-card" id="wt-pay-card" style="cursor:pointer;width:100%;box-sizing:border-box;${weekCardStyle}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="wt-stat-label" style="${weekLabelStyle}">${weekCardTitle}</div>
            <div class="wt-stat-value">${WTRules.fmtHours(pay.totalHours)}</div>
            <div style="font-size:11px;color:#636366;text-transform:uppercase;letter-spacing:.4px;margin-top:6px">Gross</div>
            <div style="font-size:13px;font-weight:700;color:#fff;margin-top:2px">${grossLine}</div>
            ${pay.isOvertime ? `<div class="wt-ot-tag">Overtime +${WTRules.fmtHours(pay.overtimeHours)}</div>` : ''}
          </div>
        </div>
      </div>
      <div style="background:rgba(28,28,30,0.5);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.07);border-radius:18px;padding:14px 16px;margin-top:10px;width:100%;box-sizing:border-box">
        ${weekLocs.length > 0 ? `
        <div style="display:flex;flex-direction:column;gap:8px">
          ${weekLocs.map(l => `
            <div data-loc-payday="${l.id}" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;padding:4px 0">
              <div>
                <div style="font-size:11px;color:#636366;font-weight:600;text-transform:uppercase;letter-spacing:.4px">Pay Day</div>
                <div style="font-size:13px;color:#fff;font-weight:700;margin-top:1px">${l.name}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:13px;color:#FF9F0A;font-weight:700">${WTRules.getPayDate(ws, settings, l)}</div>
                <div style="font-size:11px;color:#636366;margin-top:1px">Tap to change ›</div>
              </div>
            </div>`).join('')}
        </div>` : `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:11px;color:#636366;font-weight:600;text-transform:uppercase;letter-spacing:.4px">Pay Day</div>
          <div style="font-size:13px;color:#FF9F0A;font-weight:700">${WTRules.getPayDate(ws, settings)}</div>
        </div>`}
      </div>`;
    w.appendChild(stats);

    // ── DAILY TIP BLOCK ──────────────────────────────────
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

      const shiftTipRows = shiftsWithTips.map(s => {
        const t = WTDb.getTipsForShift(s.id);
        const tWorkers = t.workers || [];
        const result = _computeTipResult(t.creditCardTotal, t.cashTotal, tWorkers, _getLocationFeePercent(s.locationId), t.manualFee, t.cashFlatAmounts, t.cashPointOverrides, t.cashManualAmounts);
        const myPayout = result.payouts.find(p => p.isMe) || null;
        const myCash = myPayout ? (typeof myPayout.cashAmount === 'number' ? myPayout.cashAmount : (myPayout.amount - (myPayout.ccAmount || 0))) : 0;
        if (myPayout) totalMyCCCut += myPayout.ccAmount !== undefined ? myPayout.ccAmount : myPayout.amount;
        totalMyCash += myCash;

        return `
          <div style="border-top:1px solid rgba(255,149,0,.15);margin-top:8px;padding-top:8px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-size:13px;font-weight:700;color:#fff">${s.locationName||'Shift'} · <span style="color:#98989D;font-size:12px;font-weight:500">${s.shiftType||''}</span></div>
                <div style="font-size:11px;color:#636366">CC ${TipRules.fmtMoney(result.creditCard.gross)} − fee ${TipRules.fmtMoney(result.creditCard.fee)}</div>
              </div>
              ${myPayout ? `<div style="text-align:right">
                <div style="font-size:15px;font-weight:800;color:#30D158">$${myPayout.ccAmount !== undefined ? myPayout.ccAmount : myPayout.amount}</div>
                ${myCash > 0 ? `<div style="font-size:11px;color:#636366">+$${myCash} cash</div>` : ''}
              </div>` : `<div style="font-size:12px;color:#636366">no cut set</div>`}
            </div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">
              ${(() => {
                const workerCount = result.payouts.length;
                // How much rounding-down "slack" the rest of the group could plausibly hand
                // to one person absorbing the leftover — each other worker can round down by
                // just under $1, so this scales with group size rather than being a fixed cap.
                const roundingAllowance = Math.max(1, workerCount - 1) * 1;
                // Counts whole-dollar boundaries crossed above the exact share (e.g. exact
                // $97.80 rounded to $99 crosses two boundaries: 97→98, 98→99) — a simpler,
                // more intuitive way to gauge "how many extra dollars" than raw cents.
                const dollarSteps = (actual, exact) => Math.floor(actual) - Math.floor(exact);
                return result.payouts.map(p => {
                  const ccDeviation = p.ccAmount - p.ccExact;
                  const cashDeviation = p.cashAmount - p.cashExact;
                  // "Over" (red) fires on two different real problems: this specific person
                  // being part of a pool that's over-allocated (only flags someone who
                  // actually received more than their exact share — a worker who got their
                  // exact share or less isn't the cause, even if the pool overall is over),
                  // OR one person's individual excess exceeding what normal group rounding
                  // could plausibly explain (catches manual-entry errors that happen to still
                  // net the pool to zero, e.g. +$50 to one person and -$50 to another). A
                  // worker absorbing a couple dollars of everyone else's rounding is expected
                  // and not flagged red; absorbing far more than the group's size could
                  // account for is a real anomaly worth a second look.
                  const isCCOver = (result.ccRemainder < 0 && ccDeviation > 0) || ccDeviation > roundingAllowance;
                  const isCashOver = ((result.remainder - result.ccRemainder) < 0 && cashDeviation > 0) || cashDeviation > roundingAllowance;
                  const isOver = isCCOver || isCashOver;
                  // "Warn" (orange) is a softer, informational nudge for someone who picked up
                  // 2+ whole dollars from rounding — not a problem, just worth a glance. Never
                  // applies once something's already red, and never applies to someone who
                  // received less than their exact share.
                  const isCCWarn = !isCCOver && dollarSteps(p.ccAmount, p.ccExact) >= 2;
                  const isCashWarn = !isCashOver && dollarSteps(p.cashAmount, p.cashExact) >= 2;
                  const isWarn = isCCWarn || isCashWarn;
                const isClickable = isOver || isWarn || p.isMe;
                // If this person is over on cash specifically, route there — otherwise the CC row
                // (which is also where "this is me" lands by default, since it's the primary row).
                const gotoType = isCCOver && isCashOver ? 'both' : (isCashOver ? 'cash' : 'cc');
                const tintColor = isOver ? '#FF453A' : (isWarn ? '#FF9F0A' : null);
                // Warn-only rows (not also red) get a tap-to-explain instead of navigating —
                // the raw values are stashed in data attributes so the rounding-vs-extra split
                // can be computed at click time rather than baked into the HTML as text.
                const warnAttrs = (isWarn && !isOver)
                  ? `data-warn-shift="${s.id}" data-warn-name="${p.name}" data-warn-cc="${isCCWarn}" data-warn-cc-exact="${p.ccExact}" data-warn-cc-amount="${p.ccAmount}" data-warn-cash="${isCashWarn}" data-warn-cash-exact="${p.cashExact}" data-warn-cash-amount="${p.cashAmount}"`
                  : '';
                return `
                <div ${isClickable ? `${isOver ? `data-goto-shift="${s.id}" data-goto-worker="${p.name}" data-goto-type="${gotoType}"` : warnAttrs} style="cursor:pointer;background:rgba(28,28,30,0.8);border-radius:8px;padding:4px 8px;font-size:11px${isOver ? ';border:1px solid rgba(255,69,58,.4)' : ''}"` : `style="background:rgba(28,28,30,0.8);border-radius:8px;padding:4px 8px;font-size:11px"`}>
                  <span style="color:${tintColor || (p.isMe?'#30D158':'#98989D')};font-weight:700">${p.name}</span>
                  <span style="color:#636366"> · </span>
                  <span style="color:${tintColor || '#fff'};font-weight:800${isOver ? ';font-size:12px' : ''}">$${p.amount}</span>
                </div>`;
                }).join('');
              })()}
            </div>
            <div data-warn-msg="${s.id}"></div>
            ${result.remainder !== 0 ? `<div class="wt-shift-unalloc" data-tip-warn="${s.id}" style="font-size:11px;color:${result.remainder>=0?'#FF9F0A':'#FF453A'};margin-top:6px;font-weight:600;cursor:pointer;text-decoration:underline">⚠ ${result.remainder>=0?`$${result.remainder.toFixed(2)} unallocated`:`Over by $${Math.abs(result.remainder).toFixed(2)}`} — tap to fix</div>` : ''}
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
        </div>`;
      tipBlock.querySelectorAll('[data-tip-warn]').forEach(el => {
        el.onclick = () => _showTipPool(el.dataset.tipWarn);
      });
      tipBlock.querySelectorAll('[data-goto-worker]').forEach(el => {
        el.onclick = () => _showTipPool(el.dataset.gotoShift, el.dataset.gotoWorker, el.dataset.gotoType);
      });
      tipBlock.querySelectorAll('[data-warn-name]').forEach(el => {
        el.onclick = (e) => {
          e.stopPropagation();
          const msgEl = tipBlock.querySelector(`[data-warn-msg="${el.dataset.warnShift}"]`);
          if (!msgEl) return;
          if (msgEl.dataset.shownFor === el.dataset.warnName) {
            msgEl.innerHTML = '';
            delete msgEl.dataset.shownFor;
            return;
          }
          const parts = [];
          const splitRounding = (exact, amount) => {
            const rounding = Math.max(0, Math.min(amount - exact, Math.ceil(exact) - exact));
            const extra = (amount - exact) - rounding;
            return { rounding, extra };
          };
          if (el.dataset.warnCc === 'true') {
            const { rounding, extra } = splitRounding(parseFloat(el.dataset.warnCcExact), parseFloat(el.dataset.warnCcAmount));
            parts.push(`$${rounding.toFixed(2)} was normal rounding, $${extra.toFixed(2)} was picked up from teammates' rounddowns`);
          }
          if (el.dataset.warnCash === 'true') {
            const { rounding, extra } = splitRounding(parseFloat(el.dataset.warnCashExact), parseFloat(el.dataset.warnCashAmount));
            parts.push(`(cash) $${rounding.toFixed(2)} was normal rounding, $${extra.toFixed(2)} was picked up from teammates' rounddowns`);
          }
          msgEl.innerHTML = `<div style="font-size:11px;color:#FF9F0A;margin-top:6px;line-height:1.4">💡 ${el.dataset.warnName} — ${parts.join('; ')}. Nothing to fix.</div>`;
          msgEl.dataset.shownFor = el.dataset.warnName;
        };
      });
    }
    w.appendChild(tipBlock);

    if (!todayMarkedOff) {
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
    }

    const acts = document.createElement('div');
    acts.className = 'wt-actions';
    acts.innerHTML = `
      <button class="wt-btn wt-btn-secondary" id="wt-week-btn"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="vertical-align:-2px;margin-right:4px"><circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.3"/><path d="M7 3.5V7L9.5 8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>History</button>
      <button class="wt-btn wt-btn-secondary" id="wt-stats-btn"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="vertical-align:-2px;margin-right:4px"><rect x="1.5" y="8" width="2.5" height="4.5" rx="0.5" stroke="currentColor" stroke-width="1.2"/><rect x="5.75" y="4.5" width="2.5" height="8" rx="0.5" stroke="currentColor" stroke-width="1.2"/><rect x="10" y="1.5" width="2.5" height="11" rx="0.5" stroke="currentColor" stroke-width="1.2"/></svg>Stats</button>
      <button class="wt-btn wt-btn-primary" id="wt-export-btn">📊 Export</button>`;
    w.appendChild(acts);

    const fpRow = document.createElement('div');
    fpRow.style.cssText = 'margin-top:10px';
    fpRow.innerHTML = `<button id="wt-floorplan-btn" style="width:100%;background:rgba(28,28,30,0.8);border:1px solid rgba(255,255,255,0.08);border-radius:14px;color:#98989D;font-size:14px;font-weight:700;padding:12px;cursor:pointer">🪑 Floor Plan</button>`;
    w.appendChild(fpRow);

    _root.appendChild(w);

    w.querySelector('#wt-settings-btn').onclick = () => _go('settings');
    w.querySelector('#wt-nav-prev').onclick = () => _navDay(-1);
    const nextBtn = w.querySelector('#wt-nav-next');
    if (nextBtn && !isToday) nextBtn.onclick = () => _navDay(1);
    w.querySelector('#wt-pay-card').onclick = () => _go('week');
    w.querySelectorAll('[data-loc-payday]').forEach(el => {
      el.onclick = e => {
        e.stopPropagation();
        const locId = el.dataset.locPayday;
        const loc = locs.find(l => l.id === locId);
        if (!loc) return;
        const wsStr = `${ws.getFullYear()}-${String(ws.getMonth()+1).padStart(2,'0')}-${String(ws.getDate()).padStart(2,'0')}`;
        _showPayDayOptions(locId, loc.name, wsStr, settings);
      };
    });
    w.querySelector('#wt-week-btn').onclick = () => _go('week');
    w.querySelector('#wt-stats-btn').onclick = () => _go('stats');
    w.querySelector('#wt-floorplan-btn').onclick = () => _go('floorplan');
    w.querySelector('#wt-export-btn').onclick = () => _go('preview');
    const addBtn = w.querySelector('#wt-add-shift');
    if (addBtn) addBtn.onclick = () => _showAddShift(today);
    const ciBtn = w.querySelector('#wt-clockin-main');
    if (ciBtn) {
      ciBtn.onclick = locs.length === 0
        ? () => { alert('Add a work location in Settings first.'); _go('settings'); }
        : () => _showAddShift(today);
    }
    const dayOffTodayBtn = w.querySelector('#wt-dayoff-today');
    if (dayOffTodayBtn) dayOffTodayBtn.onclick = () => _showDayOffPicker(today, currentProfile, () => _go('home'));
    const dayOffEditHomeBtn = w.querySelector('#wt-dayoff-edit-home');
    if (dayOffEditHomeBtn) dayOffEditHomeBtn.onclick = () => _showDayOffPicker(today, currentProfile, () => _go('home'));
    const dayOffAddNavBtn = w.querySelector('#wt-dayoff-add-nav');
    if (dayOffAddNavBtn) dayOffAddNavBtn.onclick = () => _showDayOffPicker(today, currentProfile, () => _go('home'));
    const dayOffEditNavBtn = w.querySelector('#wt-dayoff-edit-nav');
    if (dayOffEditNavBtn) dayOffEditNavBtn.onclick = () => _showDayOffPicker(today, currentProfile, () => _go('home'));
    const logPastNavBtn = w.querySelector('#wt-log-past-nav');
    if (logPastNavBtn) logPastNavBtn.onclick = () => _showLogPastData(today);
    const outBtn = w.querySelector('#wt-hero-out');
    if (outBtn) outBtn.onclick = (e) => {
      e.currentTarget.disabled = true;
      e.currentTarget.style.opacity = '0.6';
      _doClockOut(run.shift.id, run.entry.id);
    };
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
        clearInterval(_heroTimer); // freeze the stale ticker now — it was still counting the
                                    // old work session's elapsed time during the photo prompt
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
        // END BREAK: open new entry. Paid break minutes are tracked separately from breakMinutes
        // (which is a deduction) — this is an addition, kept traceable, never blended into clock math.
        const breakEnd = new Date().toISOString();
        const breakMins = Math.round((new Date(breakEnd) - new Date(_breakStart)) / 60000);
        const shift = WTDb.getShifts().find(s => s.id === run.shift.id);
        const newEntryId = generateId();
        const s = WTDb.getSettings();
        const locSettings = (s.locationSettings || {})[shift.locationId] || {};
        let paidBreak = locSettings.paidBreaks || false;

        function saveBreakEntry(isPaid) {
          if (!shift) return;
          const noteText = isPaid
            ? `${run.shift.shiftType} break · ${breakMins}m · +$${((breakMins/60)*(run.shift.hourlyRate||NYC_MIN_WAGE)).toFixed(2)} paid`
            : `${run.shift.shiftType} break · ${breakMins}m unpaid · missed $${((breakMins/60)*(run.shift.hourlyRate||NYC_MIN_WAGE)).toFixed(2)}`;
          const existing = shift.entries.find(e => e.id === newEntryId);
          if (existing) {
            existing.breakDurationMinutes = breakMins;
            existing.breakPaid = isPaid;
            existing.note = noteText;
          } else {
            shift.entries.push({
              id: newEntryId, clockIn: breakEnd, clockOut: null, breakMinutes: 0,
              breakDurationMinutes: breakMins, breakPaid: isPaid, note: noteText
            });
          }
          WTDb.saveShift(shift);
        }
        saveBreakEntry(paidBreak);

        _breakStart = null;
        localStorage.removeItem('wt_break_start');
        clearInterval(_heroTimer); // stop the stale break-ticker now, before it ticks again
                                    // against a null _breakStart and shows a garbage number

        // Show immediate photo prompt for break end proof, plus a quick correction if the
        // location default doesn't match this specific break.
        const photoOv = document.createElement('div');
        photoOv.className = 'wt-overlay';
        photoOv.innerHTML = `
          <div class="wt-modal">
            <div class="wt-modal-handle"></div>
            <div class="wt-modal-title">📷 Back from break</div>
            <p style="color:#98989D;font-size:14px;margin-bottom:14px">
              ${breakMins}m break ended at ${_fmtTime(breakEnd)}. Take a photo as proof you're back on the clock.
            </p>
            <div style="display:flex;gap:8px;margin-bottom:16px">
              <button class="wt-btn" id="wt-break-paid" style="flex:1;border:1px solid ${paidBreak?'#30D158':'#38383A'};background:${paidBreak?'rgba(48,209,88,.15)':'none'};color:${paidBreak?'#30D158':'#98989D'}">Paid</button>
              <button class="wt-btn" id="wt-break-unpaid" style="flex:1;border:1px solid ${!paidBreak?'#FF453A':'#38383A'};background:${!paidBreak?'rgba(255,69,58,.15)':'none'};color:${!paidBreak?'#FF453A':'#98989D'}">Unpaid</button>
            </div>
            <div style="display:flex;gap:10px">
              <button class="wt-btn wt-btn-primary" id="wt-take-photo-break" style="flex:2">📷 Take Photo</button>
              <button class="wt-btn wt-btn-secondary" id="wt-skip-photo-break" style="flex:1">Skip (<span id="wt-skip-count-break">5</span>)</button>
            </div>
          </div>`;
        document.body.appendChild(photoOv);

        const paidBtn = photoOv.querySelector('#wt-break-paid');
        const unpaidBtn = photoOv.querySelector('#wt-break-unpaid');
        function refreshBreakToggle() {
          paidBtn.style.borderColor = paidBreak ? '#30D158' : '#38383A';
          paidBtn.style.background = paidBreak ? 'rgba(48,209,88,.15)' : 'none';
          paidBtn.style.color = paidBreak ? '#30D158' : '#98989D';
          unpaidBtn.style.borderColor = !paidBreak ? '#FF453A' : '#38383A';
          unpaidBtn.style.background = !paidBreak ? 'rgba(255,69,58,.15)' : 'none';
          unpaidBtn.style.color = !paidBreak ? '#FF453A' : '#98989D';
        }
        paidBtn.onclick = () => { paidBreak = true; saveBreakEntry(true); refreshBreakToggle(); };
        unpaidBtn.onclick = () => { paidBreak = false; saveBreakEntry(false); refreshBreakToggle(); };

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
    card.className = 'wt-shift' + (isExpanded ? ' wt-shift-expanded' : ' wt-shift-collapsed') + (shift.needsReview ? ' wt-glow' : '');

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
        <div class="wt-shift-hrs" ${isRunning ? `id="wt-live-hrs-${shift.id}"` : ''}>${WTRules.fmtHours(hrs)}</div>
        <div class="wt-shift-earn" ${isRunning ? `id="wt-live-earn-${shift.id}"` : ''}>${WTRules.fmtMoney(earn)}</div>
        ${!isRunning ? `<div class="wt-shift-chevron">${isExpanded ? '▲' : '▼'}</div>` : ''}
      </div>`;
    card.appendChild(top);

    if (isRunning) {
      const hrsEl = top.querySelector(`#wt-live-hrs-${shift.id}`);
      const earnEl = top.querySelector(`#wt-live-earn-${shift.id}`);
      const liveTick = setInterval(() => {
        if (!document.body.contains(hrsEl)) { clearInterval(liveTick); return; }
        const completedSecs = (shift.entries || [])
          .filter(e => e.clockOut)
          .reduce((sum, e) => sum + (new Date(e.clockOut) - new Date(e.clockIn)) / 1000, 0);
        const paidBreakSecs = (shift.entries || []).reduce((sum, e) => {
          if (typeof e.breakDurationMinutes === 'number') return sum + (e.breakPaid ? e.breakDurationMinutes * 60 : 0);
          return sum + ((e.paidBreakMinutes || 0) * 60);
        }, 0);
        const openEntry = (shift.entries || []).find(e => !e.clockOut);
        const currentSecs = openEntry ? (Date.now() - new Date(openEntry.clockIn)) / 1000 : 0;
        const liveHrs = (completedSecs + paidBreakSecs + currentSecs) / 3600;
        hrsEl.textContent = WTRules.fmtHours(liveHrs);
        earnEl.textContent = WTRules.fmtMoney(liveHrs * (shift.hourlyRate || NYC_MIN_WAGE));
      }, 1000);
    }

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
      entriesDiv.appendChild(built.reportRow);
    } else {
      const noHours = document.createElement('div');
      noHours.style.cssText = 'color:#636366;font-size:13px;padding:4px 0 8px';
      noHours.textContent = 'No hours logged — tips only. Tap "+ Add period" below if you remember the times.';
      entriesDiv.appendChild(noHours);
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
        olderDiv.appendChild(built.reportRow);
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
      <button class="wt-tag-btn wt-tap-scale" data-sid="${shift.id}" style="background:none;border:none;color:${(shift.weatherTag||shift.paceTag||shift.contextNote)?'#5E5CE6':'#636366'};cursor:pointer;padding:0;display:flex;align-items:center"><svg width="16" height="16" viewBox="0 0 14 14" fill="none"><path d="M1.5 1.5H6.5L12.5 7.5L7.5 12.5L1.5 6.5V1.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><circle cx="4" cy="4" r="1" fill="currentColor"/></svg></button>
      ${cardProfile.hasTips ? `<button class="wt-tips-btn ${(!isRunning && !hasTips) ? 'wt-glow' : ''}" data-sid="${shift.id}" style="background:${hasTips?'rgba(255,149,0,.15)':'rgba(28,28,30,0.8)'};border:none;border-radius:12px;color:${hasTips?'#FF9F0A':'#98989D'};font-size:13px;font-weight:700;padding:8px 14px;cursor:pointer">` : ''}
        💰 ${hasTips ? TipRules.fmtMoney(tipsData.myPayout||0) + ' tips' : 'Tips'}
      ${cardProfile.hasTips ? `</button>` : ''}
      <button class="wt-del-shift" data-sid="${shift.id}">Delete shift</button>`;
    footer.querySelector('.wt-add-period').onclick = () => _addPeriod(shift.id);
    footer.querySelector('.wt-tag-btn').onclick = () => _showShiftContext(shift);
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
        if (shift.needsReview) {
          shift.needsReview = false;
          WTDb.saveShift(shift);
          card.classList.remove('wt-glow');
        }
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
      <button class="wt-entry-del" data-sid="${shift.id}" data-eid="${e.id}" onpointerdown="this.style.transform='rotate(90deg)'" onpointerup="this.style.transform='rotate(0deg)'" onpointerleave="this.style.transform='rotate(0deg)'">✕</button>`;

    if (e.note) {
      const isBreakEntry = typeof e.breakDurationMinutes === 'number';
      if (isBreakEntry) {
        const breakToggle = document.createElement('button');
        breakToggle.style.cssText = 'display:block;width:100%;text-align:left;background:none;border:none;padding:2px 0 6px;cursor:pointer;font-size:11px;color:' + (e.breakPaid ? '#30D158' : '#636366');
        breakToggle.textContent = e.note + '  ✎ tap to change';
        breakToggle.onclick = () => {
          e.breakPaid = !e.breakPaid;
          const mins = e.breakDurationMinutes;
          const rate = shift.hourlyRate || NYC_MIN_WAGE;
          e.note = e.breakPaid
            ? `Break · ${mins}m · +$${((mins/60)*rate).toFixed(2)} paid`
            : `Break · ${mins}m unpaid · missed $${((mins/60)*rate).toFixed(2)}`;
          WTDb.saveShift(shift);
          _go(_view);
        };
        row.appendChild(breakToggle);
      } else {
        const noteEl = document.createElement('div');
        noteEl.style.cssText = 'font-size:11px;color:#636366;padding:2px 0 6px;';
        noteEl.textContent = e.note;
        row.appendChild(noteEl);
      }
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

    // Report photos — multiple allowed, same pattern as proofs
    const reportRow = document.createElement('div');
    reportRow.className = 'wt-photo-row';
    reportRow.dataset.shiftId = shift.id;
    reportRow.dataset.entryId = e.id;

    const _refreshReportRow = async () => {
      reportRow.innerHTML = '';
      // Find all existing report photos for this entry
      let n = 1;
      const existingBtns = [];
      while (true) {
        const key = `${shift.id}_report_${n}_${e.id}`;
        const base64 = await WTDb.getPhoto(shift.id, key);
        if (!base64 && n > 1) break;
        if (base64) {
          const b = document.createElement('button');
          b.className = 'wt-photo-btn has-photo';
          b.dataset.pid = key;
          b.textContent = `✓ Report ${n}`;
          b.onclick = () => _viewOrReplacePhoto(shift.id, key, base64);
          reportRow.appendChild(b);
          existingBtns.push(b);
          n++;
        } else break;
      }
      // Always show "+ Add report" button
      const addBtn = document.createElement('button');
      addBtn.className = 'wt-photo-btn';
      addBtn.textContent = '📋 Add report';
      addBtn.onclick = () => {
        const newKey = `${shift.id}_report_${n}_${e.id}`;
        _doPhotoThenRefresh(shift.id, newKey, _refreshReportRow);
      };
      reportRow.appendChild(addBtn);
    };

    _refreshReportRow();

    return { row, photoRow, reportRow };
  }

  function _Week() {
    const w = document.createElement('div');
    w.className = 'wt-screen';
    const settings = WTDb.getSettings();
    const curMs = getWeekStart(new Date()).getTime();
    // Which card gets the highlighted border — normally the same as curMs, but if we just
    // came back from Day view, it follows whatever week that date falls in instead, so the
    // highlight tracks where you actually were, not always "this calendar week."
    let highlightMs = curMs;
    if (_weekFocusDate) {
      highlightMs = getWeekStart(new Date(_weekFocusDate + 'T12:00:00')).getTime();
      _weekFocusDate = null;
    }
    const weeks = WTRules.getRecentWeeks(_weekHistoryCount);

    // Earliest active week per location — explicit startDate wins if set, else earliest tracked shift.
    // Used so "no shifts this week" doesn't retroactively show a location before it existed.
    const _allLocsForStart = WTDb.getLocations();
    const _allShiftsForStart = WTDb.getShifts();
    const locStartMs = {};
    _allLocsForStart.forEach(l => {
      const candidates = [];
      if (l.startDate) candidates.push(new Date(l.startDate+'T12:00:00').getTime());
      const shiftDates = _allShiftsForStart.filter(s => s.locationId === l.id).map(s => s.date);
      if (shiftDates.length) candidates.push(new Date(shiftDates.sort()[0]+'T12:00:00').getTime());
      locStartMs[l.id] = candidates.length ? getWeekStart(new Date(Math.min(...candidates))).getTime() : null;
    });

    w.innerHTML = `
      <div class="wt-hdr">
        <button class="wt-back" id="wt-back">‹ Back</button>
        <div style="font-size:18px;font-weight:800">Pay History</div>
        <div style="width:36px"></div>
      </div>`;

    // Payments Due — a collapsible, actionable digest of any (location, week) whose payday
    // has arrived but hasn't been confirmed yet. Computed fresh every render, so it clears
    // itself the moment a payment gets recorded — no separate flag to manage or forget to
    // clear. Bounded to a 3-week window: an unregistered payment older than that quietly
    // stops being flagged instead of piling up into noise (same principle as the Day Off
    // nudge). Each row jumps straight into the existing Record Payment flow for that week.
    const activeProf0 = settings.workProfile || 'restaurant';
    const dueLocs = WTDb.getLocations().filter(l => (l.workProfile || 'restaurant') === activeProf0);
    const todayEndMs = new Date(_today() + 'T23:59:59').getTime();
    const dueWindowMs = 21 * 86400000;
    const due = [];
    let nextPayday = null;
    weeks.forEach(ws => {
      const wsStr = `${ws.getFullYear()}-${String(ws.getMonth()+1).padStart(2,'0')}-${String(ws.getDate()).padStart(2,'0')}`;
      const wShifts = WTDb.getShiftsForWeek(ws).filter(s => (s.workProfile || 'restaurant') === activeProf0);
      const wLocIds = [...new Set(wShifts.map(s => s.locationId).filter(Boolean))];
      dueLocs.filter(l => wLocIds.includes(l.id)).forEach(l => {
        if (WTDb.getPayment(l.id, wsStr)) return;
        const rawDate = WTRules.getPayDateRaw(ws, settings, l);
        if (!rawDate) return;
        const payMs = rawDate.getTime();
        if (payMs > todayEndMs) {
          if (!nextPayday || rawDate < nextPayday) nextPayday = rawDate;
          return;
        }
        if (payMs < todayEndMs - dueWindowMs) return;
        due.push({ locId: l.id, locName: l.name, ws: wsStr, weekLabel: formatWeekLabel(ws), payDate: rawDate });
      });
    });
    due.sort((a, b) => b.payDate - a.payDate); // most recent first — the one you'd actually check today

    if (due.length) {
      const dueCard = document.createElement('div');
      dueCard.style.cssText = 'border:1px solid rgba(255,159,10,.3);border-radius:16px;margin:0 16px 14px;overflow:hidden';
      dueCard.innerHTML = `
        <div class="wt-glow" id="wt-due-header" style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;cursor:pointer;background:rgba(255,149,0,.12);border-radius:16px">
          <span style="font-size:13px;font-weight:800;color:#FF9F0A">💰 Payment${due.length > 1 ? 's' : ''} Due (${due.length})</span>
          <span id="wt-due-chevron" style="color:#FF9F0A;font-size:12px;transition:transform .15s">▼</span>
        </div>
        <div id="wt-due-body" style="display:none;padding:10px 12px 12px;background:rgba(255,149,0,.05)">
          ${due.map(d => `
            <div class="wt-due-row" data-loc-id="${d.locId}" data-loc-name="${d.locName}" data-ws="${d.ws}" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;margin-bottom:6px;cursor:pointer;background:rgba(28,28,30,0.7);border-radius:12px">
              <div>
                <div style="font-size:13px;font-weight:700;color:#fff">${d.locName}</div>
                <div style="font-size:11px;color:#98989D">${d.weekLabel}</div>
              </div>
              <div class="wt-glow" style="font-size:11px;color:#FF9F0A;font-weight:700;border-radius:8px;padding:3px 8px">Expected ${d.payDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ›</div>
            </div>
          `).join('')}
          ${_weekHistoryCount < 52 ? `<div id="wt-view-full-year" class="wt-tap-fade" style="text-align:center;font-size:12px;color:#5E5CE6;font-weight:700;padding:8px;cursor:pointer">View Full Year →</div>` : ''}
        </div>`;
      w.appendChild(dueCard);
      const headerEl = dueCard.querySelector('#wt-due-header');
      const bodyEl = dueCard.querySelector('#wt-due-body');
      const chevEl = dueCard.querySelector('#wt-due-chevron');
      headerEl.onclick = () => {
        const open = bodyEl.style.display !== 'none';
        bodyEl.style.display = open ? 'none' : 'block';
        chevEl.textContent = open ? '▼' : '▲';
      };
      dueCard.querySelectorAll('.wt-due-row').forEach(el => {
        el.onclick = (e) => {
          e.stopPropagation();
          _showPayDayOptions(el.dataset.locId, el.dataset.locName, el.dataset.ws, settings);
        };
      });
      const viewFullYearBtn = dueCard.querySelector('#wt-view-full-year');
      if (viewFullYearBtn) viewFullYearBtn.onclick = (e) => {
        e.stopPropagation();
        _weekHistoryCount = 52;
        _go('week');
      };
    } else if (nextPayday) {
      const okCard = document.createElement('div');
      okCard.style.cssText = 'background:rgba(48,209,88,.08);border:1px solid rgba(48,209,88,.25);border-radius:16px;padding:14px 16px;margin:0 16px 14px';
      okCard.innerHTML = `<span style="font-size:13px;color:#30D158">✓ All caught up · Next payment expected <strong>${nextPayday.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</strong></span>`;
      w.appendChild(okCard);
    }

    weeks.forEach(ws => {
      const activeProf = (WTDb.getSettings().workProfile || 'restaurant');
      const shifts = WTDb.getShiftsForWeek(ws).filter(s => (s.workProfile || 'restaurant') === activeProf);
      const pay = WTRules.weeklyPay(shifts);
      const weekTipCut = shifts.reduce((sum, s) => sum + _shiftTipCut(s).cc, 0);
      const isCur = ws.getTime() === curMs;
      const isHighlighted = ws.getTime() === highlightMs;
      const row = document.createElement('div');
      row.className = 'wt-week' + (isHighlighted ? ' wt-week-cur' : '');
      const dots = [0,1,2,3,4,5,6].map(i => {
        const d = new Date(ws); d.setDate(d.getDate() + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const has = shifts.some(s => s.date === ds);
        const isT = ds === _today();
        const isPast = ds < _today();
        const dotHtml = `<div class="wt-dot ${has?'wt-dot-on':''} ${isT?'wt-dot-today':''}" data-date="${ds}">${['M','T','W','T','F','S','S'][i]}${has?'<span class="wt-dot-pip"></span>':''}</div>`;
        let offHtml = '';
        if (isPast && !has) {
          const reason = WTDb.getDayOffReason(ds, activeProf);
          if (reason) {
            offHtml = `<div data-dayoff-nav="${ds}" class="wt-tap-fade" style="font-size:10px;color:#636366;text-align:center;margin-top:3px;cursor:pointer">Off</div>`;
          } else if (isCur) {
            // Only nudge within the current, still-in-progress week — once a week ends,
            // stop asking about days you likely won't remember; still fully clickable though.
            offHtml = `<div data-dayoff-nav="${ds}" class="wt-glow wt-tap-fade" style="font-size:10px;color:#FF9F0A;text-align:center;margin-top:3px;cursor:pointer;border-radius:6px">Off?</div>`;
          }
        }
        return `<div style="display:flex;flex-direction:column;align-items:center">${dotHtml}${offHtml}</div>`;
      }).join('');
      row.innerHTML = `
        ${isCur ? '<div class="wt-week-badge">Current Week</div>' : ''}
        <div class="wt-week-range">${formatWeekLabel(ws)}</div>
        <div class="wt-week-nums">
          <span>${WTRules.fmtHours(pay.totalHours)}</span>
          <span class="wt-week-pay">${WTRules.fmtMoney(pay.total)}</span>
          ${weekTipCut > 0 ? `<span style="color:#FF9F0A;font-weight:700">+${WTRules.fmtMoney(weekTipCut)}</span>` : ''}
          ${pay.isOvertime ? '<span class="wt-ot-pill">Overtime</span>' : ''}
        </div>
        <div class="wt-week-dots">${dots}</div>
        ${(() => {
          const wsStr = `${ws.getFullYear()}-${String(ws.getMonth()+1).padStart(2,'0')}-${String(ws.getDate()).padStart(2,'0')}`;
          const weekLocIds = [...new Set(shifts.map(s => s.locationId).filter(Boolean))];
          const allLocs = WTDb.getLocations().filter(l => (l.workProfile || 'restaurant') === activeProf);
          let weekLocs = allLocs.filter(l => weekLocIds.includes(l.id));
          // No tracked shifts this week — still let the user log a past check manually for any known location
          if (weekLocs.length === 0) weekLocs = allLocs.filter(l => locStartMs[l.id] !== null && locStartMs[l.id] <= ws.getTime());
          if (weekLocs.length === 0) return `<div class="wt-week-paydate">Pay: ${WTRules.getPayDate(ws, settings)}</div>`;
          return weekLocs.map(l => {
            const payment = WTDb.getPayment(l.id, wsStr);
            const locPay = pay.byLocation[l.name];
            // Calculate my CC and cash tips for this week for this location
            const locShifts = shifts.filter(s => s.locationId === l.id);
            let myWeekCCTips = 0, myWeekCashTips = 0;
            locShifts.forEach(s => {
              const t = WTDb.getTipsForShift(s.id);
              if (!t) return;
              const tWorkers = t.workers || [];
              const result = _computeTipResult(t.creditCardTotal, t.cashTotal, tWorkers, _getLocationFeePercent(l.id), t.manualFee, t.cashFlatAmounts, t.cashPointOverrides, t.cashManualAmounts);
              const meIdx = (result.payouts || []).findIndex(p => p.isMe);
              if (meIdx >= 0) {
                const mp = result.payouts[meIdx];
                myWeekCCTips += mp.ccAmount || 0;
                myWeekCashTips += typeof mp.cashAmount === 'number' ? mp.cashAmount : (mp.amount - (mp.ccAmount || 0));
              }
            });
            const cashInCheck = payment && payment.cashInCheck;
            const expectedGross = locPay
              ? locPay.total + myWeekCCTips + (cashInCheck ? myWeekCashTips : 0)
              : null;
            const netData = expectedGross !== null ? WTRules.estimateNet(expectedGross, WTDb.getTaxSettings()) : null;
            const expectedNet = netData ? netData.net : null;
            const pAmounts = WTRules.paymentAmounts(payment);
            let status, comparison = '';
            if (payment) {
              const displayParts = [];
              if (pAmounts.gross !== null) displayParts.push('$'+pAmounts.gross.toFixed(2)+' gross');
              if (pAmounts.net !== null) displayParts.push('$'+pAmounts.net.toFixed(2)+' net');
              status = `<span style="color:#30D158;font-weight:700">✅ ${displayParts.length ? displayParts.join(' · ') : 'Amount not set'}</span>`;
              const grossDiff = (expectedGross !== null && pAmounts.gross !== null) ? pAmounts.gross - expectedGross : null;
              const netDiff = (expectedNet !== null && pAmounts.net !== null) ? pAmounts.net - expectedNet : null;
              if (grossDiff !== null || netDiff !== null) {
                comparison = `
                  <div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.06);display:flex;flex-direction:column;gap:3px">
                    ${locPay ? `<div style="display:flex;justify-content:space-between;font-size:11px">
                      <span style="color:#636366">Hours (gross)</span>
                      <span style="color:#98989D">$${locPay.total.toFixed(2)}</span>
                    </div>` : ''}
                    ${myWeekCCTips > 0 ? `<div style="display:flex;justify-content:space-between;font-size:11px">
                      <span style="color:#636366">CC tips</span>
                      <span style="color:#98989D">+$${myWeekCCTips.toFixed(2)}</span>
                    </div>` : ''}
                    ${myWeekCashTips > 0 ? `<div data-cash-lock="${l.id}" data-cash-ws="${wsStr}" style="display:flex;justify-content:space-between;align-items:center;font-size:11px;cursor:pointer">
                      <span style="color:#636366">${cashInCheck ? '🔒' : '🔓'} Cash tips${cashInCheck ? ' (in check)' : ''}</span>
                      <span style="color:#636366">+$${myWeekCashTips.toFixed(2)}</span>
                    </div>` : ''}
                    ${grossDiff !== null ? `<div style="display:flex;justify-content:space-between;font-size:11px;border-top:1px solid rgba(255,255,255,0.06);padding-top:3px;margin-top:2px">
                      <span style="color:#636366">Expected (gross)</span>
                      <span style="color:#fff;font-weight:700">$${expectedGross.toFixed(2)}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:2px">
                      <span style="color:#636366">Diff (gross)</span>
                      <span style="color:${grossDiff>=0?'#30D158':'#FF453A'};font-weight:700">${grossDiff>=0?'+':''}$${Math.abs(grossDiff).toFixed(2)}</span>
                    </div>` : ''}
                    ${netDiff !== null ? `<div style="display:flex;justify-content:space-between;font-size:11px;border-top:1px solid rgba(255,255,255,0.06);padding-top:3px;margin-top:2px">
                      <span style="color:#636366">Expected (net)</span>
                      <span style="color:#fff;font-weight:700">$${expectedNet.toFixed(2)}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:2px">
                      <span style="color:#636366">Diff (net)</span>
                      <span style="color:${netDiff>=0?'#30D158':'#FF453A'};font-weight:700">${netDiff>=0?'+':''}$${Math.abs(netDiff).toFixed(2)}</span>
                    </div>` : ''}
                    ${netData && netDiff === null ? `<div data-net-toggle="${l.id}_${wsStr}" style="display:flex;justify-content:space-between;align-items:center;font-size:11px;margin-top:4px;cursor:pointer;color:#5E5CE6">
                      <span>Est. Net (after taxes)</span>
                      <span data-net-chevron="${l.id}_${wsStr}">▼</span>
                    </div>
                    <div data-net-body="${l.id}_${wsStr}" style="display:none;margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.06)">
                      ${netData.lines.map(ln => `<div style="display:flex;justify-content:space-between;font-size:10px;padding:1px 0"><span style="color:#636366">${ln.label}</span><span style="color:#FF453A">−$${ln.amount.toFixed(2)}</span></div>`).join('')}
                      <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;padding-top:3px;margin-top:2px;border-top:1px solid rgba(255,255,255,0.06)">
                        <span style="color:#fff">Net expected</span><span style="color:#64D2FF">$${netData.net.toFixed(2)}</span>
                      </div>
                    </div>` : ''}
                    ${payment.receivedDate ? `<div style="font-size:11px;color:#636366;margin-top:2px">Received: ${payment.receivedDate}</div>` : ''}
                  </div>`;
              }
            } else {
              status = `<span style="color:#FF9F0A">⏳ ${WTRules.getPayDate(ws, settings, l)}</span>`;
            }
            return `<div class="wt-week-paydate wt-pd-row" data-loc-id="${l.id}" data-loc-name="${l.name}" data-ws="${wsStr}" style="cursor:pointer">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="color:#636366">${l.name}</span>
                ${status}
              </div>
              ${comparison}
            </div>`;
          }).join('');
        })()}`;
      row.querySelectorAll('.wt-dot').forEach(dot => {
        dot.onclick = (e) => {
          e.stopPropagation();
          _go('day', { date: dot.dataset.date });
        };
      });
      row.querySelectorAll('[data-dayoff-nav]').forEach(el => {
        el.onclick = (e) => {
          e.stopPropagation();
          _go('day', { date: el.dataset.dayoffNav });
        };
      });
      row.querySelectorAll('.wt-pd-row').forEach(el => {
        el.onclick = e => {
          e.stopPropagation();
          _showPayDayOptions(el.dataset.locId, el.dataset.locName, el.dataset.ws, settings);
        };
      });
      row.querySelectorAll('[data-cash-lock]').forEach(el => {
        el.onclick = (e) => {
          e.stopPropagation();
          const lId = el.dataset.cashLock;
          const wsKey = el.dataset.cashWs;
          const existingP = WTDb.getPayment(lId, wsKey);
          if (!existingP) return;
          WTDb.savePayment(lId, wsKey, { ...existingP, cashInCheck: !existingP.cashInCheck });
          _go('week');
        };
      });
      row.querySelectorAll('[data-net-toggle]').forEach(el => {
        el.onclick = (e) => {
          e.stopPropagation();
          const key = el.dataset.netToggle;
          const body = row.querySelector(`[data-net-body="${key}"]`);
          const chev = row.querySelector(`[data-net-chevron="${key}"]`);
          if (!body) return;
          const open = body.style.display !== 'none';
          body.style.display = open ? 'none' : 'block';
          if (chev) chev.textContent = open ? '▼' : '▲';
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
            const dayTipCut = dayShifts.reduce((sum, s) => sum + _shiftTipCut(s).cc, 0);
            const div = document.createElement('div');
            div.style.cssText = 'border-bottom:1px solid #1C1C1E';
            const dayRow = document.createElement('div');
            dayRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 0;cursor:' + (hasWork ? 'pointer' : 'default');
            dayRow.innerHTML = `
              <span style="color:${hasWork?'#fff':'#636366'}">${dayNames[i]} ${new Date(ds+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
              <div style="display:flex;align-items:center;gap:8px">
                ${hasWork ? `<span style="font-size:12px;color:#636366">${WTRules.fmtHours(dayPay.totalHours)}</span>` : ''}
                <span style="color:${hasWork?'#30D158':'#636366'};font-weight:700">${hasWork ? WTRules.fmtMoney(dayPay.total) : '$0.00'}</span>
                ${hasWork && dayTipCut > 0 ? `<span style="font-size:12px;color:#FF9F0A;font-weight:700">+${WTRules.fmtMoney(dayTipCut)}</span>` : ''}
                ${hasWork ? '<span style="font-size:10px;color:#636366">▼</span>' : ''}
              </div>`;
            div.appendChild(dayRow);

            if (hasWork) {
              const detailEl = document.createElement('div');
              detailEl.style.cssText = 'display:none;background:rgba(28,28,30,0.6);border-radius:12px;padding:10px 12px;margin-bottom:6px;font-size:13px';
              
              // Tips data for this day — aggregate all shifts
              const dayShiftsAll = WTDb.getShiftsForDate(ds).filter(s => (s.workProfile || 'restaurant') === activeProf);
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
                  const tWorkers = t.workers || [];
                  const tipResult = _computeTipResult(t.creditCardTotal, t.cashTotal, tWorkers, _getLocationFeePercent(s.locationId), t.manualFee, t.cashFlatAmounts, t.cashPointOverrides, t.cashManualAmounts);
                  const meIdx = tWorkers.findIndex(w => w.isMe);
                  const myPayout = meIdx >= 0 ? tipResult.payouts[meIdx] : null;
                  const myCash = myPayout ? (typeof myPayout.cashAmount === 'number' ? myPayout.cashAmount : (myPayout.amount - (myPayout.ccAmount || 0))) : 0;
                  const myCC = myPayout ? (myPayout.ccAmount !== undefined ? myPayout.ccAmount : myPayout.amount) : 0;
                  if (myPayout) totalMyCCCut += myCC;
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
                        <span style="color:#64D2FF;font-weight:700">$${myCC}${myCash>0?' + $'+myCash+' cash':''}</span>
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
      row.onclick = () => {
        w.querySelectorAll('.wt-week').forEach(r => r.classList.remove('wt-week-cur'));
        row.classList.add('wt-week-cur');
      };
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

    // Simple sequential day-by-day navigation — every calendar day is reachable, not just
    // ones with a shift or day-off already recorded. The old version jumped straight to the
    // next date that happened to have data, silently skipping empty days in between (e.g.
    // landing on today from the 12th, skipping the 13th entirely) — confusing since the
    // arrows look like a plain day browser. "Next" stops at today since future days have
    // nothing to show yet; "prev" has no lower bound.
    const weekStart = getWeekStart(new Date(dateStr + 'T12:00:00'));
    const weekLabel = formatWeekLabel(weekStart);
    const _fmtDs = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const prevDateObj = new Date(dateStr + 'T12:00:00'); prevDateObj.setDate(prevDateObj.getDate() - 1);
    const prevDate = _fmtDs(prevDateObj);
    const nextDateObj = new Date(dateStr + 'T12:00:00'); nextDateObj.setDate(nextDateObj.getDate() + 1);
    const nextDateCandidate = _fmtDs(nextDateObj);
    const nextDate = nextDateCandidate <= _today() ? nextDateCandidate : null;

    const w = document.createElement('div');
    w.className = 'wt-screen';
    w.innerHTML = `
      <div class="wt-hdr">
        <button class="wt-back" id="wt-back">‹ Back</button>
        <div style="font-size:13px;color:#98989D">${weekLabel}</div>
        <button class="wt-sec-action" id="wt-add-shift-day">+ Shift</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0 16px;gap:12px">
        <button id="wt-day-prev" style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:${!prevDate ? '#3a3a3c' : '#fff'};font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;${!prevDate ? 'opacity:0.3;pointer-events:none' : ''}"
          onpointerdown="this.style.background='rgba(255,255,255,0.15)'" onpointerup="this.style.background='rgba(255,255,255,0.08)'" onpointerleave="this.style.background='rgba(255,255,255,0.08)'">‹</button>
        <div style="flex:1;text-align:center;font-size:18px;font-weight:800">${_fmtDate(dateStr)}</div>
        <button id="wt-day-next" style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:${!nextDate ? '#3a3a3c' : '#fff'};font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;${!nextDate ? 'opacity:0.3;pointer-events:none' : ''}"
          onpointerdown="this.style.background='rgba(255,255,255,0.15)'" onpointerup="this.style.background='rgba(255,255,255,0.08)'" onpointerleave="this.style.background='rgba(255,255,255,0.08)'">›</button>
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
              if (shiftPay.overtimePay > 0) lines.push(`<div style="display:flex;justify-content:space-between;padding-left:12px"><span style="color:#FF9F0A">Overtime ${WTRules.fmtHours(shiftPay.overtimeHours)} × ${shiftPay.otMultiplier}×</span><span style="color:#FF9F0A">${WTRules.fmtMoney(shiftPay.overtimePay)}</span></div>`);
              const paidBreakMins = (s.entries||[]).reduce((a,e) => {
                if (typeof e.breakDurationMinutes === 'number') return a + (e.breakPaid ? e.breakDurationMinutes : 0);
                return a + (e.paidBreakMinutes||0);
              }, 0);
              if (paidBreakMins > 0) lines.push(`<div style="display:flex;justify-content:space-between;padding-left:12px"><span style="color:#30D158">Paid break ${WTRules.fmtHours(paidBreakMins/60)}</span><span style="color:#30D158">+${WTRules.fmtMoney((paidBreakMins/60)*rate)}</span></div>`);
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
      const dayOffReason = WTDb.getDayOffReason(dateStr, activeProf2);
      if (dayOffReason) {
        emp.innerHTML = `<strong>Day off</strong>${_dayOffLabel(dayOffReason)}<button id="wt-dayoff-edit" style="display:block;margin:10px auto 0;background:rgba(94,92,230,.15);border:none;border-radius:10px;color:#5E5CE6;font-size:13px;font-weight:700;padding:8px 16px;cursor:pointer;transition:transform .1s"
          onpointerdown="this.style.transform='scale(.96)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">Edit</button>`;
      } else {
        emp.innerHTML = `<strong>No shifts</strong>Nothing recorded for this day.
          <div style="display:flex;gap:8px;justify-content:center;margin-top:10px">
            <button id="wt-log-past" style="background:rgba(94,92,230,.15);border:none;border-radius:10px;color:#5E5CE6;font-size:13px;font-weight:700;padding:8px 16px;cursor:pointer;transition:transform .1s"
              onpointerdown="this.style.transform='scale(.96)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">Log past data</button>
            <button id="wt-dayoff-add" style="background:rgba(28,28,30,0.8);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#98989D;font-size:13px;font-weight:700;padding:8px 16px;cursor:pointer;transition:transform .1s"
              onpointerdown="this.style.transform='scale(.96)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">Mark day off</button>
          </div>`;
      }
      w.appendChild(emp);
    }
    _root.appendChild(w);
    w.querySelector('#wt-back').onclick = () => { _weekFocusDate = dateStr; _go('week'); };
    w.querySelector('#wt-add-shift-day').onclick = () => _showAddShift(dateStr);
    if (prevDate) w.querySelector('#wt-day-prev').onclick = () => _go('day', { date: prevDate });
    if (nextDate) w.querySelector('#wt-day-next').onclick = () => _go('day', { date: nextDate });
    const dayOffAddBtn = w.querySelector('#wt-dayoff-add');
    if (dayOffAddBtn) dayOffAddBtn.onclick = () => _showDayOffPicker(dateStr, activeProf2, () => _go('day', { date: dateStr }));
    const dayOffEditBtn = w.querySelector('#wt-dayoff-edit');
    if (dayOffEditBtn) dayOffEditBtn.onclick = () => _showDayOffPicker(dateStr, activeProf2, () => _go('day', { date: dateStr }));
    const logPastBtn = w.querySelector('#wt-log-past');
    if (logPastBtn) logPastBtn.onclick = () => _showLogPastData(dateStr);
  }

  function _Preview() {
    const w = document.createElement('div');
    w.className = 'wt-screen';
    const previewProfile = WTDb.getSettings().workProfile || 'restaurant';
    const previewLocs = WTDb.getLocations().filter(l => (l.workProfile || 'restaurant') === previewProfile);
    w.innerHTML = `
      <div class="wt-hdr">
        <button class="wt-back" id="wt-back">‹ Back</button>
        <div style="font-size:18px;font-weight:800">Preview & Export</div>
        <div style="width:36px"></div>
      </div>
      <div id="wt-pv-pills" class="wt-scroll-hide" style="display:flex;gap:8px;overflow-x:auto;padding:0 16px 4px;margin-bottom:8px">
        ${['Week','Month','Quarter','6M','Year','All Time'].map(p =>
          `<button class="wt-pv-pill" data-gran="${p.toLowerCase().replace(' ', '').replace('6m','sixmonths')}" style="flex-shrink:0;padding:8px 14px;border-radius:20px;border:1px solid #38383A;background:none;color:#98989D;font-size:13px;font-weight:700;cursor:pointer">${p}</button>`
        ).join('')}
      </div>
      <button id="wt-pv-custom-btn" class="wt-tap-scale" style="display:block;width:calc(100% - 32px);margin:0 16px 10px;background:rgba(28,28,30,0.8);border:1px solid #38383A;border-radius:12px;color:#98989D;font-size:13px;font-weight:700;padding:11px;cursor:pointer"><svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="vertical-align:-2px;margin-right:5px"><rect x="1.5" y="2.5" width="11" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M1.5 5.5H12.5" stroke="currentColor" stroke-width="1.3"/><path d="M4 1.3V3.3M10 1.3V3.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>Pick a custom date range</button>
      <div id="wt-pv-nav" style="display:none;align-items:center;justify-content:center;gap:16px;margin-bottom:10px">
        <button id="wt-pv-prev" class="wt-tap-scale" style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">‹</button>
        <span id="wt-pv-label" style="font-size:14px;font-weight:700;color:#fff;min-width:170px;text-align:center"></span>
        <button id="wt-pv-next" class="wt-tap-scale" style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">›</button>
      </div>
      <div id="wt-custom-wrap" style="display:none;gap:8px;margin:0 16px 10px">
        <input type="date" class="wt-input" id="wt-custom-start" style="flex:1">
        <input type="date" class="wt-input" id="wt-custom-end" style="flex:1">
      </div>
      ${previewLocs.length > 1 ? `
      <select class="wt-range-sel" id="wt-loc-filter">
        <option value="">All Locations</option>
        ${previewLocs.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
      </select>` : ''}
      <div class="wt-table-wrap" id="wt-tbl"></div>
      <div class="wt-actions">
        <button class="wt-btn wt-btn-secondary" id="wt-backup">💾 Backup</button>
        <button class="wt-btn wt-btn-cyan" id="wt-pdf">📄 PDF</button>
      </div>`;
    _root.appendChild(w);
    const tbl = w.querySelector('#wt-tbl');
    const locFilterEl = w.querySelector('#wt-loc-filter');
    const pillsEl = w.querySelector('#wt-pv-pills');
    const customBtn = w.querySelector('#wt-pv-custom-btn');
    const navEl = w.querySelector('#wt-pv-nav');
    const labelEl = w.querySelector('#wt-pv-label');
    const nextBtn = w.querySelector('#wt-pv-next');
    let granularity = 'month', offset = 0, curRange = null;

    function setActivePill() {
      pillsEl.querySelectorAll('.wt-pv-pill').forEach(btn => {
        const active = btn.dataset.gran === granularity;
        btn.style.borderColor = active ? '#5E5CE6' : '#38383A';
        btn.style.background = active ? 'rgba(94,92,230,.15)' : 'none';
        btn.style.color = active ? '#5E5CE6' : '#98989D';
      });
      const customActive = granularity === 'custom';
      customBtn.style.borderColor = customActive ? '#5E5CE6' : '#38383A';
      customBtn.style.background = customActive ? 'rgba(94,92,230,.15)' : 'rgba(28,28,30,0.8)';
      customBtn.style.color = customActive ? '#5E5CE6' : '#98989D';
    }

    function refresh() {
      const locId = locFilterEl ? locFilterEl.value : '';
      if (granularity === 'custom') {
        const cs = w.querySelector('#wt-custom-start').value, ce = w.querySelector('#wt-custom-end').value;
        if (!cs || !ce) { tbl.innerHTML = '<div class="wt-empty"><strong>Pick both dates</strong>Choose a start and end date.</div>'; curRange = null; return; }
        curRange = { start: cs, end: ce, label: `${cs} → ${ce}` };
      } else if (granularity === 'alltime') {
        curRange = { start: '2000-01-01', end: _today(), label: 'All Time' };
      } else {
        curRange = _periodRange(granularity, offset);
        labelEl.textContent = curRange.label;
        nextBtn.style.color = offset >= 0 ? '#3a3a3c' : '#fff';
        nextBtn.style.opacity = offset >= 0 ? '0.3' : '1';
        nextBtn.style.pointerEvents = offset >= 0 ? 'none' : 'auto';
      }
      _buildTable(curRange.start, curRange.end, tbl, locId);
    }

    function selectGranularity(g) {
      granularity = g;
      offset = 0;
      setActivePill();
      navEl.style.display = (g !== 'custom' && g !== 'alltime') ? 'flex' : 'none';
      w.querySelector('#wt-custom-wrap').style.display = g === 'custom' ? 'flex' : 'none';
      refresh();
    }

    pillsEl.querySelectorAll('.wt-pv-pill').forEach(btn => { btn.onclick = () => selectGranularity(btn.dataset.gran); });
    customBtn.onclick = () => selectGranularity('custom');
    w.querySelector('#wt-pv-prev').onclick = () => { offset--; refresh(); };
    nextBtn.onclick = () => { if (offset < 0) { offset++; refresh(); } };
    w.querySelector('#wt-custom-start').onchange = refresh;
    w.querySelector('#wt-custom-end').onchange = refresh;
    if (locFilterEl) locFilterEl.onchange = refresh;

    setActivePill();
    navEl.style.display = 'flex';
    refresh();
    w.querySelector('#wt-back').onclick = () => _go('home');
    w.querySelector('#wt-backup').onclick = async () => {
      const b = new Blob([WTDb.exportData()], { type: 'application/json' });
      const result = await _saveOrShareBlob(b, `Tempo_WorkBackup_${_today()}.json`);
      if (result !== 'cancelled') WTDb.setLastBackupDate(new Date().toISOString());
    };
    w.querySelector('#wt-pdf').onclick = () => {
      if (!curRange) { alert('Pick both a start and end date.'); return; }
      const locId = locFilterEl ? locFilterEl.value : '';
      _exportPDF(curRange.start, curRange.end, locId, curRange.label);
    };
  }

  // Any calendar period, navigable via offset (0 = current, -1 = previous, etc.) — same
  // pattern as Stats' weekRange, extended to month/quarter/year. Never extends past today.
  function _periodRange(granularity, offset) {
    const now = new Date();
    const _ds = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const _mo = d => d.toLocaleDateString('en-US', { month: 'short' });
    let start, end, label;
    if (granularity === 'week') {
      start = getWeekStart(now); start.setDate(start.getDate() + offset * 7);
      end = getWeekEnd(start);
      label = formatWeekLabel(start);
    } else if (granularity === 'month') {
      start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } else if (granularity === 'quarter') {
      start = new Date(now.getFullYear(), (Math.floor(now.getMonth() / 3) + offset) * 3, 1);
      end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
      label = `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()} (${_mo(start)}–${_mo(end)})`;
    } else if (granularity === 'sixmonths') {
      start = new Date(now.getFullYear(), (Math.floor(now.getMonth() / 6) + offset) * 6, 1);
      end = new Date(start.getFullYear(), start.getMonth() + 6, 0);
      label = `H${Math.floor(start.getMonth() / 6) + 1} ${start.getFullYear()} (${_mo(start)}–${_mo(end)})`;
    } else {
      start = new Date(now.getFullYear() + offset, 0, 1);
      end = new Date(start.getFullYear(), 11, 31);
      label = String(start.getFullYear());
    }
    const today = new Date(now); today.setHours(23, 59, 59, 999);
    if (end > today) end = today;
    return { start: _ds(start), end: _ds(end), label };
  }

  function _rangeShifts(startStr, endStr) {
    const rangeProfile = WTDb.getSettings().workProfile || 'restaurant';
    return WTDb.getShifts().filter(s => s.date >= startStr && s.date <= endStr && (s.workProfile || 'restaurant') === rangeProfile)
      .sort((a,b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));
  }

  function _buildTable(startStr, endStr, container, filterLocId) {
    let shifts = _rangeShifts(startStr, endStr);
    if (filterLocId) shifts = shifts.filter(s => s.locationId === filterLocId);
    if (!shifts.length) { container.innerHTML = '<div class="wt-empty"><strong>No data</strong>No shifts in this period.</div>'; return; }
    const byDate = {};
    shifts.forEach(s => { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s); });
    let rows = '', gHrs = 0, gPay = 0, gCC = 0, gCash = 0;
    Object.entries(byDate).forEach(([date, ds]) => {
      let first = true, dHrs = 0, dPay = 0, dCC = 0, dCash = 0;
      ds.forEach(shift => {
        const hrs = WTRules.shiftHours(shift);
        const pay = hrs * (shift.hourlyRate || NYC_MIN_WAGE);
        const cut = _shiftTipCut(shift);
        const ins = (shift.entries||[]).map(e => _fmtTime(e.clockIn)).join('<br>');
        const outs = (shift.entries||[]).map(e => e.clockOut ? _fmtTime(e.clockOut) : '—').join('<br>');
        rows += `<tr>
          ${first ? `<td rowspan="${ds.length}" class="wt-td-date">${_fmtDate(date)}</td>` : ''}
          <td>${shift.locationName}</td><td>${shift.shiftType}</td>
          <td class="wt-td-mono">${ins}</td><td class="wt-td-mono">${outs}</td>
          <td class="wt-td-num">${WTRules.fmtHours(hrs)}</td>
          <td class="wt-td-num">${WTRules.fmtMoney(pay)}</td>
          <td class="wt-td-num wt-td-green">${WTRules.fmtMoney(cut.cc)}</td>
          <td class="wt-td-num wt-td-green">${WTRules.fmtMoney(cut.cash)}</td>
        </tr>`;
        first = false; dHrs += hrs; dPay += pay; dCC += cut.cc; dCash += cut.cash;
      });
      rows += `<tr class="wt-row-sub">
        <td colspan="5" class="wt-td-right">Day Total</td>
        <td class="wt-td-num">${WTRules.fmtMoney(dPay)}</td>
        <td class="wt-td-num wt-td-green">${WTRules.fmtMoney(dCC)}</td>
        <td class="wt-td-num wt-td-green">${WTRules.fmtMoney(dCash)}</td>
      </tr>`;
      gHrs += dHrs; gPay += dPay; gCC += dCC; gCash += dCash;
    });
    rows += `<tr class="wt-row-total"><td colspan="4"><strong>TOTAL</strong></td><td class="wt-td-num"><strong>${WTRules.fmtHours(gHrs)}</strong></td><td class="wt-td-num"><strong>${WTRules.fmtMoney(gPay)}</strong></td><td class="wt-td-num"><strong>${WTRules.fmtMoney(gCC)}</strong></td><td class="wt-td-num"><strong>${WTRules.fmtMoney(gCash)}</strong></td></tr>`;
    container.innerHTML = `<table class="wt-table"><thead><tr><th>Date</th><th>Location</th><th>Shift</th><th>In</th><th>Out</th><th>Hrs</th><th>Pay</th><th>CC Tips</th><th>Cash Tips</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function _svgBarRow(items, fmtFn) {
    if (!items.length) return '<div style="color:#636366;font-size:13px;padding:8px 0">No data</div>';
    const maxVal = Math.max(...items.map(i => i.value), 0.01);
    const barH = 26, gap = 14, labelW = 76, chartW = 150;
    const rowH = barH + gap;
    const totalH = items.length * rowH - gap;
    const rows = items.map((it, i) => {
      const barW = Math.max(3, (it.value / maxVal) * chartW);
      const y = i * rowH;
      const inner = `
        <text x="0" y="${y + barH/2 + 4}" font-size="11" fill="#98989D">${it.label.length > 10 ? it.label.slice(0,9)+'…' : it.label}</text>
        <rect x="${labelW}" y="${y}" width="${chartW}" height="${barH}" rx="7" fill="rgba(255,255,255,0.06)"/>
        <rect x="${labelW}" y="${y}" width="${barW}" height="${barH}" rx="7" fill="${it.color}"/>
        <text x="${labelW + chartW + 8}" y="${y + barH/2 + 4}" font-size="12" font-weight="700" fill="#fff">${fmtFn(it.value)}</text>`;
      if (it.dataAttrs) {
        const attrStr = Object.entries(it.dataAttrs).map(([k, v]) => `data-${k}="${v}"`).join(' ');
        return `<g ${attrStr} style="cursor:pointer">${inner}</g>`;
      }
      return inner;
    }).join('');
    return `<svg viewBox="0 0 ${labelW + chartW + 60} ${totalH}" width="100%" height="${totalH}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`;
  }

  function _statRow(label, value, color) {
    return `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0">
      <span style="color:#636366">${label}</span>
      <span style="color:${color||'#fff'};font-weight:700">${value}</span>
    </div>`;
  }

  // Every Stats section (except the always-visible headline) uses this same collapsible
  // shell — defaults closed so the screen reads as a scannable list of titles. isOpen lets
  // a caller restore a previously-expanded state (e.g. after switching the date-range pill,
  // where the screen isn't really "changing" so open cards shouldn't re-collapse). One
  // delegated click listener (wired in loadRange) handles every instance, matched by id.
  function _collapsibleCard(id, title, bodyHtml, isOpen) {
    if (!bodyHtml) return '';
    return `
      <div class="wt-settings-block" style="margin-bottom:16px;padding:0;overflow:hidden">
        <div class="wt-collapse-header" data-collapse-toggle="${id}" style="display:flex;justify-content:space-between;align-items:center;padding:16px;cursor:pointer">
          <div class="wt-settings-title" style="margin:0">${title}</div>
          <span class="wt-collapse-chevron" data-collapse-chevron="${id}" style="color:#98989D;font-size:12px">${isOpen ? '▲' : '▼'}</span>
        </div>
        <div class="wt-collapse-body" data-collapse-body="${id}" style="display:${isOpen ? 'block' : 'none'};padding:0 16px 16px">
          ${bodyHtml}
        </div>
      </div>`;
  }

  // Shared by Settings (where expenses get entered) and Stats (read-only view of the same
  // analysis) — one place formats this so the two screens can never drift out of sync.
  // Shows three tiers of confidence explicitly: gross (100% real, no estimation at all),
  // estimated net (your own configured tax %, clearly labeled as an estimate — taxes are a
  // real fiscal question this app can't know for certain), and, when available, whatever
  // net has actually been confirmed via payments you've recorded, as a trust cross-check.
  function _sustainabilityResultsHtml(r) {
    if (!r.hasData) {
      return `<div style="font-size:12px;color:#636366">Not enough recent shifts yet — log some work first.</div>`;
    }
    const fmt = WTRules.fmtMoney;
    let html = `
      <div style="font-size:11px;color:#636366;margin-bottom:12px;line-height:1.4">Based on your last ${r.lookbackDays} days. This is math from your own data, not a recommendation for how much you should work — take care of yourself.</div>

      <div style="font-size:12px;color:#98989D;font-weight:700;margin-bottom:6px">Per hour</div>
      ${_statRow('Gross (real, no estimate)', fmt(r.grossPerHour))}
      ${r.usingNet ? _statRow('Est. net (after your tax %)', fmt(r.avgPerHour), '#64D2FF') : ''}

      <div style="font-size:12px;color:#98989D;font-weight:700;margin:12px 0 6px">Per shift</div>
      ${_statRow('Gross (real, no estimate)', fmt(r.grossPerShift))}
      ${r.usingNet ? _statRow('Est. net (after your tax %)', fmt(r.avgPerShift), '#64D2FF') : ''}
      ${r.hasReceivedData ? `<div style="font-size:11px;color:#30D158;margin-top:8px">✓ ${fmt(r.receivedNetInWindow)} of this window has been confirmed from payments you've actually recorded.</div>` : ''}

      <div style="margin-top:12px;padding-top:10px;border-top:1px solid #2C2C2E">
        ${_statRow('Hours worked / week', r.avgHoursPerWeek.toFixed(1))}
        ${_statRow('Shifts worked / week', r.avgShiftsPerWeek.toFixed(1))}
        ${_statRow('Projected this year (est. net)', fmt(r.projectedAnnual))}
      </div>`;
    if (r.monthlyExpenses > 0) {
      const ok = r.surplusAnnual >= 0;
      html += `
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid #2C2C2E">
        ${_statRow('Your annual expenses', fmt(r.annualExpenses))}
        ${_statRow(ok ? 'Projected surplus' : 'Projected shortfall', (ok ? '+' : '') + fmt(r.surplusAnnual), ok ? '#30D158' : '#FF453A')}
      </div>
      <div style="margin-top:12px;padding-top:10px;border-top:1px solid #2C2C2E">
        <div style="font-size:13px;color:#636366;margin-bottom:4px">Needed to break even</div>
        <div style="font-size:15px;font-weight:700;color:${ok ? '#30D158' : '#FF9F0A'}">${r.hoursNeededPerWeek.toFixed(1)} hrs/week</div>
        <div style="font-size:12px;color:#636366;margin-top:2px">≈ ${r.shiftsNeededPerWeek.toFixed(1)} shifts/week, at your average ~${r.avgHoursPerShift.toFixed(1)}h per shift</div>
      </div>`;
    } else {
      html += `<div style="font-size:11px;color:#636366;margin-top:10px">Enter your monthly expenses in Settings → Sustainability to see if this pace covers your bills.</div>`;
    }
    return html;
  }

  function _Stats() {
    const openCardIds = new Set(); // which cards are expanded — survives pill changes (loadRange),
                                    // resets fresh only when _Stats() itself re-runs (leaving and
                                    // coming back), matching "collapse on page change, not on filter change"
    const w = document.createElement('div');
    w.className = 'wt-screen';
    const years = StatsRules.activeYears();
    const curYear = new Date().getFullYear();
    w.innerHTML = `
      <div class="wt-hdr">
        <button class="wt-back" id="wt-back">‹ Back</button>
        <div style="font-size:18px;font-weight:800">Stats</div>
        <div style="width:36px"></div>
      </div>
      <div id="wt-stats-pills" class="wt-scroll-hide" style="display:flex;gap:8px;overflow-x:auto;padding:8px 0 12px;margin-bottom:0;position:sticky;top:0;z-index:10;background:#000">
        ${['7D','30D','3M','6M','1Y','By Year','Custom'].map(p =>
          `<button class="wt-stats-pill" data-pill="${p}" style="flex-shrink:0;padding:8px 14px;border-radius:20px;border:1px solid #38383A;background:none;color:#98989D;font-size:13px;font-weight:700;cursor:pointer">${p}</button>`
        ).join('')}
      </div>
      <div style="margin-bottom:12px"></div>
      <div id="wt-stats-loc-picker" style="display:none;margin-bottom:12px">
        <select class="wt-select-sm" id="wt-stats-loc-sel" style="width:100%">
          <option value="">All Locations</option>
        </select>
      </div>
      <div id="wt-stats-year-picker" style="display:none;margin-bottom:12px">
        <select class="wt-select-sm" id="wt-stats-year-sel" style="width:100%">
          ${(years.length ? years : [curYear]).map(y => `<option value="${y}">${y}</option>`).join('')}
        </select>
      </div>
      <div id="wt-stats-custom-picker" style="display:none;margin-bottom:12px;display:flex;gap:8px">
        <input type="date" class="wt-input" id="wt-stats-start" style="flex:1">
        <input type="date" class="wt-input" id="wt-stats-end" style="flex:1">
        <button class="wt-btn wt-btn-primary" id="wt-stats-apply" style="flex-shrink:0">Go</button>
      </div>
      <div id="wt-stats-range-label" style="font-size:12px;color:#636366;margin-bottom:4px"></div>
      <div id="wt-stats-week-nav" style="display:none;align-items:center;justify-content:center;gap:16px;margin-bottom:12px">
        <button id="wt-stats-week-prev" style="background:none;border:none;color:#5E5CE6;font-size:20px;cursor:pointer;padding:4px 14px">‹</button>
        <span id="wt-stats-week-label" style="font-size:13px;font-weight:700;color:#fff;min-width:120px;text-align:center"></span>
        <button id="wt-stats-week-next" style="background:none;border:none;color:${'#3a3a3c'};font-size:20px;cursor:pointer;padding:4px 14px;opacity:0.3;pointer-events:none">›</button>
      </div>
      <div id="wt-stats-results"></div>`;
    _root.appendChild(w);
    w.querySelector('#wt-back').onclick = () => _go('home');

    const pillsEl = w.querySelector('#wt-stats-pills');
    const yearPicker = w.querySelector('#wt-stats-year-picker');
    const customPicker = w.querySelector('#wt-stats-custom-picker');
    const yearSel = w.querySelector('#wt-stats-year-sel');
    const rangeLabelEl = w.querySelector('#wt-stats-range-label');
    const resultsEl = w.querySelector('#wt-stats-results');
    const weekNavEl = w.querySelector('#wt-stats-week-nav');
    const weekLabelEl = w.querySelector('#wt-stats-week-label');
    const weekPrevBtn = w.querySelector('#wt-stats-week-prev');
    const weekNextBtn = w.querySelector('#wt-stats-week-next');
    const locPicker = w.querySelector('#wt-stats-loc-picker');
    const locSel = w.querySelector('#wt-stats-loc-sel');
    let weekOffset = 0;
    let selectedLocationId = '';
    let lastStart, lastEnd, lastLabel;

    const currentProfileForLocs = WTDb.getSettings().workProfile || 'restaurant';
    const statsLocations = WTDb.getLocations().filter(l => (l.workProfile || 'restaurant') === currentProfileForLocs);
    if (statsLocations.length >= 2) {
      locPicker.style.display = 'block';
      statsLocations.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l.id;
        opt.textContent = l.name;
        locSel.appendChild(opt);
      });
      locSel.onchange = () => {
        selectedLocationId = locSel.value;
        if (lastStart) loadRange(lastStart, lastEnd, lastLabel);
      };
    }

    function fmtStatDate(dateStr) {
      return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function setActivePill(name) {
      pillsEl.querySelectorAll('.wt-stats-pill').forEach(btn => {
        const active = btn.dataset.pill === name;
        btn.style.borderColor = active ? '#5E5CE6' : '#38383A';
        btn.style.background = active ? 'rgba(94,92,230,.15)' : 'none';
        btn.style.color = active ? '#5E5CE6' : '#98989D';
      });
    }

    function loadRange(start, end, label) {
      lastStart = start; lastEnd = end; lastLabel = label;
      rangeLabelEl.textContent = `${label} · ${fmtStatDate(start)} → ${fmtStatDate(end)}`;
      const currentProfile = WTDb.getSettings().workProfile || 'restaurant';
      const stats = StatsRules.computeAllStats(start, end, currentProfile, selectedLocationId || null);
      resultsEl.innerHTML = _renderStatsResults(stats, openCardIds, selectedLocationId || null);
      resultsEl.querySelectorAll('[data-chart-date]').forEach(el => {
        el.onclick = () => _go('day', { date: el.dataset.chartDate });
      });
      const sustainLink = resultsEl.querySelector('#wt-stats-sustain-link');
      if (sustainLink) sustainLink.onclick = (e) => { e.stopPropagation(); _go('settings'); };
      resultsEl.onclick = (e) => {
        const barEl = e.target.closest('[data-bar-target]');
        if (barEl) {
          const target = barEl.dataset.barTarget;
          const msgEl = resultsEl.querySelector(`[data-bar-msg="${target}"]`);
          if (!msgEl) return;
          const label = barEl.dataset.barLabel;
          if (msgEl.dataset.shownFor === label) {
            msgEl.innerHTML = '';
            delete msgEl.dataset.shownFor;
            return;
          }
          const wage = parseFloat(barEl.dataset.barWage);
          const cc = parseFloat(barEl.dataset.barCc);
          const cash = parseFloat(barEl.dataset.barCash);
          msgEl.innerHTML = `<div style="font-size:12px;color:#98989D;margin-top:10px;padding-top:10px;border-top:1px solid #2C2C2E"><strong style="color:#fff">${label}</strong> average breakdown:<br>Hourly wage: ${WTRules.fmtMoney(wage)} · CC tips: ${WTRules.fmtMoney(cc)} · Cash tips: ${WTRules.fmtMoney(cash)}</div>`;
          msgEl.dataset.shownFor = label;
          return;
        }
        const toggle = e.target.closest('[data-collapse-toggle]');
        if (!toggle) return;
        const id = toggle.dataset.collapseToggle;
        const body = resultsEl.querySelector(`[data-collapse-body="${id}"]`);
        const chev = resultsEl.querySelector(`[data-collapse-chevron="${id}"]`);
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        chev.textContent = open ? '▼' : '▲';
        if (open) openCardIds.delete(id); else openCardIds.add(id);
      };
    }

    function loadWeek() {
      const r = StatsRules.weekRange(weekOffset);
      weekLabelEl.textContent = formatWeekLabel(r.weekStart);
      weekNextBtn.style.color = weekOffset >= 0 ? '#3a3a3c' : '#5E5CE6';
      weekNextBtn.style.opacity = weekOffset >= 0 ? '0.3' : '1';
      weekNextBtn.style.pointerEvents = weekOffset >= 0 ? 'none' : 'auto';
      loadRange(r.start, r.end, weekOffset === 0 ? 'This week' : 'Week of');
    }

    weekPrevBtn.onclick = () => { weekOffset--; loadWeek(); };
    weekNextBtn.onclick = () => { if (weekOffset < 0) { weekOffset++; loadWeek(); } };

    pillsEl.querySelectorAll('.wt-stats-pill').forEach(btn => {
      btn.onclick = () => {
        const p = btn.dataset.pill;
        setActivePill(p);
        yearPicker.style.display = p === 'By Year' ? 'block' : 'none';
        customPicker.style.display = p === 'Custom' ? 'flex' : 'none';
        weekNavEl.style.display = p === '7D' ? 'flex' : 'none';
        if (p === '7D') { weekOffset = 0; loadWeek(); }
        else if (p === '30D') { const r = StatsRules.rollingRange(30); loadRange(r.start, r.end, 'Last 30 days'); }
        else if (p === '3M') { const r = StatsRules.rollingRange(90); loadRange(r.start, r.end, 'Last 3 months'); }
        else if (p === '6M') { const r = StatsRules.rollingRange(180); loadRange(r.start, r.end, 'Last 6 months'); }
        else if (p === '1Y') { const r = StatsRules.rollingRange(365); loadRange(r.start, r.end, 'Last year'); }
        else if (p === 'By Year') { const y = parseInt(yearSel.value) || curYear; const r = StatsRules.yearRange(y); loadRange(r.start, r.end, String(y)); }
        else if (p === 'Custom') { /* wait for Go button */ }
      };
    });

    yearSel.onchange = () => {
      const y = parseInt(yearSel.value) || curYear;
      const r = StatsRules.yearRange(y);
      loadRange(r.start, r.end, String(y));
    };

    w.querySelector('#wt-stats-apply').onclick = () => {
      const start = w.querySelector('#wt-stats-start').value;
      const end = w.querySelector('#wt-stats-end').value;
      if (!start || !end || start > end) { alert('Pick a valid start and end date.'); return; }
      loadRange(start, end, 'Custom range');
    };

    // Default view on open
    setActivePill('30D');
    const r0 = StatsRules.rollingRange(30);
    loadRange(r0.start, r0.end, 'Last 30 days');
  }

  function _svgLineChart(points) {
    if (!points.length) return '<div style="color:#636366;font-size:13px;padding:8px 0">No data</div>';
    const w = 300, h = 110, padding = 10;
    const maxVal = Math.max(...points.map(p => p.total), 0.01);
    const stepX = points.length > 1 ? (w - padding * 2) / (points.length - 1) : 0;
    const coords = points.map((p, i) => ({
      x: padding + i * stepX,
      y: h - padding - (p.total / maxVal) * (h - padding * 2),
      date: p.date,
      total: p.total
    }));
    const pathD = coords.map((c, i) => (i === 0 ? 'M' : 'L') + c.x.toFixed(1) + ',' + c.y.toFixed(1)).join(' ');
    const last = coords[coords.length - 1], first = coords[0];
    const areaD = `${pathD} L${last.x.toFixed(1)},${h - padding} L${first.x.toFixed(1)},${h - padding} Z`;
    const dots = coords.map(c =>
      `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="9" fill="transparent" data-chart-date="${c.date}" style="cursor:pointer"/>
       <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" fill="#5E5CE6" data-chart-date="${c.date}" style="cursor:pointer;pointer-events:none"/>`
    ).join('');
    return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <path d="${areaD}" fill="rgba(94,92,230,.12)"/>
      <path d="${pathD}" fill="none" stroke="#5E5CE6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
    </svg>`;
  }

  function _renderStatsResults(stats, openCardIds, locationId) {
    if (!stats.perLocation.length) {
      return '<div class="wt-empty"><strong>No data</strong>No shifts or payments in this period.</div>';
    }
    const t = stats.totals;
    const colors = ['#5E5CE6', '#30D158', '#64D2FF', '#FF9F0A', '#FF453A', '#BF5AF2'];
    const statsProfile = WTDb.getSettings().workProfile || 'restaurant';

    const ts = StatsRules.timeSeries(stats.startDate, stats.endDate, statsProfile, locationId);
    const lineChartCard = _collapsibleCard('chart', 'Earnings over time', _svgLineChart(ts.points), openCardIds.has('chart'));

    const dowData = StatsRules.dayOfWeekPattern(stats.startDate, stats.endDate, statsProfile, locationId)
      .sort((a, b) => b.avg - a.avg);
    const dowCard = dowData.some(d => d.count > 0)
      ? _collapsibleCard('dow', 'Best days to work', `
          <div style="font-size:11px;color:#636366;margin-bottom:10px">Includes hourly wage + CC tips + cash tips. Tap a bar for the breakdown.</div>
          ${_svgBarRow(dowData.map((d, i) => ({
            label: d.day, value: d.avg, color: colors[i % colors.length],
            dataAttrs: { 'bar-target': 'dow', 'bar-label': d.day, 'bar-wage': d.avgWage.toFixed(2), 'bar-cc': d.avgCC.toFixed(2), 'bar-cash': d.avgCash.toFixed(2) }
          })), v => WTRules.fmtMoney(v))}
          <div data-bar-msg="dow"></div>
        `, openCardIds.has('dow'))
      : '';

    const monthData = StatsRules.monthPattern(stats.startDate, stats.endDate, statsProfile, locationId)
      .filter(m => m.count > 0)
      .sort((a, b) => b.avg - a.avg);
    const monthCard = monthData.length >= 2
      ? _collapsibleCard('month', 'Best months to work', `
          <div style="font-size:11px;color:#636366;margin-bottom:10px">Includes hourly wage + CC tips + cash tips. Tap a bar for the breakdown.</div>
          ${_svgBarRow(monthData.map((m, i) => ({
            label: m.month, value: m.avg, color: colors[i % colors.length],
            dataAttrs: { 'bar-target': 'month', 'bar-label': m.month, 'bar-wage': m.avgWage.toFixed(2), 'bar-cc': m.avgCC.toFixed(2), 'bar-cash': m.avgCash.toFixed(2) }
          })), v => WTRules.fmtMoney(v))}
          <div data-bar-msg="month"></div>
        `, openCardIds.has('month'))
      : '';

    const daysOff = StatsRules.daysOffInRange(stats.startDate, stats.endDate, statsProfile);
    const dayOffLabels = { not_scheduled: 'Not scheduled', weather: 'Weather', cancelled: 'Shift cancelled', sick: 'Sick', requested_off: 'Requested off', custom: 'Custom' };
    const daysOffCard = daysOff.total > 0 ? _collapsibleCard('daysoff', 'Days off', `
      ${_statRow('Total', String(daysOff.total))}
      ${Object.entries(daysOff.byType).map(([type, count]) => _statRow(dayOffLabels[type] || type, String(count))).join('')}
    `, openCardIds.has('daysoff')) : '';

    const contextResult = StatsRules.computeShiftContext(stats.startDate, stats.endDate, statsProfile, locationId);
    const contextInsights = contextResult.insights;
    const cmp = StatsRules.periodComparison(stats.startDate, stats.endDate, statsProfile, locationId);
    const topDriver = contextInsights.length
      ? contextInsights.reduce((best, i) => Math.abs(i.deltaPercent) > Math.abs(best.deltaPercent) ? i : best)
      : null;
    const headlineCard = cmp.deltaPercent !== null ? `
      <div class="wt-settings-block" style="margin-bottom:16px;background:rgba(94,92,230,.08);border:1px solid rgba(94,92,230,.25)">
        <div style="font-size:14px;line-height:1.5;color:#fff">
          You earned <strong>${WTRules.fmtMoney(cmp.curTotal)}</strong> this period — <strong style="color:${cmp.deltaPercent >= 0 ? '#30D158' : '#FF453A'}">${cmp.deltaPercent >= 0 ? '+' : ''}${cmp.deltaPercent.toFixed(0)}%</strong> vs. the previous ${cmp.spanDays === 1 ? 'day' : cmp.spanDays + ' days'} (${WTRules.fmtMoney(cmp.prevTotal)})${topDriver && Math.abs(topDriver.deltaPercent) >= 15 ? `, largely coinciding with <strong>${topDriver.label}</strong> (${topDriver.deltaPercent >= 0 ? '+' : ''}${topDriver.deltaPercent.toFixed(0)}%)` : ''}.
        </div>
        <div style="font-size:11px;color:#98989D;margin-top:6px">${cmp.usingNet ? 'Estimated net, after your configured taxes — not a confirmed paycheck.' : 'Gross, before taxes — turn on tax estimates in Settings for a take-home number.'}</div>
      </div>` : '';

    function _contextRow(i) {
      const unitLabel = i.unit === 'perHour' ? '/hr' : i.unit === 'perShift' ? '/shift' : '/wk';
      const better = i.deltaPercent >= 0;
      return `
        <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #2C2C2E">
          <div style="font-size:13px;color:#fff;font-weight:700;margin-bottom:2px">${i.label} <span style="color:#636366;font-weight:400">(${i.groupCount} shift${i.groupCount !== 1 ? 's' : ''})</span></div>
          <div style="font-size:12px;color:#98989D">${WTRules.fmtMoney(i.groupAvg)}${unitLabel} vs. your usual ${WTRules.fmtMoney(i.baselineAvg)}${unitLabel} — <span style="color:${better ? '#30D158' : '#FF453A'};font-weight:700">${Math.abs(i.deltaPercent).toFixed(0)}% ${better ? 'more' : 'less'}</span></div>
        </div>`;
    }

    const lengthPatterns = StatsRules.shiftLengthPatterns(stats.startDate, stats.endDate, statsProfile, locationId);
    const contextBody = (contextInsights.length > 0 || lengthPatterns.length > 0) ? `
      <div style="font-size:11px;color:#636366;margin-bottom:14px;line-height:1.4">Each line compares your average pay in that situation against your average on everything else this period, using your real numbers.</div>
      ${contextInsights.map(_contextRow).join('')}
      ${contextInsights.length === 0 ? `<div style="font-size:11px;color:#636366;margin-bottom:14px;line-height:1.4">Not enough shifts yet in this period for earnings comparisons (need at least 2 on each side). Check back after a few more.</div>` : ''}
      ${contextResult.needsTagging ? `<div style="font-size:11px;color:#FF9F0A;margin-bottom:14px;line-height:1.4">🏷️ Tag more shifts with weather and pace (on each shift's card) to unlock those insights here.</div>` : ''}
      ${lengthPatterns.length ? `<div style="font-size:12px;color:#98989D;font-weight:700;margin-bottom:6px">Avg hours per shift</div>` : ''}
      ${lengthPatterns.map(p => `
        <div style="font-size:13px;color:#fff;margin-bottom:6px">${p.location}</div>
        ${p.weekdayCount ? _statRow(`Weekday (${p.weekdayCount} shift${p.weekdayCount !== 1 ? 's' : ''})`, WTRules.fmtHours(p.weekdayAvg)) : ''}
        ${p.weekendCount ? _statRow(`Weekend (${p.weekendCount} shift${p.weekendCount !== 1 ? 's' : ''})`, WTRules.fmtHours(p.weekendAvg)) : ''}
      `).join('')}
    ` : '';
    const contextCard = _collapsibleCard('context', 'What affects your earnings', contextBody, openCardIds.has('context'));

    const summaryCard = _collapsibleCard('summary', 'Summary', `
      ${_statRow('Hours worked', WTRules.fmtHours(t.hours))}
      ${_statRow('Gross from hours', WTRules.fmtMoney(t.grossFromHours))}
      ${_statRow('CC tips', '+' + WTRules.fmtMoney(t.ccTips), '#30D158')}
      ${_statRow('Cash tips', '+' + WTRules.fmtMoney(t.cashTips), '#FF9F0A')}
      ${_statRow('Expected total (gross)', WTRules.fmtMoney(t.expectedGross), '#fff')}
      ${t.receivedGross !== null ? _statRow('Received (gross)', WTRules.fmtMoney(t.receivedGross), '#64D2FF') : ''}
      ${t.receivedNet !== null ? _statRow('Received (net)', WTRules.fmtMoney(t.receivedNet), '#64D2FF') : ''}
    `, openCardIds.has('summary'));

    const activityCard = _collapsibleCard('activity', 'Activity', `
      ${_statRow('Days worked', `${t.daysWorked} of ${t.totalDaysInRange}`)}
      ${_statRow('Avg hours per worked day', WTRules.fmtHours(t.avgHoursPerWorkedDay))}
      ${_statRow('Shifts tracked', String(t.shiftsCount))}
    `, openCardIds.has('activity'));

    const positionsCard = stats.positionBreakdown.length > 0
      ? _collapsibleCard('positions', 'Positions worked', stats.positionBreakdown.map(p => _statRow(p.position, `${p.days} day${p.days !== 1 ? 's' : ''}`)).join(''), openCardIds.has('positions'))
      : '';

    const hoursChart = stats.perLocation.length > 1
      ? _collapsibleCard('hourschart', 'Hours by location', _svgBarRow(stats.perLocation.map((l, i) => ({ label: l.locationName, value: l.hours, color: colors[i % colors.length] })), v => WTRules.fmtHours(v)), openCardIds.has('hourschart'))
      : '';

    const incomeChart = stats.perLocation.length > 1
      ? _collapsibleCard('incomechart', 'Expected income by location', _svgBarRow(stats.perLocation.map((l, i) => ({ label: l.locationName, value: l.expectedGross, color: colors[i % colors.length] })), v => WTRules.fmtMoney(v)), openCardIds.has('incomechart'))
      : '';

    const locCards = stats.perLocation.map((l, i) => _collapsibleCard(`loc-${i}`, `
        <span style="display:inline-flex;align-items:center;gap:8px"><span style="width:10px;height:10px;border-radius:50%;background:${colors[i % colors.length]}"></span>${l.locationName}</span>
      `, `
        ${_statRow('Hours', WTRules.fmtHours(l.hours) + (l.overtimeHours > 0 ? ` (${WTRules.fmtHours(l.overtimeHours)} overtime)` : ''))}
        ${_statRow('Gross from hours', WTRules.fmtMoney(l.grossFromHours))}
        ${_statRow('CC tips', '+' + WTRules.fmtMoney(l.ccTips), '#30D158')}
        ${_statRow('Cash tips', '+' + WTRules.fmtMoney(l.cashTips), '#FF9F0A')}
        ${_statRow('Expected total (gross)', WTRules.fmtMoney(l.expectedGross))}
        ${l.expectedNet !== null ? _statRow('Est. net (after taxes)', WTRules.fmtMoney(l.expectedNet), '#64D2FF') : ''}
        ${l.receivedGross !== null ? _statRow('Received (gross)', WTRules.fmtMoney(l.receivedGross), '#64D2FF') : ''}
        ${l.receivedNet !== null ? _statRow('Received (net)', WTRules.fmtMoney(l.receivedNet), '#64D2FF') : ''}
        ${l.realTaxRate !== null ? _statRow('Avg. real tax rate', l.realTaxRate.toFixed(1) + '%', '#FF9F0A') : ''}
        ${_statRow('Shifts tracked', String(l.shiftsCount))}
      `, openCardIds.has(`loc-${i}`))).join('');

    // Always the fixed 90-day lookback, independent of whichever pill is selected above —
    // sustainability is about your current real pace, not the specific range you're browsing.
    const sustainResult = StatsRules.sustainabilityAnalysis(statsProfile, 90);
    const sustainCard = sustainResult.hasData ? _collapsibleCard('sustain', 'Sustainability', `
      ${_sustainabilityResultsHtml(sustainResult)}
      <div id="wt-stats-sustain-link" class="wt-tap-fade" style="text-align:center;font-size:12px;color:#5E5CE6;font-weight:700;margin-top:12px;cursor:pointer">Edit expenses in Settings →</div>
    `, openCardIds.has('sustain')) : '';

    return headlineCard + lineChartCard + dowCard + monthCard + daysOffCard + contextCard + summaryCard + activityCard + positionsCard + hoursChart + incomeChart + locCards + sustainCard;
  }

  const FLOORPLAN_PALETTE = [
    { type: 'mesa', shape: 'circle', label: 'Round table', numbered: true, w: 10, h: 10 },
    { type: 'mesa', shape: 'square', label: 'Square table', numbered: true, w: 10, h: 10 },
    { type: 'mesa', shape: 'rect', label: 'Rect table', numbered: true, w: 16, h: 9 },
    { type: 'silla', shape: 'circle', label: 'Chair', numbered: true, w: 5.5, h: 5.5 },
    { type: 'barra', shape: 'rect', label: 'Bar', numbered: true, w: 26, h: 6 },
    { type: 'columna', shape: 'square', label: 'Column', numbered: false, w: 6, h: 6 },
    { type: 'pared', shape: 'rect', label: 'Wall', numbered: false, w: 24, h: 3 },
    { type: 'espacio', shape: 'rect', label: 'Empty space', numbered: false, w: 14, h: 10 },
    { type: 'escaleras', shape: 'rect', label: 'Stairs', numbered: false, w: 10, h: 14 },
    { type: 'puerta', shape: 'rect', label: 'Door', numbered: false, w: 8, h: 8 },
  ];
  const FLOORPLAN_STRUCTURE_TYPES = ['columna', 'pared', 'espacio', 'escaleras'];

  function _floorPlanElStyle(el) {
    const isStructure = FLOORPLAN_STRUCTURE_TYPES.includes(el.type);
    // Each structure type gets its own real drafting symbol instead of all looking like the
    // same plain gray box: diagonal hatching for empty space, horizontal step-lines for
    // stairs, plain solid for columns/walls. Tables/chairs/bar stay a tenuous gray at rest,
    // ready to shift color once service state is wired up. Doors render custom SVG elsewhere
    // and never reach this function.
    let bg = 'rgba(255,255,255,0.07)';
    if (el.type === 'espacio') bg = 'repeating-linear-gradient(45deg, #48484A 0px, #48484A 1.5px, transparent 1.5px, transparent 9px)';
    else if (el.type === 'escaleras') bg = 'repeating-linear-gradient(0deg, #48484A 0px, #48484A 1.5px, transparent 1.5px, transparent 8px)';
    else if (isStructure) bg = '#3A3A3C';
    const border = isStructure ? '1px solid #48484A' : '1.5px solid rgba(255,255,255,0.18)';
    const radius = el.shape === 'circle' ? '50%' : (el.shape === 'square' || el.shape === 'rect') ? '6px' : '2px';
    return `position:absolute;left:${el.x}%;top:${el.y}%;width:${el.w}%;height:${el.h}%;transform:translate(-50%,-50%) rotate(${el.rotation||0}deg);background:${bg};border:${border};border-radius:${radius};display:flex;align-items:center;justify-content:center;box-sizing:border-box;touch-action:none;user-select:none;-webkit-user-select:none`;
  }

  function _FloorPlan() {
    const w = document.createElement('div');
    w.className = 'wt-screen';
    const settings = WTDb.getSettings();
    const currentProfile = settings.workProfile || 'restaurant';
    const allLocs = WTDb.getLocations().filter(l => (l.workProfile || 'restaurant') === currentProfile);
    let locationId = _floorPlanLocationId || (allLocs[0] && allLocs[0].id) || null;
    _floorPlanLocationId = locationId;

    let plan = locationId ? WTDb.getFloorPlan(locationId) : { elements: [] };
    let editMode = false;
    let selectedId = null;
    let undoStack = [];
    let redoStack = [];

    w.innerHTML = `
      <div style="position:fixed;inset:0;background:#141416;z-index:1">
        <div id="wt-fp-canvas" style="position:absolute;inset:0"></div>

        <button class="wt-back" id="wt-back" style="position:absolute;top:14px;left:14px;width:36px;height:36px;border-radius:50%;background:rgba(28,28,30,0.85);border:1px solid rgba(255,255,255,0.1);color:#98989D;display:flex;align-items:center;justify-content:center;font-size:18px;z-index:2">‹</button>

        ${allLocs.length > 1 ? `
        <select id="wt-fp-loc" style="position:absolute;top:14px;left:58px;max-width:calc(100% - 130px);background:rgba(28,28,30,0.85);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#98989D;font-size:12px;font-weight:700;padding:8px 10px;z-index:2">
          ${allLocs.map(l => `<option value="${l.id}" ${l.id === locationId ? 'selected' : ''}>${l.name}</option>`).join('')}
        </select>` : ''}

        <button id="wt-fp-mode" style="position:absolute;top:14px;right:14px;background:${editMode ? '#1C1C1E' : 'rgba(94,92,230,.9)'};border:${editMode ? '1px solid #38383A' : 'none'};border-radius:20px;color:${editMode ? '#98989D' : '#fff'};font-size:13px;font-weight:700;padding:9px 16px;cursor:pointer;transition:transform .1s,background .25s,color .25s;z-index:2" onpointerdown="this.style.transform='scale(.96)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">${editMode ? 'Done' : '✏️ Edit Plan'}</button>

        <div id="wt-fp-history-row" style="position:absolute;top:60px;right:14px;left:14px;display:${editMode ? 'flex' : 'none'};gap:8px;justify-content:flex-end;z-index:2">
          <button id="wt-fp-undo" style="background:rgba(28,28,30,0.85);border:1px solid #38383A;border-radius:10px;color:#636366;font-size:16px;padding:6px 12px;cursor:pointer;transition:transform .1s" onpointerdown="this.style.transform='scale(.9)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">↺</button>
          <button id="wt-fp-redo" style="background:rgba(28,28,30,0.85);border:1px solid #38383A;border-radius:10px;color:#636366;font-size:16px;padding:6px 12px;cursor:pointer;transition:transform .1s" onpointerdown="this.style.transform='scale(.9)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">↻</button>
          <button id="wt-fp-bulk" style="background:rgba(28,28,30,0.85);border:1px solid #38383A;border-radius:10px;color:#98989D;font-size:12px;font-weight:700;padding:6px 12px;cursor:pointer;transition:transform .1s" onpointerdown="this.style.transform='scale(.96)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">+ Multiple</button>
          <button id="wt-fp-clear" style="background:rgba(255,69,58,.15);border:none;border-radius:10px;color:#FF453A;font-size:12px;font-weight:700;padding:6px 12px;cursor:pointer;transition:transform .1s" onpointerdown="this.style.transform='scale(.96)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">Clear All</button>
        </div>

        <div id="wt-fp-toolbar" style="position:absolute;bottom:${editMode ? '90px' : '14px'};left:14px;right:14px;display:none;gap:8px;flex-wrap:wrap;z-index:2"></div>

        <div id="wt-fp-palette" style="position:absolute;bottom:14px;left:14px;right:14px;display:${editMode ? 'flex' : 'none'};gap:8px;overflow-x:auto;z-index:2"></div>

        ${allLocs.length === 0 ? '<div class="wt-empty" style="position:absolute;top:50%;left:14px;right:14px;transform:translateY(-50%);z-index:2"><strong>No locations yet</strong>Add a work location in Settings first.</div>' : ''}
      </div>
    `;
    _root.appendChild(w);

    const canvas = w.querySelector('#wt-fp-canvas');
    const toolbar = w.querySelector('#wt-fp-toolbar');
    const paletteEl = w.querySelector('#wt-fp-palette');
    const historyRow = w.querySelector('#wt-fp-history-row');

    paletteEl.innerHTML = FLOORPLAN_PALETTE.map((p, i) => `
      <button data-palette="${i}" style="flex-shrink:0;background:#1C1C1E;border:1px solid #38383A;border-radius:12px;color:#fff;font-size:11px;font-weight:600;padding:10px 12px;cursor:pointer;white-space:nowrap;transition:transform .1s" onpointerdown="this.style.transform='scale(.94)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">${p.label}</button>
    `).join('');

    function persist() {
      if (locationId) WTDb.saveFloorPlan(locationId, plan);
    }

    // Call before any mutation to plan.elements — captures a snapshot so it can be undone.
    // Any new snapshot invalidates the redo stack (standard undo/redo behavior).
    function snapshotBefore() {
      undoStack.push(JSON.stringify(plan.elements));
      if (undoStack.length > 50) undoStack.shift();
      redoStack = [];
      updateHistoryButtons();
    }

    function updateHistoryButtons() {
      const undoBtn = w.querySelector('#wt-fp-undo');
      const redoBtn = w.querySelector('#wt-fp-redo');
      if (undoBtn) { undoBtn.disabled = undoStack.length === 0; undoBtn.style.opacity = undoStack.length === 0 ? '0.35' : '1'; }
      if (redoBtn) { redoBtn.disabled = redoStack.length === 0; redoBtn.style.opacity = redoStack.length === 0 ? '0.35' : '1'; }
    }

    function boxesOverlap(a, b) {
      const aLeft = a.x - a.w / 2, aRight = a.x + a.w / 2, aTop = a.y - a.h / 2, aBottom = a.y + a.h / 2;
      const bLeft = b.x - b.w / 2, bRight = b.x + b.w / 2, bTop = b.y - b.h / 2, bBottom = b.y + b.h / 2;
      return aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;
    }

    // New pieces always try to spawn at the same default spot (center), but if something's
    // already there, spiral outward in 8-percent steps to find the nearest free spot instead
    // of silently stacking on top of the existing piece.
    function findFreeSpot(candidateX, candidateY, w2, h2) {
      const step = 8;
      const trySpots = [{ x: candidateX, y: candidateY }];
      for (let ring = 1; ring < 8; ring++) {
        [[ring, 0], [-ring, 0], [0, ring], [0, -ring], [ring, ring], [-ring, -ring], [ring, -ring], [-ring, ring]]
          .forEach(([dx, dy]) => trySpots.push({ x: candidateX + dx * step, y: candidateY + dy * step }));
      }
      for (const spot of trySpots) {
        const clampedX = Math.max(w2 / 2, Math.min(100 - w2 / 2, spot.x));
        const clampedY = Math.max(h2 / 2, Math.min(100 - h2 / 2, spot.y));
        const candidate = { x: clampedX, y: clampedY, w: w2, h: h2 };
        if (!plan.elements.some(e => boxesOverlap(candidate, e))) return { x: clampedX, y: clampedY };
      }
      return { x: candidateX, y: candidateY };
    }

    // Continues from the highest existing number of that type (e.g. renamed to 21 → next is
    // 22), rather than just counting how many elements exist — so manual renumbering to
    // match a real, non-sequential floor plan doesn't get overridden by later additions.
    function nextNumber(type) {
      const nums = plan.elements.filter(e => e.type === type).map(e => parseInt(e.label, 10)).filter(n => !isNaN(n));
      return nums.length > 0 ? Math.max(...nums) + 1 : 1;
    }

    function renderCanvas() {
      canvas.innerHTML = '';
      plan.elements.forEach(el => {
        const box = document.createElement('div');
        box.dataset.elId = el.id;
        const isDoor = el.type === 'puerta';
        let styleStr = _floorPlanElStyle(el);
        if (isDoor) styleStr += ';background:none;border:none';
        box.style.cssText = styleStr + (selectedId === el.id ? ';outline:2px solid #5E5CE6;outline-offset:2px' : '');

        if (isDoor) {
          const flip = el.flipped ? -1 : 1;
          box.innerHTML = `<svg viewBox="0 0 100 100" style="width:100%;height:100%;overflow:visible;transform:scaleX(${flip});pointer-events:none">
            <line x1="0" y1="100" x2="100" y2="100" stroke="#8E8E93" stroke-width="4"/>
            <line x1="0" y1="100" x2="0" y2="0" stroke="#fff" stroke-width="3"/>
            <path d="M 0 0 A 100 100 0 0 1 100 100" fill="none" stroke="#636366" stroke-width="1.5" stroke-dasharray="4,3"/>
          </svg>`;
        } else if (!FLOORPLAN_STRUCTURE_TYPES.includes(el.type)) {
          const span = document.createElement('span');
          span.textContent = el.label;
          span.style.cssText = `font-size:11px;font-weight:700;color:#fff;text-align:center;padding:2px;transform:rotate(${-(el.rotation||0)}deg)`;
          if (editMode) {
            span.style.cursor = 'text';
            span.onpointerdown = (e) => e.stopPropagation();
            span.onclick = (e) => {
              e.stopPropagation();
              startInlineEdit(box, span, el);
            };
          } else {
            span.style.pointerEvents = 'none';
          }
          box.appendChild(span);
        }
        canvas.appendChild(box);

        if (editMode) {
          wireDrag(box, el);
          if (selectedId === el.id) {
            const handle = document.createElement('div');
            handle.style.cssText = 'position:absolute;right:-8px;bottom:-8px;width:18px;height:18px;border-radius:50%;background:#fff;border:2px solid #5E5CE6;cursor:pointer;touch-action:none';
            box.appendChild(handle);
            wireResize(handle, box, el);
          }
        } else if (!FLOORPLAN_STRUCTURE_TYPES.includes(el.type) && el.type !== 'puerta') {
          box.onclick = () => showTableInfo(el);
        }
      });
    }

    function startInlineEdit(box, span, el) {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = el.label;
      input.style.cssText = 'width:90%;background:#000;border:1px solid #5E5CE6;border-radius:4px;color:#fff;font-size:11px;font-weight:700;text-align:center;padding:1px;outline:none';
      input.onclick = (e) => e.stopPropagation();
      box.replaceChild(input, span);
      input.focus();
      input.select();
      const commit = () => {
        const trimmed = input.value.trim();
        if (trimmed && trimmed !== el.label) { snapshotBefore(); el.label = trimmed; persist(); }
        renderCanvas();
      };
      input.onblur = commit;
      input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); };
    }

    // Recomputes the positions of any chairs still linked to this bar (via parentId), using
    // the same side/index/count metadata stored when they were auto-generated — so moving or
    // resizing the bar carries its seats along instead of leaving them stranded.
    function repositionAttachedSeats(barEl) {
      const canvasRect = canvas.getBoundingClientRect();
      const attached = plan.elements.filter(e => e.parentId === barEl.id);
      const sides = [...new Set(attached.map(e => e.seatSide))];
      sides.forEach(side => {
        const seatsOnSide = attached.filter(e => e.seatSide === side);
        if (!seatsOnSide.length) return;
        const count = seatsOnSide[0].seatCount;
        const positions = computeSeatPositions(canvasRect.width, canvasRect.height, barEl, side, count);
        seatsOnSide.forEach(seat => {
          if (positions[seat.seatIndex]) { seat.x = positions[seat.seatIndex].x; seat.y = positions[seat.seatIndex].y; }
        });
      });
    }

    function getAlignmentSnap(movingEl) {
      const threshold = 1.4;
      let snapX = null, snapY = null;
      plan.elements.forEach(other => {
        if (other.id === movingEl.id) return;
        if (snapX === null && Math.abs(other.x - movingEl.x) < threshold) snapX = other.x;
        if (snapY === null && Math.abs(other.y - movingEl.y) < threshold) snapY = other.y;
      });
      return { snapX, snapY };
    }

    function wireDrag(box, el) {
      box.onpointerdown = (e) => {
        if (e.target !== box && e.target.parentElement !== box) return;
        e.preventDefault();
        selectedId = el.id;
        snapshotBefore();
        if (el.type === 'silla' && el.parentId) delete el.parentId;
        const canvasRect = canvas.getBoundingClientRect();
        const startX = e.clientX, startY = e.clientY;
        const startElX = el.x, startElY = el.y;
        let moved = false;
        const guideV = document.createElement('div');
        guideV.style.cssText = 'position:absolute;top:0;bottom:0;width:1px;background:#FF9F0A;display:none;pointer-events:none;z-index:5';
        const guideH = document.createElement('div');
        guideH.style.cssText = 'position:absolute;left:0;right:0;height:1px;background:#FF9F0A;display:none;pointer-events:none;z-index:5';
        canvas.appendChild(guideV);
        canvas.appendChild(guideH);
        const onMove = (ev) => {
          moved = true;
          const dx = ((ev.clientX - startX) / canvasRect.width) * 100;
          const dy = ((ev.clientY - startY) / canvasRect.height) * 100;
          el.x = Math.max(0, Math.min(100, startElX + dx));
          el.y = Math.max(0, Math.min(100, startElY + dy));
          const { snapX, snapY } = getAlignmentSnap(el);
          if (snapX !== null) { el.x = snapX; guideV.style.left = snapX + '%'; guideV.style.display = 'block'; }
          else { guideV.style.display = 'none'; }
          if (snapY !== null) { el.y = snapY; guideH.style.top = snapY + '%'; guideH.style.display = 'block'; }
          else { guideH.style.display = 'none'; }
          if (el.type === 'barra') {
            repositionAttachedSeats(el);
            renderCanvas();
            canvas.appendChild(guideV);
            canvas.appendChild(guideH);
          }
          else { box.style.left = el.x + '%'; box.style.top = el.y + '%'; }
        };
        const onUp = () => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          guideV.remove();
          guideH.remove();
          if (moved) { persist(); }
          else { undoStack.pop(); }
          renderCanvas();
          renderToolbar();
          updateHistoryButtons();
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      };
    }

    function wireResize(handle, box, el) {
      handle.onpointerdown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        snapshotBefore();
        const canvasRect = canvas.getBoundingClientRect();
        const startX = e.clientX, startY = e.clientY;
        const startW = el.w, startH = el.h;
        // Un-rotate the raw screen-space drag into the element's own local frame — without
        // this, dragging the handle on a rotated piece changes the wrong dimension (e.g. a
        // 90°-rotated element would grow in width when the finger moves vertically), which is
        // exactly the "feels backwards" sensation on anything that isn't at 0°.
        const rad = -(el.rotation || 0) * Math.PI / 180;
        let resized = false;
        const onMove = (ev) => {
          resized = true;
          const dxPx = ev.clientX - startX, dyPx = ev.clientY - startY;
          const dxLocal = dxPx * Math.cos(rad) - dyPx * Math.sin(rad);
          const dyLocal = dxPx * Math.sin(rad) + dyPx * Math.cos(rad);
          const dw = (dxLocal / canvasRect.width) * 100;
          const dh = (dyLocal / canvasRect.height) * 100;
          el.w = Math.max(4, startW + dw * 2);
          el.h = Math.max(4, startH + dh * 2);
          if (el.type === 'barra') { repositionAttachedSeats(el); renderCanvas(); }
          else { box.style.width = el.w + '%'; box.style.height = el.h + '%'; }
        };
        const onUp = () => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          if (resized) { persist(); renderCanvas(); }
          else { undoStack.pop(); }
          updateHistoryButtons();
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      };
    }

    function renderToolbar() {
      const el = plan.elements.find(e => e.id === selectedId);
      if (!editMode || !el) { toolbar.style.display = 'none'; toolbar.innerHTML = ''; return; }
      const isDoor = el.type === 'puerta';
      const isNumbered = !FLOORPLAN_STRUCTURE_TYPES.includes(el.type) && !isDoor;
      toolbar.style.display = 'flex';
      toolbar.innerHTML = `
        <button id="wt-fp-rotate" style="background:#1C1C1E;border:1px solid #38383A;border-radius:10px;color:#fff;font-size:13px;font-weight:600;padding:8px 12px;cursor:pointer;transition:transform .1s" onpointerdown="this.style.transform='scale(.96)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">↻ Rotate 45°</button>
        <button id="wt-fp-duplicate" style="background:#1C1C1E;border:1px solid #38383A;border-radius:10px;color:#fff;font-size:13px;font-weight:600;padding:8px 12px;cursor:pointer;transition:transform .1s" onpointerdown="this.style.transform='scale(.96)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">⧉ Duplicate</button>
        ${isNumbered ? '<button id="wt-fp-rename" style="background:#1C1C1E;border:1px solid #38383A;border-radius:10px;color:#fff;font-size:13px;font-weight:600;padding:8px 12px;cursor:pointer;transition:transform .1s" onpointerdown="this.style.transform=\'scale(.96)\'" onpointerup="this.style.transform=\'scale(1)\'" onpointerleave="this.style.transform=\'scale(1)\'">✏️ Rename</button>' : ''}
        ${isDoor ? '<button id="wt-fp-mirror" style="background:#1C1C1E;border:1px solid #38383A;border-radius:10px;color:#fff;font-size:13px;font-weight:600;padding:8px 12px;cursor:pointer;transition:transform .1s" onpointerdown="this.style.transform=\'scale(.96)\'" onpointerup="this.style.transform=\'scale(1)\'" onpointerleave="this.style.transform=\'scale(1)\'">⇄ Mirror</button>' : ''}
        <button id="wt-fp-delete" style="background:rgba(255,69,58,.12);border:none;border-radius:10px;color:#FF453A;font-size:13px;font-weight:600;padding:8px 12px;cursor:pointer;transition:transform .1s" onpointerdown="this.style.transform='scale(.96)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">Delete</button>
      `;
      toolbar.querySelector('#wt-fp-rotate').onclick = () => {
        snapshotBefore();
        el.rotation = ((el.rotation || 0) + 45) % 360;
        persist();
        renderCanvas();
      };
      toolbar.querySelector('#wt-fp-duplicate').onclick = () => {
        snapshotBefore();
        const needsFreeSpot = el.type === 'mesa' || el.type === 'silla' || el.type === 'barra';
        const spot = needsFreeSpot ? findFreeSpot(el.x, el.y, el.w, el.h) : { x: Math.min(96, el.x + 6), y: Math.min(96, el.y + 6) };
        const newEl = { ...el, id: 'fp_' + Math.random().toString(36).slice(2, 10), x: spot.x, y: spot.y };
        delete newEl.parentId; delete newEl.seatSide; delete newEl.seatIndex; delete newEl.seatCount;
        if (!FLOORPLAN_STRUCTURE_TYPES.includes(el.type) && el.type !== 'puerta') newEl.label = String(nextNumber(el.type));
        plan.elements.push(newEl);
        selectedId = newEl.id;
        persist();
        renderCanvas();
        renderToolbar();
      };
      const renameBtn = toolbar.querySelector('#wt-fp-rename');
      if (renameBtn) renameBtn.onclick = () => {
        const box = canvas.querySelector(`[data-el-id="${el.id}"]`);
        const span = box && box.querySelector('span');
        if (box && span) startInlineEdit(box, span, el);
      };
      const mirrorBtn = toolbar.querySelector('#wt-fp-mirror');
      if (mirrorBtn) mirrorBtn.onclick = () => {
        snapshotBefore();
        el.flipped = !el.flipped;
        persist();
        renderCanvas();
      };
      toolbar.querySelector('#wt-fp-delete').onclick = () => {
        if (!confirm(`Remove this piece from the plan?`)) return;
        snapshotBefore();
        plan.elements = plan.elements.filter(e => e.id !== el.id && e.parentId !== el.id);
        selectedId = null;
        persist();
        renderCanvas();
        renderToolbar();
      };
    }

    function showTableInfo(el) {
      alert(`${el.label}\n\nOrder tracking isn't set up yet — coming in a future update.`);
    }

    canvas.onclick = (e) => {
      if (!editMode) return;
      if (e.target === canvas) {
        selectedId = null;
        renderCanvas();
        renderToolbar();
      }
    };

    function computeSeatPositions(canvasW, canvasH, el, side, count) {
      const cxPx = (el.x / 100) * canvasW;
      const cyPx = (el.y / 100) * canvasH;
      const wPx = (el.w / 100) * canvasW;
      const hPx = (el.h / 100) * canvasH;
      const seatOffsetPx = 18;
      const rad = (el.rotation || 0) * Math.PI / 180;
      const positions = [];
      for (let i = 0; i < count; i++) {
        let xLocal, yLocal;
        if (side === 'top' || side === 'bottom') {
          xLocal = -wPx / 2 + wPx * (i + 0.5) / count;
          yLocal = side === 'top' ? -hPx / 2 - seatOffsetPx : hPx / 2 + seatOffsetPx;
        } else {
          yLocal = -hPx / 2 + hPx * (i + 0.5) / count;
          xLocal = side === 'left' ? -wPx / 2 - seatOffsetPx : wPx / 2 + seatOffsetPx;
        }
        const xRot = xLocal * Math.cos(rad) - yLocal * Math.sin(rad);
        const yRot = xLocal * Math.sin(rad) + yLocal * Math.cos(rad);
        positions.push({ x: ((cxPx + xRot) / canvasW) * 100, y: ((cyPx + yRot) / canvasH) * 100 });
      }
      return positions;
    }

    function generateSeatsForBar(barEl) {
      const ov = document.createElement('div');
      ov.className = 'wt-overlay';
      const sideBtnStyle = 'background:#1C1C1E;border:1px solid #38383A;border-radius:10px;color:#fff;font-size:13px;font-weight:600;padding:12px;cursor:pointer;transition:transform .1s';
      const pressAttrs = `onpointerdown="this.style.transform='scale(.96)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'"`;
      ov.innerHTML = `
        <div class="wt-modal">
          <div class="wt-modal-handle"></div>
          <div class="wt-modal-title">Add seats to this bar?</div>
          <div style="font-size:13px;color:#636366;margin-bottom:14px">Choose up to 2 sides — most bars only have seating on one or two.</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
            <button data-side="top" class="wt-fp-side-btn" style="${sideBtnStyle}" ${pressAttrs}>Top</button>
            <button data-side="bottom" class="wt-fp-side-btn" style="${sideBtnStyle}" ${pressAttrs}>Bottom</button>
            <button data-side="left" class="wt-fp-side-btn" style="${sideBtnStyle}" ${pressAttrs}>Left</button>
            <button data-side="right" class="wt-fp-side-btn" style="${sideBtnStyle}" ${pressAttrs}>Right</button>
          </div>
          <button class="wt-btn wt-btn-primary" id="wt-fp-seats-continue">Continue</button>
          <button class="wt-btn wt-btn-secondary" id="wt-fp-seats-skip" style="margin-top:8px">No seats for now</button>
        </div>`;
      document.body.appendChild(ov);
      const selected = new Set();
      ov.querySelectorAll('.wt-fp-side-btn').forEach(btn => {
        btn.onclick = () => {
          const side = btn.dataset.side;
          if (selected.has(side)) {
            selected.delete(side);
            btn.style.background = '#1C1C1E'; btn.style.color = '#fff'; btn.style.borderColor = '#38383A';
          } else {
            if (selected.size >= 2) return;
            selected.add(side);
            btn.style.background = 'rgba(94,92,230,.2)'; btn.style.color = '#5E5CE6'; btn.style.borderColor = '#5E5CE6';
          }
        };
      });
      ov.querySelector('#wt-fp-seats-skip').onclick = () => ov.remove();
      ov.querySelector('#wt-fp-seats-continue').onclick = () => {
        ov.remove();
        if (selected.size === 0) return;
        const canvasRect = canvas.getBoundingClientRect();
        const counts = [];
        selected.forEach(side => {
          const n = parseInt(prompt(`How many seats on the ${side}?`, '4'), 10);
          if (n > 0) counts.push({ side, count: n });
        });
        if (!counts.length) return;
        snapshotBefore();
        counts.forEach(({ side, count }) => {
          computeSeatPositions(canvasRect.width, canvasRect.height, barEl, side, count).forEach((pos, i) => {
            plan.elements.push({
              id: 'fp_' + Math.random().toString(36).slice(2, 10),
              type: 'silla', shape: 'circle',
              label: String(nextNumber('silla')),
              x: pos.x, y: pos.y, w: 5.5, h: 5.5, rotation: 0,
              parentId: barEl.id, seatSide: side, seatIndex: i, seatCount: count
            });
          });
        });
        persist();
        renderCanvas();
      };
    }

    paletteEl.querySelectorAll('[data-palette]').forEach(btn => {
      btn.onclick = () => {
        const tpl = FLOORPLAN_PALETTE[parseInt(btn.dataset.palette)];
        snapshotBefore();
        const needsFreeSpot = tpl.type === 'mesa' || tpl.type === 'silla' || tpl.type === 'barra';
        const spot = needsFreeSpot ? findFreeSpot(50, 50, tpl.w, tpl.h) : { x: 50, y: 50 };
        const newEl = {
          id: 'fp_' + Math.random().toString(36).slice(2, 10),
          type: tpl.type, shape: tpl.shape,
          label: tpl.numbered ? String(nextNumber(tpl.type)) : `${tpl.label} ${plan.elements.filter(e => e.type === tpl.type).length + 1}`,
          x: spot.x, y: spot.y, w: tpl.w, h: tpl.h, rotation: 0
        };
        plan.elements.push(newEl);
        selectedId = newEl.id;
        persist();
        renderCanvas();
        renderToolbar();
        if (tpl.type === 'barra') generateSeatsForBar(newEl);
      };
    });

    w.querySelector('#wt-fp-mode').onclick = () => {
      const wasEditing = editMode;
      editMode = !editMode;
      selectedId = null;
      paletteEl.style.display = editMode ? 'flex' : 'none';
      historyRow.style.display = editMode ? 'flex' : 'none';
      toolbar.style.bottom = editMode ? '90px' : '14px';
      const modeBtn = w.querySelector('#wt-fp-mode');
      if (wasEditing) {
        modeBtn.textContent = '✓ Saved';
        modeBtn.style.background = 'rgba(48,209,88,.15)';
        modeBtn.style.border = 'none';
        modeBtn.style.color = '#30D158';
        setTimeout(() => {
          modeBtn.textContent = '✏️ Edit Plan';
          modeBtn.style.background = 'rgba(94,92,230,.15)';
          modeBtn.style.color = '#5E5CE6';
        }, 700);
      } else {
        modeBtn.textContent = 'Done';
        modeBtn.style.background = '#1C1C1E';
        modeBtn.style.border = '1px solid #38383A';
        modeBtn.style.color = '#98989D';
      }
      renderCanvas();
      renderToolbar();
      updateHistoryButtons();
    };

    w.querySelector('#wt-fp-undo').onclick = () => {
      if (!undoStack.length) return;
      redoStack.push(JSON.stringify(plan.elements));
      plan.elements = JSON.parse(undoStack.pop());
      selectedId = null;
      persist();
      renderCanvas();
      renderToolbar();
      updateHistoryButtons();
    };
    w.querySelector('#wt-fp-redo').onclick = () => {
      if (!redoStack.length) return;
      undoStack.push(JSON.stringify(plan.elements));
      plan.elements = JSON.parse(redoStack.pop());
      selectedId = null;
      persist();
      renderCanvas();
      renderToolbar();
      updateHistoryButtons();
    };
    w.querySelector('#wt-fp-clear').onclick = () => {
      if (!plan.elements.length) return;
      if (!confirm('Remove every piece from this floor plan? This clears the whole layout, not just one item.')) return;
      snapshotBefore();
      plan.elements = [];
      selectedId = null;
      persist();
      renderCanvas();
      renderToolbar();
    };

    w.querySelector('#wt-fp-bulk').onclick = () => {
      const ov = document.createElement('div');
      ov.className = 'wt-overlay';
      ov.innerHTML = `
        <div class="wt-modal">
          <div class="wt-modal-handle"></div>
          <div class="wt-modal-title">Add multiple</div>
          <div style="font-size:13px;color:#636366;margin-bottom:14px">Pick a shape first, then how many.</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${FLOORPLAN_PALETTE.map((p, i) => `<button data-bulk-type="${i}" style="background:#1C1C1E;border:1px solid #38383A;border-radius:10px;color:#fff;font-size:12px;font-weight:600;padding:10px 12px;cursor:pointer;transition:transform .1s" onpointerdown="this.style.transform='scale(.96)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">${p.label}</button>`).join('')}
          </div>
        </div>`;
      document.body.appendChild(ov);
      ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
      ov.querySelectorAll('[data-bulk-type]').forEach(btn => {
        btn.onclick = () => {
          ov.remove();
          const tpl = FLOORPLAN_PALETTE[parseInt(btn.dataset.bulkType)];
          const count = parseInt(prompt(`How many ${tpl.label.toLowerCase()}?`, '4'), 10);
          if (!count || count < 1) return;
          showBulkSizeStep(tpl, count);
        };
      });
    };

    function showBulkSizeStep(tpl, count) {
      let sizeW = tpl.w, sizeH = tpl.h;
      const ov = document.createElement('div');
      ov.className = 'wt-overlay';
      document.body.appendChild(ov);
      const radius = tpl.shape === 'circle' ? '50%' : (tpl.shape === 'square' || tpl.shape === 'rect') ? '18%' : '6%';
      function paint() {
        const previewPx = Math.round(sizeW * 3);
        const previewPxH = Math.round(sizeH * 3);
        ov.innerHTML = `
          <div class="wt-modal">
            <div class="wt-modal-handle"></div>
            <div class="wt-modal-title">Size for ${count} ${tpl.label.toLowerCase()}</div>
            <div style="display:flex;align-items:center;justify-content:center;padding:24px 0;min-height:100px">
              <div style="width:${previewPx}px;height:${previewPxH}px;background:rgba(255,255,255,0.08);border:1.5px solid rgba(255,255,255,0.25);border-radius:${radius}"></div>
            </div>
            <div style="display:flex;align-items:center;justify-content:center;gap:0;background:#1C1C1E;border-radius:14px;overflow:hidden;border:1px solid #38383A;margin:0 auto 16px;width:160px">
              <button id="wt-bulk-size-minus" style="width:48px;height:48px;background:none;border:none;color:#98989D;font-size:24px;cursor:pointer;transition:transform .1s" onpointerdown="this.style.transform='scale(.9)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">−</button>
              <span style="flex:1;text-align:center;color:#fff;font-weight:700;font-size:15px">${sizeW.toFixed(1)}%</span>
              <button id="wt-bulk-size-plus" style="width:48px;height:48px;background:none;border:none;color:#98989D;font-size:20px;cursor:pointer;transition:transform .1s" onpointerdown="this.style.transform='scale(.9)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">+</button>
            </div>
            <button class="wt-btn wt-btn-primary" id="wt-bulk-create" style="width:100%">Create ${count}</button>
          </div>`;
        ov.querySelector('#wt-bulk-size-minus').onclick = () => { sizeW = Math.max(3, sizeW - 1); sizeH = Math.max(3, sizeH - (tpl.h / tpl.w)); paint(); };
        ov.querySelector('#wt-bulk-size-plus').onclick = () => { sizeW = sizeW + 1; sizeH = sizeH + (tpl.h / tpl.w); paint(); };
        ov.querySelector('#wt-bulk-create').onclick = () => {
          ov.remove();
          const needsFreeSpot = tpl.type === 'mesa' || tpl.type === 'silla' || tpl.type === 'barra';
          snapshotBefore();
          let lastId = null;
          for (let i = 0; i < count; i++) {
            const spot = needsFreeSpot ? findFreeSpot(50, 50, sizeW, sizeH) : { x: 50, y: 50 };
            const newEl = {
              id: 'fp_' + Math.random().toString(36).slice(2, 10),
              type: tpl.type, shape: tpl.shape,
              label: tpl.numbered ? String(nextNumber(tpl.type)) : `${tpl.label} ${plan.elements.filter(e => e.type === tpl.type).length + 1}`,
              x: spot.x, y: spot.y, w: sizeW, h: sizeH, rotation: 0
            };
            plan.elements.push(newEl);
            lastId = newEl.id;
          }
          selectedId = lastId;
          persist();
          renderCanvas();
          renderToolbar();
        };
      }
      ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
      paint();
    }

    const locSel = w.querySelector('#wt-fp-loc');
    if (locSel) {
      locSel.onchange = () => {
        _floorPlanLocationId = locSel.value;
        _go('floorplan');
      };
    }

    w.querySelector('#wt-back').onclick = () => _go('home');
    updateHistoryButtons();
    renderCanvas();
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
        <div class="wt-settings-header" data-accordion-header="profile">
          <div class="wt-settings-title" style="margin-bottom:0">Work Profile & Pay Rules</div>
          <span class="wt-settings-chevron" data-accordion-chevron="profile">▼</span>
        </div>
        <div class="wt-settings-body" data-accordion-body="profile" style="margin-top:14px">
        <div class="wt-setting-row">
          <label>Work Profile</label>
          <select class="wt-select-sm ${!settings.workProfile ? 'wt-glow' : ''}" id="wt-work-profile-top">
            <option value="" ${!settings.workProfile ? 'selected' : ''}>Not set</option>
            ${Object.entries(WORK_PROFILES).map(([key, p]) =>
              `<option value="${key}" ${settings.workProfile===key?'selected':''}>${p.label}</option>`
            ).join('')}
          </select>
        </div>
        <p class="wt-note" id="wt-profile-note-top" style="margin-bottom:8px">
          ${(() => {
            if (!settings.workProfile) return 'Choose a profile to see suggested shifts and rate.';
            const p = WORK_PROFILES[settings.workProfile] || WORK_PROFILES.restaurant;
            return p.shifts.length > 0
              ? `Shifts: ${p.shifts.slice(0,3).join(', ')}… · Suggested rate: $${p.suggestedRate}/hr`
              : 'Define your own shift names.';
          })()}
        </p>
        <div class="wt-setting-row">
          <label>Pay Period</label>
          <select class="wt-select-sm ${!settings.payPeriod ? 'wt-glow' : ''}" id="wt-pay-period-top">
            <option value="" ${!settings.payPeriod ? 'selected' : ''}>Not set</option>
            <option value="weekly" ${settings.payPeriod==='weekly'?'selected':''}>Weekly</option>
            <option value="event" ${settings.payPeriod==='event'?'selected':''}>Per Event</option>
            <option value="biweekly" ${settings.payPeriod==='biweekly'?'selected':''}>Bi-Weekly</option>
          </select>
        </div>
        <div class="wt-setting-row">
          <label>Default Pay Day</label>
          <select class="wt-select-sm ${typeof settings.payDayOfWeek === 'undefined' ? 'wt-glow' : ''}" id="wt-pay-day-top">
            <option value="" ${typeof settings.payDayOfWeek === 'undefined' ? 'selected' : ''}>Not set</option>
            ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d,i) =>
              `<option value="${i+1}" ${settings.payDayOfWeek===(i+1)?'selected':''}>${d}</option>`
            ).join('')}
          </select>
        </div>
        <button class="wt-btn wt-btn-primary" style="margin-top:12px;width:100%" id="wt-save-profile-top">Save Profile & Pay Period</button>
        </div>
      </div>
      <div class="wt-settings-block">
        <div class="wt-settings-header" data-accordion-header="locations">
          <div class="wt-settings-title" style="margin-bottom:0">Work Locations</div>
          <span class="wt-settings-chevron" data-accordion-chevron="locations">▼</span>
        </div>
        <div class="wt-settings-body" data-accordion-body="locations" style="margin-top:14px">
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
                <button class="wt-loc-del" data-lid="${l.id}" style="z-index:2" onpointerdown="this.style.transform='rotate(90deg)'" onpointerup="this.style.transform='rotate(0deg)'" onpointerleave="this.style.transform='rotate(0deg)'">✕</button>
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
            <label>Calculate Overtime by</label>
            <select class="wt-select-sm wt-glow" id="wt-ot-calcby">
              <option value="" selected>Not set</option>
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
      </div>

      <div class="wt-settings-block" id="wt-data-backup-legacy-block" style="display:none">
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
      <div class="wt-settings-header" data-accordion-header="tips">
        <div class="wt-settings-title" style="margin-bottom:0">Tip Pool Settings</div>
        <span class="wt-settings-chevron" data-accordion-chevron="tips">▼</span>
      </div>
      <div class="wt-settings-body" data-accordion-body="tips" style="margin-top:14px">

      <div style="font-size:11px;font-weight:700;color:#FF9F0A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Processing Fee</div>
      <div class="wt-setting-row">
        <label>Credit card fee % <span style="font-size:11px;color:#636366;font-weight:400">(deducted from CC tips before split)</span></label>
        <div id="wt-tip-fee-pill" class="${typeof tipSettings.processingFeePercent === 'undefined' ? 'wt-glow' : ''}" style="display:flex;align-items:center;gap:0;background:#2C2C2E;border-radius:12px;overflow:hidden;border:1px solid #38383A;width:140px;flex-shrink:0">
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
        <select class="wt-select-sm ${!tipSettings.roundingMode ? 'wt-glow' : ''}" id="wt-tip-rounding">
          <option value="" ${!tipSettings.roundingMode ? 'selected' : ''}>Not set</option>
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
            <button data-pos-del="${i}" style="background:none;border:none;color:#636366;font-size:14px;cursor:pointer;padding:4px 8px;transition:transform .18s ease" onpointerdown="this.style.transform='rotate(90deg)'" onpointerup="this.style.transform='rotate(0deg)'" onpointerleave="this.style.transform='rotate(0deg)'">✕</button>
          </div>`).join('')}
      </div>
      <button class="wt-btn wt-btn-secondary" style="margin-top:10px;width:100%" id="wt-tip-add-pos">+ Add Position</button>
      <button class="wt-btn wt-btn-primary" style="margin-top:10px;width:100%" id="wt-tip-save">Save Tip Settings</button>
      </div>`;
    w.appendChild(tipBlock);

    // Fee stepper
    tipBlock.querySelector('#wt-tip-rounding')?.addEventListener('change', function() {
      this.classList.toggle('wt-glow', this.value === '');
    });

    tipBlock.querySelector('#wt-tip-fee-minus').onclick = () => {
      const i = tipBlock.querySelector('#wt-tip-fee');
      i.value = Math.max(0, (parseFloat(i.value)||3) - 0.25).toFixed(2);
      tipBlock.querySelector('#wt-tip-fee-pill').classList.remove('wt-glow');
    };
    tipBlock.querySelector('#wt-tip-fee-plus').onclick = () => {
      const i = tipBlock.querySelector('#wt-tip-fee');
      i.value = ((parseFloat(i.value)||3) + 0.25).toFixed(2);
      tipBlock.querySelector('#wt-tip-fee-pill').classList.remove('wt-glow');
    };
    tipBlock.querySelector('#wt-tip-fee').addEventListener('input', function() {
      tipBlock.querySelector('#wt-tip-fee-pill').classList.remove('wt-glow');
    });

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
      openAccordionSection('tax');
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
      <div class="wt-settings-header" data-accordion-header="tax">
        <div class="wt-settings-title" style="margin-bottom:0">Tax Estimate (${new Date().getFullYear()})</div>
        <span class="wt-settings-chevron" data-accordion-chevron="tax">▼</span>
      </div>
      <div class="wt-settings-body" data-accordion-body="tax" style="margin-top:14px">
      ${(!taxSettings.lastConfirmedYear || taxSettings.lastConfirmedYear < new Date().getFullYear()) ? `
      <div style="background:rgba(255,159,10,.08);border:1px solid rgba(255,159,10,.2);border-radius:12px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#FF9F0A">
        ⚠️ These rates are from ${taxSettings.lastConfirmedYear || 'a while ago'}. Check if they changed for ${new Date().getFullYear()} and save again to confirm.
      </div>` : ''}

      <div style="display:flex;gap:8px;margin:12px 0 16px">
        <button id="wt-tax-mode-detailed" class="wt-btn" style="flex:1;border:1px solid ${taxSettings.mode==='simple'?'#38383A':'#5E5CE6'};background:${taxSettings.mode==='simple'?'none':'rgba(94,92,230,.15)'};color:${taxSettings.mode==='simple'?'#98989D':'#5E5CE6'}">Detailed</button>
        <button id="wt-tax-mode-simple" class="wt-btn" style="flex:1;border:1px solid ${taxSettings.mode==='simple'?'#5E5CE6':'#38383A'};background:${taxSettings.mode==='simple'?'rgba(94,92,230,.15)':'none'};color:${taxSettings.mode==='simple'?'#5E5CE6':'#98989D'}">Simple %</button>
      </div>

      <div id="wt-tax-simple" style="${taxSettings.mode==='simple'?'':'display:none'}">
        <div style="font-size:12px;color:#636366;margin-bottom:8px">A single percentage deducted from gross pay.</div>
        <div class="wt-setting-row">
          <label>Estimated tax %</label>
          <div style="display:flex;align-items:center;background:#2C2C2E;border:1px solid #38383A;border-radius:10px;overflow:hidden">
            <button id="wt-tax-simple-minus" style="background:none;border:none;color:#5E5CE6;padding:8px 12px;font-size:18px;cursor:pointer">−</button>
            <input type="text" inputmode="decimal" id="wt-tax-simple-pct" value="${taxSettings.simplePercent||25}" style="width:40px;background:none;border:none;color:#fff;font-weight:700;text-align:center;font-size:16px;outline:none" onclick="this.select()" onfocus="this.select()">
            <button id="wt-tax-simple-plus" style="background:none;border:none;color:#5E5CE6;padding:8px 12px;font-size:18px;cursor:pointer">+</button>
          </div>
        </div>
      </div>

      <div id="wt-tax-detailed" style="${taxSettings.mode==='simple'?'display:none':''}">
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
      </div>

      <div style="font-size:11px;font-weight:700;color:#636366;text-transform:uppercase;letter-spacing:.5px;margin:16px 0 8px">Display</div>
      <div class="wt-setting-row">
        <label>Show net estimate in breakdown</label>
        <input type="checkbox" id="wt-tax-show" style="width:18px;height:18px;accent-color:#5E5CE6" ${taxSettings.showEstimate?'checked':''}>
      </div>
      <div style="font-size:11px;color:#636366;margin-top:8px;line-height:1.5">Estimate only — not tax advice. All rates are editable. Does not account for filing status, dependents, or multi-state situations. Update rates each year as laws change.</div>
      <button class="wt-btn wt-btn-primary" style="margin-top:14px;width:100%" id="wt-tax-save">Save Tax Settings</button>
      </div>`;
    w.appendChild(taxBlock);

    const backupBlock = document.createElement('div');
    backupBlock.className = 'wt-settings-block';
    backupBlock.innerHTML = `
      <div class="wt-settings-header" data-standalone-header="backup">
        <div class="wt-settings-title" style="margin-bottom:0">Backup & Restore</div>
        <span class="wt-settings-chevron" data-standalone-chevron="backup">▼</span>
      </div>
      <div class="wt-settings-body" data-standalone-body="backup" style="display:none;margin-top:14px">
      <div style="font-size:12px;color:#636366;margin-bottom:12px;line-height:1.5">Export all your shifts, tips, locations, and payment records to a file. Use it to move your data to a new device or a newly installed app, or just to keep a safe copy.</div>
      <div id="wt-last-backup" style="font-size:12px;font-weight:700;margin-bottom:12px"></div>
      <button class="wt-btn wt-btn-primary" style="width:100%;margin-bottom:10px" id="wt-backup-export">⬇️ Export All Data</button>
      <button class="wt-btn wt-btn-secondary" style="width:100%;margin-bottom:10px" id="wt-backup-import">⬆️ Import from Backup</button>
      <input type="file" id="wt-backup-file" accept="application/json" style="display:none">
      <button class="wt-btn wt-btn-secondary" style="width:100%" id="wt-clean-orphans">🧹 Clean Up Old Data</button>
      <div style="font-size:11px;color:#636366;margin-top:8px;line-height:1.5">Photos aren't included — they're already saved to your phone's photo gallery separately.<br>"Clean Up" removes tip records left behind by deleted shifts. It never touches a shift that still exists.</div>
      </div>
    `;
    w.appendChild(backupBlock);

    const budget = WTDb.getBudget();
    const sustainBlock = document.createElement('div');
    sustainBlock.className = 'wt-settings-block';
    sustainBlock.innerHTML = `
      <div class="wt-settings-header" data-standalone-header="sustain">
        <div class="wt-settings-title" style="margin-bottom:0">Sustainability</div>
        <span class="wt-settings-chevron" data-standalone-chevron="sustain">▼</span>
      </div>
      <div class="wt-settings-body" data-standalone-body="sustain" style="display:none;margin-top:14px">
      <div style="font-size:12px;color:#636366;margin-bottom:12px;line-height:1.5">Does this job actually cover your bills? Enter your real monthly expenses, and Tempo compares them against your real earnings from the last 90 days — no guessing.</div>
      <label class="wt-modal-label">Monthly expenses ($)</label>
      <input id="wt-sustain-expenses" class="wt-input" type="text" inputmode="decimal" placeholder="e.g. 3200" value="${budget.monthlyExpenses || ''}" style="margin-bottom:12px">
      <button class="wt-btn wt-btn-primary" style="width:100%;margin-bottom:14px" id="wt-sustain-save">Calculate</button>
      <div id="wt-sustain-results"></div>
      <div id="wt-sustain-view-stats" class="wt-tap-fade" style="text-align:center;font-size:12px;color:#5E5CE6;font-weight:700;margin-top:12px;cursor:pointer">View full analysis in Stats →</div>
      </div>
    `;
    w.appendChild(sustainBlock);
    sustainBlock.querySelector('#wt-sustain-view-stats').onclick = () => _go('stats');
    sustainBlock.querySelector('[data-standalone-header="sustain"]').onclick = () => {
      const body = sustainBlock.querySelector('[data-standalone-body="sustain"]');
      const chev = sustainBlock.querySelector('[data-standalone-chevron="sustain"]');
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      chev.classList.toggle('open', !isOpen);
      if (!isOpen) renderSustainResults();
    };

    function renderSustainResults() {
      const resultsEl = sustainBlock.querySelector('#wt-sustain-results');
      const currentProfile = WTDb.getSettings().workProfile || 'restaurant';
      const r = StatsRules.sustainabilityAnalysis(currentProfile, 90);
      resultsEl.innerHTML = _sustainabilityResultsHtml(r);
    }

    sustainBlock.querySelector('#wt-sustain-save').onclick = () => {
      const val = parseFloat(sustainBlock.querySelector('#wt-sustain-expenses').value.replace(',', '.'));
      WTDb.saveBudget({ monthlyExpenses: !isNaN(val) && val > 0 ? val : null });
      renderSustainResults();
    };

    const dangerBlock = document.createElement('div');
    dangerBlock.className = 'wt-settings-block';
    dangerBlock.style.border = '1px solid rgba(255,69,58,.3)';
    dangerBlock.innerHTML = `
      <div class="wt-settings-header" data-standalone-header="danger">
        <div class="wt-settings-title" style="margin-bottom:0;color:#FF453A">Danger Zone</div>
        <span class="wt-settings-chevron" data-standalone-chevron="danger">▼</span>
      </div>
      <div class="wt-settings-body" data-standalone-body="danger" style="display:none;margin-top:14px">
      <div style="font-size:12px;color:#636366;margin-bottom:12px;line-height:1.5">Permanently erases every shift, tip, location, payment record, and photo in the Work Tracker on this device. Study Tracker and Tempo are not affected.</div>
      <button class="wt-btn" style="width:100%;background:none;border:1px solid #FF453A;color:#FF453A" id="wt-danger-delete">🗑️ Delete All Work Tracker Data</button>
      </div>
    `;
    w.appendChild(dangerBlock);
    dangerBlock.querySelector('[data-standalone-header="danger"]').onclick = () => {
      const body = dangerBlock.querySelector('[data-standalone-body="danger"]');
      const chev = dangerBlock.querySelector('[data-standalone-chevron="danger"]');
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      chev.classList.toggle('open', !isOpen);
    };
    dangerBlock.querySelector('#wt-danger-delete').onclick = () => {
      const ov = document.createElement('div');
      ov.className = 'wt-overlay';
      ov.innerHTML = `
        <div class="wt-modal">
          <div class="wt-modal-handle"></div>
          <div class="wt-modal-title" style="color:#FF453A">Delete All Work Tracker Data</div>
          <div style="background:#2C2C2E;border-radius:12px;padding:12px 14px;margin-bottom:14px;font-size:13px;color:#98989D;line-height:1.7">
            This permanently deletes:
            <ul style="margin:6px 0 0;padding-left:18px">
              <li>All shifts and clock in/out history, for every work profile</li>
              <li>All tip records and payment history</li>
              <li>All locations, workers, and settings</li>
              <li>All saved proof photos</li>
            </ul>
          </div>
          <div style="color:#FF453A;font-size:13px;margin-bottom:14px;font-weight:600">This cannot be undone. There is no way to recover this data afterward.</div>
          <button class="wt-btn wt-btn-secondary" style="width:100%;margin-bottom:14px" id="wt-danger-backup-first">⬇️ Back Up First</button>
          <label class="wt-modal-label">Type DELETE to confirm</label>
          <input id="wt-danger-confirm-input" class="wt-input" type="text" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="DELETE" style="margin-bottom:14px">
          <div class="wt-modal-actions">
            <button class="wt-btn wt-btn-secondary" id="wt-danger-cancel">Cancel</button>
            <button class="wt-btn" id="wt-danger-confirm" disabled style="background:#3A3A3C;color:#8E8E93">Delete Everything</button>
          </div>
        </div>`;
      document.body.appendChild(ov);
      ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
      const confirmInput = ov.querySelector('#wt-danger-confirm-input');
      const confirmBtn = ov.querySelector('#wt-danger-confirm');
      confirmInput.addEventListener('input', () => {
        const match = confirmInput.value.trim() === 'DELETE';
        confirmBtn.disabled = !match;
        confirmBtn.style.background = match ? '#FF453A' : '#3A3A3C';
        confirmBtn.style.color = match ? '#fff' : '#8E8E93';
      });
      ov.querySelector('#wt-danger-backup-first').onclick = async () => {
        const blob = new Blob([WTDb.exportData()], { type: 'application/json' });
        const result = await _saveOrShareBlob(blob, `tempo-backup-${_today()}.json`);
        if (result !== 'cancelled') {
          WTDb.setLastBackupDate(new Date().toISOString());
        }
      };
      ov.querySelector('#wt-danger-cancel').onclick = () => ov.remove();
      confirmBtn.onclick = async () => {
        if (confirmInput.value.trim() !== 'DELETE') return;
        await WTDb.deleteAllData();
        ov.remove();
        alert('All Work Tracker data has been deleted.');
        location.reload();
      };
    };
    function updateLastBackupLabel() {
      const el = backupBlock.querySelector('#wt-last-backup');
      const iso = WTDb.getLastBackupDate();
      if (!iso) { el.textContent = '⚠️ Never backed up'; el.style.color = '#FF9F0A'; return; }
      const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
      if (days <= 0) { el.textContent = '✓ Backed up today'; el.style.color = '#30D158'; }
      else if (days === 1) { el.textContent = '✓ Backed up yesterday'; el.style.color = '#30D158'; }
      else if (days < 14) { el.textContent = `✓ Backed up ${days} days ago`; el.style.color = '#30D158'; }
      else { el.textContent = `⚠️ Last backup was ${days} days ago`; el.style.color = '#FF9F0A'; }
    }
    updateLastBackupLabel();
    backupBlock.querySelector('[data-standalone-header="backup"]').onclick = () => {
      const body = backupBlock.querySelector('[data-standalone-body="backup"]');
      const chev = backupBlock.querySelector('[data-standalone-chevron="backup"]');
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      chev.classList.toggle('open', !isOpen);
    };

    backupBlock.querySelector('#wt-backup-export').onclick = async () => {
      const blob = new Blob([WTDb.exportData()], { type: 'application/json' });
      const result = await _saveOrShareBlob(blob, `tempo-backup-${_today()}.json`);
      if (result !== 'cancelled') {
        WTDb.setLastBackupDate(new Date().toISOString());
        updateLastBackupLabel();
      }
    };

    backupBlock.querySelector('#wt-backup-import').onclick = () => {
      backupBlock.querySelector('#wt-backup-file').click();
    };

    backupBlock.querySelector('#wt-clean-orphans').onclick = () => {
      const removed = WTDb.cleanOrphanedTips();
      alert(removed > 0 ? `Cleaned up ${removed} leftover tip record${removed !== 1 ? 's' : ''} from deleted shifts.` : 'Nothing to clean up — no leftover data found.');
    };

    backupBlock.querySelector('#wt-backup-file').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let parsed;
        try { parsed = JSON.parse(reader.result); } catch { alert("Could not read this file. Make sure it's a valid Tempo backup JSON."); e.target.value = ''; return; }
        if (!parsed || !parsed.data) { alert("Could not read this file. Make sure it's a valid Tempo backup JSON."); e.target.value = ''; return; }

        let shiftCount = 0, dateRange = '';
        try {
          const shifts = JSON.parse(parsed.data.wt_shifts_v1 || '[]');
          shiftCount = shifts.length;
          if (shifts.length) {
            const dates = shifts.map(s => s.date).sort();
            dateRange = ` (${dates[0]} to ${dates[dates.length - 1]})`;
          }
        } catch {}
        const exportedDate = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'unknown date';
        const versionMismatch = parsed.version && parsed.version !== WT_VERSION;

        const ov = document.createElement('div');
        ov.className = 'wt-overlay';
        ov.innerHTML = `
          <div class="wt-modal">
            <div class="wt-modal-handle"></div>
            <div class="wt-modal-title">Confirm Restore</div>
            <div style="background:#2C2C2E;border-radius:12px;padding:12px 14px;margin-bottom:14px;font-size:13px;color:#98989D;line-height:1.7">
              <div><strong style="color:#fff">Backup from:</strong> ${exportedDate}</div>
              <div><strong style="color:#fff">Contains:</strong> ${shiftCount} shift${shiftCount !== 1 ? 's' : ''}${dateRange}</div>
            </div>
            ${versionMismatch ? `<div style="background:rgba(255,149,0,.15);border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#FF9F0A">⚠️ This backup is from a different app version (v${parsed.version} vs current v${WT_VERSION}). It should still work, but double-check your data after restoring.</div>` : ''}
            <div style="color:#FF453A;font-size:13px;margin-bottom:18px;font-weight:600">This replaces everything currently on this device. Cannot be undone.</div>
            <div class="wt-modal-actions">
              <button class="wt-btn wt-btn-secondary" id="wt-restore-cancel">Cancel</button>
              <button class="wt-btn wt-btn-primary" id="wt-restore-confirm" style="background:#FF453A">Replace Everything</button>
            </div>
          </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', ev => { if (ev.target === ov) ov.remove(); });
        ov.querySelector('#wt-restore-cancel').onclick = () => ov.remove();
        ov.querySelector('#wt-restore-confirm').onclick = () => {
          const ok = WTDb.importData(reader.result);
          ov.remove();
          if (!ok) { alert("Could not read this file. Make sure it's a valid Tempo backup JSON."); return; }
          alert('Backup restored. Reloading...');
          location.reload();
        };
      };
      reader.readAsText(file);
      e.target.value = '';
    };

    let currentTaxMode = taxSettings.mode || 'detailed';
    const btnDet = taxBlock.querySelector('#wt-tax-mode-detailed');
    const btnSim = taxBlock.querySelector('#wt-tax-mode-simple');
    const divDet = taxBlock.querySelector('#wt-tax-detailed');
    const divSim = taxBlock.querySelector('#wt-tax-simple');

    const updateTaxModeUI = () => {
      btnDet.style.borderColor = currentTaxMode === 'detailed' ? '#5E5CE6' : '#38383A';
      btnDet.style.background  = currentTaxMode === 'detailed' ? 'rgba(94,92,230,.15)' : 'none';
      btnDet.style.color       = currentTaxMode === 'detailed' ? '#5E5CE6' : '#98989D';
      btnSim.style.borderColor = currentTaxMode === 'simple'   ? '#5E5CE6' : '#38383A';
      btnSim.style.background  = currentTaxMode === 'simple'   ? 'rgba(94,92,230,.15)' : 'none';
      btnSim.style.color       = currentTaxMode === 'simple'   ? '#5E5CE6' : '#98989D';
      divDet.style.display     = currentTaxMode === 'detailed' ? 'block' : 'none';
      divSim.style.display     = currentTaxMode === 'simple'   ? 'block' : 'none';
    };

    btnDet.onclick = () => { currentTaxMode = 'detailed'; updateTaxModeUI(); };
    btnSim.onclick = () => { currentTaxMode = 'simple';   updateTaxModeUI(); };

    const inpSim = taxBlock.querySelector('#wt-tax-simple-pct');
    taxBlock.querySelector('#wt-tax-simple-minus').onclick = () => { inpSim.value = Math.max(0, parseFloat(inpSim.value) - 1); };
    taxBlock.querySelector('#wt-tax-simple-plus').onclick = () => { inpSim.value = parseFloat(inpSim.value) + 1; };

    taxBlock.querySelector('#wt-tax-profile').onchange = function() {
      const p = DEFAULT_TAX_PROFILES[this.value];
      if (!p) return;
      taxBlock.querySelector('#wt-tax-state').value       = p.state;
      taxBlock.querySelector('#wt-tax-local').value       = p.local;
      taxBlock.querySelector('#wt-tax-pfl').value         = p.pfl;
      taxBlock.querySelector('#wt-tax-other-label').value = p.otherLabel||'';
      taxBlock.querySelector('#wt-tax-other').value       = p.other||0;
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
        mode:           currentTaxMode,
        simplePercent:  parseFloat(taxBlock.querySelector('#wt-tax-simple-pct').value) || 0,
        profile:        taxBlock.querySelector('#wt-tax-profile').value,
        federal:        parseFloat(taxBlock.querySelector('#wt-tax-fed').value)         || 0,
        socialSecurity: parseFloat(taxBlock.querySelector('#wt-tax-ss').value)          || 0,
        medicare:       parseFloat(taxBlock.querySelector('#wt-tax-med').value)         || 0,
        state:          parseFloat(taxBlock.querySelector('#wt-tax-state').value)       || 0,
        local:          parseFloat(taxBlock.querySelector('#wt-tax-local').value)       || 0,
        pfl:            parseFloat(taxBlock.querySelector('#wt-tax-pfl').value)         || 0,
        otherLabel:     taxBlock.querySelector('#wt-tax-other-label').value.trim(),
        other:          parseFloat(taxBlock.querySelector('#wt-tax-other').value)       || 0,
        showEstimate:   taxBlock.querySelector('#wt-tax-show').checked,
        lastConfirmedYear: new Date().getFullYear()
      });
      alert('Tax settings saved.');
      openAccordionSection(null);
    };

    taxBlock.querySelectorAll('input').forEach(i => {
      i.addEventListener('focus', () => i.select && i.select());
      i.addEventListener('click', () => i.select && i.select());
    });

    _root.appendChild(w);
    w.querySelector('#wt-back').onclick = () => _go('home');
    const saveProfileTop = w.querySelector('#wt-save-profile-top');
    if (saveProfileTop) {
      saveProfileTop.onclick = () => {
        const newProfile = w.querySelector('#wt-work-profile-top').value;
        const newPayPeriod = w.querySelector('#wt-pay-period-top').value;
        const s = WTDb.getSettings();
        s.workProfile = newProfile;
        s.payPeriod = newPayPeriod;
        s.payDayOfWeek = parseInt(w.querySelector('#wt-pay-day-top').value) || 5;
        WTDb.saveSettings(s);
        _settingsOpenSection = 'locations';
        _go('settings');
      };
      w.querySelector('#wt-work-profile-top').onchange = function() {
        this.classList.toggle('wt-glow', this.value === '');
        if (this.value === '') {
          const note = w.querySelector('#wt-profile-note-top');
          if (note) note.textContent = 'Choose a profile to see suggested shifts and rate.';
          return;
        }
        const p = WORK_PROFILES[this.value] || WORK_PROFILES.restaurant;
        const note = w.querySelector('#wt-profile-note-top');
        if (note) note.textContent = p.shifts.length > 0
          ? `Shifts: ${p.shifts.slice(0,3).join(', ')}… · Suggested rate: $${p.suggestedRate}/hr`
          : 'Define your own shift names.';
      };
    }
    w.querySelector('#wt-pay-period-top')?.addEventListener('change', function() {
      this.classList.toggle('wt-glow', this.value === '');
    });
    w.querySelector('#wt-pay-day-top')?.addEventListener('change', function() {
      this.classList.toggle('wt-glow', this.value === '');
    });
    w.querySelectorAll('.wt-loc-del').forEach(b => { b.onclick = () => { WTDb.deleteLocation(b.dataset.lid); _go('settings'); }; });
    w.querySelectorAll('[data-edit-loc]').forEach(row => {
      row.onclick = (e) => {
        if (e.target.classList.contains('wt-loc-del')) return;
        _showEditLocation(row.dataset.editLoc);
      };
    });
    w.querySelector('#wt-add-loc').onclick = () => {
      const nameEl = w.querySelector('#wt-loc-name');
      const rateEl = w.querySelector('#wt-loc-rate');
      const name = nameEl.value.trim();
      const rate = parseFloat(rateEl.value);
      const color = w.querySelector('#wt-loc-color').value;
      const paidBreaks = w.querySelector('#wt-loc-paid-break').checked;
      if (!name) {
        nameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        nameEl.focus();
        alert('Enter a work location name.');
        return;
      }
      if (!rate || rate <= 0) {
        rateEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        rateEl.focus();
        alert('Enter a valid hourly rate.');
        return;
      }

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
      _settingsOpenSection = 'tips';
      _go('settings');
    };

    w.querySelector('#wt-add-ot2')?.addEventListener('click', () => {
      const row = w.querySelector('#wt-ot2-row');
      const btn = w.querySelector('#wt-add-ot2');
      const visible = row.style.display !== 'none';
      row.style.display = visible ? 'none' : 'flex';
      btn.textContent = visible ? '+ Add Level 2 (double time)' : '− Remove Level 2';
    });
    w.querySelector('#wt-ot-calcby')?.addEventListener('change', function() {
      this.classList.toggle('wt-glow', this.value === '');
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

    function openAccordionSection(name) {
      while (name && !w.querySelector(`[data-accordion-body="${name}"]`)) {
        const idx = accordionOrder.indexOf(name);
        name = accordionOrder[idx + 1] || null;
      }
      accordionOrder.forEach(n => {
        const body = w.querySelector(`[data-accordion-body="${n}"]`);
        const chev = w.querySelector(`[data-accordion-chevron="${n}"]`);
        if (!body) return;
        const isOpen = n === name;
        body.style.display = isOpen ? 'block' : 'none';
        if (chev) chev.classList.toggle('open', isOpen);
      });
      _settingsOpenSection = name;
    }
    const accordionOrder = ['profile', 'locations', 'tips', 'tax'];
    w.querySelectorAll('[data-accordion-header]').forEach(h => {
      h.onclick = () => {
        const name = h.dataset.accordionHeader;
        const body = w.querySelector(`[data-accordion-body="${name}"]`);
        const isCurrentlyOpen = body.style.display !== 'none';
        openAccordionSection(isCurrentlyOpen ? null : name);
      };
    });
    openAccordionSection(_settingsOpenSection);
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

  function _showPayDayOptions(locId, locName, weekStart, settings) {
    const payment = WTDb.getPayment(locId, weekStart);
    const ov = document.createElement('div');
    ov.className = 'wt-overlay';
    document.body.appendChild(ov);

    const _ds = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    ov.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">${locName}</div>
        ${payment ? `
        <div style="background:rgba(48,209,88,.08);border:1px solid rgba(48,209,88,.2);border-radius:14px;padding:12px 14px;margin-bottom:16px">
          <div style="font-size:11px;color:#30D158;font-weight:700;text-transform:uppercase;letter-spacing:.4px">✅ Payment Recorded</div>
          <div style="font-size:15px;color:#fff;font-weight:700;margin-top:4px">${(() => {
            const pa = WTRules.paymentAmounts(payment);
            const parts = [];
            if (pa.gross !== null) parts.push('$'+pa.gross.toFixed(2)+' gross');
            if (pa.net !== null) parts.push('$'+pa.net.toFixed(2)+' net');
            return parts.length ? parts.join(' · ') : 'Amount not set';
          })()}</div>
          <div style="font-size:12px;color:#636366;margin-top:2px">Received: ${payment.receivedDate || '—'}</div>
          ${payment.photoCount > 0 ? `<div style="font-size:12px;color:#5E5CE6;margin-top:2px">${payment.photoCount} photo${payment.photoCount>1?'s':''} attached</div>` : ''}
        </div>` : `
        <div style="background:rgba(255,159,10,.06);border:1px solid rgba(255,159,10,.15);border-radius:14px;padding:12px 14px;margin-bottom:16px">
          <div style="font-size:11px;color:#FF9F0A;font-weight:700;text-transform:uppercase;letter-spacing:.4px">⏳ Payment Pending</div>
          <div style="font-size:12px;color:#636366;margin-top:4px">No payment recorded yet for this week</div>
        </div>`}
        <div style="display:flex;flex-direction:column;gap:10px">
          <button id="wt-pd-record" class="wt-btn wt-btn-primary">💰 ${payment ? 'Update Payment' : 'Record Payment'}</button>
          <button id="wt-pd-editloc" class="wt-btn wt-btn-secondary">Edit Pay Day</button>
          ${payment ? `<button id="wt-pd-delete" class="wt-btn" style="background:rgba(255,69,58,.1);border:1px solid rgba(255,69,58,.2);color:#FF453A">Delete Record</button>` : ''}
          <button id="wt-pd-close" class="wt-btn wt-btn-secondary">Cancel</button>
        </div>
      </div>`;

    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.querySelector('#wt-pd-close').onclick = () => ov.remove();
    ov.querySelector('#wt-pd-editloc').onclick = () => { ov.remove(); _showEditLocation(locId); };
    ov.querySelector('#wt-pd-record').onclick = () => { ov.remove(); _showRecordPayment(locId, locName, weekStart, payment); };
    const delBtn = ov.querySelector('#wt-pd-delete');
    if (delBtn) delBtn.onclick = () => {
      if (!confirm('Delete this payment record?')) return;
      WTDb.deletePayment(locId, weekStart);
      ov.remove();
      _go('home');
    };
  }

  function _showRecordPayment(locId, locName, weekStart, existing) {
    const ov = document.createElement('div');
    ov.className = 'wt-overlay';
    document.body.appendChild(ov);

    const todayStr = _today();
    const existingCount = existing ? (existing.photoCount || 0) : 0;

    ov.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">💰 Record Payment</div>
        <div style="font-size:13px;color:#636366;margin-bottom:16px">${locName}</div>
        <label class="wt-modal-label">Date received</label>
        <input id="wt-rp-date" class="wt-input" type="date" value="${existing?.receivedDate || todayStr}"
          style="display:block;width:100%;box-sizing:border-box;margin-bottom:4px">
        <label class="wt-modal-label">Gross pay (before taxes)</label>
        <div style="display:flex;align-items:center;background:#2C2C2E;border-radius:14px;overflow:hidden;border:1px solid #38383A;margin-bottom:10px">
          <span style="padding:0 10px;color:#98989D;font-size:15px">$</span>
          <input id="wt-rp-gross" type="text" inputmode="decimal"
            value="${typeof existing?.grossAmount === 'number' ? existing.grossAmount : (existing && existing.amountType !== 'net' && existing.amount ? existing.amount : '')}" placeholder="0.00"
            style="flex:1;background:none;border:none;color:#fff;font-size:18px;font-weight:700;padding:12px 0;outline:none;width:0"
            onclick="this.select()" onfocus="this.select()">
        </div>
        <label class="wt-modal-label">Net pay (take-home)</label>
        <div style="display:flex;align-items:center;background:#2C2C2E;border-radius:14px;overflow:hidden;border:1px solid #38383A;margin-bottom:4px">
          <span style="padding:0 10px;color:#98989D;font-size:15px">$</span>
          <input id="wt-rp-net" type="text" inputmode="decimal"
            value="${typeof existing?.netAmount === 'number' ? existing.netAmount : (existing && existing.amountType === 'net' && existing.amount ? existing.amount : '')}" placeholder="0.00"
            style="flex:1;background:none;border:none;color:#fff;font-size:18px;font-weight:700;padding:12px 0;outline:none;width:0"
            onclick="this.select()" onfocus="this.select()">
        </div>
        <div style="font-size:11px;color:#636366;margin-bottom:14px">Both are optional — enter whichever you have, or both if they're on the check.</div>
        <div id="wt-rp-rate-box" style="display:none;background:rgba(94,92,230,.08);border:1px solid rgba(94,92,230,.2);border-radius:14px;padding:12px 14px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-size:13px;color:#98989D;display:flex;align-items:center;gap:5px">Real rate on this check
              <span id="wt-rp-rate-info" style="cursor:pointer;width:15px;height:15px;border-radius:50%;background:rgba(152,152,157,.25);color:#98989D;font-size:10px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;line-height:1">i</span>
            </span>
            <span id="wt-rp-rate-value" style="font-size:16px;font-weight:800;color:#5E5CE6">0%</span>
          </div>
          <div id="wt-rp-rate-explain" style="display:none;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);font-size:11px;color:#98989D;line-height:1.5">
            This rate varies check to check because your employer withholds taxes by annualizing each paycheck: in overtime-heavy weeks, the system assumes you'd earn that much all year and withholds more. In slower weeks, it withholds less. It's not your real annual rate — it's a weekly projection. That's why tax refunds exist: they correct whatever was over- or under-withheld.
          </div>
          <label style="display:flex;align-items:center;gap:10px;margin-top:10px;cursor:pointer">
            <input type="checkbox" id="wt-rp-use-rate" ${existing?.usedRealRate ? 'checked' : ''} style="width:18px;height:18px;accent-color:#5E5CE6">
            <span style="font-size:13px;color:#fff">Use this real rate for my estimates (Simple %)</span>
          </label>
        </div>
        <label class="wt-modal-label">Notes (optional)</label>
        <input id="wt-rp-notes" class="wt-input" type="text" placeholder="e.g. Received Thursday instead..."
          value="${existing?.notes || ''}" style="display:block;width:100%;box-sizing:border-box;margin-bottom:14px">
        <label style="display:flex;align-items:center;gap:10px;margin-bottom:14px;cursor:pointer">
          <input type="checkbox" id="wt-rp-cashincheck" ${existing?.cashInCheck ? 'checked' : ''} style="width:18px;height:18px;accent-color:#5E5CE6">
          <div>
            <div style="font-size:14px;color:#fff;font-weight:600">Cash tips included in check</div>
            <div style="font-size:11px;color:#636366;margin-top:2px">Enable if your employer includes cash tips in the paycheck</div>
          </div>
        </label>
        <div style="margin-bottom:14px">
          <div style="font-size:12px;color:#98989D;margin-bottom:8px">📎 Photos (optional — check stubs, signed hours, etc.)</div>
          <div id="wt-rp-photos" style="display:flex;flex-wrap:wrap;gap:8px">
            ${Array.from({length: existingCount}, (_,i) => `
              <button class="wt-photo-btn has-photo" data-rp-photo="${i+1}">✓ Photo ${i+1}</button>
            `).join('')}
            <button id="wt-rp-add-photo" class="wt-photo-btn">📋 Add photo</button>
          </div>
        </div>
        <div class="wt-modal-actions">
          <button class="wt-btn wt-btn-secondary" id="wt-rp-cancel">Cancel</button>
          <button class="wt-btn wt-btn-primary" id="wt-rp-save">Save</button>
        </div>
      </div>`;

    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.querySelector('#wt-rp-cancel').onclick = () => ov.remove();

    const rpGrossInput = ov.querySelector('#wt-rp-gross');
    const rpNetInput = ov.querySelector('#wt-rp-net');
    const rpRateBox = ov.querySelector('#wt-rp-rate-box');
    const rpRateValue = ov.querySelector('#wt-rp-rate-value');
    const rpUseRateCheck = ov.querySelector('#wt-rp-use-rate');
    function updateRpRate() {
      const g = parseFloat(rpGrossInput.value);
      const n = parseFloat(rpNetInput.value);
      if (!isNaN(g) && g > 0 && !isNaN(n) && n >= 0 && n <= g) {
        const rate = ((g - n) / g) * 100;
        rpRateValue.textContent = rate.toFixed(2) + '%';
        rpRateBox.style.display = 'block';
      } else {
        rpRateBox.style.display = 'none';
        rpUseRateCheck.checked = false;
      }
    }
    rpGrossInput.addEventListener('input', updateRpRate);
    rpNetInput.addEventListener('input', updateRpRate);
    updateRpRate();
    ov.querySelector('#wt-rp-rate-info').onclick = (e) => {
      e.stopPropagation();
      const el = ov.querySelector('#wt-rp-rate-explain');
      el.style.display = el.style.display === 'none' ? 'block' : 'none';
    };

    // iOS keyboard fix
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

    let photoCount = existingCount;

    // View existing photos
    ov.querySelectorAll('[data-rp-photo]').forEach(btn => {
      const n = parseInt(btn.dataset.rpPhoto);
      const key = `payment_${locId}_${weekStart}_${n}`;
      WTDb.getPhoto(locId, key).then(base64 => {
        if (base64) btn.onclick = () => _viewOrReplacePhoto(locId, key, base64);
      });
    });

    // Add new photo
    ov.querySelector('#wt-rp-add-photo').onclick = () => {
      photoCount++;
      const key = `payment_${locId}_${weekStart}_${photoCount}`;
      _doPhotoThenRefresh(locId, key, () => {
        // Commit the photo count now, merged with whatever's already saved for this payment —
        // so the photo isn't orphaned if the user closes without hitting the main Save button.
        const existingPayment = WTDb.getPayment(locId, weekStart) || {};
        WTDb.savePayment(locId, weekStart, { ...existingPayment, photoCount });
        const addBtn = ov.querySelector('#wt-rp-add-photo');
        const newBtn = document.createElement('button');
        newBtn.className = 'wt-photo-btn has-photo';
        newBtn.textContent = `✓ Photo ${photoCount}`;
        WTDb.getPhoto(locId, key).then(base64 => {
          if (base64) newBtn.onclick = () => _viewOrReplacePhoto(locId, key, base64);
        });
        ov.querySelector('#wt-rp-photos').insertBefore(newBtn, addBtn);
      });
    };

    ov.querySelector('#wt-rp-save').onclick = () => {
      if (ov._cleanupVV) ov._cleanupVV();
      const receivedDate = ov.querySelector('#wt-rp-date').value;
      const grossVal = parseFloat(rpGrossInput.value);
      const netVal = parseFloat(rpNetInput.value);
      const notes = ov.querySelector('#wt-rp-notes').value.trim();
      const cashInCheck = ov.querySelector('#wt-rp-cashincheck').checked;
      const payload = { receivedDate, notes, photoCount, cashInCheck, usedRealRate: rpUseRateCheck.checked };
      if (!isNaN(grossVal) && grossVal > 0) payload.grossAmount = grossVal;
      if (!isNaN(netVal) && netVal > 0) payload.netAmount = netVal;
      if (rpUseRateCheck.checked && !isNaN(grossVal) && grossVal > 0 && !isNaN(netVal) && netVal <= grossVal) {
        const rate = ((grossVal - netVal) / grossVal) * 100;
        const ts = WTDb.getTaxSettings();
        WTDb.saveTaxSettings({ ...ts, mode: 'simple', simplePercent: parseFloat(rate.toFixed(2)), lastConfirmedYear: new Date().getFullYear() });
      }
      WTDb.savePayment(locId, weekStart, payload);
      ov.remove();
      _go('week');
    };
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
        <label class="wt-modal-label">Pay Day</label>
        <select class="wt-input" id="wt-ql-payday" style="display:block;width:100%;box-sizing:border-box;margin-bottom:6px">
          ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d,i) =>
            `<option value="${i+1}" ${(i+1)===5?'selected':''}>${d}</option>`
          ).join('')}
        </select>
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
        overtimeRules: JSON.parse(JSON.stringify(DEFAULT_OT_RULES)),
        payDayOfWeek: parseInt(ov.querySelector('#wt-ql-payday').value) || 5
      };
      WTDb.saveLocation(loc);
      ov.remove();
      if (onDone) onDone(loc.id);
    };
  }

  function _showAddShift(dateStr, preSelectLocId) {
    const settings = WTDb.getSettings();
    const currentProfile = (WTDb.getSettings().workProfile || 'restaurant');
    const locs = WTDb.getLocations().filter(l => (l.workProfile || 'restaurant') === currentProfile);
    if (!locs.length) { _showQuickAddLocation((newLocId) => _showAddShift(dateStr, newLocId)); return; }
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
        <div style="width:100%;box-sizing:border-box">
          <select class="wt-input" id="wt-ml" style="width:100%;box-sizing:border-box;display:block">
            ${locs.map(l => `<option value="${l.id}" data-rate="${l.hourlyRate}" ${preSelectLocId === l.id ? 'selected' : ''}>${l.name} — $${l.hourlyRate}/hr</option>`).join('')}
          </select>
        </div>
        <button id="wt-ml-add" type="button" style="display:block;width:100%;background:none;border:none;color:#5E5CE6;font-size:13px;font-weight:600;padding:8px 0 4px;cursor:pointer;text-align:left">+ Add new location</button>
        <label class="wt-modal-label">Shift Type <span style="font-size:10px;color:#5E5CE6;font-weight:700;letter-spacing:.5px">AUTO-DETECTED</span></label>
        <div style="width:100%;box-sizing:border-box">
          <select class="wt-input" id="wt-ms" style="width:100%;box-sizing:border-box;display:block">
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
      _showQuickAddLocation((newLocId) => _showAddShift(dateStr, newLocId));
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
    ov.querySelector('#wt-clockin-now').onclick = (e) => {
      if (e.currentTarget.disabled) return;
      if (_running()) { alert('You already have an active shift running.'); ov.remove(); return; }
      e.currentTarget.disabled = true;
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
      _go('home'); // reflect the running shift immediately, not gated behind the photo flow
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

  // Backfill flow for past dates: unlike "Clock In Now" (which always uses the current
  // real-world timestamp), this creates a shift dated exactly as given, with hours as a
  // simple optional total instead of live clock times — or no hours at all if genuinely
  // unknown, so the person can still log tips for that day.
  function _showLogPastData(dateStr) {
    const settings = WTDb.getSettings();
    const currentProfile = settings.workProfile || 'restaurant';
    const locs = WTDb.getLocations().filter(l => (l.workProfile || 'restaurant') === currentProfile);
    if (!locs.length) { _showQuickAddLocation((newLocId) => _showLogPastData(dateStr)); return; }
    const profileShifts = (WORK_PROFILES[currentProfile]||WORK_PROFILES.restaurant).shifts;
    const firstLoc = locs[0];
    const initialRate = firstLoc ? firstLoc.hourlyRate : 16.50;

    const ov = document.createElement('div');
    ov.className = 'wt-overlay';
    ov.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">Log Past Data · ${_fmtDate(dateStr)}</div>
        <label class="wt-modal-label">Location</label>
        <select class="wt-input" id="wt-lp-loc">
          ${locs.map(l => `<option value="${l.id}" data-rate="${l.hourlyRate}">${l.name} — $${l.hourlyRate}/hr</option>`).join('')}
        </select>
        <label class="wt-modal-label">Shift Type</label>
        <select class="wt-input" id="wt-lp-type">
          ${profileShifts.map(s => `<option>${s}</option>`).join('')}
          <option value="__custom">Custom…</option>
        </select>
        <div id="wt-lp-custom-wrap" style="display:none;margin-top:8px">
          <input id="wt-lp-custom" class="wt-input" placeholder="Shift name" type="text">
        </div>
        <label class="wt-modal-label">Hourly Rate ($/hr)</label>
        <input id="wt-lp-rate" class="wt-input" type="text" inputmode="decimal" value="${initialRate}">
        <label class="wt-modal-label">Hours worked <span style="font-size:11px;color:#636366;font-weight:400">(optional — leave blank if you don't remember; you can still log tips)</span></label>
        <input id="wt-lp-hours" class="wt-input" type="text" inputmode="decimal" placeholder="e.g. 7.5">
        <div class="wt-modal-actions">
          <button class="wt-btn wt-btn-secondary" id="wt-lp-cancel">Cancel</button>
          <button class="wt-btn wt-btn-primary" id="wt-lp-save">Continue to Tips</button>
        </div>
      </div>`;
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    ov.querySelectorAll('input').forEach(i => { i.addEventListener('focus', () => i.select()); i.addEventListener('click', () => i.select()); });

    ov.querySelector('#wt-lp-loc').onchange = function() {
      const rate = this.options[this.selectedIndex].dataset.rate;
      if (rate) ov.querySelector('#wt-lp-rate').value = rate;
    };
    ov.querySelector('#wt-lp-type').onchange = function() {
      ov.querySelector('#wt-lp-custom-wrap').style.display = this.value === '__custom' ? 'block' : 'none';
    };
    ov.querySelector('#wt-lp-cancel').onclick = () => ov.remove();
    ov.querySelector('#wt-lp-save').onclick = () => {
      const locId = ov.querySelector('#wt-lp-loc').value;
      const loc = locs.find(l => l.id === locId);
      const typeSel = ov.querySelector('#wt-lp-type');
      const shiftType = typeSel.value === '__custom'
        ? (ov.querySelector('#wt-lp-custom').value.trim() || 'Custom') : typeSel.value;
      const rate = parseFloat(ov.querySelector('#wt-lp-rate').value.replace(',','.'));
      if (!rate || rate <= 0) { alert('Enter a valid hourly rate.'); return; }
      const hoursVal = ov.querySelector('#wt-lp-hours').value.trim();
      const hours = hoursVal !== '' ? parseFloat(hoursVal.replace(',','.')) : null;
      if (hoursVal !== '' && (isNaN(hours) || hours <= 0)) { alert('Enter a valid number of hours, or leave it blank.'); return; }
      const shiftId = generateId();
      let entries = [];
      if (hours) {
        const clockIn = new Date(dateStr + 'T12:00:00');
        const clockOut = new Date(clockIn.getTime() + hours * 3600000);
        entries = [{ id: generateId(), clockIn: clockIn.toISOString(), clockOut: clockOut.toISOString(), breakMinutes: 0 }];
      }
      WTDb.saveShift({
        id: shiftId, date: dateStr,
        locationId: locId, locationName: loc.name,
        hourlyRate: rate, shiftType,
        workProfile: currentProfile,
        entries
      });
      ov.remove();
      const profileDef = WORK_PROFILES[currentProfile] || WORK_PROFILES.restaurant;
      if (profileDef.hasTips) {
        _showTipPool(shiftId);
      } else {
        _go('day', { date: dateStr });
      }
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
    if (!entry || entry.clockOut) return; // already clocked out — ignore a duplicate call
    const clockOutTime = new Date().toISOString();
    entry.clockOut = clockOutTime;
    shift.needsReview = true;
    WTDb.saveShift(shift);
    _breakStart = null;
    localStorage.removeItem('wt_break_start');
    _go('home'); // reflect the closed shift immediately (this also stops the live ticker,
                  // since _go() clears it internally) — not gated behind the photo flow

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

  function _compressImage(base64, maxPx, quality) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = base64;
    });
  }

  // Tries the native share sheet (one tap → Save to Photos, right where the user already looks).
  // Falls back to the existing download-to-Files behavior if share isn't supported or fails.
  // If the user explicitly cancels the share sheet, respects that — no fallback, no message.
  async function _saveOrShareImage(dataUrl, filename) {
    if (navigator.canShare) {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return 'shared';
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
        // any other failure falls through to the download fallback below
      }
    }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    return 'downloaded';
  }

  async function _saveOrShareBlob(blob, filename) {
    if (navigator.canShare) {
      try {
        const file = new File([blob], filename, { type: blob.type });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return 'shared';
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    return 'downloaded';
  }

  // Wraps every photo save with real error handling and a read-back verification — without
  // this, an IndexedDB failure (iOS Safari is known for silently failing writes under low
  // storage or private-mode restrictions) would leave the user thinking the photo was saved
  // when it never was, with zero indication anything went wrong. Returns false on any
  // failure so callers can stop and tell the user, instead of proceeding as if it worked.
  async function _savePhotoSafe(shiftId, photoKey, base64) {
    try {
      await WTDb.savePhoto(shiftId, photoKey, base64);
      const verify = await WTDb.getPhoto(shiftId, photoKey);
      if (!verify) throw new Error('Photo did not persist');
      return true;
    } catch (err) {
      console.error('Photo save failed:', err);
      alert('⚠️ This photo could not be saved (storage error). Please try again — if this keeps happening, your device may be low on storage.');
      return false;
    }
  }

  async function _doPhotoThenRefresh(shiftId, photoKey, onDone) {
    const hint = document.createElement('div');
    hint.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;font-size:13px;padding:10px 18px;border-radius:20px;z-index:9999;pointer-events:none;text-align:center';
    hint.textContent = '💡 Tip: turn off flash before taking photo';
    document.body.appendChild(hint);
    setTimeout(() => hint.remove(), 3000);
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async ev => {
        const compressed = await _compressImage(ev.target.result, 1024, 0.75);
        const ok = await _savePhotoSafe(shiftId, photoKey, compressed);
        if (!ok) return;
        const now = new Date().toISOString().replace(/[:.]/g,'-').slice(0,16);
        const result = await _saveOrShareImage(compressed, `Tempo_report_${now}.jpg`);
        if (result === 'downloaded') alert('📷 Saved — find it in Files > Downloads.');
        if (onDone) onDone();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  async function _doPhoto(shiftId, photoKey, onDone) {
    const hint = document.createElement('div');
    hint.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;font-size:13px;padding:10px 18px;border-radius:20px;z-index:9999;pointer-events:none;text-align:center';
    hint.textContent = '💡 Tip: turn off flash before taking photo';
    document.body.appendChild(hint);
    setTimeout(() => hint.remove(), 3000);
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = async ev => {
        const compressed = await _compressImage(ev.target.result, 1024, 0.75);
        const ok = await _savePhotoSafe(shiftId, photoKey, compressed);
        if (!ok) return;
        const btn = document.querySelector(`[data-pid="${photoKey}"]`);
        if (btn) {
          if (btn.nextSibling && btn.nextSibling.tagName === 'IMG') btn.nextSibling.remove();
          btn.textContent = '✓ View proof';
          btn.classList.add('has-photo');
          btn.onclick = () => _viewOrReplacePhoto(shiftId, photoKey, compressed);
        }
        if (onDone) onDone(compressed);
        const a = document.createElement('a');
        a.href = compressed;
        const now = new Date().toISOString().replace(/[:.]/g,'-').slice(0,16);
        a.download = 'Tempo_proof_' + now + '.jpg';
        a.click();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  async function _exportPDF(startStr, endStr, filterLocId, periodLabel) {
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
    let shifts = _rangeShifts(startStr, endStr);
    if (filterLocId) shifts = shifts.filter(s => s.locationId === filterLocId);
    if (!shifts.length) { alert('No shifts in this period.'); return; }

    const PURPLE = [94, 92, 230], DARK = [30, 30, 32], GRAY = [120, 120, 120], LIGHT = [244, 244, 247];
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.width, pageH = doc.internal.pageSize.height;

    doc.setFillColor(...PURPLE); doc.rect(0, 0, pageW, 3, 'F');
    doc.setTextColor(...DARK); doc.setFontSize(20); doc.setFont(undefined, 'bold');
    doc.text('Tempo — Work Report', 14, 16);
    doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(...GRAY);
    doc.text(`Generated ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}  ·  Period: ${periodLabel}`, 14, 23);

    const byLoc = {};
    shifts.forEach(s => {
      const key = s.locationId || '—';
      if (!byLoc[key]) byLoc[key] = { name: s.locationName || '—', shifts: [] };
      byLoc[key].shifts.push(s);
    });

    let grandHrs = 0, grandPay = 0, grandCC = 0, grandCash = 0, y = 30;
    Object.values(byLoc).forEach(loc => {
      if (y > pageH - 40) { doc.addPage(); y = 16; }
      doc.setFillColor(...LIGHT); doc.rect(14, y, pageW - 28, 8, 'F');
      doc.setTextColor(...DARK); doc.setFontSize(12); doc.setFont(undefined, 'bold');
      doc.text(loc.name, 17, y + 5.5);
      y += 10;

      const _wds = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const byWeek = {};
      loc.shifts.forEach(s => {
        const wsKey = _wds(getWeekStart(new Date(s.date + 'T12:00:00')));
        if (!byWeek[wsKey]) byWeek[wsKey] = [];
        byWeek[wsKey].push(s);
      });
      const weekKeys = Object.keys(byWeek).sort();
      const showWeeks = weekKeys.length > 1;
      const body = [];
      let locHrs = 0, locPay = 0, locCC = 0, locCash = 0;
      weekKeys.forEach(wsKey => {
        if (showWeeks) {
          const ws = new Date(wsKey + 'T12:00:00'), we = getWeekEnd(ws);
          body.push([{ content: `Week of ${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, colSpan: 9, styles: { fontStyle: 'bold', fillColor: [230, 229, 250], textColor: DARK, fontSize: 9 } }]);
        }
        const byDate = {};
        byWeek[wsKey].forEach(s => { if (!byDate[s.date]) byDate[s.date] = []; byDate[s.date].push(s); });
        let wHrs = 0, wPay = 0, wCC = 0, wCash = 0;
        Object.entries(byDate).forEach(([date, ds]) => {
          ds.forEach(shift => {
            const hrs = WTRules.shiftHours(shift);
            const pay = hrs * (shift.hourlyRate || NYC_MIN_WAGE);
            const cut = _shiftTipCut(shift);
            body.push([_fmtDate(date), shift.shiftType || '—',
              (shift.entries || []).map(e => _fmtTime(e.clockIn)).join(', ') || '—',
              (shift.entries || []).map(e => e.clockOut ? _fmtTime(e.clockOut) : '—').join(', '),
              WTRules.fmtHours(hrs), WTRules.fmtMoney(pay), WTRules.fmtMoney(cut.cc), WTRules.fmtMoney(cut.cash),
              WTRules.fmtMoney(pay + cut.cc + cut.cash)]);
            wHrs += hrs; wPay += pay; wCC += cut.cc; wCash += cut.cash;
          });
        });
        if (showWeeks) {
          body.push(['', '', '', 'Week Total →', WTRules.fmtHours(wHrs), WTRules.fmtMoney(wPay), WTRules.fmtMoney(wCC), WTRules.fmtMoney(wCash), WTRules.fmtMoney(wPay + wCC + wCash)]);
        }
        locHrs += wHrs; locPay += wPay; locCC += wCC; locCash += wCash;
      });
      body.push(['', '', '', 'Location Total →', WTRules.fmtHours(locHrs), WTRules.fmtMoney(locPay), WTRules.fmtMoney(locCC), WTRules.fmtMoney(locCash), WTRules.fmtMoney(locPay + locCC + locCash)]);
      grandHrs += locHrs; grandPay += locPay; grandCC += locCC; grandCash += locCash;

      doc.autoTable({
        startY: y,
        head: [['Date', 'Shift', 'In', 'Out', 'Hours', 'Hourly Pay', 'CC Tips', 'Cash Tips', 'Total']],
        body, theme: 'grid',
        headStyles: { fillColor: PURPLE, textColor: 255, fontStyle: 'bold', fontSize: 9 },
        styles: { fontSize: 9, cellPadding: 2.5, textColor: DARK },
        didParseCell: d => {
          if (d.row.raw[3] === 'Location Total →') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = LIGHT; }
          if (d.row.raw[3] === 'Week Total →') { d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = [248, 248, 250]; }
        }
      });
      y = doc.lastAutoTable.finalY + 10;
    });

    if (y > pageH - 25) { doc.addPage(); y = 16; }
    doc.setFillColor(...PURPLE); doc.rect(14, y, pageW - 28, 12, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.text(`GRAND TOTAL  —  ${WTRules.fmtHours(grandHrs)}  ·  Hourly ${WTRules.fmtMoney(grandPay)}  ·  CC Tips ${WTRules.fmtMoney(grandCC)}  ·  Cash Tips ${WTRules.fmtMoney(grandCash)}  ·  ${WTRules.fmtMoney(grandPay + grandCC + grandCash)}`, 17, y + 8);

    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(8); doc.setTextColor(...GRAY);
      doc.text('Generated by Tempo · Personal reference only · Not an official payroll document', 14, pageH - 8);
      doc.text(`Page ${p} of ${totalPages}`, pageW - 14, pageH - 8, { align: 'right' });
    }
    const fname = `${startStr}_to_${endStr}`;
    await _saveOrShareBlob(doc.output('blob'), `Tempo_Work_${fname}.pdf`);
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
    if (photoKey && photoKey.includes('_in_')) photoLabel = 'Clock In';
    else if (photoKey && photoKey.includes('_out_')) photoLabel = 'Clock Out';
    else if (photoKey && photoKey.includes('break')) photoLabel = 'Break';
    else if (photoKey && photoKey.includes('report')) photoLabel = 'Report';

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
          <button id="wt-vp-delete" style="width:44px;height:44px;border-radius:50%;background:rgba(255,69,58,.15);border:1.5px solid rgba(255,69,58,.3);color:#FF453A;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 5h12M8 5V3h4v2M6 5l1 11h6l1-11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>`;

    // Pinch-zoom is blocked app-wide (see index.html), except while this photo viewer is
    // open — the observer catches removal however it happens (close button, tap-outside,
    // or the replace flow further down), so every exit path is covered from one place.
    document.body.classList.add('wt-photo-zoom-ok');
    document.body.appendChild(ov);
    new MutationObserver((_muts, obs) => {
      if (!document.body.contains(ov)) {
        document.body.classList.remove('wt-photo-zoom-ok');
        obs.disconnect();
      }
    }).observe(document.body, { childList: true });
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
      _doPhoto(shiftId, photoKey, (newBase64) => {
        _viewOrReplacePhoto(shiftId, photoKey, newBase64);
      });
    };
    ov.querySelector('#wt-vp-delete').onclick = () => {
      if (!confirm('Delete this photo? This cannot be undone.')) return;
      WTDb.deletePhoto(shiftId, photoKey).then(() => {
        ov.remove();
        // Update button in ShiftCard
        const btn = document.querySelector(`[data-pid="${photoKey}"]`);
        if (btn) {
          btn.textContent = photoKey.includes('report') ? '📋 Add report' : '📷 ' + photoLabel;
          btn.classList.remove('has-photo');
          btn.onclick = () => photoKey.includes('report')
            ? _doPhotoThenRefresh(shiftId, photoKey, () => {
                const rr = btn.closest('[data-shift-id]');
                if (rr && rr._refresh) rr._refresh();
              })
            : _doPhoto(shiftId, photoKey);
        }
        _go('home');
      });
    };
  }

  function _doPhotoThenHome(shiftId, photoKey) {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) { _go('home'); return; }
      const reader = new FileReader();
      reader.onload = async ev => {
        const ok = await _savePhotoSafe(shiftId, photoKey, ev.target.result);
        _go('home'); // refresh immediately once the save is confirmed — don't wait on the
                      // share sheet below, which the user might dismiss in a way that never
                      // resolves the promise, leaving the "✓ saved" state stuck showing old
        if (!ok) return;
        const now = new Date().toISOString().replace(/[:.]/g,'-').slice(0,16);
        const result = await _saveOrShareImage(ev.target.result, 'Tempo_clockin_' + now + '.jpg');
        if (result === 'downloaded') alert('📷 Saved — find it in Files > Downloads.');
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function _showTipPool(dayKey, highlightName, highlightType) {
    const __shifts = WTDb.getShifts();
    const __shift = __shifts.find(s => s.id === dayKey);
    const locationId = __shift ? __shift.locationId : null;
    const tipSettings = WTDb.getTipSettings();
    const feePercent = _getLocationFeePercent(locationId);
    const __originalTips = WTDb.getTipsForShift(dayKey);
    // Snapshot taken before any edits — Cancel restores exactly this, or deletes the
    // record entirely if it never existed before this session opened it.
    const __originalSnapshot = __originalTips ? JSON.parse(JSON.stringify(__originalTips)) : null;
    const saved = __originalTips || {
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
      const result = _computeTipResult(ccTotal, cashTotal, workers, feePercent, saved.manualFee, saved.cashFlatAmounts, saved.cashPointOverrides, saved.cashManualAmounts);
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

      // Single source of truth for cash display — reused by render + balance check below
      const cashRows = result.payouts.map(p => {
        const exactCashShare = _exactCashShare(p);
        const cashShare = saved.cashManualAmounts && saved.cashManualAmounts[p.name] !== undefined
          ? saved.cashManualAmounts[p.name]
          : Math.floor(exactCashShare);
        return { name: p.name, exactCashShare, cashShare, diff: cashShare - exactCashShare, cashPoints: p.cashPoints || 0 };
      });

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
              ${cashRows.map(r => `
                <div data-cash-row="${r.name}" style="padding:6px 0;border-bottom:1px solid rgba(48,209,88,0.1)">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                    <span style="color:#98989D;font-weight:600">${r.name} · <span style="color:#FF9F0A">$${r.exactCashShare.toFixed(2)}</span></span>
                    <span style="font-size:11px;color:${r.diff>0?'#FF9F0A':r.diff<0?'#64D2FF':'#636366'}">
                      ${r.diff<0?'↓ −$'+Math.abs(r.diff).toFixed(2):r.diff>0?'↑ +$'+r.diff.toFixed(2):''}
                    </span>
                  </div>
                  <div style="display:flex;align-items:center;justify-content:space-between">
                    <div style="display:flex;align-items:center;gap:4px">
                      <span style="font-size:10px;color:#636366">pts</span>
                      <div style="display:flex;align-items:center;background:#1C1C1E;border-radius:8px;overflow:hidden;border:1px solid #38383A">
                        <button data-cashpt-minus="${r.name}" style="width:22px;height:22px;background:none;border:none;color:#64D2FF;font-size:13px;cursor:pointer;line-height:1">−</button>
                        <input data-cashpt-direct="${r.name}" type="text" inputmode="decimal" value="${r.cashPoints.toFixed(2)}"
                          style="width:32px;text-align:center;font-size:12px;font-weight:700;color:#64D2FF;background:none;border:none;outline:none;padding:0"
                          onclick="this.select()" onfocus="this.select()">
                        <button data-cashpt-plus="${r.name}" style="width:22px;height:22px;background:none;border:none;color:#64D2FF;font-size:13px;cursor:pointer;line-height:1">+</button>
                      </div>
                    </div>
                    <div style="display:flex;align-items:center;background:#1C1C1E;border-radius:8px;overflow:hidden;border:1px solid #38383A">
                      <button data-cash-minus="${r.name}" style="width:26px;height:26px;background:none;border:none;color:#98989D;font-size:15px;cursor:pointer;line-height:1"
                        onpointerdown="this.style.background='rgba(255,255,255,0.1)'" onpointerup="this.style.background='none'" onpointerleave="this.style.background='none'">−</button>
                      <span style="color:#30D158;font-size:13px;padding-left:2px">$</span><input data-cash-direct="${r.name}" type="text" inputmode="decimal" value="${r.cashShare}"
                        style="width:30px;text-align:center;font-size:14px;font-weight:700;color:#30D158;background:none;border:none;outline:none;padding:0"
                        onclick="this.select()" onfocus="this.select()">
                      <button data-cash-plus="${r.name}" style="width:26px;height:26px;background:none;border:none;color:#98989D;font-size:13px;cursor:pointer;line-height:1"
                        onpointerdown="this.style.background='rgba(255,255,255,0.1)'" onpointerup="this.style.background='none'" onpointerleave="this.style.background='none'">+</button>
                    </div>
                  </div>
                </div>`).join('')}
              ${(() => {
                const totalCashDistributed = cashRows.reduce((s, r) => s + r.cashShare, 0);
                const cashRemainder = parseFloat((cashTotal - totalCashDistributed).toFixed(2));
                if (cashRemainder === 0) return '<div style="font-size:12px;color:#30D158;margin-top:6px;font-weight:600">✓ Cash balanced</div>';
                return `<div style="font-size:12px;color:${cashRemainder>0?'#FF9F0A':'#FF453A'};margin-top:6px;font-weight:600">
                  ${cashRemainder>0?`$${cashRemainder.toFixed(2)} cash unallocated`:`Over by $${Math.abs(cashRemainder).toFixed(2)}`}
                </div>`;
              })()}
            </div>` : ''}
            ${workers.length > 0 ? `
            <div style="display:flex;justify-content:space-between;margin-top:4px">
              <span style="color:#636366">${result.totalPoints} pts${result.impliedPoints > 0 ? ` + ${result.impliedPoints.toFixed(2)} fixed` : ''} total</span>
              <span style="color:#636366">$${(result.perPoint || result.creditCard.net / (result.totalPoints || 1)).toFixed(2)}/pt CC</span>
            </div>` : ''}
          </div>` : ''}

          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px">
            <div style="font-size:14px;font-weight:700;flex:1">Workers (${workers.length})</div>
            ${locationId ? `<button id="wt-tp-roster" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#98989D;font-size:13px;font-weight:700;padding:7px 12px;cursor:pointer">👥 Roster</button>` : ''}
            <button id="wt-tp-add" class="${workers.length === 0 ? 'wt-glow' : ''}" style="background:rgba(94,92,230,.15);border:none;border-radius:10px;color:#5E5CE6;font-size:13px;font-weight:700;padding:7px 14px;cursor:pointer">+ Add</button>
          </div>
          ${workers.length > 0 && !(ccTotal > 0 || cashTotal > 0) ? `<div style="font-size:12px;color:#636366;margin:-4px 0 10px">${result.totalPoints} pts total</div>` : ''}

          <div id="wt-tp-workers-list">
          ${workers.length === 0
            ? '<div style="color:#636366;font-size:13px;text-align:center;padding:20px 0">No workers yet.<br>Add yourself first with ⭐</div>'
            : result.payouts.map((p, i) => `
              <div data-worker-name="${p.name}" style="background:rgba(28,28,30,0.6);border-radius:14px;padding:12px 14px;margin-bottom:8px">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                  <div style="cursor:pointer" data-edit="${i}" data-edit-name="${p.name}">
                    <span style="font-size:15px;font-weight:700;color:${p.isMe?'#64D2FF':'#fff'}">${p.name} ${p.isMe?'⭐':''} <span style="font-size:11px;color:#5E5CE6">edit</span></span>
                    <div style="font-size:12px;color:#636366;margin-top:2px">${p.position} · ${p.isFixed ? `<span style="color:#FF9F0A">${(p.impliedPoints||0).toFixed(2)} pts (fixed)</span>` : `${p.points} pts`} · CC exact: <span style="color:#FF9F0A">$${(p.ccExact ?? p.exact).toFixed(2)}</span></div>
                  </div>
                  <button data-del="${i}" data-del-name="${p.name}" style="background:none;border:none;color:#636366;font-size:14px;cursor:pointer;padding:4px 8px;transition:transform .18s ease" onpointerdown="this.style.transform='rotate(90deg)'" onpointerup="this.style.transform='rotate(0deg)'" onpointerleave="this.style.transform='rotate(0deg)'">✕</button>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between">
                  <div style="display:flex;align-items:center;gap:0;background:#1C1C1E;border-radius:12px;overflow:hidden;border:1px solid #38383A">
                    <button data-minus="${i}" data-minus-name="${p.name}" style="width:44px;height:44px;background:none;border:none;color:#98989D;font-size:24px;font-weight:200;cursor:pointer;line-height:1"
                      onpointerdown="this.style.background='rgba(255,255,255,0.1)'"
                      onpointerup="this.style.background='none'"
                      onpointerleave="this.style.background='none'">−</button>
                    <span style="color:${p.isMe?'#30D158':'#98989D'};font-size:16px;padding-left:4px">$</span><input data-direct="${i}" data-direct-name="${p.name}" type="text" inputmode="decimal"
                      value="${p.ccAmount !== undefined ? p.ccAmount : p.amount}"
                      style="width:50px;text-align:center;font-size:22px;font-weight:800;color:${p.isMe?'#30D158':'#fff'};font-variant-numeric:tabular-nums;background:none;border:none;outline:none;padding:0"
                      onclick="this.select()" onfocus="this.select()">
                    <button data-plus="${i}" data-plus-name="${p.name}" style="width:44px;height:44px;background:none;border:none;color:#98989D;font-size:20px;font-weight:200;cursor:pointer;line-height:1"
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
      // Lets the CC/Cash fields accept a quick calculation (e.g. "461-42" for a reversed
      // charge, or "100+50+20" to add up several receipts) instead of requiring the user to
      // do the math elsewhere first. Strictly whitelists characters before ever evaluating —
      // only digits, ., +, -, *, /, (), and whitespace are allowed — so it can never run
      // anything beyond basic arithmetic, regardless of what's typed.
      const _safeMathEval = (expr) => {
        const cleaned = String(expr).trim();
        if (!cleaned || !/^[0-9.,+\-*/()\s]+$/.test(cleaned)) return null;
        const normalized = cleaned.replace(/,/g, '.');
        try {
          const result = Function(`"use strict"; return (${normalized})`)();
          return typeof result === 'number' && isFinite(result) ? result : null;
        } catch (e) { return null; }
      };
      const _evalFieldIfExpr = (input) => {
        const raw = input.value.trim();
        // Only evaluate if it actually looks like an expression (an operator beyond a single
        // leading minus sign, which is just a negative number) — a plain "42" is left as-is.
        if (raw && /[-+*/]/.test(raw.replace(/^-/, ''))) {
          const evaluated = _safeMathEval(raw);
          if (evaluated !== null) input.value = evaluated.toFixed(2);
        }
      };
      const doRecalc = () => {
        _evalFieldIfExpr(ov.querySelector('#wt-tp-cc'));
        _evalFieldIfExpr(ov.querySelector('#wt-tp-cash'));
        const ccVal = parseFloat(ov.querySelector('#wt-tp-cc').value.replace(',','.')) || 0;
        const cashVal = parseFloat(ov.querySelector('#wt-tp-cash').value.replace(',','.')) || 0;
        // Don't wipe manualFee if it matches the gross from an active split —
        // a split's fee is intentional, not a stale leftover from a prior manual edit.
        const splitMatchesCC = saved.ccBreakdown && saved.ccBreakdown.length > 1
          && Math.abs(TipRules.applyProcessingFeeMulti(saved.ccBreakdown, feePercent).gross - ccVal) < 0.005;
        if (ccVal !== saved.creditCardTotal && !splitMatchesCC) delete saved.manualFee;
        if (ccVal !== saved.creditCardTotal && !splitMatchesCC) delete saved.ccBreakdown;
        // Only reset worker CC overrides if CC total changed — cash changes should not affect CC adjustments
        if (ccVal !== saved.creditCardTotal && !splitMatchesCC) {
          saved.workers.forEach(w => { delete w.manualAmount; delete w.ccManualAmount; delete w.fixedAmount; });
        }
        if (cashVal !== saved.cashTotal) {
          delete saved.cashFlatAmounts;
          delete saved.cashPointOverrides;
          delete saved.cashManualAmounts;
        }
        saved.creditCardTotal = ccVal;
        saved.cashTotal = cashVal;
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
      ov.querySelectorAll('[data-direct]').forEach(inp => {
        inp.addEventListener('blur', () => {
          const i = parseInt(inp.dataset.direct);
          const vw = workers[i];
          if (!vw) return;
          const sw = saved.workers.find(w => w.name === vw.name);
          if (!sw) return;
          const p = result.payouts.find(p => p.name === vw.name);
          const val = parseFloat(inp.value);
          if (!isNaN(val) && val !== (p?.ccAmount)) {
            sw.fixedAmount = val;
            delete sw.ccManualAmount;
          }
          render();
        });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      });
      ov.querySelectorAll('[data-minus]').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.dataset.minus);
          const vw = workers[i]; // workers = sorted visual copy
          if (!vw) return;
          const sw = saved.workers.find(w => w.name === vw.name); // find in saved
          if (!sw || typeof sw.fixedAmount === 'number') return;
          const p = result.payouts.find(p => p.name === vw.name);
          if (!p) return;
          const cur = p.ccAmount !== undefined ? p.ccAmount : p.amount;
          sw.ccManualAmount = Math.max(0, cur - 1);
          render();
        };
      });
      ov.querySelectorAll('[data-plus]').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.dataset.plus);
          const vw = workers[i]; // workers = sorted visual copy
          if (!vw) return;
          const sw = saved.workers.find(w => w.name === vw.name); // find in saved
          if (!sw || typeof sw.fixedAmount === 'number') return;
          const p = result.payouts.find(p => p.name === vw.name);
          if (!p) return;
          const cur = p.ccAmount !== undefined ? p.ccAmount : p.amount;
          sw.ccManualAmount = cur + 1;
          render();
        };
      });

      // Delete worker
      ov.querySelectorAll('[data-del]').forEach(btn => {
        btn.onclick = () => {
          const i = parseInt(btn.dataset.del);
          const vw = workers[i];
          if (!vw) return;
          const trueIdx = saved.workers.findIndex(w => w.name === vw.name);
          if (trueIdx >= 0) saved.workers.splice(trueIdx, 1);
          // Reset ccManualAmount for remaining workers (pool changed) but keep fixedAmount
          saved.workers.forEach(w => { delete w.ccManualAmount; delete w.manualAmount; });
          render();
        };
      });

      ov.querySelectorAll('[data-edit]').forEach(el => {
        el.onclick = () => {
          const i = parseInt(el.dataset.edit);
          const vw = workers[i];
          if (!vw) return;
          const trueIdx = saved.workers.findIndex(w => w.name === vw.name);
          _showAddWorker(saved, tipSettings, render, trueIdx >= 0 ? trueIdx : undefined, locationId);
        };
      });

      // Cash UI listeners
      if (!saved.cashFlatAmounts) saved.cashFlatAmounts = {};
      if (!saved.cashPointOverrides) saved.cashPointOverrides = {};
      if (!saved.cashManualAmounts) saved.cashManualAmounts = {};

      ov.querySelectorAll('[data-cash-direct]').forEach(inp => {
        inp.addEventListener('blur', () => {
          const name = inp.dataset.cashDirect;
          const val = parseFloat(inp.value);
          if (!isNaN(val) && val >= 0) saved.cashManualAmounts[name] = val;
          render();
        });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      });

      ov.querySelectorAll('[data-cashpt-direct]').forEach(inp => {
        inp.addEventListener('blur', () => {
          const name = inp.dataset.cashptDirect;
          const val = parseFloat(inp.value);
          if (!isNaN(val) && val >= 0) saved.cashPointOverrides[name] = parseFloat(val.toFixed(2));
          render();
        });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      });

      ov.querySelectorAll('[data-cashpt-minus]').forEach(btn => {
        btn.onclick = () => {
          const name = btn.dataset.cashptMinus;
          const p = result.payouts.find(p => p.name === name);
          if (!p) return;
          const cur = saved.cashPointOverrides[name] !== undefined ? saved.cashPointOverrides[name] : p.cashPoints;
          saved.cashPointOverrides[name] = Math.max(0, parseFloat((cur - 0.05).toFixed(2)));
          render();
        };
      });

      ov.querySelectorAll('[data-cashpt-plus]').forEach(btn => {
        btn.onclick = () => {
          const name = btn.dataset.cashptPlus;
          const p = result.payouts.find(p => p.name === name);
          if (!p) return;
          const cur = saved.cashPointOverrides[name] !== undefined ? saved.cashPointOverrides[name] : p.cashPoints;
          saved.cashPointOverrides[name] = parseFloat((cur + 0.05).toFixed(2));
          render();
        };
      });

      ov.querySelectorAll('[data-cash-minus]').forEach(btn => {
        btn.onclick = () => {
          const name = btn.dataset.cashMinus;
          const p = result.payouts.find(p => p.name === name);
          if (!p) return;
          const exactCashShare = _exactCashShare(p);
          const cur = saved.cashManualAmounts[name] !== undefined ? saved.cashManualAmounts[name] : Math.floor(exactCashShare);
          saved.cashManualAmounts[name] = Math.max(0, cur - 1);
          render();
        };
      });

      ov.querySelectorAll('[data-cash-plus]').forEach(btn => {
        btn.onclick = () => {
          const name = btn.dataset.cashPlus;
          const p = result.payouts.find(p => p.name === name);
          if (!p) return;
          const exactCashShare = _exactCashShare(p);
          const cur = saved.cashManualAmounts[name] !== undefined ? saved.cashManualAmounts[name] : Math.floor(exactCashShare);
          saved.cashManualAmounts[name] = cur + 1;
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
        if (!confirm('This will permanently discard everything you entered here. This cannot be undone. Continue?')) return;
        if (ov._cleanupVV) ov._cleanupVV();
        if (__originalSnapshot) {
          WTDb.saveTipsForShift(dayKey, __originalSnapshot);
        } else {
          WTDb.deleteTipsForShift(dayKey);
        }
        ov.remove();
        _go('home');
      };
      ov.querySelector('#wt-tp-save').onclick = () => {
        saved.creditCardTotal = parseFloat(ov.querySelector('#wt-tp-cc').value) || 0;
        saved.cashTotal = parseFloat(ov.querySelector('#wt-tp-cash').value) || 0;
        const finalResult = _computeTipResult(saved.creditCardTotal, saved.cashTotal, saved.workers, feePercent, saved.manualFee, saved.cashFlatAmounts, saved.cashPointOverrides, saved.cashManualAmounts);
        const me = finalResult.payouts.find((p, i) => saved.workers[i] && saved.workers[i].isMe);
        saved.myPayout = me ? me.amount : 0;
        WTDb.saveTipsForShift(dayKey, saved);
        ov.remove();
        _go('home');
      };
    };

    render();
    document.body.appendChild(ov);
    if (highlightName) {
      const targets = [];
      if (highlightType === 'both' || highlightType === 'cash') {
        const cashRow = ov.querySelector(`[data-cash-row="${highlightName}"]`);
        if (cashRow) targets.push(cashRow);
      }
      if (highlightType === 'both' || highlightType === 'cc') {
        const ccRow = ov.querySelector(`[data-worker-name="${highlightName}"]`);
        if (ccRow) targets.push(ccRow);
      }
      if (targets.length > 0) {
        requestAnimationFrame(() => {
          targets[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
          targets.forEach(t => {
            t.style.transition = 'box-shadow .3s';
            t.style.boxShadow = '0 0 0 2px #5E5CE6';
            setTimeout(() => { t.style.boxShadow = 'none'; }, 2000);
          });
        });
      }
    }
    // Tap outside to close — saves directly first, since relying on the input's blur
    // event to fire before this click (as a timing race) isn't reliable on iOS.
    ov.addEventListener('click', e => {
      if (e.target !== ov) return;
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
      const __tapOutResult = _computeTipResult(saved.creditCardTotal, saved.cashTotal, saved.workers, feePercent, saved.manualFee, saved.cashFlatAmounts, saved.cashPointOverrides, saved.cashManualAmounts);
      const __tapOutMe = __tapOutResult.payouts.find((p, i) => saved.workers[i] && saved.workers[i].isMe);
      saved.myPayout = __tapOutMe ? __tapOutMe.amount : 0;
      WTDb.saveTipsForShift(dayKey, saved);
      ov.remove();
      _go('home');
    });
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
                ${amounts.length > 1 ? `<button data-sa-del="${i}" style="background:none;border:none;color:#636366;font-size:14px;cursor:pointer;padding:4px 8px;transition:transform .18s ease" onpointerdown="this.style.transform='rotate(90deg)'" onpointerup="this.style.transform='rotate(0deg)'" onpointerleave="this.style.transform='rotate(0deg)'">✕</button>` : ''}
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
    const label = type === 'cc' ? 'Credit Card' : 'Cash';
    if (TipRules.totalPoints(workers) <= 0) {
      const warnOv = document.createElement('div');
      warnOv.className = 'wt-overlay';
      warnOv.innerHTML = `
        <div class="wt-modal">
          <div class="wt-modal-handle"></div>
          <div class="wt-modal-title">Add workers first</div>
          <div style="color:#98989D;font-size:14px;margin-bottom:18px">This works out the total pool from your share — it needs at least one worker with points added first so it knows how the pool is split.</div>
          <div class="wt-modal-actions">
            <button class="wt-btn wt-btn-primary" id="wt-rv-warn-ok" style="width:100%">Got it</button>
          </div>
        </div>`;
      document.body.appendChild(warnOv);
      warnOv.addEventListener('click', e => { if (e.target === warnOv) warnOv.remove(); });
      warnOv.querySelector('#wt-rv-warn-ok').onclick = () => warnOv.remove();
      return;
    }

    const ov = document.createElement('div');
    ov.className = 'wt-overlay';
    document.body.appendChild(ov);

    ov.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">My ${label} Amount</div>
        <div style="color:#636366;font-size:12px;margin-bottom:14px">Enter what you actually received and your points — we'll work out the total pool. This is a math estimate from your numbers, not a confirmed count — round it after if that's how your workplace usually does it.</div>
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

    let lastValidResult = null;
    ov.addEventListener('click', e => {
      if (e.target !== ov) return;
      if (lastValidResult) onResolve(lastValidResult.reconstructedGross);
      ov.remove();
    });
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
      if (amount <= 0 || points <= 0) { preview.textContent = ''; lastValidResult = null; return; }
      const result = TipRules.reverseFromKnownAmount(amount, points, workers, feePercent, type);
      if (!result) { preview.textContent = ''; lastValidResult = null; return; }
      lastValidResult = result;
      preview.innerHTML = (type === 'cc'
        ? `Reconstructed CC total (before fee): <span style="color:#FF9F0A;font-weight:700">$${result.reconstructedGross.toFixed(2)}</span>`
        : `Reconstructed cash total: <span style="color:#FF9F0A;font-weight:700">$${result.reconstructedGross.toFixed(2)}</span>`)
        + `<div style="margin-top:2px">Estimate — you can edit or round it in the field after applying.</div>`;
    }
    ov.querySelector('#wt-rv-amount').addEventListener('input', updatePreview);
    ov.querySelector('#wt-rv-points').addEventListener('input', updatePreview);

    ov.querySelector('#wt-rv-apply').onclick = () => {
      if (!lastValidResult) { alert('Enter your amount and points.'); return; }
      ov.remove();
      onResolve(lastValidResult.reconstructedGross);
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
              <div data-roster-row="${i}" style="display:flex;align-items:center;justify-content:space-between;background:rgba(28,28,30,0.6);border-radius:14px;padding:12px 14px;margin-bottom:8px;${already?'opacity:0.6':''}">
                <div>
                  <div style="font-size:15px;font-weight:700;color:${m.isMe?'#64D2FF':'#fff'}">${m.name} ${m.isMe?'⭐':''}</div>
                  <div style="font-size:12px;color:#636366;margin-top:2px">${m.position || ''} · ${m.points || 1} pts</div>
                </div>
                <div style="display:flex;align-items:center;gap:10px">
                  <button data-roster-add="${i}" style="background:${already?'rgba(255,69,58,.12)':'rgba(48,209,88,.15)'};border:none;border-radius:10px;color:${already?'#FF453A':'#30D158'};font-size:13px;font-weight:700;padding:8px 14px;cursor:pointer">
                    ${already ? '✓ Added — tap to remove' : '+ Add'}
                  </button>
                  <button data-roster-delete="${i}" title="Remove from roster" style="background:none;border:none;color:#636366;font-size:14px;cursor:pointer;padding:4px 8px;transition:transform .18s ease;display:${already?'none':'inline-flex'}" onpointerdown="this.style.transform='rotate(90deg)'" onpointerup="this.style.transform='rotate(0deg)'" onpointerleave="this.style.transform='rotate(0deg)'">✕</button>
                </div>
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
        if (!member) return;
        const isCurrentlyAdded = TipRules.isAlreadyInWorkers(member.name, saved.workers || []);

        if (isCurrentlyAdded) {
          // Undo: they were added by mistake, or the user changed their mind
          saved.workers = (saved.workers || []).filter(w => w.name !== member.name);
          onSave();
          btn.textContent = '+ Add';
          btn.style.background = 'rgba(48,209,88,.15)';
          btn.style.color = '#30D158';
          btn.parentElement.style.opacity = '1';
          const delBtn = btn.parentElement.querySelector('[data-roster-delete]');
          if (delBtn) delBtn.style.display = 'inline-flex';
          return;
        }

        // Sync CC/cash from the live inputs first — in case they were typed but the field never lost focus
        const ccInput = document.querySelector('#wt-tp-cc');
        const cashInput = document.querySelector('#wt-tp-cash');
        if (ccInput) saved.creditCardTotal = parseFloat(ccInput.value.replace(',','.')) || saved.creditCardTotal;
        if (cashInput) saved.cashTotal = parseFloat(cashInput.value.replace(',','.')) || saved.cashTotal;
        if (!saved.workers) saved.workers = [];
        saved.workers.push(TipRules.rosterMemberToWorker(member));
        // Same sort as manual add: isMe first, then by points descending
        saved.workers = [
          ...saved.workers.filter(w => w.isMe),
          ...saved.workers.filter(w => !w.isMe).sort((a, b) => (b.points || 0) - (a.points || 0))
        ];
        onSave();
        btn.textContent = '✓ Added — tap to remove';
        btn.style.background = 'rgba(255,69,58,.12)';
        btn.style.color = '#FF453A';
        btn.parentElement.style.opacity = '0.6';
        const delBtn = btn.parentElement.querySelector('[data-roster-delete]');
        if (delBtn) delBtn.style.display = 'none';
      };
    });

    ov.querySelectorAll('[data-roster-delete]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const i = parseInt(btn.dataset.rosterDelete);
        const member = roster[i];
        if (!member) return;
        if (!confirm(`Remove ${member.name} from your roster? Past tip pools they were part of won't be affected.`)) return;
        WTDb.deleteRosterMember(locationId, member.name);
        const row = ov.querySelector(`[data-roster-row="${i}"]`);
        if (row) row.remove();
      };
    });
  }

  const DAY_OFF_REASONS = [
    { type: 'not_scheduled', label: 'Not scheduled' },
    { type: 'weather', label: 'Weather', subtypes: [
      { id: 'hot', label: 'Extreme heat' },
      { id: 'cold', label: 'Cold' },
      { id: 'rain', label: 'Rain' },
      { id: 'storm', label: 'Storm' }
    ]},
    { type: 'cancelled', label: 'Shift cancelled' },
    { type: 'sick', label: 'Sick' },
    { type: 'requested_off', label: 'Requested off (unpaid)' },
    { type: 'custom', label: 'Custom' }
  ];

  function _dayOffLabel(reason) {
    if (!reason) return '';
    const def = DAY_OFF_REASONS.find(r => r.type === reason.type);
    if (!def) return '';
    if (reason.type === 'weather') {
      const sub = def.subtypes.find(s => s.id === reason.subtype);
      return `Weather${sub ? ' · ' + sub.label : ''}`;
    }
    if (reason.type === 'custom') return reason.note ? `Custom: ${reason.note}` : 'Custom';
    return def.label;
  }

  function _showDayOffPicker(date, profile, onSave) {
    const dayOffProfile = profile || 'restaurant';
    const existing = WTDb.getDayOffReason(date, dayOffProfile);
    const ov = document.createElement('div');
    ov.className = 'wt-overlay';
    ov.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">Why no shift on ${_fmtDate(date)}?</div>
        <div id="wt-do-types" style="display:flex;flex-direction:column;gap:8px;margin-top:6px">
          ${DAY_OFF_REASONS.map(r => `
            <button data-do-type="${r.type}" style="text-align:left;background:${existing && existing.type===r.type ? 'rgba(94,92,230,.15)' : 'rgba(28,28,30,0.6)'};border:1px solid ${existing && existing.type===r.type ? '#5E5CE6' : 'transparent'};border-radius:12px;padding:12px 14px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:transform .1s"
              onpointerdown="this.style.transform='scale(.97)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">${r.label}</button>
            ${r.type === 'weather' ? `<div id="wt-do-sub" style="display:${existing && existing.type==='weather' ? 'flex' : 'none'};gap:8px;flex-wrap:wrap"></div>` : ''}
            ${r.type === 'custom' ? `<div id="wt-do-note-wrap" style="display:${existing && existing.type==='custom' ? 'block' : 'none'}">
              <input id="wt-do-note" class="wt-input" type="text" placeholder="What happened?" value="${existing && existing.note ? existing.note : ''}" onclick="this.select()" onfocus="this.select()">
            </div>` : ''}
          `).join('')}
        </div>
        <div class="wt-modal-actions" style="margin-top:20px">
          <button class="wt-btn wt-btn-secondary" id="wt-do-cancel">Cancel</button>
          <button class="wt-btn wt-btn-primary" id="wt-do-save">Save</button>
        </div>
        ${existing ? `<button id="wt-do-remove" class="wt-tap-fade" style="width:100%;margin-top:10px;background:none;border:none;color:#FF453A;font-size:13px;font-weight:600;cursor:pointer;padding:8px">Remove</button>` : ''}
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => {
      if (e.target !== ov) return;
      if (selectedType && !(selectedType === 'weather' && !selectedSubtype)) {
        const data = { type: selectedType };
        if (selectedType === 'weather') data.subtype = selectedSubtype;
        if (selectedType === 'custom') data.note = ov.querySelector('#wt-do-note').value.trim();
        WTDb.saveDayOffReason(date, dayOffProfile, data);
        onSave();
      }
      ov.remove();
    });

    let selectedType = existing ? existing.type : null;
    let selectedSubtype = existing ? existing.subtype : null;

    function renderSub() {
      const subWrap = ov.querySelector('#wt-do-sub');
      const noteWrap = ov.querySelector('#wt-do-note-wrap');
      const def = DAY_OFF_REASONS.find(r => r.type === selectedType);
      if (def && def.subtypes) {
        subWrap.style.display = 'flex';
        subWrap.innerHTML = def.subtypes.map(s => `
          <button data-do-sub="${s.id}" style="background:${selectedSubtype===s.id?'rgba(94,92,230,.2)':'rgba(28,28,30,0.6)'};border:1px solid ${selectedSubtype===s.id?'#5E5CE6':'transparent'};border-radius:10px;padding:8px 12px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:transform .1s"
            onpointerdown="this.style.transform='scale(.95)'" onpointerup="this.style.transform='scale(1)'" onpointerleave="this.style.transform='scale(1)'">${s.label}</button>
        `).join('');
        subWrap.querySelectorAll('[data-do-sub]').forEach(btn => {
          btn.onclick = () => { selectedSubtype = btn.dataset.doSub; renderSub(); };
        });
      } else {
        subWrap.style.display = 'none';
      }
      noteWrap.style.display = selectedType === 'custom' ? 'block' : 'none';
    }

    ov.querySelectorAll('[data-do-type]').forEach(btn => {
      btn.onclick = () => {
        selectedType = btn.dataset.doType;
        selectedSubtype = null;
        ov.querySelectorAll('[data-do-type]').forEach(b => {
          const on = b.dataset.doType === selectedType;
          b.style.background = on ? 'rgba(94,92,230,.15)' : 'rgba(28,28,30,0.6)';
          b.style.borderColor = on ? '#5E5CE6' : 'transparent';
        });
        renderSub();
      };
    });
    renderSub();

    ov.querySelector('#wt-do-cancel').onclick = () => ov.remove();
    ov.querySelector('#wt-do-save').onclick = () => {
      if (!selectedType) { alert('Pick a reason.'); return; }
      const data = { type: selectedType };
      if (selectedType === 'weather') {
        if (!selectedSubtype) { alert('Pick the type of weather.'); return; }
        data.subtype = selectedSubtype;
      }
      if (selectedType === 'custom') data.note = ov.querySelector('#wt-do-note').value.trim();
      WTDb.saveDayOffReason(date, dayOffProfile, data);
      ov.remove();
      onSave();
    };
    const removeBtn = ov.querySelector('#wt-do-remove');
    if (removeBtn) removeBtn.onclick = () => {
      if (!confirm('Remove this day off reason? This cannot be undone.')) return;
      WTDb.deleteDayOffReason(date, dayOffProfile);
      ov.remove();
      onSave();
    };
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
        <label class="wt-modal-label">This person's points</label>
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
        <p style="font-size:12px;color:#636366;margin-top:8px;line-height:1.5">Just for this one person — not the group's total. Each position is weighted on its own; the app adds everyone up automatically.</p>
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
      if (_containsProfanity(name)) { alert('Please use an appropriate name.'); return; }
      // Sync CC/cash from the live inputs first — in case they were typed but the field never lost focus
      const ccInput = document.querySelector('#wt-tp-cc');
      const cashInput = document.querySelector('#wt-tp-cash');
      if (ccInput) saved.creditCardTotal = parseFloat(ccInput.value.replace(',','.')) || saved.creditCardTotal;
      if (cashInput) saved.cashTotal = parseFloat(cashInput.value.replace(',','.')) || saved.cashTotal;
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
    const globalFeePercent = WTDb.getTipSettings().processingFeePercent || 3;
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
        <label class="wt-modal-label">Start date <span style="font-size:11px;color:#636366;font-weight:400">(when you started — optional, defaults to your first tracked shift)</span></label>
        <input id="wt-el-startdate" class="wt-input" type="date" value="${loc.startDate || ''}">
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
        <label class="wt-modal-label">Pay Type</label>
        <select class="wt-input" id="wt-el-paytype">
          <option value="hourly" ${(loc.payType||'hourly')==='hourly'?'selected':''}>Hourly</option>
          <option value="salary" ${loc.payType==='salary'?'selected':''}>Fixed Salary</option>
        </select>
        <div id="wt-el-salary-wrap" style="display:${loc.payType==='salary'?'block':'none'}">
          <label class="wt-modal-label">Salary Amount</label>
          <div style="display:flex;align-items:center;background:#2C2C2E;border-radius:14px;overflow:hidden;border:1px solid #38383A;margin-bottom:4px">
            <span style="padding:0 10px;color:#98989D;font-size:15px">$</span>
            <input id="wt-el-salary-amt" type="text" inputmode="decimal" value="${loc.salaryAmount || ''}"
              style="flex:1;background:none;border:none;color:#fff;font-size:16px;font-weight:700;padding:12px 0;outline:none"
              onclick="this.select()" onfocus="this.select()">
          </div>
          <select class="wt-input" id="wt-el-salary-period">
            <option value="annual" ${(loc.salaryPeriod||'annual')==='annual'?'selected':''}>Per year</option>
            <option value="monthly" ${loc.salaryPeriod==='monthly'?'selected':''}>Per month</option>
          </select>
        </div>
        <label class="wt-modal-label">Credit card fee % <span style="font-size:11px;color:#636366;font-weight:400">(optional — blank uses the ${globalFeePercent}% default from Settings)</span></label>
        <div style="display:flex;align-items:center;background:#2C2C2E;border-radius:14px;overflow:hidden;border:1px solid #38383A;margin-bottom:4px">
          <input id="wt-el-fee" type="text" inputmode="decimal" placeholder="Default: ${globalFeePercent}%"
            value="${typeof loc.processingFeePercent === 'number' ? loc.processingFeePercent : ''}"
            style="flex:1;background:none;border:none;color:#fff;font-size:16px;font-weight:700;padding:12px 14px;outline:none"
            onclick="this.select()" onfocus="this.select()">
          <span style="padding:0 14px;color:#98989D;font-size:15px">%</span>
        </div>
        <label class="wt-modal-label">Pay Day</label>
        <select class="wt-input" id="wt-el-payday">
          <option value="" ${!loc.payDayOfWeek?'selected':''}>Same as default (${['','Mon','Tue','Wed','Thu','Fri','Sat','Sun'][settings.payDayOfWeek||5]})</option>
          ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((d,i) =>
            `<option value="${i+1}" ${loc.payDayOfWeek===(i+1)?'selected':''}>${d}</option>`
          ).join('')}
        </select>
        <label class="wt-modal-label">Pay Period</label>
        <select class="wt-input" id="wt-el-payperiod">
          <option value="" ${!loc.payPeriod?'selected':''}>Same as default</option>
          <option value="weekly" ${loc.payPeriod==='weekly'?'selected':''}>Weekly</option>
          <option value="biweekly" ${loc.payPeriod==='biweekly'?'selected':''}>Bi-Weekly</option>
          <option value="semimonthly" ${loc.payPeriod==='semimonthly'?'selected':''}>Semi-Monthly</option>
          <option value="event" ${loc.payPeriod==='event'?'selected':''}>Per Event</option>
        </select>
        <div id="wt-el-biweekly-wrap" style="display:${loc.payPeriod==='biweekly'?'block':'none'}">
          <label class="wt-modal-label">Any known past payday <span style="font-size:11px;color:#636366;font-weight:400">(anchors the 2-week cycle)</span></label>
          <input id="wt-el-biweekly-anchor" class="wt-input" type="date" value="${loc.biweeklyAnchor || ''}">
        </div>
        <div id="wt-el-semimonthly-wrap" style="display:${loc.payPeriod==='semimonthly'?'block':'none'}">
          <label class="wt-modal-label">Split dates <span style="font-size:11px;color:#636366;font-weight:400">(defaults to 1st and 16th)</span></label>
          <div style="display:flex;gap:8px">
            <input id="wt-el-semimonthly-c1" class="wt-input" type="text" inputmode="numeric" value="${(loc.semimonthlyDates||[1,16])[0]}" style="text-align:center">
            <input id="wt-el-semimonthly-c2" class="wt-input" type="text" inputmode="numeric" value="${(loc.semimonthlyDates||[1,16])[1]}" style="text-align:center">
          </div>
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
            <label>Calculate Overtime by</label>
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

    ov.querySelector('#wt-el-paytype').onchange = function() {
      ov.querySelector('#wt-el-salary-wrap').style.display = this.value === 'salary' ? 'block' : 'none';
    };
    ov.querySelector('#wt-el-payperiod').onchange = function() {
      ov.querySelector('#wt-el-biweekly-wrap').style.display = this.value === 'biweekly' ? 'block' : 'none';
      ov.querySelector('#wt-el-semimonthly-wrap').style.display = this.value === 'semimonthly' ? 'block' : 'none';
    };

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
      const nameEl = ov.querySelector('#wt-el-name');
      const name = nameEl.value.trim();
      const rate = parseFloat(rateInput.value.replace(',','.'));
      const color = ov.querySelector('#wt-el-color').value;
      const paidBreaks = ov.querySelector('#wt-el-paid-break').checked;
      if (!name) {
        nameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        nameEl.focus();
        alert('Enter a location name.');
        return;
      }
      if (!rate || rate <= 0) {
        rateInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        rateInput.focus();
        alert('Enter a valid rate.');
        return;
      }
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
      loc.startDate = ov.querySelector('#wt-el-startdate').value || null;
      loc.workProfile = ov.querySelector('#wt-el-profile').value;
      loc.overtimeRules = { calculateBy: calcBy, levels };
      const feeVal = ov.querySelector('#wt-el-fee').value.trim();
      loc.processingFeePercent = feeVal !== '' && !isNaN(parseFloat(feeVal)) ? parseFloat(feeVal) : null;
      const pdVal = ov.querySelector('#wt-el-payday').value;
      loc.payDayOfWeek = pdVal ? parseInt(pdVal) : null;

      loc.payType = ov.querySelector('#wt-el-paytype').value;
      if (loc.payType === 'salary') {
        const salaryAmt = parseFloat(ov.querySelector('#wt-el-salary-amt').value.replace(',','.'));
        if (!salaryAmt || salaryAmt <= 0) { alert('Enter a valid salary amount.'); return; }
        loc.salaryAmount = salaryAmt;
        loc.salaryPeriod = ov.querySelector('#wt-el-salary-period').value;
      } else {
        loc.salaryAmount = null;
        loc.salaryPeriod = null;
      }

      const ppVal = ov.querySelector('#wt-el-payperiod').value;
      loc.payPeriod = ppVal || null;
      if (ppVal === 'biweekly') {
        loc.biweeklyAnchor = ov.querySelector('#wt-el-biweekly-anchor').value || null;
      } else {
        loc.biweeklyAnchor = null;
      }
      if (ppVal === 'semimonthly') {
        const c1 = parseInt(ov.querySelector('#wt-el-semimonthly-c1').value) || 1;
        const c2 = parseInt(ov.querySelector('#wt-el-semimonthly-c2').value) || 16;
        if (c1 < 1 || c1 > 28 || c2 < 1 || c2 > 28 || c1 >= c2) { alert('Split dates must be two different days, 1–28, in order.'); return; }
        loc.semimonthlyDates = [c1, c2];
      } else {
        loc.semimonthlyDates = null;
      }

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
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) { callback(); return; }
      const reader = new FileReader();
      reader.onload = async ev => {
        const ok = await _savePhotoSafe(shiftId, photoKey, ev.target.result);
        if (!ok) { callback(); return; }
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

  // Weather/pace are deliberately limited to 2-3 options each — few enough buckets that each
  // one accumulates real sample size over time, instead of scattering into one-off anecdotes
  // that can't support any actual average. The free-text note is personal-reference only and
  // is never used in Stats aggregation.
  function _showShiftContext(shift) {
    const ov = document.createElement('div');
    ov.className = 'wt-overlay';
    let weather = shift.weatherTag || null;
    let pace = shift.paceTag || null;
    ov.innerHTML = `
      <div class="wt-modal">
        <div class="wt-modal-handle"></div>
        <div class="wt-modal-title">Shift Notes</div>
        <label class="wt-modal-label">Weather</label>
        <div id="wt-sc-weather" style="display:flex;gap:8px;margin-bottom:16px">
          <button data-v="" class="wt-sc-opt" style="flex:1;padding:10px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer">Normal</button>
          <button data-v="bad" class="wt-sc-opt" style="flex:1;padding:10px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer">Bad</button>
        </div>
        <label class="wt-modal-label">Pace</label>
        <div id="wt-sc-pace" style="display:flex;gap:8px;margin-bottom:16px">
          <button data-v="slow" class="wt-sc-opt" style="flex:1;padding:10px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer">Slower</button>
          <button data-v="" class="wt-sc-opt" style="flex:1;padding:10px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer">Normal</button>
          <button data-v="busy" class="wt-sc-opt" style="flex:1;padding:10px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer">Busier</button>
        </div>
        <label class="wt-modal-label">Note <span style="font-size:11px;color:#636366;font-weight:400">(just for you — not used in Stats)</span></label>
        <textarea id="wt-sc-note" class="wt-input" style="min-height:60px;resize:vertical" placeholder="e.g. concert let out nearby...">${shift.contextNote || ''}</textarea>
        <div class="wt-modal-actions" style="margin-top:18px">
          <button class="wt-btn wt-btn-secondary" id="wt-sc-cancel">Cancel</button>
          <button class="wt-btn wt-btn-primary" id="wt-sc-save">Save</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });

    function refreshOpts(containerId, val) {
      ov.querySelectorAll(`#${containerId} .wt-sc-opt`).forEach(b => {
        const active = b.dataset.v === (val || '');
        b.style.background = active ? '#5E5CE6' : '#2C2C2E';
        b.style.color = '#fff';
        b.style.border = active ? 'none' : '1px solid #3A3A3C';
      });
    }
    refreshOpts('wt-sc-weather', weather);
    refreshOpts('wt-sc-pace', pace);
    ov.querySelectorAll('#wt-sc-weather .wt-sc-opt').forEach(b => {
      b.onclick = () => { weather = b.dataset.v || null; refreshOpts('wt-sc-weather', weather); };
    });
    ov.querySelectorAll('#wt-sc-pace .wt-sc-opt').forEach(b => {
      b.onclick = () => { pace = b.dataset.v || null; refreshOpts('wt-sc-pace', pace); };
    });

    ov.querySelector('#wt-sc-cancel').onclick = () => ov.remove();
    ov.querySelector('#wt-sc-save').onclick = () => {
      const saved = WTDb.getShifts().find(s => s.id === shift.id);
      if (saved) {
        saved.weatherTag = weather;
        saved.paceTag = pace;
        saved.contextNote = ov.querySelector('#wt-sc-note').value.trim();
        WTDb.saveShift(saved);
      }
      ov.remove();
      _go('home');
    };
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
        <label class="wt-modal-label">Date</label>
        <input id="wt-es-date" class="wt-input" type="date" value="${shift.date}" style="margin-bottom:4px">
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
      const newDate = ov.querySelector('#wt-es-date').value;
      if (!newDate) { alert('Pick a valid date.'); return; }
      const saved = WTDb.getShifts().find(s => s.id === shift.id);
      if (saved) {
        saved.shiftType = newType;
        saved.hourlyRate = newRate;
        saved.date = newDate;
        WTDb.saveShift(saved);
      }
      ov.remove();
      _go('home');
    };
  }

  return { mount };
})();
