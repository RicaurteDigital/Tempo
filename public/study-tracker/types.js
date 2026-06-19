// study-tracker/types.js
// Constants and default data for Study Tracker

const ST_DEFAULT_SUBJECTS = [
  { id: 'pm',       name: 'Project Management', color: '#5E5CE6', emoji: '📋' },
  { id: 'english',  name: 'English',             color: '#64D2FF', emoji: '🌐' },
  { id: 'tech',     name: 'Technology',          color: '#30D158', emoji: '💻' },
  { id: 'finance',  name: 'Finance',             color: '#FF9F0A', emoji: '💰' },
  { id: 'health',   name: 'Health & Body',       color: '#FF453A', emoji: '🏃' },
  { id: 'custom',   name: 'Custom',              color: '#BF5AF2', emoji: '📚' }
];

const ST_POMODORO_PRESETS = [
  { label: 'Classic',    focus: 25, rest: 5  },
  { label: 'Deep Work',  focus: 50, rest: 10 },
  { label: 'Short',      focus: 15, rest: 3  },
  { label: 'Custom',     focus: 25, rest: 5  }
];

const ST_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
