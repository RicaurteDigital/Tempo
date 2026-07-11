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
  function computeAllStats(startDate, endDate, workProfile) {
    const profile = workProfile || 'restaurant';
    const allLocs = WTDb.getLocations().filter(l => (l.workProfile || 'restaurant') === profile);
    const profileLocIds = new Set(allLocs.map(l => l.id));
    const shifts = WTDb.getShiftsInRange(startDate, endDate).filter(s => (s.workProfile || 'restaurant') === profile);
    const payments = WTDb.getAllPayments().filter(p => p.weekStart >= startDate && p.weekStart <= endDate && profileLocIds.has(p.locationId));
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
    // Separate count for the hours average: excludes tips-only backfilled days
    // (shifts with no entries at all, from "Log Past Data" without an hours value),
    // so those days don't silently pull the average down with a phantom zero.
    const datesWithHours = new Set(shifts.filter(s => (s.entries || []).length > 0).map(s => s.date));
    const daysWithHours = datesWithHours.size;
    const rangeStart = new Date(startDate + 'T12:00:00');
    const rangeEnd = new Date(endDate + 'T12:00:00');
    const totalDaysInRange = Math.round((rangeEnd - rangeStart) / 86400000) + 1;
    totals.daysWorked = daysWorked;
    totals.totalDaysInRange = totalDaysInRange;
    totals.avgHoursPerWorkedDay = daysWithHours > 0 ? totals.hours / daysWithHours : 0;
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

  // Per-shift earnings using the same simple straight-rate math ShiftCard already shows
  // (hours × rate, no OT premium) — kept consistent with how individual shifts display
  // elsewhere, rather than trying to attribute weekly OT premium to a single day.
  function _dayEarningsMap(shifts, feePercent) {
    const byDate = {};
    shifts.forEach(s => {
      if (!byDate[s.date]) byDate[s.date] = 0;
      const hrs = WTRules.shiftHours(s);
      const cut = _myTipCut(s, feePercent);
      byDate[s.date] += hrs * (s.hourlyRate || NYC_MIN_WAGE) + cut.cc + cut.cash;
    });
    return byDate;
  }

  // Earnings over time, bucketed daily for ranges up to a month, or weekly for longer
  // ranges so a chart never has to plot more than ~52 points. Every bucket in range is
  // included (even zero-earning ones) so the line stays continuous, not just connect-the-dots
  // between worked days.
  function timeSeries(startDate, endDate, workProfile) {
    const profile = workProfile || 'restaurant';
    const shifts = WTDb.getShiftsInRange(startDate, endDate).filter(s => (s.workProfile || 'restaurant') === profile);
    const tipSettings = WTDb.getTipSettings();
    const feePercent = tipSettings.processingFeePercent || 3;
    const rangeStart = new Date(startDate + 'T12:00:00');
    const rangeEnd = new Date(endDate + 'T12:00:00');
    const totalDays = Math.round((rangeEnd - rangeStart) / 86400000) + 1;
    const useWeekly = totalDays > 31;
    const byDate = _dayEarningsMap(shifts, feePercent);

    if (!useWeekly) {
      const points = [];
      for (let d = new Date(rangeStart); d <= rangeEnd; d.setDate(d.getDate() + 1)) {
        const ds = _ds(d);
        points.push({ date: ds, total: byDate[ds] || 0 });
      }
      return { points, bucketType: 'day' };
    } else {
      const byWeek = {};
      Object.keys(byDate).forEach(ds => {
        const wsKey = _ds(getWeekStart(new Date(ds + 'T12:00:00')));
        byWeek[wsKey] = (byWeek[wsKey] || 0) + byDate[ds];
      });
      const points = [];
      let wsIter = getWeekStart(new Date(rangeStart));
      while (wsIter <= rangeEnd) {
        const key = _ds(wsIter);
        points.push({ date: key, total: byWeek[key] || 0 });
        wsIter = new Date(wsIter);
        wsIter.setDate(wsIter.getDate() + 7);
      }
      return { points, bucketType: 'week' };
    }
  }

  // Average earnings by day of week (Sun–Sat) within the range — surfaces which days
  // tend to be worth the most, so "which days should I work" has an actual answer.
  function dayOfWeekPattern(startDate, endDate, workProfile) {
    const profile = workProfile || 'restaurant';
    const shifts = WTDb.getShiftsInRange(startDate, endDate).filter(s => (s.workProfile || 'restaurant') === profile);
    const tipSettings = WTDb.getTipSettings();
    const feePercent = tipSettings.processingFeePercent || 3;
    const byDate = _dayEarningsMap(shifts, feePercent);
    const dowTotals = [0, 0, 0, 0, 0, 0, 0];
    const dowCounts = [0, 0, 0, 0, 0, 0, 0];
    Object.entries(byDate).forEach(([ds, total]) => {
      const dow = new Date(ds + 'T12:00:00').getDay();
      dowTotals[dow] += total;
      dowCounts[dow]++;
    });
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return dayNames.map((name, i) => ({
      day: name,
      avg: dowCounts[i] > 0 ? dowTotals[i] / dowCounts[i] : 0,
      count: dowCounts[i]
    }));
  }

  // Days marked off within the range, broken down by reason — reuses the Day Off feature's
  // own storage, no new data collected.
  function daysOffInRange(startDate, endDate, workProfile) {
    const all = WTDb.getAllDayOffReasons(workProfile || 'restaurant');
    const inRange = Object.entries(all).filter(([date]) => date >= startDate && date <= endDate);
    const byType = {};
    inRange.forEach(([, reason]) => {
      byType[reason.type] = (byType[reason.type] || 0) + 1;
    });
    return { total: inRange.length, byType };
  }

  // Fixed-date holidays that actually move hospitality traffic (not generic office holidays
  // like Presidents Day), plus Thanksgiving and its eve — one of the busiest bar nights of
  // the year — computed since it falls on a different date each year (4th Thursday of Nov).
  function _isHospitalityHoliday(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const m = d.getMonth() + 1, day = d.getDate();
    const fixed = new Set(['1-1', '2-14', '3-17', '5-5', '7-4', '10-31', '12-24', '12-25', '12-31']);
    if (fixed.has(`${m}-${day}`)) return true;
    if (m === 11) {
      const nov1DayOfWeek = new Date(d.getFullYear(), 10, 1).getDay();
      const firstThursday = 1 + (4 - nov1DayOfWeek + 7) % 7;
      const thanksgiving = firstThursday + 21;
      if (day === thanksgiving || day === thanksgiving - 1) return true;
    }
    return false;
  }

  // What actually moves your earnings, and by how much. Start/end of month and holidays are
  // detected automatically from the date — zero data entry required. Weather and pace only
  // compare shifts you've explicitly tagged as Bad/Slower/Busier against everything else in
  // range; each comparison is only returned once both sides have at least 2 shifts, so one
  // rainy Tuesday can never look like a trend.
  function computeShiftContext(startDate, endDate, workProfile) {
    const profile = workProfile || 'restaurant';
    const shifts = WTDb.getShiftsInRange(startDate, endDate).filter(s => (s.workProfile || 'restaurant') === profile);
    const feePercent = WTDb.getTipSettings().processingFeePercent || 3;

    const buckets = {
      startOfMonth: { label: 'Start of Month (1st–5th)', in: [], out: [] },
      endOfMonth: { label: 'End of Month (last 5 days)', in: [], out: [] },
      holiday: { label: 'Holidays', in: [], out: [] },
      weather: { label: 'Bad Weather', in: [], out: [] },
      slow: { label: 'Marked "Slower"', in: [], out: [] },
      busy: { label: 'Marked "Busier"', in: [], out: [] }
    };

    shifts.forEach(s => {
      const hrs = WTRules.shiftHours(s);
      const cut = _myTipCut(s, feePercent);
      const earn = hrs * (s.hourlyRate || 15) + cut.cc + cut.cash;
      if (hrs <= 0 && earn <= 0) return; // nothing measurable yet (open or empty shift)

      const d = new Date(s.date + 'T12:00:00');
      const day = d.getDate();
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

      (day <= 5 ? buckets.startOfMonth.in : buckets.startOfMonth.out).push(earn);
      (day > lastDay - 5 ? buckets.endOfMonth.in : buckets.endOfMonth.out).push(earn);
      (_isHospitalityHoliday(s.date) ? buckets.holiday.in : buckets.holiday.out).push(earn);
      (s.weatherTag === 'bad' ? buckets.weather.in : buckets.weather.out).push(earn);
      (s.paceTag === 'slow' ? buckets.slow.in : buckets.slow.out).push(earn);
      (s.paceTag === 'busy' ? buckets.busy.in : buckets.busy.out).push(earn);
    });

    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
    const insights = [];
    Object.values(buckets).forEach(b => {
      if (b.in.length < 2 || b.out.length < 2) return; // not enough sample size to mean anything
      const inAvg = avg(b.in), outAvg = avg(b.out);
      insights.push({
        label: b.label,
        groupAvg: inAvg, groupCount: b.in.length,
        baselineAvg: outAvg,
        deltaPercent: outAvg > 0 ? ((inAvg - outAvg) / outAvg) * 100 : 0
      });
    });
    return insights;
  }

  return {
    rollingRange, yearRange, weekRange, activeYears,
    computeLocationStats, computeAllStats, timeSeries, dayOfWeekPattern, daysOffInRange,
    computeShiftContext
  };
})();
