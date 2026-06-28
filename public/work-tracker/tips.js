// public/work-tracker/tips.js
// Pure tip pool logic — no DOM, fully testable

const TipRules = (() => {

  // ── PROCESSING FEE ───────────────────────────────────
  function applyProcessingFee(creditCardTotal, feePercent) {
    const fee = Math.floor(creditCardTotal * (feePercent / 100));
    return {
      gross: creditCardTotal,
      fee,
      net: creditCardTotal - fee
    };
  }

  // ── TOTAL POINTS ─────────────────────────────────────
  function totalPoints(workers) {
    return workers.reduce((sum, w) => sum + (parseFloat(w.points) || 0), 0);
  }

  // ── BASE PAYOUTS (exact, no rounding) ────────────────
  function basePayouts(totalNet, workers) {
    const pts = totalPoints(workers);
    if (pts === 0) return workers.map(w => ({ ...w, exact: 0, amount: 0 }));
    const perPoint = totalNet / pts;
    return workers.map(w => {
      const exact = (parseFloat(w.points) || 0) * perPoint;
      return { ...w, exact, amount: Math.floor(exact) };
    });
  }

  // ── CALCULATE WITH MANUAL ADJUSTMENTS ────────────────
  function calculatePayouts(creditCardTotal, cashTotal, workers, feePercent) {
    const ccBreakdown = applyProcessingFee(creditCardTotal, feePercent);
    const totalNet = ccBreakdown.net + cashTotal;
    const pts = totalPoints(workers);
    const perPoint = pts > 0 ? totalNet / pts : 0;

    const payouts = workers.map(w => {
      const exact = (parseFloat(w.points) || 0) * perPoint;
      // Use manual override if set, otherwise floor
      const amount = typeof w.manualAmount === 'number'
        ? w.manualAmount
        : Math.floor(exact);
      return {
        name:         w.name,
        isMe:         w.isMe || false,
        position:     w.position,
        points:       parseFloat(w.points) || 0,
        exact,
        amount
      };
    });

    const distributed = payouts.reduce((s, p) => s + p.amount, 0);
    const remainder = parseFloat((totalNet - distributed).toFixed(2));

    return {
      creditCard: {
        gross:     creditCardTotal,
        fee:       ccBreakdown.fee,
        feePercent,
        net:       ccBreakdown.net
      },
      cash:        cashTotal,
      totalGross:  creditCardTotal + cashTotal,
      totalNet,
      totalPoints: pts,
      perPoint,
      payouts,
      distributed,
      remainder
    };
  }

  // ── FORMAT ────────────────────────────────────────────
  function fmtMoney(n) {
    if (isNaN(n) || n === null) return '$0.00';
    const abs = Math.abs(n);
    return (n < 0 ? '−$' : '$') + abs.toFixed(2);
  }

  function fmtMoneyInt(n) {
    if (isNaN(n) || n === null) return '$0';
    return '$' + Math.round(n);
  }

  return {
    applyProcessingFee,
    totalPoints,
    basePayouts,
    calculatePayouts,
    fmtMoney,
    fmtMoneyInt
  };
})();
