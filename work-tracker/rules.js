// work-tracker/rules.js
const WTRules = {
  calculateWeek(shifts) {
    let totalHours = 0;
    let regularPay = 0;
    let overtimePay = 0;
    
    // NY Overtime is calculated weekly over 40 hours.
    shifts.sort((a,b) => a.clockIn - b.clockIn);
    
    shifts.forEach(shift => {
      if (!shift.clockOut) return;
      let durationH = (shift.clockOut - shift.clockIn) / 3600000;
      let rate = parseFloat(shift.rate) || NYC_MIN_WAGE;
      
      if (totalHours + durationH <= OVERTIME_THRESHOLD) {
        regularPay += durationH * rate;
        totalHours += durationH;
      } else if (totalHours >= OVERTIME_THRESHOLD) {
        overtimePay += durationH * (rate * OVERTIME_MULTIPLIER);
        totalHours += durationH;
      } else {
        let regularH = OVERTIME_THRESHOLD - totalHours;
        let overtimeH = durationH - regularH;
        regularPay += regularH * rate;
        overtimePay += overtimeH * (rate * OVERTIME_MULTIPLIER);
        totalHours += durationH;
      }
    });
    return { totalHours, regularPay, overtimePay, totalPay: regularPay + overtimePay };
  }
};
