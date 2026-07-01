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
      const amount = typeof w.manualAmount === 'number'
        ? w.manualAmount
        : Math.floor(exact);
      const ccAmount = Math.floor(ccExact);
      return {
        name:         w.name,
        isMe:         w.isMe || false,
        position:     w.position,
        points:       wpts,
        exact,        // CC + cash combined (kept for backward compat)
        amount,       // CC + cash combined (kept for backward compat)
        ccExact,      // CC only — use this for weekly check display
        ccAmount      // CC only floored — use this for weekly check display
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
    reverseFromKnownAmount,
    rosterMemberToWorker,
    isAlreadyInWorkers
  };
})();
