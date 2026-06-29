// work-tracker/types.js
const WT_VERSION = 1;
const WORK_PROFILES = {
  restaurant: {
    label: 'Restaurant',
    shifts: ['Breakfast', 'Lunch', 'Dinner', 'Brunch', 'Event', 'Double'],
    suggestedRate: 16.50,
    hasTips: true,
    tipPositions: [
      { id: 'server',    label: 'Server',      points: 1.0  },
      { id: 'bartender', label: 'Bartender',   points: 1.0  },
      { id: 'runner',    label: 'Food Runner', points: 0.75 },
      { id: 'busboy',    label: 'Busboy',      points: 0.5  },
      { id: 'barback',   label: 'Barback',     points: 0.5  },
      { id: 'host',      label: 'Host',        points: 0.5  }
    ]
  },
  office: {
    label: 'Office / Corporate',
    shifts: ['Morning', 'Afternoon', 'Full Day', 'Overtime', 'Remote', 'Meeting'],
    suggestedRate: 25.00,
    hasTips: false,
    tipPositions: []
  },
  freelance: {
    label: 'Freelance / Events',
    shifts: ['Half Day', 'Full Day', 'Evening', 'Weekend', 'Event', 'Consultation'],
    suggestedRate: 35.00,
    hasTips: true,
    tipPositions: [
      { id: 'lead',      label: 'Lead',        points: 1.0  },
      { id: 'assistant', label: 'Assistant',   points: 0.75 },
      { id: 'staff',     label: 'Staff',       points: 0.5  }
    ]
  },
  construction: {
    label: 'Construction / Field',
    shifts: ['Day Shift', 'Night Shift', 'Weekend', 'Overtime', 'On-Call'],
    suggestedRate: 22.00,
    hasTips: false,
    tipPositions: []
  },
  custom: {
    label: 'Custom',
    shifts: [],
    suggestedRate: 0,
    hasTips: true,
    tipPositions: [
      { id: 'custom1', label: 'Position 1', points: 1.0 },
      { id: 'custom2', label: 'Position 2', points: 0.5 }
    ]
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

const DEFAULT_TAX_PROFILES = {
  // ── NO STATE INCOME TAX ──────────────────────────────
  'AK': { label: 'Alaska — No state tax',        federal:22, socialSecurity:6.2, medicare:1.45, state:0,    local:0,     pfl:0,    otherLabel:'',      other:0 },
  'FL': { label: 'Florida — No state tax',        federal:22, socialSecurity:6.2, medicare:1.45, state:0,    local:0,     pfl:0,    otherLabel:'',      other:0 },
  'NV': { label: 'Nevada — No state tax',         federal:22, socialSecurity:6.2, medicare:1.45, state:0,    local:0,     pfl:0,    otherLabel:'',      other:0 },
  'NH': { label: 'New Hampshire — No state tax',  federal:22, socialSecurity:6.2, medicare:1.45, state:0,    local:0,     pfl:0,    otherLabel:'',      other:0 },
  'SD': { label: 'South Dakota — No state tax',   federal:22, socialSecurity:6.2, medicare:1.45, state:0,    local:0,     pfl:0,    otherLabel:'',      other:0 },
  'TN': { label: 'Tennessee — No state tax',      federal:22, socialSecurity:6.2, medicare:1.45, state:0,    local:0,     pfl:0,    otherLabel:'',      other:0 },
  'TX': { label: 'Texas — No state tax',          federal:22, socialSecurity:6.2, medicare:1.45, state:0,    local:0,     pfl:0,    otherLabel:'',      other:0 },
  'WA': { label: 'Washington — No state tax',     federal:22, socialSecurity:6.2, medicare:1.45, state:0,    local:0,     pfl:0.58, otherLabel:'LTC',   other:0.58 },
  'WY': { label: 'Wyoming — No state tax',        federal:22, socialSecurity:6.2, medicare:1.45, state:0,    local:0,     pfl:0,    otherLabel:'',      other:0 },
  // ── FLAT TAX STATES 2026 ─────────────────────────────
  'AZ': { label: 'Arizona — Flat 2.5%',           federal:22, socialSecurity:6.2, medicare:1.45, state:2.5,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'CO': { label: 'Colorado — Flat 4.4%',          federal:22, socialSecurity:6.2, medicare:1.45, state:4.4,  local:0,     pfl:0.9,  otherLabel:'FAMLI', other:0 },
  'GA': { label: 'Georgia — Flat 5.19%',          federal:22, socialSecurity:6.2, medicare:1.45, state:5.19, local:0,     pfl:0,    otherLabel:'',      other:0 },
  'ID': { label: 'Idaho — Flat 5.8%',             federal:22, socialSecurity:6.2, medicare:1.45, state:5.8,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'IL': { label: 'Illinois — Flat 4.95%',         federal:22, socialSecurity:6.2, medicare:1.45, state:4.95, local:0,     pfl:0,    otherLabel:'',      other:0 },
  'IN': { label: 'Indiana — Flat 3.05%',          federal:22, socialSecurity:6.2, medicare:1.45, state:3.05, local:1.5,   pfl:0,    otherLabel:'County',other:0 },
  'IA': { label: 'Iowa — Flat 3.8%',              federal:22, socialSecurity:6.2, medicare:1.45, state:3.8,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'KY': { label: 'Kentucky — Flat 3.5%',          federal:22, socialSecurity:6.2, medicare:1.45, state:3.5,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'LA': { label: 'Louisiana — Flat 3%',           federal:22, socialSecurity:6.2, medicare:1.45, state:3.0,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'MA': { label: 'Massachusetts — Flat 5%',       federal:22, socialSecurity:6.2, medicare:1.45, state:5.0,  local:0,     pfl:0.46, otherLabel:'PFML',  other:0 },
  'MI': { label: 'Michigan — Flat 4.25%',         federal:22, socialSecurity:6.2, medicare:1.45, state:4.25, local:0,     pfl:0,    otherLabel:'',      other:0 },
  'MS': { label: 'Mississippi — Flat 4.7%',       federal:22, socialSecurity:6.2, medicare:1.45, state:4.7,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'NC': { label: 'North Carolina — Flat 3.99%',   federal:22, socialSecurity:6.2, medicare:1.45, state:3.99, local:0,     pfl:0,    otherLabel:'',      other:0 },
  'OH': { label: 'Ohio — Flat 2.75%',             federal:22, socialSecurity:6.2, medicare:1.45, state:2.75, local:2.0,   pfl:0,    otherLabel:'City',  other:0 },
  'PA': { label: 'Pennsylvania — Flat 3.07%',     federal:22, socialSecurity:6.2, medicare:1.45, state:3.07, local:1.0,   pfl:0,    otherLabel:'',      other:0 },
  'UT': { label: 'Utah — Flat 4.55%',             federal:22, socialSecurity:6.2, medicare:1.45, state:4.55, local:0,     pfl:0,    otherLabel:'',      other:0 },
  // ── PROGRESSIVE TAX STATES (common rate used) ────────
  'AL': { label: 'Alabama — ~4%',                 federal:22, socialSecurity:6.2, medicare:1.45, state:4.0,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'AR': { label: 'Arkansas — ~4.4%',              federal:22, socialSecurity:6.2, medicare:1.45, state:4.4,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'CA': { label: 'California — ~9.3%',            federal:22, socialSecurity:6.2, medicare:1.45, state:9.3,  local:0,     pfl:0.9,  otherLabel:'SDI',   other:0.9 },
  'CT': { label: 'Connecticut — ~5%',             federal:22, socialSecurity:6.2, medicare:1.45, state:5.0,  local:0,     pfl:0.5,  otherLabel:'PFML',  other:0 },
  'DE': { label: 'Delaware — ~5.5%',              federal:22, socialSecurity:6.2, medicare:1.45, state:5.5,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'HI': { label: 'Hawaii — ~7.9%',                federal:22, socialSecurity:6.2, medicare:1.45, state:7.9,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'KS': { label: 'Kansas — ~5.7%',                federal:22, socialSecurity:6.2, medicare:1.45, state:5.7,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'MD': { label: 'Maryland — ~5.75%',             federal:22, socialSecurity:6.2, medicare:1.45, state:5.75, local:3.0,   pfl:0,    otherLabel:'County',other:0 },
  'MN': { label: 'Minnesota — ~7.05%',            federal:22, socialSecurity:6.2, medicare:1.45, state:7.05, local:0,     pfl:0,    otherLabel:'',      other:0 },
  'MO': { label: 'Missouri — ~4.8%',              federal:22, socialSecurity:6.2, medicare:1.45, state:4.8,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'MT': { label: 'Montana — ~5.9%',               federal:22, socialSecurity:6.2, medicare:1.45, state:5.9,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'NE': { label: 'Nebraska — ~4.55%',             federal:22, socialSecurity:6.2, medicare:1.45, state:4.55, local:0,     pfl:0,    otherLabel:'',      other:0 },
  'NJ': { label: 'New Jersey — ~5.53%',           federal:22, socialSecurity:6.2, medicare:1.45, state:5.53, local:0,     pfl:0.28, otherLabel:'UI/WF', other:0 },
  'NM': { label: 'New Mexico — ~4.9%',            federal:22, socialSecurity:6.2, medicare:1.45, state:4.9,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'NY': { label: 'New York — Upstate / Outside NYC',       federal:22, socialSecurity:6.2, medicare:1.45, state:6.85, local:0,     pfl:0.388,otherLabel:'PFL',   other:0 },
  'NY_NYC': { label: 'New York — Works in NYC (adds 3.876% city tax)', federal:22, socialSecurity:6.2, medicare:1.45, state:6.85, local:3.876, pfl:0.388, otherLabel:'PFL', other:0 },
  'OK': { label: 'Oklahoma — ~4.5%',              federal:22, socialSecurity:6.2, medicare:1.45, state:4.5,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'OR': { label: 'Oregon — ~8.75%',               federal:22, socialSecurity:6.2, medicare:1.45, state:8.75, local:0,     pfl:1.0,  otherLabel:'PFML',  other:0 },
  'RI': { label: 'Rhode Island — ~5.99%',         federal:22, socialSecurity:6.2, medicare:1.45, state:5.99, local:0,     pfl:0,    otherLabel:'',      other:0 },
  'SC': { label: 'South Carolina — ~6.0%',        federal:22, socialSecurity:6.2, medicare:1.45, state:6.0,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'VA': { label: 'Virginia — ~5.75%',             federal:22, socialSecurity:6.2, medicare:1.45, state:5.75, local:0,     pfl:0,    otherLabel:'',      other:0 },
  'VT': { label: 'Vermont — ~6.6%',               federal:22, socialSecurity:6.2, medicare:1.45, state:6.6,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'WI': { label: 'Wisconsin — ~5.3%',             federal:22, socialSecurity:6.2, medicare:1.45, state:5.3,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'WV': { label: 'West Virginia — ~4.5%',         federal:22, socialSecurity:6.2, medicare:1.45, state:4.5,  local:0,     pfl:0,    otherLabel:'',      other:0 },
  'DC': { label: 'Washington DC — ~8.5%',         federal:22, socialSecurity:6.2, medicare:1.45, state:8.5,  local:0,     pfl:0.26, otherLabel:'PFML',  other:0 },
  'CUSTOM': { label: 'Custom — edit manually',    federal:22, socialSecurity:6.2, medicare:1.45, state:0,    local:0,     pfl:0,    otherLabel:'',      other:0 }
};

// ── TIP POOL ─────────────────────────────────────────────
const DEFAULT_TIP_POSITIONS = [
  { id: 'server',      label: 'Server',       points: 1.0  },
  { id: 'bartender',   label: 'Bartender',    points: 1.0  },
  { id: 'runner',      label: 'Food Runner',  points: 0.75 },
  { id: 'busboy',      label: 'Busboy',       points: 0.5  },
  { id: 'barback',     label: 'Barback',      points: 0.5  },
  { id: 'host',        label: 'Host',         points: 0.5  },
  { id: 'custom',      label: 'Custom',       points: 1.0  }
];

const TIP_ROUNDING_OPTIONS = [
  { value: 'down',    label: 'Always round down  (e.g. $37.6 → $37)' },
  { value: 'up',      label: 'Always round up    (e.g. $37.1 → $38)' },
  { value: 'nearest', label: 'Round to nearest   (e.g. $37.5 → $38)' },
  { value: 'manual',  label: 'No rounding — show exact cents'         }
];

const DEFAULT_TIP_SETTINGS = {
  positions: DEFAULT_TIP_POSITIONS,
  processingFeePercent: 3.0,
  roundingMode: 'down',
  roundIndividual: true
};
