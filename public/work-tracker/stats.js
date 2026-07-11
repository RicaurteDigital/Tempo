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
  // detected automatically from the date — zero data entry required. Most comparisons use
  // $/hour rather than total shift pay, so a longer shift that day doesn't get mistaken for
  // "this condition pays better" — it isolates whether the condition itself changes your
  // rate, not just how many hours you happened to work. Every comparison requires at least
  // 2 shifts (or weeks) on both sides, so a single anecdote never looks like a pattern.
  function computeShiftContext(startDate, endDate, workProfile) {
    const profile = workProfile || 'restaurant';
    const shifts = WTDb.getShiftsInRange(startDate, endDate).filter(s => (s.workProfile || 'restaurant') === profile);
    const feePercent = WTDb.getTipSettings().processingFeePercent || 3;
    const rangeSpanDays = (new Date(endDate) - new Date(startDate)) / 86400000;

    const records = [];
    shifts.forEach(s => {
      const hrs = WTRules.shiftHours(s);
      if (hrs <= 0) return; // open or empty shift — no rate to measure yet
      const cut = _myTipCut(s, feePercent);
      const earn = hrs * (s.hourlyRate || 15) + cut.cc + cut.cash;
      const d = new Date(s.date + 'T12:00:00');
      const dow = d.getDay();
      records.push({
        shift: s, hrs, earn, perHour: earn / hrs,
        day: d.getDate(), lastDay: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
        isWeekend: dow === 0 || dow === 5 || dow === 6, // Fri/Sat/Sun
        isHoliday: _isHospitalityHoliday(s.date)
      });
    });

    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const insights = [];
    function addInsight(label, inRecs, outRecs, metric) {
      if (inRecs.length < 2 || outRecs.length < 2) return;
      const inAvg = avg(inRecs.map(metric)), outAvg = avg(outRecs.map(metric));
      insights.push({ label, groupCount: inRecs.length, deltaPercent: outAvg > 0 ? ((inAvg - outAvg) / outAvg) * 100 : 0 });
    }

    if (rangeSpanDays >= 20) {
      addInsight('Start of Month (1st–5th)', records.filter(r => r.day <= 5), records.filter(r => r.day > 5), r => r.earn);
      addInsight('End of Month (last 5 days)', records.filter(r => r.day > r.lastDay - 5), records.filter(r => r.day <= r.lastDay - 5), r => r.earn);
    }
    addInsight('Holidays', records.filter(r => r.isHoliday), records.filter(r => !r.isHoliday), r => r.perHour);
    addInsight('Weekends (Fri–Sun)', records.filter(r => r.isWeekend), records.filter(r => !r.isWeekend), r => r.perHour);
    addInsight('Bad Weather', records.filter(r => r.shift.weatherTag === 'bad'), records.filter(r => r.shift.weatherTag !== 'bad'), r => r.perHour);
    addInsight('Marked "Slower"', records.filter(r => r.shift.paceTag === 'slow'), records.filter(r => r.shift.paceTag !== 'slow'), r => r.perHour);
    addInsight('Marked "Busier"', records.filter(r => r.shift.paceTag === 'busy'), records.filter(r => r.shift.paceTag !== 'busy'), r => r.perHour);

    // Larger vs smaller tip pools, split at the median total points in range — does sharing
    // with more people actually cost you per hour, or does it wash out with bigger sales?
    const withPts = records.map(r => {
      const t = WTDb.getTipsForShift(r.shift.id);
      if (!t || !t.workers || !t.workers.length) return null;
      return { ...r, pts: t.workers.reduce((sum, w) => sum + (w.points || 0), 0) };
    }).filter(Boolean);
    if (withPts.length >= 4) {
      const sortedPts = withPts.map(r => r.pts).sort((a, b) => a - b);
      const median = sortedPts[Math.floor(sortedPts.length / 2)];
      addInsight(`Larger Tip Pools (${median.toFixed(2)}+ pts)`,
        withPts.filter(r => r.pts >= median), withPts.filter(r => r.pts < median), r => r.perHour);
    }

    // Weeks with any day off vs weeks without — real weekly totals, not per-shift, since a
    // day off's cost shows up across the whole week's earnings, not any single shift.
    const dayOffData = WTDb.getAllDayOffReasons(profile);
    const byWeek = {};
    records.forEach(r => {
      const ws = _ds(getWeekStart(new Date(r.shift.date + 'T12:00:00')));
      byWeek[ws] = (byWeek[ws] || 0) + r.earn;
    });
    const weeksWithOff = [], weeksWithoutOff = [];
    Object.entries(byWeek).forEach(([ws, total]) => {
      const we = _ds(getWeekEnd(new Date(ws + 'T12:00:00')));
      const hasOff = Object.keys(dayOffData).some(d => d >= ws && d <= we);
      (hasOff ? weeksWithOff : weeksWithoutOff).push(total);
    });
    if (weeksWithOff.length >= 2 && weeksWithoutOff.length >= 2) {
      const inAvg = avg(weeksWithOff), outAvg = avg(weeksWithoutOff);
      insights.push({ label: 'Weeks with a Day Off', groupCount: weeksWithOff.length, deltaPercent: outAvg > 0 ? ((inAvg - outAvg) / outAvg) * 100 : 0 });
    }

    return insights;
  }

  // Purely descriptive (not a "good/bad" comparison): how long your shifts actually run, per
  // location, weekday vs weekend — e.g. "do I really stay later on weekends, and by how much."
  function shiftLengthPatterns(startDate, endDate, workProfile) {
    const profile = workProfile || 'restaurant';
    const shifts = WTDb.getShiftsInRange(startDate, endDate).filter(s => (s.workProfile || 'restaurant') === profile);
    const byLoc = {};
    shifts.forEach(s => {
      const hrs = WTRules.shiftHours(s);
      if (hrs <= 0) return;
      const isWeekend = [0, 5, 6].includes(new Date(s.date + 'T12:00:00').getDay());
      const key = s.locationName || 'Unknown';
      if (!byLoc[key]) byLoc[key] = { weekday: [], weekend: [] };
      (isWeekend ? byLoc[key].weekend : byLoc[key].weekday).push(hrs);
    });
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    return Object.entries(byLoc).map(([location, d]) => ({
      location,
      weekdayAvg: avg(d.weekday), weekdayCount: d.weekday.length,
      weekendAvg: avg(d.weekend), weekendCount: d.weekend.length
    })).filter(r => r.weekdayCount > 0 || r.weekendCount > 0);
  }

  // Current period vs the immediately preceding period of the same length (this week vs last
  // week, this month vs last month, etc.) — reuses computeAllStats for both, so the numbers
  // always agree with the rest of Stats.
  function periodComparison(startDate, endDate, workProfile) {
    const spanDays = Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
    const prevEnd = new Date(startDate); prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - spanDays + 1);
    const curTotal = computeAllStats(startDate, endDate, workProfile).totals.expectedGross;
    const prevTotal = computeAllStats(_ds(prevStart), _ds(prevEnd), workProfile).totals.expectedGross;
    return {
      curTotal, prevTotal, spanDays,
      prevStart: _ds(prevStart), prevEnd: _ds(prevEnd),
      deltaPercent: prevTotal > 0 ? ((curTotal - prevTotal) / prevTotal) * 100 : null
    };
  }

  // "Can this job actually pay my bills, and how much do I need to work for that." Uses a
  // realistic 90-day lookback (recent enough to reflect current reality, long enough to
  // smooth out one unusual week) and estimated NET income (via the user's own tax settings,
  // reusing WTRules.estimateNet) rather than gross, since "can I cover my bills" is a
  // take-home question. Falls back to gross with a clear flag if tax estimation is off.
  function sustainabilityAnalysis(workProfile, lookbackDays) {
    const days = lookbackDays || 90;
    const end = new Date();
    const start = new Date(); start.setDate(start.getDate() - (days - 1));
    const t = computeAllStats(_ds(start), _ds(end), workProfile).totals;

    const taxSettings = WTDb.getTaxSettings();
    const netEstimate = WTRules.estimateNet(t.expectedGross, taxSettings);
    const usingNet = netEstimate !== null;
    const periodEarnings = usingNet ? netEstimate.net : t.expectedGross;

    const weeksInWindow = days / 7;
    const avgHoursPerWeek = t.hours / weeksInWindow;
    const avgShiftsPerWeek = t.shiftsCount / weeksInWindow;
    const avgPerHour = t.hours > 0 ? periodEarnings / t.hours : 0;
    const avgPerShift = t.shiftsCount > 0 ? periodEarnings / t.shiftsCount : 0;
    const projectedAnnual = periodEarnings * (365 / days);

    const monthlyExpenses = (WTDb.getBudget().monthlyExpenses) || null;
    let annualExpenses = null, surplusAnnual = null, hoursNeededPerWeek = null, shiftsNeededPerWeek = null;
    if (monthlyExpenses > 0) {
      annualExpenses = monthlyExpenses * 12;
      surplusAnnual = projectedAnnual - annualExpenses;
      if (avgPerHour > 0) hoursNeededPerWeek = (annualExpenses / 52) / avgPerHour;
      if (avgPerShift > 0) shiftsNeededPerWeek = (annualExpenses / 52) / avgPerShift;
    }

    return {
      hasData: t.hours > 0, usingNet, lookbackDays: days,
      avgPerHour, avgPerShift, avgHoursPerWeek, avgShiftsPerWeek,
      projectedAnnual, projectedMonthly: projectedAnnual / 12,
      monthlyExpenses, annualExpenses, surplusAnnual,
      hoursNeededPerWeek, shiftsNeededPerWeek
    };
  }

  return {
    rollingRange, yearRange, weekRange, activeYears,
    computeLocationStats, computeAllStats, timeSeries, dayOfWeekPattern, daysOffInRange,
    computeShiftContext, shiftLengthPatterns, periodComparison, sustainabilityAnalysis
  };
})();
