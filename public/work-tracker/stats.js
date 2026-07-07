// Tempo — Stats module (pure logic, no DOM)
// Aggregates hours, gross/net pay, CC tips, and cash tips per location over a date range.
// Reuses WTDb, WTRules, TipRules — no duplicated math, no new storage keys.

const StatsRules = (() => {

  function _ds(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Rolling window: last N days including today.
  function rollingRange(days) {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    return { start: _ds(start), end: _ds(end) };
  }

  // Same-length window immediately before the given range — for "vs previous period" comparisons.
  function previousPeriod(startDate, endDate) {
    const start = new Date(startDate + 'T12:00:00');
    const end = new Date(endDate + 'T12:00:00');
    const lengthDays = Math.round((end - start) / 86400000) + 1;
    const prevEnd = new Date(start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - (lengthDays - 1));
    return { start: _ds(prevStart), end: _ds(prevEnd) };
  }

  // Calendar year — Jan 1 to Dec 31, or Jan 1 to today if it's the current year.
  function yearRange(year) {
    const now = new Date();
    const start = new Date(year, 0, 1);
    const end = (year === now.getFullYear()) ? now : new Date(year, 11, 31);
    return { start: _ds(start), end: _ds(end) };
  }

  // Calendar week (Mon–Sun), same definition used everywhere else in the app (Pay History).
  // offsetWeeks=0 is the current week; negative values go to past weeks. Caps at "now" so
  // the current week never claims data for days that haven't happened yet.
  function weekRange(offsetWeeks) {
    const ws = getWeekStart(new Date());
    ws.setDate(ws.getDate() + offsetWeeks * 7);
    const we = getWeekEnd(ws);
    const now = new Date();
    const end = we > now ? now : we;
    return { start: _ds(ws), end: _ds(end), weekStart: new Date(ws) };
  }

  // List of years that have any tracked activity (shifts or payments) — for the "by year" picker.
  function activeYears() {
    const years = new Set();
    WTDb.getShifts().forEach(s => { if (s.date) years.add(parseInt(s.date.slice(0, 4))); });
    WTDb.getAllPayments().forEach(p => { if (p.weekStart) years.add(parseInt(p.weekStart.slice(0, 4))); });
    return [...years].sort((a, b) => b - a);
  }

  // My CC + cash cut for one shift, using the same engine as the rest of the app (Tip Pool, Pay History).
  function _myTipCut(shift, feePercent) {
    const t = WTDb.getTipsForShift(shift.id);
    if (!t) return { cc: 0, cash: 0 };
    const tWorkers = t.workers || [];
    const tHasFixed = tWorkers.some(w => typeof w.fixedAmount === 'number');
    const tCashOpts = {
      flatAmounts: t.cashFlatAmounts || {},
      pointOverrides: t.cashPointOverrides || {},
      manualAmounts: t.cashManualAmounts || {}
    };
    const tHasCashOv = Object.keys(tCashOpts.flatAmounts).length > 0 || Object.keys(tCashOpts.pointOverrides).length > 0;
    const result = (tHasFixed || tHasCashOv)
      ? TipRules.calculatePayoutsWithFixed(t.creditCardTotal || 0, t.cashTotal || 0, tWorkers, t.feePercent || feePercent, t.manualFee, tCashOpts)
      : TipRules.calculatePayouts(t.creditCardTotal || 0, t.cashTotal || 0, tWorkers, t.feePercent || feePercent, t.manualFee);
    const meIdx = tWorkers.findIndex(w => w.isMe);
    if (meIdx < 0) return { cc: 0, cash: 0 };
    const mp = result.payouts[meIdx];
    const cc = mp.ccAmount || 0;
    const cash = typeof mp.cashAmount === 'number' ? mp.cashAmount : (mp.amount - (mp.ccAmount || 0));
    return { cc, cash };
  }

  // Sum hours/pay respecting REAL calendar-week OT boundaries — weeklyPay() assumes its
  // input is exactly one week, so a multi-week stats range must be split by real week first,
  // otherwise overtime thresholds get pooled across weeks and understate actual OT pay.
  function _payAcrossRealWeeks(shifts) {
    const byWeek = {};
    shifts.forEach(s => {
      const wsKey = _ds(getWeekStart(new Date(s.date + 'T12:00:00')));
      if (!byWeek[wsKey]) byWeek[wsKey] = [];
      byWeek[wsKey].push(s);
    });
    let totalHours = 0, total = 0, overtimeHours = 0;
    Object.values(byWeek).forEach(weekShifts => {
      const wp = WTRules.weeklyPay(weekShifts);
      totalHours += wp.totalHours;
      total += wp.total;
      overtimeHours += wp.overtimeHours;
    });
    return { totalHours, total, overtimeHours };
  }

  // Aggregate everything for one location within [startDate, endDate].
  function computeLocationStats(location, shifts, payments, feePercent) {
    const hoursPay = _payAcrossRealWeeks(shifts);

    let ccTips = 0, cashTips = 0;
    shifts.forEach(s => {
      const cut = _myTipCut(s, feePercent);
      ccTips += cut.cc;
      cashTips += cut.cash;
    });

    const expectedGross = hoursPay.total + ccTips + cashTips;
    const taxSettings = WTDb.getTaxSettings();
    const netData = WTRules.estimateNet(expectedGross, taxSettings);
    const expectedNet = netData ? netData.net : null;

    let receivedGross = 0, receivedNet = 0, grossCount = 0, netCount = 0, rateSum = 0, rateWeight = 0;
    payments.forEach(p => {
      const pa = WTRules.paymentAmounts(p);
      if (pa.gross !== null) { receivedGross += pa.gross; grossCount++; }
      if (pa.net !== null) { receivedNet += pa.net; netCount++; }
      if (pa.gross !== null && pa.net !== null && pa.gross > 0) {
        rateSum += ((pa.gross - pa.net) / pa.gross) * pa.gross;
        rateWeight += pa.gross;
      }
    });

    return {
      locationId: location.id,
      locationName: location.name,
      hours: hoursPay.totalHours,
      overtimeHours: hoursPay.overtimeHours,
      grossFromHours: hoursPay.total,
      ccTips,
      cashTips,
      expectedGross,
      expectedNet,
      receivedGross: grossCount > 0 ? receivedGross : null,
      receivedNet: netCount > 0 ? receivedNet : null,
      realTaxRate: rateWeight > 0 ? (rateSum / rateWeight) * 100 : null,
      shiftsCount: shifts.length,
      paymentsCount: payments.length
    };
  }

  // Full picture for a date range: every active location, separately, plus a combined total.
  function computeAllStats(startDate, endDate) {
    const allLocs = WTDb.getLocations();
    const shifts = WTDb.getShiftsInRange(startDate, endDate);
    const payments = WTDb.getAllPayments().filter(p => p.weekStart >= startDate && p.weekStart <= endDate);
    const tipSettings = WTDb.getTipSettings();
    const feePercent = tipSettings.processingFeePercent || 3;

    const activeLocIds = new Set([
      ...shifts.map(s => s.locationId),
      ...payments.map(p => p.locationId)
    ]);

    const perLocation = allLocs
      .filter(l => activeLocIds.has(l.id))
      .map(l => computeLocationStats(
        l,
        shifts.filter(s => s.locationId === l.id),
        payments.filter(p => p.locationId === l.id),
        feePercent
      ));

    const totals = perLocation.reduce((acc, s) => {
      acc.hours += s.hours;
      acc.grossFromHours += s.grossFromHours;
      acc.ccTips += s.ccTips;
      acc.cashTips += s.cashTips;
      acc.expectedGross += s.expectedGross;
      if (s.receivedGross !== null) { acc.receivedGross += s.receivedGross; acc._hasGross = true; }
      if (s.receivedNet !== null) { acc.receivedNet += s.receivedNet; acc._hasNet = true; }
      return acc;
    }, { hours: 0, grossFromHours: 0, ccTips: 0, cashTips: 0, expectedGross: 0, receivedGross: 0, receivedNet: 0, _hasGross: false, _hasNet: false });

    totals.receivedGross = totals._hasGross ? totals.receivedGross : null;
    totals.receivedNet = totals._hasNet ? totals.receivedNet : null;
    delete totals._hasGross;
    delete totals._hasNet;

    // Days actually worked (distinct dates with any shift) within the range.
    const workedDates = new Set(shifts.map(s => s.date));
    const daysWorked = workedDates.size;
    const rangeStart = new Date(startDate + 'T12:00:00');
    const rangeEnd = new Date(endDate + 'T12:00:00');
    const totalDaysInRange = Math.round((rangeEnd - rangeStart) / 86400000) + 1;
    totals.daysWorked = daysWorked;
    totals.totalDaysInRange = totalDaysInRange;
    totals.avgHoursPerWorkedDay = daysWorked > 0 ? totals.hours / daysWorked : 0;
    totals.shiftsCount = perLocation.reduce((sum, l) => sum + l.shiftsCount, 0);

    // "This is me" position breakdown — counts distinct DAYS per position (not shifts,
    // so two shifts in one day at the same position only count once). Only reflects shifts
    // that had tips entered with "this is me" set, since position currently lives only
    // inside Tip Pool worker records, not on the shift itself — a real, known limitation.
    const positionDaysMap = {};
    shifts.forEach(s => {
      const t = WTDb.getTipsForShift(s.id);
      const me = t && t.workers ? t.workers.find(w => w.isMe) : null;
      if (me && me.position) {
        if (!positionDaysMap[me.position]) positionDaysMap[me.position] = new Set();
        positionDaysMap[me.position].add(s.date);
      }
    });
    const positionBreakdown = Object.entries(positionDaysMap)
      .map(([position, dates]) => ({ position, days: dates.size }))
      .sort((a, b) => b.days - a.days);

    return { perLocation, totals, positionBreakdown, startDate, endDate };
  }

  return {
    rollingRange, previousPeriod, yearRange, weekRange, activeYears,
    computeLocationStats, computeAllStats
  };
})();
