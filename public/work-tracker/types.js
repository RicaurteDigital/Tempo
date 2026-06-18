// work-tracker/types.js
const WT_VERSION = 1;
const WORK_PROFILES = {
  restaurant: {
    label: 'Restaurant',
    shifts: ['Breakfast', 'Lunch', 'Dinner', 'Brunch', 'Event', 'Double'],
    suggestedRate: 16.50
  },
  office: {
    label: 'Office / Corporate',
    shifts: ['Morning', 'Afternoon', 'Full Day', 'Overtime', 'Remote', 'Meeting'],
    suggestedRate: 25.00
  },
  freelance: {
    label: 'Freelance / Events',
    shifts: ['Half Day', 'Full Day', 'Evening', 'Weekend', 'Event', 'Consultation'],
    suggestedRate: 35.00
  },
  construction: {
    label: 'Construction / Field',
    shifts: ['Day Shift', 'Night Shift', 'Weekend', 'Overtime', 'On-Call'],
    suggestedRate: 22.00
  },
  custom: {
    label: 'Custom',
    shifts: [],
    suggestedRate: 0
  }
};

// Keep DEFAULT_SHIFTS for backward compatibility
const DEFAULT_SHIFTS = WORK_PROFILES.restaurant.shifts;

const DEFAULT_OT_RULES = {
  restaurant: {
    calculateBy: 'week',
    levels: [
      { after: 40, per: 'week', multiplier: 1.5 }
    ]
  },
  office: {
    calculateBy: 'week',
    levels: [
      { after: 40, per: 'week', multiplier: 1.5 }
    ]
  },
  freelance: {
    calculateBy: 'week',
    levels: []  // flat rate, no OT
  },
  construction: {
    calculateBy: 'week',
    levels: [
      { after: 40, per: 'week', multiplier: 1.5 }
    ]
  },
  california_restaurant: {
    calculateBy: 'both',
    levels: [
      { after: 8,  per: 'day',  multiplier: 1.5 },
      { after: 12, per: 'day',  multiplier: 2.0 },
      { after: 40, per: 'week', multiplier: 1.5 }
    ]
  },
  custom: {
    calculateBy: 'week',
    levels: [
      { after: 40, per: 'week', multiplier: 1.5 }
    ]
  }
};
const NYC_MIN_WAGE = 16.50;
const OVERTIME_THRESHOLD = 40;
const OVERTIME_MULTIPLIER = 1.5;
const PAY_PERIOD = { WEEKLY:'weekly', EVENT:'event', BIWEEKLY:'biweekly', CUSTOM:'custom' };
function getWeekStart(date){const d=new Date(date);const day=d.getDay();const diff=(day===0)?-6:1-day;d.setDate(d.getDate()+diff);d.setHours(0,0,0,0);return d;}
function getWeekEnd(weekStart){const d=new Date(weekStart);d.setDate(d.getDate()+6);d.setHours(23,59,59,999);return d;}
function formatWeekLabel(weekStart){const end=getWeekEnd(weekStart);const opts={month:'short',day:'numeric'};return `${weekStart.toLocaleDateString('en-US',opts)} – ${end.toLocaleDateString('en-US',opts)}`;}
function generateId(){return Date.now().toString(36)+Math.random().toString(36).substr(2,5);}
