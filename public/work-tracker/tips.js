// public/work-tracker/tips.js
// Pure tip pool logic — no DOM, fully testable

const TipRules = (() => {

  // ── PROCESSING FEE (EXISTING — UNCHANGED) ────────────
  function applyProcessingFee(creditCardTotal, feePercent, manualFee) {
    const gross = parseFloat(creditCardTotal) || 0;
    const exactFee = gross * ((parseFloat(feePercent) || 0) / 100);
    const fee = manualFee !== undefined ? manualFee : Math.floor(exactFee);
    return {
      gross,
      exactFee,
      fee,
      net: gross - fee
    };
  }

  // ── TOTAL POINTS (EXISTING — UNCHANGED) ──────────────
  function totalPoints(workers) {
    return workers.reduce((sum, w) => sum + (parseFloat(w.points) || 0), 0);
  }

  // ── BASE PAYOUTS (EXISTING — UNCHANGED) ──────────────
  function basePayouts(totalNet, workers) {
    const pts = totalPoints(workers);
    if (pts === 0) return workers.map(w => ({ ...w, exact: 0, amount: 0 }));
    const perPoint = totalNet / pts;
    return workers.map(w => {
      const exact = (parseFloat(w.points) || 0) * perPoint;
      return { ...w, exact, amount: Math.floor(exact) };
    });
  }

  // ── CALCULATE WITH MANUAL ADJUSTMENTS (EXISTING — UNCHANGED) ──
  function calculatePayouts(creditCardTotal, cashTotal, workers, feePercent, manualFee) {
    const ccBreakdown = applyProcessingFee(creditCardTotal, feePercent, manualFee);
    const totalNet = ccBreakdown.net + cashTotal;
    const pts = totalPoints(workers);
    const perPoint = pts > 0 ? totalNet / pts : 0;
    // CC-only per point (for separate CC payout display)
    const ccPerPoint = pts > 0 ? ccBreakdown.net / pts : 0;

    const payouts = workers.map(w => {
      const wpts = parseFloat(w.points) || 0;
      const exact = wpts * perPoint;
      const ccExact = wpts * ccPerPoint;
      const ccAmount = typeof w.ccManualAmount === 'number'
        ? w.ccManualAmount
        : Math.floor(ccExact);
      // Cash: real points, independent of CC — same math calculatePayoutsWithFixed uses by default.
      const cashExact = pts > 0 ? (wpts / pts) * cashTotal : 0;
      const cashAmount = Math.floor(cashExact);
      // amount is always the true sum of what this person actually receives — never an
      // independently pooled figure, so it can never silently drift from ccAmount+cashAmount
      // when only one side has a manual override. Legacy combined-override records (from
      // before CC/cash were tracked separately) still take priority for backward compat.
      const amount = typeof w.manualAmount === 'number'
        ? w.manualAmount
        : ccAmount + cashAmount;
      return {
        name:         w.name,
        isMe:         w.isMe || false,
        position:     w.position,
        points:       wpts,
        exact,        // CC + cash combined (kept for backward compat)
        amount,       // CC + cash combined (kept for backward compat)
        ccExact,      // CC only — use this for weekly check display
        ccAmount,     // CC only — respects ccManualAmount override
        cashPoints:   wpts,               // NEW additive: matches calculatePayoutsWithFixed's interface
        cashExact,                        // NEW additive: true pre-rounding cash share
        cashAmount,                       // NEW additive: floored cash share
        isCashFixed:  false                // NEW additive: this engine never has cash-fixed workers
      };
    });

    const distributed = payouts.reduce((s, p) => s + p.amount, 0);
    const remainder = parseFloat((totalNet - distributed).toFixed(2));
    // CC-only tracking for the separate CC pool balance
    const ccDistributed = payouts.reduce((s, p) => s + p.ccAmount, 0);
    const ccRemainder = parseFloat((ccBreakdown.net - ccDistributed).toFixed(2));

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
      remainder,
      ccDistributed,
      ccRemainder
    };
  }

  // ── FORMAT (EXISTING — UNCHANGED) ────────────────────
  function fmtMoney(n) {
    if (isNaN(n) || n === null) return '$0.00';
    const abs = Math.abs(n);
    return (n < 0 ? '−$' : '$') + abs.toFixed(2);
  }

  function fmtMoneyInt(n) {
    if (isNaN(n) || n === null) return '$0';
    return '$' + Math.round(n);
  }

  // ════════════════════════════════════════════════════
  // NEW — ADDITIVE FUNCTIONS (opt-in only, nothing above changes)
  // ════════════════════════════════════════════════════

  // ── NEW: MULTI-AMOUNT FEE BREAKDOWN ──────────────────
  // amounts: [{ amount: number, feeExempt: boolean }, ...]
  // Returns same shape as applyProcessingFee, so it's a drop-in
  // replacement for creditCardTotal when multi-amount mode is on.
  // ── FIXED AMOUNT PAYOUT CALCULATION ──────────────────
  // When a worker has a fixed amount (written directly, not +/- approximation),
  // deduct their fixed amount from the pool first, then distribute the remainder
  // proportionally among workers with points. Returns same shape as calculatePayouts.
  function calculatePayoutsWithFixed(creditCardTotal, cashTotal, workers, feePercent, manualFee, cashOptions = {}) {
    const cFlat = cashOptions.flatAmounts || {};
    const cPts = cashOptions.pointOverrides || {};
    const cMan = cashOptions.manualAmounts || {};
    const ccBreakdown = applyProcessingFee(creditCardTotal, feePercent, manualFee);
    const totalNet = ccBreakdown.net + cashTotal;
    const ccNet = ccBreakdown.net;
    const ccPerPointBase = 0; // will be recalculated

    // Separate fixed workers from point-based workers
    const fixedWorkers = workers.filter(w => typeof w.fixedAmount === 'number');
    const pointWorkers = workers.filter(w => typeof w.fixedAmount !== 'number');

    // Total fixed CC amounts
    const totalFixed = fixedWorkers.reduce((s, w) => s + w.fixedAmount, 0);
    const remainingCC = Math.max(0, ccNet - totalFixed);

    // Calculate implied points for fixed workers: fixedAmount / perPoint
    const pointTotal = pointWorkers.reduce((s, w) => s + (parseFloat(w.points) || 0), 0);
    const perPoint = pointTotal > 0 ? remainingCC / pointTotal : 0;
    const impliedPointsMap = {};
    fixedWorkers.forEach(w => {
      impliedPointsMap[w.name] = perPoint > 0 ? w.fixedAmount / perPoint : 0;
    });

    const totalImpliedPoints = fixedWorkers.reduce((s, w) => s + (impliedPointsMap[w.name] || 0), 0);

    // --- HYBRID CASH ENGINE ---
    // 1. Identify workers with Flat Cash (locked amount)
    const fixedCashWorkers = workers.filter(w => typeof cFlat[w.name] === 'number');
    const totalFixedCash = fixedCashWorkers.reduce((s, w) => s + cFlat[w.name], 0);
    const remainingCash = Math.max(0, cashTotal - totalFixedCash);

    // 2. Identify effective cash points for the remaining (unlocked) workers
    const unlockedCashWorkers = workers.filter(w => typeof cFlat[w.name] !== 'number');
    const cashPointsMap = {};
    unlockedCashWorkers.forEach(w => {
      if (typeof cPts[w.name] === 'number') {
        cashPointsMap[w.name] = cPts[w.name]; // Force real points (or custom points)
      } else {
        cashPointsMap[w.name] = parseFloat(w.points) || 0; // default: real points, independent of CC — never impliedPoints
      }
    });

    const totalCashPoints = unlockedCashWorkers.reduce((s, w) => s + cashPointsMap[w.name], 0);

    const payouts = workers.map(w => {
      const wpts = parseFloat(w.points) || 0;
      const isFixed = typeof w.fixedAmount === 'number';
      const ccExact = isFixed ? w.fixedAmount : wpts * perPoint;
      const ccAmount = isFixed
        ? w.fixedAmount
        : typeof w.ccManualAmount === 'number'
          ? w.ccManualAmount
          : Math.floor(ccExact);

      // --- Cash Distribution for this worker ---
      let cashExact = 0;
      let cashAmount = 0;

      if (typeof cFlat[w.name] === 'number') {
        cashExact = cFlat[w.name];
        cashAmount = cFlat[w.name]; // Flat amounts skip rounding
      } else {
        const myCashPts = cashPointsMap[w.name] || 0;
        cashExact = totalCashPoints > 0 ? (myCashPts / totalCashPoints) * remainingCash : 0;
        cashAmount = typeof cMan[w.name] === 'number' 
          ? cMan[w.name] // Rounding / Manual Adjustment +/-
          : Math.floor(cashExact);
      }

      const exact = ccExact + cashExact;
      const amount = ccAmount + cashAmount;

      return {
        name: w.name,
        isMe: w.isMe || false,
        position: w.position,
        points: wpts,
        impliedPoints: isFixed ? (impliedPointsMap[w.name] || 0) : null,
        cashPoints: typeof cFlat[w.name] === 'number' ? null : (cashPointsMap[w.name] || 0),
        isFixed,
        hasFixedCash: typeof cFlat[w.name] === 'number',
        exact, amount, ccExact, ccAmount,
        cashExact,  // NEW: true pre-rounding cash share — single source of truth for UI
        cashAmount  // NEW: rounded/overridden cash share actually paid
      };
    });

    const distributed = payouts.reduce((s, p) => s + p.amount, 0);
    const ccDistributed = payouts.reduce((s, p) => s + p.ccAmount, 0);
    const remainder = parseFloat((totalNet - distributed).toFixed(2));
    const ccRemainder = parseFloat((ccNet - ccDistributed).toFixed(2));

    return {
      creditCard: { gross: creditCardTotal, fee: ccBreakdown.fee, feePercent, net: ccNet },
      cash: cashTotal, totalGross: creditCardTotal + cashTotal, totalNet,
      totalPoints: pointTotal, impliedPoints: totalImpliedPoints,
      perPoint, payouts, distributed, remainder, ccDistributed, ccRemainder
    };
  }

  function applyProcessingFeeMulti(amounts, feePercent, manualFee) {
    const list = Array.isArray(amounts) ? amounts : [];
    const gross = list.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
    const feeApplicableGross = list.reduce((s, a) =>
      s + (a.feeExempt ? 0 : (parseFloat(a.amount) || 0)), 0);
    const exactFee = feeApplicableGross * ((parseFloat(feePercent) || 0) / 100);
    const fee = manualFee !== undefined ? manualFee : Math.floor(exactFee);
    return {
      gross,
      feeApplicableGross,
      exactFee,
      fee,
      net: gross - fee
    };
  }

  // ── NEW: REVERSE CALCULATION ──────────────────────────
  // Given what ONE worker actually received (knownAmount) and their
  // points, reconstruct the total pool net (and therefore the
  // pre-fee credit card total) so the rest of the flow (manual +/-
  // adjustments, other workers) keeps working unmodified.
  // type: 'cc' | 'cash' — only affects how we re-derive the gross
  // for display; the math on totalNet is identical either way.
  function reverseFromKnownAmount(knownAmount, knownPoints, allWorkers, feePercent, type) {
    const amt = parseFloat(knownAmount) || 0;
    const pts = parseFloat(knownPoints) || 0;
    if (pts <= 0) return null;
    const perPoint = amt / pts;
    const totalPts = totalPoints(allWorkers);
    const totalNet = perPoint * totalPts;

    if (type === 'cash') {
      // Cash has no fee — net === gross
      return { totalNet, reconstructedGross: totalNet, perPoint };
    }
    // type === 'cc' — work backwards through the fee to get the gross
    const pct = (parseFloat(feePercent) || 0) / 100;
    // net = gross - gross*pct  =>  gross = net / (1 - pct)
    const reconstructedGross = pct < 1 ? totalNet / (1 - pct) : totalNet;
    return { totalNet, reconstructedGross, perPoint };
  }

  // ── NEW: WORKER ROSTER HELPERS (location-scoped) ─────
  // Roster storage itself lives in db.js (wt_worker_roster_v1,
  // keyed by locationId). These are pure helpers for matching /
  // deduping when adding a roster member into a shift's workers list.
  function rosterMemberToWorker(member) {
    return {
      name: member.name,
      position: member.position || '',
      points: typeof member.points === 'number' ? member.points : 1,
      isMe: !!member.isMe
    };
  }

  function isAlreadyInWorkers(name, workers) {
    const n = (name || '').trim().toLowerCase();
    return (workers || []).some(w => (w.name || '').trim().toLowerCase() === n);
  }

  return {
    applyProcessingFee,
    totalPoints,
    basePayouts,
    calculatePayouts,
    fmtMoney,
    fmtMoneyInt,
    // new, additive:
    applyProcessingFeeMulti,
    calculatePayoutsWithFixed,
    reverseFromKnownAmount,
    rosterMemberToWorker,
    isAlreadyInWorkers
  };
})();
