// study-tracker/db.js
// Storage layer for Study Tracker — localStorage only

const ST_KEYS = {
  subjects:  'st_subjects_v1',
  projects:  'st_projects_v1',
  sessions:  'st_sessions_v1',
  settings:  'st_settings_v1'
};

const STDb = (() => {

  // ── SUBJECTS ────────────────────────────────────────
  function getSubjects() {
    try {
      const raw = localStorage.getItem(ST_KEYS.subjects);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function saveSubject(subject) {
    const all = getSubjects();
    const idx = all.findIndex(s => s.id === subject.id);
    if (idx >= 0) all[idx] = subject; else all.push(subject);
    localStorage.setItem(ST_KEYS.subjects, JSON.stringify(all));
    return subject;
  }

  function deleteSubject(id) {
    const all = getSubjects().filter(s => s.id !== id);
    localStorage.setItem(ST_KEYS.subjects, JSON.stringify(all));
    return true;
  }

  // ── PROJECTS ─────────────────────────────────────────
  function getProjects() {
    try {
      const raw = localStorage.getItem(ST_KEYS.projects);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function saveProject(project) {
    const all = getProjects();
    const idx = all.findIndex(p => p.id === project.id);
    if (idx >= 0) all[idx] = project; else all.push(project);
    localStorage.setItem(ST_KEYS.projects, JSON.stringify(all));
    return project;
  }

  function deleteProject(id) {
    const all = getProjects().filter(p => p.id !== id);
    localStorage.setItem(ST_KEYS.projects, JSON.stringify(all));
    return true;
  }

  // ── SESSIONS ─────────────────────────────────────────
  function getSessions() {
    try {
      const raw = localStorage.getItem(ST_KEYS.sessions);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function saveSession(session) {
    const all = getSessions();
    const idx = all.findIndex(s => s.id === session.id);
    if (idx >= 0) all[idx] = session; else all.push(session);
    localStorage.setItem(ST_KEYS.sessions, JSON.stringify(all));
    return session;
  }

  function deleteSession(id) {
    const all = getSessions().filter(s => s.id !== id);
    localStorage.setItem(ST_KEYS.sessions, JSON.stringify(all));
    return true;
  }

  function getSessionsForDate(dateStr) {
    return getSessions().filter(s => s.date === dateStr);
  }

  function getSessionsForWeek(weekStart) {
    const start = new Date(weekStart);
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 7);
    return getSessions().filter(s => {
      const d = new Date(s.date);
      return d >= start && d < end;
    });
  }

  function getSessionsForProject(projectId) {
    return getSessions().filter(s => s.projectId === projectId);
  }

  // ── SETTINGS ─────────────────────────────────────────
  function getSettings() {
    try {
      const raw = localStorage.getItem(ST_KEYS.settings);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      dailyGoalMinutes: 120,
      pomodoroMode: false,
      pomodoroFocus: 25,
      pomodoroRest: 5,
      weeklyGoalDays: 5
    };
  }

  function saveSettings(settings) {
    localStorage.setItem(ST_KEYS.settings, JSON.stringify(settings));
    return settings;
  }

  // ── EXPORT / IMPORT ──────────────────────────────────
  function exportData() {
    return JSON.stringify({
      version: 1,
      exported: new Date().toISOString(),
      subjects: getSubjects(),
      projects: getProjects(),
      sessions: getSessions(),
      settings: getSettings()
    }, null, 2);
  }

  function importData(jsonStr) {
    try {
      const data = JSON.parse(jsonStr);
      if (!data.version) return false;
      if (data.subjects) localStorage.setItem(ST_KEYS.subjects, JSON.stringify(data.subjects));
      if (data.projects) localStorage.setItem(ST_KEYS.projects, JSON.stringify(data.projects));
      if (data.sessions) localStorage.setItem(ST_KEYS.sessions, JSON.stringify(data.sessions));
      if (data.settings) localStorage.setItem(ST_KEYS.settings, JSON.stringify(data.settings));
      return true;
    } catch { return false; }
  }

  return {
    getSubjects, saveSubject, deleteSubject,
    getProjects, saveProject, deleteProject,
    getSessions, saveSession, deleteSession,
    getSessionsForDate, getSessionsForWeek, getSessionsForProject,
    getSettings, saveSettings,
    exportData, importData
  };
})();
