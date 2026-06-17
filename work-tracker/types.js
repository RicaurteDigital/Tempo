// work-tracker/types.js
const WT_VERSION = 1;
const DEFAULT_SHIFTS = ['Breakfast', 'Lunch', 'Dinner', 'Brunch', 'Event', 'Double'];
const NYC_MIN_WAGE = 16.50;
const OVERTIME_THRESHOLD = 40;
const OVERTIME_MULTIPLIER = 1.5;
const PAY_PERIOD = { WEEKLY:'weekly', EVENT:'event', BIWEEKLY:'biweekly', CUSTOM:'custom' };
function getWeekStart(date){const d=new Date(date);const day=d.getDay();const diff=(day===0)?-6:1-day;d.setDate(d.getDate()+diff);d.setHours(0,0,0,0);return d;}
function getWeekEnd(weekStart){const d=new Date(weekStart);d.setDate(d.getDate()+6);d.setHours(23,59,59,999);return d;}
function formatWeekLabel(weekStart){const end=getWeekEnd(weekStart);const opts={month:'short',day:'numeric'};return `${weekStart.toLocaleDateString('en-US',opts)} – ${end.toLocaleDateString('en-US',opts)}`;}
function generateId(){return Date.now().toString(36)+Math.random().toString(36).substr(2,5);}
