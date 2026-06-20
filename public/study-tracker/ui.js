// study-tracker/ui.js — Premium Study Tracker UI

const StudyTracker = (() => {
  let _root = null;
  let _view = 'home';
  let _heroTimer = null;
  let _pomodoroTimer = null;
  let _breakStart = localStorage.getItem('st_break_start') || null;
  let _activeSession = null;

  function _loadActiveSession() {
    try {
      const raw = localStorage.getItem('st_active_session');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function _saveActiveSession(s) {
    if (s) localStorage.setItem('st_active_session', JSON.stringify(s));
    else localStorage.removeItem('st_active_session');
  }

  function mount(el) {
    _root = el;
    _view = 'home';
    _activeSession = _loadActiveSession();
    _go('home');
  }

  function _go(view, opts) {
    _view = view;
    clearInterval(_heroTimer);
    clearInterval(_pomodoroTimer);
    if (!_root) return;
    _root.innerHTML = '';
    const views = { home: _Home, projects: _Projects, history: _History, settings: _Settings };
    (views[view] || _Home)();
  }

  function _today() { return new Date().toISOString().slice(0, 10); }

  function _fmtTime(iso) {
    if (!iso) return '--:--';
    return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function _elapsed(iso) {
    const s = Math.floor((Date.now() - new Date(iso)) / 1000);
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`
      : `${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`;
  }

  function _stGenerateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ── HOME ─────────────────────────────────────────────
  function _Home() {
    const today = _today();
    const settings = STDb.getSettings();
    const subjects = STDb.getSubjects();
    const todaySessions = STDb.getSessionsForDate(today);
    const ws = STRules.getWeekStart(new Date());
    const weekSessions = STDb.getSessionsForWeek(ws);
    const streak = STRules.currentStreak(STDb.getSessions());
    const todayMins = STRules.totalMinutes(todaySessions);
    const weekMins = STRules.totalMinutes(weekSessions);
    const onBreak = _breakStart !== null;

    const w = document.createElement('div');
    w.className = 'st-screen';

    w.innerHTML = `
      <div class="st-hdr">
        <div class="st-hdr-left">
          <h2>Study</h2>
          <p>${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(ws.getTime() + 6*86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
        </div>
        <button class="st-hdr-btn" id="st-settings-btn">⚙</button>
      </div>`;

    // Hero — active session or start button
    if (_activeSession) {
      const subject = subjects.find(s => s.id === _activeSession.subjectId);
      const project = _activeSession.projectId ? STDb.getProjects().find(p => p.id === _activeSession.projectId) : null;
      const color = subject ? subject.color : '#5E5CE6';

      const hero = document.createElement('div');
      hero.className = 'st-hero' + (onBreak ? ' st-hero-break' : '');
      hero.innerHTML = `
        <div class="st-hero-label">${onBreak ? 'ON BREAK' : 'STUDYING'}</div>
        <div class="st-hero-subject" style="color:${color}">${subject ? subject.emoji + ' ' + subject.name : 'Study Session'}</div>
        <div class="st-hero-project" id="st-hero-proj">${project ? project.name : '+ Add to project'}</div>
        <div class="st-hero-timer${onBreak ? ' st-timer-break' : ''}" id="st-htimer">
          ${onBreak ? _elapsed(_breakStart) : _elapsed(_activeSession.startTime)}
        </div>
        <div class="st-hero-accumulated" id="st-accumulated">
          Today: ${STRules.fmtMinutes(todayMins)}
        </div>
        <div class="st-hero-since">Since ${_fmtTime(_activeSession.startTime)}</div>
        <div class="st-hero-actions">
          <button class="st-end-btn" id="st-end-btn" ${onBreak ? 'disabled style="opacity:.4"' : ''}>End Session</button>
          <button class="${onBreak ? 'st-breakend-btn' : 'st-breakstart-btn'}" id="st-break-btn">
            ${onBreak ? '▶ End Break' : '⏸ Break'}
          </button>
        </div>`;
      w.appendChild(hero);

      _heroTimer = setInterval(() => {
        const el = document.getElementById('st-htimer');
        const acc = document.getElementById('st-accumulated');
        if (!el) { clearInterval(_heroTimer); return; }
        el.textContent = onBreak ? _elapsed(_breakStart) : _elapsed(_activeSession.startTime);
        if (acc && !onBreak) {
          const completedMins = (_activeSession.completedMinutes || 0);
          const currentMins = (Date.now() - new Date(_activeSession.startTime)) / 60000;
          acc.textContent = 'Today: ' + STRules.fmtMinutes(todayMins + currentMins);
        }
      }, 1000);
    } else {
      const cta = document.createElement('button');
      cta.className = 'st-start-cta';
      cta.id = 'st-start-btn';
      cta.innerHTML = `📚 Start Studying`;
      w.appendChild(cta);
    }

    // Stats row
    const stats = document.createElement('div');
    stats.className = 'st-stats-row';
    const goalPct = Math.min(100, Math.round((todayMins / (settings.dailyGoalMinutes || 120)) * 100));
    stats.innerHTML = `
      <div class="st-stat-card">
        <div class="st-stat-label">Today</div>
        <div class="st-stat-value">${STRules.fmtMinutes(todayMins)}</div>
        <div class="st-progress-wrap"><div class="st-progress-bar" style="width:${goalPct}%;background:#5E5CE6"></div></div>
        <div class="st-stat-sub">Goal: ${STRules.fmtMinutes(settings.dailyGoalMinutes || 120)}</div>
        ${goalPct >= 100 ? '<div class="st-goal-tag">✓ Goal reached</div>' : ''}
      </div>
      <div class="st-stat-card">
        <div class="st-stat-label">Streak</div>
        <div class="st-stat-value">${streak}</div>
        <div class="st-stat-sub">days</div>
        ${streak >= 3 ? `<div class="st-streak-tag">🔥 ${streak} days</div>` : ''}
      </div>`;
    w.appendChild(stats);

    // Subjects grid
    if (subjects.length > 0) {
      const secHdr = document.createElement('div');
      secHdr.className = 'st-sec-hdr';
      secHdr.innerHTML = `
        <span class="st-sec-title">Subjects</span>
        <button class="st-sec-action" id="st-manage-subjects">Manage</button>`;
      w.appendChild(secHdr);

      const grid = document.createElement('div');
      grid.className = 'st-subject-grid';
      subjects.forEach(sub => {
        const subSessions = weekSessions.filter(s => s.subjectId === sub.id);
        const subMins = STRules.totalMinutes(subSessions);
        const card = document.createElement('div');
        card.className = 'st-subject-card';
        card.innerHTML = `
          <span class="st-subject-emoji">${sub.emoji}</span>
          <div class="st-subject-name">${sub.name}</div>
          <div class="st-subject-time">${STRules.fmtMinutes(subMins)} this week</div>
          <div class="st-subject-accent" style="background:${sub.color}"></div>`;
        card.onclick = () => _startSessionFor(sub);
        grid.appendChild(card);
      });
      w.appendChild(grid);
    }

    // Today's sessions
    if (todaySessions.length > 0) {
      const secHdr2 = document.createElement('div');
      secHdr2.className = 'st-sec-hdr';
      secHdr2.innerHTML = `<span class="st-sec-title">Today · ${STRules.fmtMinutes(todayMins)}</span>`;
      w.appendChild(secHdr2);
      [...todaySessions].reverse().forEach(session => {
        const sub = subjects.find(s => s.id === session.subjectId);
        const card = document.createElement('div');
        card.className = 'st-session';
        card.innerHTML = `
          <div class="st-session-top">
            <div>
              <div class="st-session-name" style="display:flex;align-items:center;gap:6px">
                <div class="st-session-dot" style="background:${sub ? sub.color : '#5E5CE6'}"></div>
                ${sub ? sub.emoji + ' ' + sub.name : 'Study'}
              </div>
              <div class="st-session-time">${_fmtTime(session.startTime)} → ${session.endTime ? _fmtTime(session.endTime) : 'Running'}</div>
              ${session.note ? `<div class="st-session-note">"${session.note}"</div>` : ''}
            </div>
            <div style="text-align:right">
              <div class="st-session-dur">${STRules.fmtMinutes(STRules.sessionMinutes(session))}</div>
            </div>
          </div>`;
        w.appendChild(card);
      });
    }

    // Bottom nav
    const acts = document.createElement('div');
    acts.className = 'st-modal-actions';
    acts.style.marginTop = '24px';
    acts.innerHTML = `
      <button class="st-btn st-btn-secondary" id="st-history-btn">📅 History</button>
      <button class="st-btn st-btn-primary" id="st-projects-btn">🎯 Projects</button>`;
    w.appendChild(acts);

    _root.appendChild(w);

    // Events
    w.querySelector('#st-settings-btn').onclick = () => _go('settings');
    w.querySelector('#st-history-btn').onclick = () => _go('history');
    w.querySelector('#st-projects-btn').onclick = () => _go('projects');

    const startBtn = w.querySelector('#st-start-btn');
    if (startBtn) {
      if (subjects.length === 0) {
        startBtn.onclick = () => { _go('settings'); };
      } else {
        startBtn.onclick = () => _showStartSession();
      }
    }

    const manageBtn = w.querySelector('#st-manage-subjects');
    if (manageBtn) manageBtn.onclick = () => _go('settings');

    const endBtn = w.querySelector('#st-end-btn');
    if (endBtn) endBtn.onclick = () => _endSession();

    const breakBtn = w.querySelector('#st-break-btn');
    if (breakBtn) breakBtn.onclick = () => _toggleBreak();

    const projLink = w.querySelector('#st-hero-proj');
    if (projLink && _activeSession) projLink.onclick = () => _showAssignProject();
  }

  // ── PROJECTS ─────────────────────────────────────────
  function _Projects() {
    const projects = STDb.getProjects();
    const subjects = STDb.getSubjects();
    const sessions = STDb.getSessions();

    const w = document.createElement('div');
    w.className = 'st-screen';
    w.innerHTML = `
      <div class="st-back-hdr">
        <button class="st-back" id="st-back">‹ Back</button>
        <div style="font-size:18px;font-weight:800">Projects</div>
        <button class="st-sec-action" id="st-add-project">+ New</button>
      </div>`;

    if (projects.length === 0) {
      const emp = document.createElement('div');
      emp.className = 'st-empty';
      emp.innerHTML = '<strong>No projects yet</strong>Create a project to track progress toward a specific goal.';
      w.appendChild(emp);
    } else {
      projects.forEach(project => {
        const sub = subjects.find(s => s.id === project.subjectId);
        const progress = STRules.projectProgress(project, sessions);
        const pace = STRules.projectPace(project, sessions);
        const card = document.createElement('div');
        card.className = 'st-project';
        card.innerHTML = `
          <div class="st-project-header">
            <div>
              <div class="st-project-name">${project.name}</div>
              <div class="st-project-subject">${sub ? sub.emoji + ' ' + sub.name : ''}</div>
            </div>
            <div style="text-align:right">
              <div class="st-project-pct" style="color:${sub ? sub.color : '#5E5CE6'}">${progress.pct}%</div>
              <div class="st-project-meta">${STRules.fmtMinutes(progress.minutesLogged)} / ${STRules.fmtMinutes(progress.minutesGoal)}</div>
            </div>
          </div>
          <div class="st-progress-wrap">
            <div class="st-progress-bar" style="width:${progress.pct}%;background:${sub ? sub.color : '#5E5CE6'}"></div>
          </div>
          ${pace ? `
            <div class="${pace.onTrack ? 'st-on-track' : 'st-off-track'}">
              ${pace.onTrack ? '✓ On track' : '⚠ Behind pace'} · ${STRules.fmtMinutes(pace.minutesPerDayNeeded)}/day needed
              ${pace.projectedFinish ? '· Finish: ' + pace.projectedFinish.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
            </div>` : ''}`;
        card.onclick = () => _showEditProject(project);
        w.appendChild(card);
      });
    }

    _root.appendChild(w);
    w.querySelector('#st-back').onclick = () => _go('home');
    w.querySelector('#st-add-project').onclick = () => _showAddProject();
  }

  // ── HISTORY ──────────────────────────────────────────
  function _History() {
    const subjects = STDb.getSubjects();
    const weeks = STRules.getRecentWeeks(8);
    const w = document.createElement('div');
    w.className = 'st-screen';
    w.innerHTML = `
      <div class="st-back-hdr">
        <button class="st-back" id="st-back">‹ Back</button>
        <div style="font-size:18px;font-weight:800">History</div>
        <div style="width:60px"></div>
      </div>`;

    weeks.forEach((ws, idx) => {
      const sessions = STDb.getSessionsForWeek(ws);
      const summary = STRules.weeklySummary(sessions, subjects);
      const isCur = idx === 0;
      const we = new Date(ws.getTime() + 6 * 86400000);

      const card = document.createElement('div');
      card.className = 'st-review';
      if (isCur) card.style.border = '1.5px solid rgba(94,92,230,.4)';

      const byDay = [0,1,2,3,4,5,6].map(i => {
        const d = new Date(ws); d.setDate(d.getDate() + i);
        const ds = d.toISOString().slice(0,10);
        const daySessions = sessions.filter(s => s.date === ds);
        return STRules.totalMinutes(daySessions);
      });
      const maxDay = Math.max(...byDay, 1);

      const barsHtml = byDay.map((mins, i) => {
        const pct = Math.round((mins / maxDay) * 100);
        return `<div class="st-bar-wrap">
          <div class="st-bar-fill" style="height:${pct}%;background:rgba(94,92,230,${mins > 0 ? '.7' : '.15'})"></div>
          <div class="st-bar-label">${ST_DAYS[i]}</div>
        </div>`;
      }).join('');

      card.innerHTML = `
        ${isCur ? '<div class="st-streak-tag" style="margin-bottom:8px">Current Week</div>' : ''}
        <div class="st-review-week">${ws.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${we.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
        <div class="st-review-total">${STRules.fmtMinutes(summary.totalMinutes)}</div>
        <div class="st-week-bars">${barsHtml}</div>
        ${Object.values(summary.bySubject).filter(b => b.minutes > 0).map(b => `
          <div class="st-subject-row">
            <div class="st-subject-dot" style="background:${b.subject.color}"></div>
            <span style="flex:1;font-size:14px;font-weight:600">${b.subject.emoji} ${b.subject.name}</span>
            <span style="font-size:13px;color:#636366">${STRules.fmtMinutes(b.minutes)} · ${b.pct}%</span>
          </div>`).join('')}`;

      w.appendChild(card);
    });

    _root.appendChild(w);
    w.querySelector('#st-back').onclick = () => _go('home');
  }

  // ── SETTINGS ─────────────────────────────────────────
  function _Settings() {
    const subjects = STDb.getSubjects();
    const settings = STDb.getSettings();

    const w = document.createElement('div');
    w.className = 'st-screen';
    w.innerHTML = `
      <div class="st-back-hdr">
        <button class="st-back" id="st-back">‹ Back</button>
        <div style="font-size:18px;font-weight:800">Settings</div>
        <div style="width:60px"></div>
      </div>

      <div class="st-settings-block">
        <div class="st-settings-title">Subjects</div>
        <div id="st-subject-list">
          ${subjects.length === 0 ? '<div style="color:#636366;font-size:14px;padding:8px 0">No subjects yet.</div>' :
            subjects.map(s => `
              <div class="st-subject-row" style="cursor:pointer" data-edit-sub="${s.id}">
                <div class="st-subject-dot" style="background:${s.color}"></div>
                <span style="flex:1;font-size:15px;font-weight:600">${s.emoji} ${s.name}</span>
                <button class="st-del-sub" data-sid="${s.id}" style="background:none;border:none;color:#FF453A;font-size:16px;cursor:pointer;padding:4px 8px">✕</button>
              </div>`).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
          <input id="st-sub-name" class="st-input" placeholder="Subject name" type="text" style="flex:1" autocapitalize="words">
          <input id="st-sub-emoji" class="st-input" placeholder="Icon" type="text" maxlength="2" style="width:56px;flex:none;text-align:center;font-size:18px;font-family:'Apple Color Emoji','Segoe UI Emoji',sans-serif">
          <input id="st-sub-color" type="color" value="#5E5CE6" style="width:44px;height:44px;border-radius:12px;border:none;cursor:pointer;flex-shrink:0;-webkit-appearance:none;appearance:none;padding:0">
        </div>
        <button class="st-btn st-btn-primary" style="margin-top:12px;width:100%" id="st-add-sub">Add Subject</button>
      </div>

      <div class="st-settings-block">
        <div class="st-settings-title">Study Goals</div>
        <div class="st-setting-row">
          <label>Daily goal</label>
          <div class="st-stepper" style="width:160px">
            <button class="st-stepper-btn" id="st-goal-minus"
              onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
              onpointerup="this.style.background='none'"
              onpointerleave="this.style.background='none'">−</button>
            <input id="st-daily-goal" type="text" inputmode="numeric"
              value="${settings.dailyGoalMinutes || 120}"
              onclick="this.select()" onfocus="this.select()">
            <button class="st-stepper-btn" id="st-goal-plus"
              onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
              onpointerup="this.style.background='none'"
              onpointerleave="this.style.background='none'">+</button>
          </div>
        </div>
        <div class="st-setting-row">
          <label>Weekly goal (days)</label>
          <div class="st-stepper" style="width:160px">
            <button class="st-stepper-btn" id="st-wdays-minus"
              onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
              onpointerup="this.style.background='none'"
              onpointerleave="this.style.background='none'">−</button>
            <input id="st-weekly-days" type="text" inputmode="numeric"
              value="${settings.weeklyGoalDays || 5}"
              onclick="this.select()" onfocus="this.select()">
            <button class="st-stepper-btn" id="st-wdays-plus"
              onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
              onpointerup="this.style.background='none'"
              onpointerleave="this.style.background='none'">+</button>
          </div>
        </div>
        <button class="st-btn st-btn-primary" style="margin-top:14px;width:100%" id="st-save-goals">Save Goals</button>
      </div>

      <div class="st-settings-block">
        <div class="st-settings-title">Pomodoro</div>
        <div class="st-setting-row">
          <label>Pomodoro mode</label>
          <input type="checkbox" id="st-pomo-toggle" style="width:18px;height:18px;accent-color:#5E5CE6" ${settings.pomodoroMode ? 'checked' : ''}>
        </div>
        <div class="st-setting-row">
          <label>Focus (min)</label>
          <div class="st-stepper" style="width:160px">
            <button class="st-stepper-btn" id="st-focus-minus"
              onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
              onpointerup="this.style.background='none'"
              onpointerleave="this.style.background='none'">−</button>
            <input id="st-focus-min" type="text" inputmode="numeric"
              value="${settings.pomodoroFocus || 25}"
              onclick="this.select()" onfocus="this.select()">
            <button class="st-stepper-btn" id="st-focus-plus"
              onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
              onpointerup="this.style.background='none'"
              onpointerleave="this.style.background='none'">+</button>
          </div>
        </div>
        <div class="st-setting-row">
          <label>Break (min)</label>
          <div class="st-stepper" style="width:160px">
            <button class="st-stepper-btn" id="st-rest-minus"
              onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
              onpointerup="this.style.background='none'"
              onpointerleave="this.style.background='none'">−</button>
            <input id="st-rest-min" type="text" inputmode="numeric"
              value="${settings.pomodoroRest || 5}"
              onclick="this.select()" onfocus="this.select()">
            <button class="st-stepper-btn" id="st-rest-plus"
              onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
              onpointerup="this.style.background='none'"
              onpointerleave="this.style.background='none'">+</button>
          </div>
        </div>
        <button class="st-btn st-btn-primary" style="margin-top:14px;width:100%" id="st-save-pomo">Save Pomodoro</button>
      </div>

      <div class="st-settings-block">
        <div class="st-settings-title">Data</div>
        <div style="display:flex;gap:10px">
          <button class="st-btn st-btn-secondary" id="st-export-btn">💾 Backup</button>
          <button class="st-btn st-btn-secondary" id="st-import-btn">📥 Import</button>
        </div>
        <input type="file" id="st-import-file" accept=".json" style="display:none">
      </div>`;

    _root.appendChild(w);

    w.querySelector('#st-back').onclick = () => _go('home');

    // Subjects
    w.querySelectorAll('.st-del-sub').forEach(b => {
      b.onclick = (e) => {
        e.stopPropagation();
        if (!confirm('Delete this subject?')) return;
        STDb.deleteSubject(b.dataset.sid);
        _go('settings');
      };
    });

    w.querySelector('#st-add-sub').onclick = () => {
      const name = w.querySelector('#st-sub-name').value.trim();
      const emoji = w.querySelector('#st-sub-emoji').value.trim() || '📚';
      const color = w.querySelector('#st-sub-color').value;
      if (!name) { alert('Enter a subject name.'); return; }
      STDb.saveSubject({ id: _stGenerateId(), name, emoji, color, dailyGoalMinutes: 30 });
      _go('settings');
    };

    // Goals steppers
    w.querySelector('#st-goal-minus').onclick = () => {
      const i = w.querySelector('#st-daily-goal');
      i.value = Math.max(5, (parseInt(i.value) || 120) - 5);
    };
    w.querySelector('#st-goal-plus').onclick = () => {
      const i = w.querySelector('#st-daily-goal');
      i.value = Math.min(720, (parseInt(i.value) || 120) + 5);
    };
    w.querySelector('#st-wdays-minus').onclick = () => {
      const i = w.querySelector('#st-weekly-days');
      i.value = Math.max(1, (parseInt(i.value) || 5) - 1);
    };
    w.querySelector('#st-wdays-plus').onclick = () => {
      const i = w.querySelector('#st-weekly-days');
      i.value = Math.min(7, (parseInt(i.value) || 5) + 1);
    };
    w.querySelector('#st-save-goals').onclick = () => {
      const s = STDb.getSettings();
      s.dailyGoalMinutes = parseInt(w.querySelector('#st-daily-goal').value) || 120;
      s.weeklyGoalDays = parseInt(w.querySelector('#st-weekly-days').value) || 5;
      STDb.saveSettings(s);
      alert('Goals saved.');
    };

    // Pomodoro
    w.querySelector('#st-focus-minus').onclick = () => {
      const i = w.querySelector('#st-focus-min');
      i.value = Math.max(5, (parseInt(i.value) || 25) - 5);
    };
    w.querySelector('#st-focus-plus').onclick = () => {
      const i = w.querySelector('#st-focus-min');
      i.value = Math.min(120, (parseInt(i.value) || 25) + 5);
    };
    w.querySelector('#st-rest-minus').onclick = () => {
      const i = w.querySelector('#st-rest-min');
      i.value = Math.max(1, (parseInt(i.value) || 5) - 1);
    };
    w.querySelector('#st-rest-plus').onclick = () => {
      const i = w.querySelector('#st-rest-min');
      i.value = Math.min(30, (parseInt(i.value) || 5) + 1);
    };
    w.querySelector('#st-save-pomo').onclick = () => {
      const s = STDb.getSettings();
      s.pomodoroMode = w.querySelector('#st-pomo-toggle').checked;
      s.pomodoroFocus = parseInt(w.querySelector('#st-focus-min').value) || 25;
      s.pomodoroRest = parseInt(w.querySelector('#st-rest-min').value) || 5;
      STDb.saveSettings(s);
      alert('Pomodoro settings saved.');
    };

    // Data
    w.querySelector('#st-export-btn').onclick = () => {
      const b = new Blob([STDb.exportData()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `Tempo_StudyBackup_${_today()}.json`;
      a.click();
    };
    w.querySelector('#st-import-btn').onclick = () => w.querySelector('#st-import-file').click();
    w.querySelector('#st-import-file').onchange = function() {
      const file = this.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        if (STDb.importData(e.target.result)) { alert('Imported.'); _go('home'); }
        else alert('Import failed.');
      };
      reader.readAsText(file);
    };

    // Select all on inputs
    w.querySelectorAll('input').forEach(i => {
      i.addEventListener('focus', () => i.select());
      i.addEventListener('click', () => i.select());
    });
  }

  // ── START SESSION MODAL ───────────────────────────────
  function _showStartSession(preSelectedSubject) {
    const subjects = STDb.getSubjects();
    if (!subjects.length) { alert('Add a subject in Settings first.'); _go('settings'); return; }
    const projects = STDb.getProjects();

    const ov = document.createElement('div');
    ov.className = 'st-overlay';
    ov.innerHTML = `
      <div class="st-modal">
        <div class="st-modal-handle"></div>
        <div class="st-modal-title">Start Study Session</div>
        <label class="st-modal-label">Subject</label>
        <select class="st-input" id="st-sel-sub">
          ${subjects.map(s => `<option value="${s.id}" ${preSelectedSubject && s.id === preSelectedSubject.id ? 'selected' : ''}>${s.emoji} ${s.name}</option>`).join('')}
        </select>
        <label class="st-modal-label">Project (optional)</label>
        <select class="st-input" id="st-sel-proj">
          <option value="">No project</option>
          ${projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
        </select>
        <div class="st-modal-actions">
          <button class="st-btn st-btn-secondary" id="st-cancel">Cancel</button>
          <button class="st-btn st-btn-primary" id="st-confirm-start">📚 Start Now</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.querySelectorAll('input, select').forEach(i => {
      i.addEventListener('focus', () => i.select && i.select());
    });
    ov.querySelector('#st-cancel').onclick = () => ov.remove();
    ov.querySelector('#st-confirm-start').onclick = () => {
      const subjectId = ov.querySelector('#st-sel-sub').value;
      const projectId = ov.querySelector('#st-sel-proj').value || null;
      _activeSession = {
        id: _stGenerateId(),
        subjectId, projectId,
        date: _today(),
        startTime: new Date().toISOString(),
        endTime: null,
        breakMinutes: 0,
        note: null,
        completedMinutes: 0
      };
      _saveActiveSession(_activeSession);
      ov.remove();
      _go('home');
    };
  }

  function _startSessionFor(subject) {
    _showStartSession(subject);
  }

  // ── END SESSION ───────────────────────────────────────
  function _endSession() {
    if (!_activeSession) return;
    const endTime = new Date().toISOString();
    const ov = document.createElement('div');
    ov.className = 'st-overlay';
    ov.innerHTML = `
      <div class="st-modal">
        <div class="st-modal-handle"></div>
        <div class="st-modal-title">Session complete 🎉</div>
        <p style="color:#98989D;font-size:14px;margin-bottom:16px">
          ${STRules.fmtMinutes((new Date(endTime) - new Date(_activeSession.startTime)) / 60000)} of focused study.
        </p>
        <label class="st-modal-label">What did you cover? (optional)</label>
        <input id="st-session-note" class="st-input" type="text"
          placeholder="e.g. Chapter 4, Mock exam 1, Unit vocabulary..."
          onclick="this.select()" onfocus="this.select()">
        <div class="st-modal-actions">
          <button class="st-btn st-btn-secondary" id="st-skip-note">Skip</button>
          <button class="st-btn st-btn-primary" id="st-save-session">Save Session</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });

    const saveSession = (note) => {
      _activeSession.endTime = endTime;
      _activeSession.note = note || null;
      STDb.saveSession(_activeSession);
      _saveActiveSession(null);
      _activeSession = null;
      _breakStart = null;
      localStorage.removeItem('st_break_start');
      ov.remove();
      _go('home');
    };

    ov.querySelector('#st-skip-note').onclick = () => saveSession(null);
    ov.querySelector('#st-save-session').onclick = () => {
      saveSession(ov.querySelector('#st-session-note').value.trim());
    };
  }

  // ── BREAK TOGGLE ─────────────────────────────────────
  function _toggleBreak() {
    if (!_activeSession) return;
    const breakBtn = document.getElementById('st-break-btn');
    const heroEl = breakBtn ? breakBtn.closest('.st-hero') : null;

    if (_breakStart === null) {
      _breakStart = new Date().toISOString();
      localStorage.setItem('st_break_start', _breakStart);
      if (heroEl) {
        heroEl.classList.add('st-hero-break');
        heroEl.querySelector('.st-hero-label').textContent = 'ON BREAK';
        heroEl.querySelector('#st-htimer').classList.add('st-timer-break');
        const endBtn = heroEl.querySelector('#st-end-btn');
        if (endBtn) { endBtn.disabled = true; endBtn.style.opacity = '0.4'; }
        breakBtn.className = 'st-breakend-btn';
        breakBtn.textContent = '▶ End Break';
        clearInterval(_heroTimer);
        _heroTimer = setInterval(() => {
          const el = document.getElementById('st-htimer');
          if (el) el.textContent = _elapsed(_breakStart);
          else clearInterval(_heroTimer);
        }, 1000);
      }
    } else {
      const breakMins = Math.round((Date.now() - new Date(_breakStart)) / 60000);
      _activeSession.breakMinutes = (_activeSession.breakMinutes || 0) + breakMins;
      _saveActiveSession(_activeSession);
      _breakStart = null;
      localStorage.removeItem('st_break_start');
      _go('home');
    }
  }

  // ── ADD PROJECT MODAL ─────────────────────────────────
  function _showAddProject() {
    const subjects = STDb.getSubjects();
    if (!subjects.length) { alert('Add a subject first.'); return; }
    const ov = document.createElement('div');
    ov.className = 'st-overlay';
    ov.innerHTML = `
      <div class="st-modal">
        <div class="st-modal-handle"></div>
        <div class="st-modal-title">New Project</div>
        <label class="st-modal-label">Name</label>
        <input id="st-pj-name" class="st-input" type="text" placeholder="e.g. PMP Exam Prep" autocapitalize="words">
        <label class="st-modal-label">Subject</label>
        <select class="st-input" id="st-pj-sub">
          ${subjects.map(s => `<option value="${s.id}">${s.emoji} ${s.name}</option>`).join('')}
        </select>
        <label class="st-modal-label">Estimated hours to complete</label>
        <div class="st-stepper">
          <button class="st-stepper-btn" id="st-pj-hr-minus"
            onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
            onpointerup="this.style.background='none'"
            onpointerleave="this.style.background='none'">−</button>
          <input id="st-pj-hrs" type="text" inputmode="numeric" value="20"
            onclick="this.select()" onfocus="this.select()">
          <button class="st-stepper-btn" id="st-pj-hr-plus"
            onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
            onpointerup="this.style.background='none'"
            onpointerleave="this.style.background='none'">+</button>
        </div>
        <label class="st-modal-label">Target date (optional)</label>
        <input id="st-pj-date" class="st-input" type="date">
        <div class="st-modal-actions">
          <button class="st-btn st-btn-secondary" id="st-pj-cancel">Cancel</button>
          <button class="st-btn st-btn-primary" id="st-pj-save">Create Project</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.querySelectorAll('input').forEach(i => {
      i.addEventListener('focus', () => i.select && i.select());
      i.addEventListener('click', () => i.select && i.select());
    });
    ov.querySelector('#st-pj-hr-minus').onclick = () => {
      const i = ov.querySelector('#st-pj-hrs');
      i.value = Math.max(1, (parseInt(i.value) || 20) - 5);
    };
    ov.querySelector('#st-pj-hr-plus').onclick = () => {
      const i = ov.querySelector('#st-pj-hrs');
      i.value = (parseInt(i.value) || 20) + 5;
    };
    ov.querySelector('#st-pj-cancel').onclick = () => ov.remove();
    ov.querySelector('#st-pj-save').onclick = () => {
      const name = ov.querySelector('#st-pj-name').value.trim();
      const subjectId = ov.querySelector('#st-pj-sub').value;
      const hrs = parseInt(ov.querySelector('#st-pj-hrs').value) || 20;
      const targetDate = ov.querySelector('#st-pj-date').value || null;
      if (!name) { alert('Enter a project name.'); return; }
      STDb.saveProject({ id: _stGenerateId(), name, subjectId, estimatedHours: hrs, targetDate, createdAt: new Date().toISOString() });
      ov.remove();
      _go('projects');
    };
  }

  // ── EDIT PROJECT MODAL ────────────────────────────────
  function _showEditProject(project) {
    const subjects = STDb.getSubjects();
    const sessions = STDb.getSessionsForProject(project.id);
    const progress = STRules.projectProgress(project, STDb.getSessions());
    const sub = subjects.find(s => s.id === project.subjectId);

    const ov = document.createElement('div');
    ov.className = 'st-overlay';
    ov.innerHTML = `
      <div class="st-modal">
        <div class="st-modal-handle"></div>
        <div class="st-modal-title">Edit Project</div>
        <label class="st-modal-label">Name</label>
        <input id="st-epj-name" class="st-input" type="text" value="${project.name}" autocapitalize="words">
        <label class="st-modal-label">Subject</label>
        <select class="st-input" id="st-epj-sub">
          ${subjects.map(s => `<option value="${s.id}" ${s.id === project.subjectId ? 'selected' : ''}>${s.emoji} ${s.name}</option>`).join('')}
        </select>
        <label class="st-modal-label">Estimated hours</label>
        <div class="st-stepper">
          <button class="st-stepper-btn" id="st-epj-hr-minus"
            onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
            onpointerup="this.style.background='none'"
            onpointerleave="this.style.background='none'">−</button>
          <input id="st-epj-hrs" type="text" inputmode="numeric" value="${project.estimatedHours || 20}"
            onclick="this.select()" onfocus="this.select()">
          <button class="st-stepper-btn" id="st-epj-hr-plus"
            onpointerdown="this.style.background='rgba(255,255,255,0.12)'"
            onpointerup="this.style.background='none'"
            onpointerleave="this.style.background='none'">+</button>
        </div>
        <label class="st-modal-label">Target date</label>
        <input id="st-epj-date" class="st-input" type="date" value="${project.targetDate || ''}">
        <div style="margin-top:16px;background:rgba(0,0,0,.3);border-radius:12px;padding:12px">
          <div style="font-size:13px;color:#636366;margin-bottom:6px">Progress</div>
          <div style="font-size:22px;font-weight:800;color:${sub ? sub.color : '#5E5CE6'}">${progress.pct}% complete</div>
          <div style="font-size:13px;color:#636366">${STRules.fmtMinutes(progress.minutesLogged)} logged · ${sessions.length} sessions</div>
          <div class="st-progress-wrap" style="margin-top:8px">
            <div class="st-progress-bar" style="width:${progress.pct}%;background:${sub ? sub.color : '#5E5CE6'}"></div>
          </div>
        </div>
        <div class="st-modal-actions">
          <button class="st-btn st-btn-danger" id="st-epj-delete">Delete</button>
          <button class="st-btn st-btn-primary" id="st-epj-save">Save</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.querySelectorAll('input').forEach(i => {
      i.addEventListener('focus', () => i.select && i.select());
      i.addEventListener('click', () => i.select && i.select());
    });
    ov.querySelector('#st-epj-hr-minus').onclick = () => {
      const i = ov.querySelector('#st-epj-hrs');
      i.value = Math.max(1, (parseInt(i.value) || 20) - 5);
    };
    ov.querySelector('#st-epj-hr-plus').onclick = () => {
      const i = ov.querySelector('#st-epj-hrs');
      i.value = (parseInt(i.value) || 20) + 5;
    };
    ov.querySelector('#st-epj-delete').onclick = () => {
      if (!confirm('Delete this project? Sessions will remain but unlinked.')) return;
      if (!confirm('Are you sure? This cannot be undone.')) return;
      STDb.deleteProject(project.id);
      ov.remove();
      _go('projects');
    };
    ov.querySelector('#st-epj-save').onclick = () => {
      const name = ov.querySelector('#st-epj-name').value.trim();
      if (!name) { alert('Enter a project name.'); return; }
      project.name = name;
      project.subjectId = ov.querySelector('#st-epj-sub').value;
      project.estimatedHours = parseInt(ov.querySelector('#st-epj-hrs').value) || 20;
      project.targetDate = ov.querySelector('#st-epj-date').value || null;
      STDb.saveProject(project);
      ov.remove();
      _go('projects');
    };
  }

  // ── ASSIGN PROJECT ────────────────────────────────────
  function _showAssignProject() {
    if (!_activeSession) return;
    const projects = STDb.getProjects().filter(p => p.subjectId === _activeSession.subjectId);
    const ov = document.createElement('div');
    ov.className = 'st-overlay';
    ov.innerHTML = `
      <div class="st-modal">
        <div class="st-modal-handle"></div>
        <div class="st-modal-title">Assign to Project</div>
        <select class="st-input" id="st-ap-proj" style="margin-top:8px">
          <option value="">No project</option>
          ${projects.map(p => `<option value="${p.id}" ${p.id === _activeSession.projectId ? 'selected' : ''}>${p.name}</option>`).join('')}
        </select>
        <div class="st-modal-actions" style="margin-top:16px">
          <button class="st-btn st-btn-secondary" id="st-ap-cancel">Cancel</button>
          <button class="st-btn st-btn-primary" id="st-ap-save">Assign</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    ov.querySelector('#st-ap-cancel').onclick = () => ov.remove();
    ov.querySelector('#st-ap-save').onclick = () => {
      _activeSession.projectId = ov.querySelector('#st-ap-proj').value || null;
      _saveActiveSession(_activeSession);
      ov.remove();
      _go('home');
    };
  }

  return { mount };
})();
