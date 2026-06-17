// work-tracker/rules.js
// Pure business logic - no DOM, fully testable
// NYC Restaurant industry rules 2026

const WTRules = (() => {

  function entryHours(entry) {
    if (!entry.clockOut) return 0;
    const ms = new Date(entry.clockOut) - new Date(entry.clockIn);
    const breakMs = (entry.breakMinutes || 0) * 60000;
    return Math.max(0, (ms - breakMs) / 3600000);
  }

  function shiftHours(shift) {
    return (shift.entries || []).reduce((sum, e) => sum + entryHours(e), 0);
  }

  function shiftEarnings(shift) {
    return shiftHours(shift) * (shift.hourlyRate || NYC_MIN_WAGE);
  }

  function weeklyPay(shifts) {
    const byLocation = {};
    let totalHours = 0;
    const sorted = [...shifts].sort((a, b) => new Date(a.date) - new Date(b.date));
    sorted.forEach(shift => {
      const hrs = shiftHours(shift);
      const rate = shift.hourlyRate || NYC_MIN_WAGE;
      const locName = shift.locationName || 'Unknown';
      if (!byLocation[locName]) byLocation[locName] = { hours: 0, rate };
      byLocation[locName].hours += hrs;
      totalHours += hrs;
    });
    const regularHours = Math.min(totalHours, OVERTIME_THRESHOLD);
    const overtimeHours = Math.max(0, totalHours - OVERTIME_THRESHOLD);
    let regularPay = 0, overtimePay = 0;
    if (totalHours > 0) {
      Object.values(byLocation).forEach(loc => {
        const locReg = (loc.hours / totalHours) * regularHours;
        const locOT = (loc.hours / totalHours) * overtimeHours;
        loc.regularHours = locReg;
        loc.overtimeHours = locOT;
        loc.regularPay = locReg * loc.rate;
        loc.overtimePay = locOT * loc.rate * OVERTIME_MULTIPLIER;
        loc.total = loc.regularPay + loc.overtimePay;
        regularPay += loc.regularPay;
        overtimePay += loc.overtimePay;
      });
    }
    return {
      totalHours, regularHours, overtimeHours,
      regularPay, overtimePay,
      total: regularPay + overtimePay,
      isOvertime: overtimeHours > 0,
      byLocation,
      overtimeWarning: overtimeHours > 0
        ? `⚠️ ${overtimeHours.toFixed(1)} OT hrs × 1.5 = $${overtimePay.toFixed(2)} extra`
        : null
    };
  }

  function dailySummary(shifts) {
    const totalHrs = shifts.reduce((s, sh) => s + shiftHours(sh), 0);
    const totalEarnings = shifts.reduce((s, sh) => s + shiftEarnings(sh), 0);
    return { totalHrs, totalEarnings };
  }

  function fmtHours(h) {
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    if (hrs === 0) return `${mins}m`;
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
  }

  function fmtMoney(n) {
    return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function getPayDate(weekStart, settings) {
    if (!settings || settings.payPeriod === 'event') return 'Same day (event)';
    if (settings.payPeriod === 'custom' && settings.customPayDate) {
      return new Date(settings.customPayDate).toLocaleDateString('en-US',
        { weekday: 'long', month: 'short', day: 'numeric' });
    }
    const ws = new Date(weekStart);
    ws.setDate(ws.getDate() + 7);
    const day = ws.getDay();
    const daysToFri = (5 - day + 7) % 7;
    ws.setDate(ws.getDate() + daysToFri);
    return ws.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  function getRecentWeeks(n) {
    n = n || 8;
    const weeks = [];
    const ws = getWeekStart(new Date());
    for (let i = 0; i < n; i++) {
      weeks.push(new Date(ws));
      ws.setDate(ws.getDate() - 7);
    }
    return weeks;
  }

  return {
    entryHours, shiftHours, shiftEarnings, weeklyPay,
    dailySummary, fmtHours, fmtMoney, getPayDate, getRecentWeeks
  };
})();
