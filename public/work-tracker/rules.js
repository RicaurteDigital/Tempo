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
    if (!shifts || shifts.length === 0) return {
      totalHours: 0, regularHours: 0, overtimeHours: 0,
      regularPay: 0, overtimePay: 0, total: 0,
      isOvertime: false, byLocation: {}, overtimeWarning: null
    };

    // Group shifts by location
    const byLocation = {};
    shifts.forEach(shift => {
      const locName = shift.locationName || 'Unknown';
      if (!byLocation[locName]) {
        byLocation[locName] = {
          shifts: [], hours: 0, rate: shift.hourlyRate || NYC_MIN_WAGE,
          otRules: shift.overtimeRules || DEFAULT_OT_RULES.restaurant
        };
      }
      byLocation[locName].shifts.push(shift);
      byLocation[locName].hours += shiftHours(shift);
    });

    let totalHours = 0, totalRegularPay = 0, totalOvertimePay = 0;

    Object.values(byLocation).forEach(loc => {
      totalHours += loc.hours;
      const result = _calcLocationPay(loc.shifts, loc.rate, loc.otRules);
      loc.regularPay = result.regularPay;
      loc.overtimePay = result.overtimePay;
      loc.regularHours = result.regularHours;
      loc.overtimeHours = result.overtimeHours;
      loc.total = result.regularPay + result.overtimePay;
      totalRegularPay += result.regularPay;
      totalOvertimePay += result.overtimePay;
    });

    const totalOTHours = Object.values(byLocation).reduce((s, l) => s + (l.overtimeHours||0), 0);

    return {
      totalHours,
      regularHours: totalHours - totalOTHours,
      overtimeHours: totalOTHours,
      regularPay: totalRegularPay,
      overtimePay: totalOvertimePay,
      total: totalRegularPay + totalOvertimePay,
      isOvertime: totalOvertimePay > 0,
      byLocation,
      overtimeWarning: totalOvertimePay > 0
        ? `⚠️ ${fmtHours(totalOTHours)} OT = +${fmtMoney(totalOvertimePay)} extra`
        : null
    };
  }

  // Internal: calculate pay for one location's shifts with its OT rules
  function _calcLocationPay(shifts, rate, otRules) {
    // Each shift may carry its own hourlyRate (e.g. rate changed mid-week) —
    // true earnings always uses the shift's own rate, never one locked group rate.
    const totalHrs = shifts.reduce((s, sh) => s + shiftHours(sh), 0);
    const trueStraightPay = shifts.reduce((s, sh) => s + shiftHours(sh) * (sh.hourlyRate || rate), 0);
    const blendedRate = totalHrs > 0 ? trueStraightPay / totalHrs : rate;

    const levels = (otRules && otRules.levels) ? [...otRules.levels] : [];
    const calcBy = (otRules && otRules.calculateBy) || 'week';

    // If no OT levels — pay each shift at its own true rate
    if (levels.length === 0) {
      return { regularHours: totalHrs, overtimeHours: 0, regularPay: trueStraightPay, overtimePay: 0 };
    }

    // Sort levels: day levels first, then week levels, each by threshold ascending
    const dayLevels = levels.filter(l => l.per === 'day').sort((a,b) => a.after - b.after);
    const weekLevels = levels.filter(l => l.per === 'week').sort((a,b) => a.after - b.after);

    let regularPay = 0, overtimePay = 0, regularHours = 0, overtimeHours = 0;

    if (calcBy === 'week' || calcBy === 'both') {
      // Weekly calculation
      let weekTotal = shifts.reduce((s, sh) => s + shiftHours(sh), 0);
      let remaining = weekTotal;
      let prevThreshold = 0;

      weekLevels.forEach(level => {
        const regularPortion = Math.min(remaining, level.after - prevThreshold);
        if (regularPortion > 0) {
          regularPay += regularPortion * blendedRate;
          regularHours += regularPortion;
          remaining -= regularPortion;
        }
        prevThreshold = level.after;
      });

      if (remaining > 0) {
        const lastMultiplier = weekLevels[weekLevels.length - 1]?.multiplier || 1.5;
        overtimePay += remaining * blendedRate * lastMultiplier;
        overtimeHours += remaining;
      }
    }

    if (calcBy === 'day' || calcBy === 'both') {
      // Daily calculation — group entries by date
      const byDate = {};
      shifts.forEach(shift => {
        if (!byDate[shift.date]) byDate[shift.date] = [];
        byDate[shift.date].push(shift);
      });

      let dayRegularPay = 0, dayOTPay = 0, dayRegHrs = 0, dayOTHrs = 0;

      Object.values(byDate).forEach(dayShifts => {
        let dayTotal = dayShifts.reduce((s, sh) => s + shiftHours(sh), 0);
        let remaining = dayTotal;
        let prevThreshold = 0;

        dayLevels.forEach(level => {
          const regularPortion = Math.min(remaining, level.after - prevThreshold);
          if (regularPortion > 0) {
            dayRegularPay += regularPortion * blendedRate;
            dayRegHrs += regularPortion;
            remaining -= regularPortion;
          }
          if (remaining > 0) {
            const otPortion = Math.min(remaining,
              (dayLevels[dayLevels.indexOf(level)+1]?.after || Infinity) - level.after);
            if (otPortion > 0) {
              dayOTPay += otPortion * blendedRate * level.multiplier;
              dayOTHrs += otPortion;
              remaining -= otPortion;
            }
          }
          prevThreshold = level.after;
        });

        if (remaining > 0) {
          const lastMultiplier = dayLevels[dayLevels.length-1]?.multiplier || 1.5;
          dayOTPay += remaining * blendedRate * lastMultiplier;
          dayOTHrs += remaining;
        }
      });

      // If 'both': use whichever gives worker MORE pay (California rule)
      if (calcBy === 'both') {
        if (dayOTPay > overtimePay) {
          regularPay = dayRegularPay;
          overtimePay = dayOTPay;
          regularHours = dayRegHrs;
          overtimeHours = dayOTHrs;
        }
      } else {
        regularPay = dayRegularPay;
        overtimePay = dayOTPay;
        regularHours = dayRegHrs;
        overtimeHours = dayOTHrs;
      }
    }

    return { regularHours, overtimeHours, regularPay, overtimePay };
  }

  function dailySummary(shifts) {
    const totalHrs = shifts.reduce((s, sh) => s + shiftHours(sh), 0);
    const totalEarnings = shifts.reduce((s, sh) => s + shiftEarnings(sh), 0);
    return { totalHrs, totalEarnings };
  }

  function fmtHours(h) {
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    const decimal = h.toFixed(2);
    if (hrs === 0) return `${mins}m (0.${String(Math.round(h*100)).padStart(2,'0')} hrs)`;
    if (mins === 0) return `${hrs}h (${decimal} hrs)`;
    return `${hrs}h ${mins}m (${decimal} hrs)`;
  }

  function fmtMoney(n) {
    return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function estimateNet(grossPay, taxSettings) {
    if (!taxSettings || !taxSettings.showEstimate || grossPay <= 0) return null;
    const g = grossPay;
    if (taxSettings.mode === 'simple') {
      const pct = (taxSettings.simplePercent || 0) / 100;
      const amount = g * pct;
      return {
        gross: g,
        lines: [{ label: `Estimated deductions ~${taxSettings.simplePercent}%`, amount }],
        totalDeductions: amount,
        net: g - amount
      };
    }
    const federal  = g * ((taxSettings.federal        || 0) / 100);
    const ss       = g * ((taxSettings.socialSecurity || 0) / 100);
    const medicare = g * ((taxSettings.medicare       || 0) / 100);
    const state    = g * ((taxSettings.state          || 0) / 100);
    const local    = g * ((taxSettings.local          || 0) / 100);
    const pfl      = g * ((taxSettings.pfl            || 0) / 100);
    const other    = g * ((taxSettings.other          || 0) / 100);
    const totalDeductions = federal + ss + medicare + state + local + pfl + other;
    const lines = [
      { label: `Federal ~${taxSettings.federal}%`,        amount: federal  },
      { label: `Social Security 6.2%`,                    amount: ss       },
      { label: `Medicare 1.45%`,                          amount: medicare },
    ];
    if (state    > 0) lines.push({ label: `State ~${taxSettings.state}%`,              amount: state  });
    if (local    > 0) lines.push({ label: `Local/City ~${taxSettings.local}%`,         amount: local  });
    if (pfl      > 0) lines.push({ label: `PFL/PFML ~${taxSettings.pfl}%`,             amount: pfl    });
    if (other    > 0) lines.push({ label: `${taxSettings.otherLabel||'Other'} ~${taxSettings.other}%`, amount: other });
    return {
      gross: g,
      lines,
      totalDeductions,
      net: g - totalDeductions
    };
  }

  function getPayDate(weekStart, settings, location) {
    if (!settings || settings.payPeriod === 'event') return 'Same day (event)';
    if (settings.payPeriod === 'custom' && settings.customPayDate) {
      return new Date(settings.customPayDate).toLocaleDateString('en-US',
        { weekday: 'long', month: 'short', day: 'numeric' });
    }
    // Use location-specific payDay if set, otherwise fall back to global setting (default: Friday=5)
    const targetDay = (location && location.payDayOfWeek) || settings.payDayOfWeek || 5;
    const ws = new Date(weekStart);
    ws.setDate(ws.getDate() + 7);
    const day = ws.getDay();
    // Convert 1-7 (Mon-Sun) to 0-6 (Sun-Sat) for JS Date
    const targetJS = targetDay === 7 ? 0 : targetDay;
    const daysTo = (targetJS - day + 7) % 7;
    ws.setDate(ws.getDate() + daysTo);
    return ws.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  function paymentAmounts(payment) {
    if (!payment) return { gross: null, net: null };
    const legacyAmt = payment.amount !== undefined && payment.amount !== '' ? parseFloat(payment.amount) : null;
    const gross = typeof payment.grossAmount === 'number' ? payment.grossAmount
      : (payment.amountType !== 'net' && legacyAmt !== null && !isNaN(legacyAmt) ? legacyAmt : null);
    const net = typeof payment.netAmount === 'number' ? payment.netAmount
      : (payment.amountType === 'net' && legacyAmt !== null && !isNaN(legacyAmt) ? legacyAmt : null);
    return { gross, net };
  }

  function getRecentWeeks(n) {
    n = n || 8;
    const weeks = [];
    let ws = getWeekStart(new Date());
    for (let i = 0; i < n; i++) {
      weeks.push(new Date(ws));
      ws = new Date(ws);
      ws.setDate(ws.getDate() - 7);
    }
    return weeks;
  }

  return {
    entryHours, shiftHours, shiftEarnings, weeklyPay,
    dailySummary, fmtHours, fmtMoney, getPayDate, getRecentWeeks,
    estimateNet, paymentAmounts
  };
})();
