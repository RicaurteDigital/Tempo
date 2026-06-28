// public/work-tracker/tips.js
// Pure tip pool logic — no DOM, fully testable

const TipRules = (() => {

  // ── ROUNDING ─────────────────────────────────────────
  function roundAmount(amount, mode) {
    switch (mode) {
      case 'down':    return Math.floor(amount);
      case 'up':      return Math.ceil(amount);
      case 'nearest': return Math.round(amount);
      case 'manual':  return parseFloat(amount.toFixed(2));
      default:        return Math.floor(amount);
    }
  }

  // ── PROCESSING FEE ───────────────────────────────────
  function applyProcessingFee(creditCardTotal, feePercent, roundingMode) {
    const fee = creditCardTotal * (feePercent / 100);
    const roundedFee = roundAmount(fee, roundingMode);
    return {
      gross: creditCardTotal,
      fee: roundedFee,
      net: creditCardTotal - roundedFee
    };
  }

  // ── TOTAL TIPS TO DISTRIBUTE ─────────────────────────
  function totalToDistribute(creditCardNet, cashTotal) {
    return creditCardNet + cashTotal;
  }

  // ── POINT TOTAL ──────────────────────────────────────
  function totalPoints(workers) {
    return workers.reduce((sum, w) => sum + (parseFloat(w.points) || 0), 0);
  }

  // ── VALUE PER POINT ──────────────────────────────────
  function valuePerPoint(totalTips, workers) {
    const pts = totalPoints(workers);
    if (pts === 0) return 0;
    return totalTips / pts;
  }

  // ── INDIVIDUAL PAYOUT ────────────────────────────────
  function calculatePayouts(creditCardTotal, cashTotal, workers, settings) {
    const feePercent   = settings.processingFeePercent || 3;
    const roundingMode = settings.roundingMode || 'down';
    const roundInd     = settings.roundIndividual !== false;

    const ccBreakdown  = applyProcessingFee(creditCardTotal, feePercent, roundingMode);
    const total        = totalToDistribute(ccBreakdown.net, cashTotal);
    const pts          = totalPoints(workers);
    const perPoint     = pts > 0 ? total / pts : 0;

    const payouts = workers.map(w => {
      const raw    = (parseFloat(w.points) || 0) * perPoint;
      const amount = roundInd ? roundAmount(raw, roundingMode) : parseFloat(raw.toFixed(2));
      return {
        name:     w.name,
        position: w.position,
        points:   parseFloat(w.points) || 0,
        raw,
        amount
      };
    });

    // Rounding difference — leftover cents after rounding
    const distributed  = payouts.reduce((s, p) => s + p.amount, 0);
    const remainder    = parseFloat((total - distributed).toFixed(2));

    return {
      creditCard: {
        gross:   creditCardTotal,
        fee:     ccBreakdown.fee,
        feePercent,
        net:     ccBreakdown.net
      },
      cash:        cashTotal,
      totalGross:  creditCardTotal + cashTotal,
      totalNet:    total,
      totalPoints: pts,
      perPoint:    parseFloat(perPoint.toFixed(4)),
      payouts,
      remainder,
      roundingMode
    };
  }

  // ── FORMAT HELPERS ───────────────────────────────────
  function fmtMoney(n) {
    if (isNaN(n) || n === null) return '$0.00';
    return '$' + Math.abs(n).toFixed(2);
  }

  function fmtPoints(p) {
    return parseFloat(p).toFixed(2) + ' pts';
  }

  return {
    roundAmount,
    applyProcessingFee,
    totalToDistribute,
    totalPoints,
    valuePerPoint,
    calculatePayouts,
    fmtMoney,
    fmtPoints
  };
})();
