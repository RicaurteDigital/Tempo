// study-tracker/rules.js
// Pure business logic — no DOM, fully testable

const STRules = (() => {

  // ── SESSION MATH ─────────────────────────────────────
  function sessionMinutes(session) {
    if (!session.endTime) return 0;
    const ms = new Date(session.endTime) - new Date(session.startTime);
    const breakMs = (session.breakMinutes || 0) * 60000;
    return Math.max(0, (ms - breakMs) / 60000);
  }

  function totalMinutes(sessions) {
    return sessions.reduce((sum, s) => sum + sessionMinutes(s), 0);
  }

  function todayMinutes(sessions, dateStr) {
    return totalMinutes(sessions.filter(s => s.date === dateStr));
  }

  // ── PROJECT PROGRESS ─────────────────────────────────
  function projectProgress(project, sessions) {
    const projectSessions = sessions.filter(s => s.projectId === project.id);
    const minutesLogged = totalMinutes(projectSessions);
    const minutesGoal = (project.estimatedHours || 0) * 60;
    const pct = minutesGoal > 0 ? Math.min(100, Math.round((minutesLogged / minutesGoal) * 100)) : 0;
    return { minutesLogged, minutesGoal, pct, sessions: projectSessions.length };
  }

  // ── PACE & PROJECTION ────────────────────────────────
  function projectPace(project, sessions) {
    const progress = projectProgress(project, sessions);
    if (!project.targetDate || progress.minutesGoal === 0) return null;

    const now = new Date();
    const target = new Date(project.targetDate);
    const daysLeft = Math.max(1, Math.ceil((target - now) / (1000 * 60 * 60 * 24)));
    const minutesLeft = progress.minutesGoal - progress.minutesLogged;
    const minutesPerDayNeeded = minutesLeft / daysLeft;

    // Calculate current pace from last 7 days
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const recentSessions = sessions.filter(s =>
      s.projectId === project.id && new Date(s.date) >= weekAgo
    );
    const recentMinutes = totalMinutes(recentSessions);
    const currentPacePerDay = recentMinutes / 7;

    // At current pace, when will it finish?
    let projectedFinish = null;
    if (currentPacePerDay > 0) {
      const daysAtCurrentPace = minutesLeft / currentPacePerDay;
      projectedFinish = new Date();
      projectedFinish.setDate(projectedFinish.getDate() + Math.ceil(daysAtCurrentPace));
    }

    const onTrack = currentPacePerDay >= minutesPerDayNeeded;

    return {
      daysLeft,
      minutesLeft,
      minutesPerDayNeeded: Math.round(minutesPerDayNeeded),
      currentPacePerDay: Math.round(currentPacePerDay),
      projectedFinish,
      onTrack
    };
  }

  // ── STREAK ───────────────────────────────────────────
  function currentStreak(sessions) {
    if (!sessions.length) return 0;
    const days = [...new Set(sessions.map(s => s.date))].sort().reverse();
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (days[0] !== today && days[0] !== yesterday) return 0;
    let streak = 1;
    for (let i = 1; i < days.length; i++) {
      const prev = new Date(days[i-1]);
      const curr = new Date(days[i]);
      const diff = Math.round((prev - curr) / 86400000);
      if (diff === 1) streak++;
      else break;
    }
    return streak;
  }

  // ── WEEKLY SUMMARY ───────────────────────────────────
  function weeklySummary(sessions, subjects) {
    const bySubject = {};
    subjects.forEach(s => { bySubject[s.id] = { subject: s, minutes: 0, sessions: 0 }; });
    sessions.forEach(s => {
      if (!bySubject[s.subjectId]) {
        const subj = subjects.find(sub => sub.id === s.subjectId);
        if (subj) bySubject[s.subjectId] = { subject: subj, minutes: 0, sessions: 0 };
      }
      if (bySubject[s.subjectId]) {
        bySubject[s.subjectId].minutes += sessionMinutes(s);
        bySubject[s.subjectId].sessions++;
      }
    });
    const total = totalMinutes(sessions);
    Object.values(bySubject).forEach(b => {
      b.pct = total > 0 ? Math.round((b.minutes / total) * 100) : 0;
    });
    return { bySubject, totalMinutes: total };
  }

  // ── BEST DAY ─────────────────────────────────────────
  function bestDayThisWeek(sessions) {
    const byDay = {};
    sessions.forEach(s => {
      if (!byDay[s.date]) byDay[s.date] = 0;
      byDay[s.date] += sessionMinutes(s);
    });
    const entries = Object.entries(byDay);
    if (!entries.length) return null;
    return entries.reduce((best, curr) => curr[1] > best[1] ? curr : best);
  }

  // ── FORMAT HELPERS ───────────────────────────────────
  function fmtMinutes(m) {
    const h = Math.floor(m / 60);
    const min = Math.round(m % 60);
    if (h === 0) return `${min}m`;
    if (min === 0) return `${h}h`;
    return `${h}h ${min}m`;
  }

  function fmtDate(ds) {
    return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    });
  }

  function getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function getRecentWeeks(n) {
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
    sessionMinutes, totalMinutes, todayMinutes,
    projectProgress, projectPace,
    currentStreak, weeklySummary, bestDayThisWeek,
    fmtMinutes, fmtDate, getWeekStart, getRecentWeeks
  };
})();
