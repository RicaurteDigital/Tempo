// Design system token definitions, defaults, constraints, and CSS property mapping

export interface DesignTokens {
  // Typography
  fontScale: number;
  fontDisplay: number;
  fontTitle: number;
  fontBody: number;
  fontCaption: number;
  // Layout
  cardHeightSm: number;
  cardHeightMd: number;
  cardHeightLg: number;
  cardPadding: number;
  gridGap: number;
  sectionGap: number;
  timelineHourHeight: number;
  timelineGutter: number;
  timelineBlockRadius: number;
  timelineBlockMinHeight: number;
  timelineNowThickness: number;
  tabbarHeight: number;
  // Radii
  radiusCard: number;
  radiusButton: number;
  radiusPill: number;
  // Touch
  touchTargetMin: number;
  // Ring (timer progress ring)
  ringSize: number;
  ringStroke: number;
  // Colors
  colorDeepStudy: string;
  colorWork: string;
  colorTransport: string;
  colorBody: string;
  colorSleep: string;
  colorRest: string;
  colorLeak: string;
  colorSurface: string;
  colorSurfaceHigh: string;
  colorBorder: string;
  colorTextPrimary: string;
  colorTextSecondary: string;
  colorBackground: string;
}

export interface TokenConstraint {
  min: number;
  max: number;
  step: number;
  group: TokenGroup;
  label: string;
  unit: string; // 'px', '', etc.
}

export type TokenGroup = 'typography' | 'layout' | 'radii' | 'touch' | 'ring' | 'colors';

/** Map of JS key → CSS custom property name */
export const TOKEN_CSS_MAP: Record<keyof DesignTokens, string> = {
  fontScale: '--font-scale',
  fontDisplay: '--font-display',
  fontTitle: '--font-title',
  fontBody: '--font-body',
  fontCaption: '--font-caption',
  cardHeightSm: '--card-height-sm',
  cardHeightMd: '--card-height-md',
  cardHeightLg: '--card-height-lg',
  cardPadding: '--card-padding',
  gridGap: '--grid-gap',
  sectionGap: '--section-gap',
  timelineHourHeight: '--timeline-hour-height',
  timelineGutter: '--timeline-gutter',
  timelineBlockRadius: '--timeline-block-radius',
  timelineBlockMinHeight: '--timeline-block-min-height',
  timelineNowThickness: '--timeline-now-thickness',
  tabbarHeight: '--tabbar-height',
  radiusCard: '--radius-card',
  radiusButton: '--radius-button',
  radiusPill: '--radius-pill',
  touchTargetMin: '--touch-target-min',
  ringSize: '--ring-size',
  ringStroke: '--ring-stroke',
  colorDeepStudy: '--color-deep-study',
  colorWork: '--color-work',
  colorTransport: '--color-transport',
  colorBody: '--color-body',
  colorSleep: '--color-sleep',
  colorRest: '--color-rest',
  colorLeak: '--color-leak',
  colorSurface: '--color-surface',
  colorSurfaceHigh: '--color-surface-high',
  colorBorder: '--color-border',
  colorTextPrimary: '--color-text-primary',
  colorTextSecondary: '--color-text-secondary',
  colorBackground: '--color-background',
};

/** Set of token keys that use 'px' unit in CSS */
export const PX_TOKENS = new Set<keyof DesignTokens>([
  'fontDisplay', 'fontTitle', 'fontBody', 'fontCaption',
  'cardHeightSm', 'cardHeightMd', 'cardHeightLg',
  'cardPadding', 'gridGap', 'sectionGap',
  'timelineHourHeight', 'timelineGutter', 'timelineBlockRadius', 'timelineBlockMinHeight', 'timelineNowThickness', 'tabbarHeight',
  'radiusCard', 'radiusButton', 'radiusPill',
  'touchTargetMin', 'ringSize', 'ringStroke',
]);

/** Color token keys */
export const COLOR_TOKENS = new Set<keyof DesignTokens>([
  'colorDeepStudy', 'colorWork', 'colorTransport', 'colorBody',
  'colorSleep', 'colorRest', 'colorLeak', 'colorSurface',
  'colorSurfaceHigh', 'colorBorder', 'colorTextPrimary',
  'colorTextSecondary', 'colorBackground',
]);

/** Factory defaults */
export const DEFAULT_TOKENS: DesignTokens = {
  fontScale: 1,
  fontDisplay: 46,
  fontTitle: 20,
  fontBody: 16,
  fontCaption: 12,
  cardHeightSm: 44,
  cardHeightMd: 64,
  cardHeightLg: 88,
  cardPadding: 16,
  gridGap: 12,
  sectionGap: 24,
  timelineHourHeight: 56,
  timelineGutter: 52,
  timelineBlockRadius: 10,
  timelineBlockMinHeight: 18,
  timelineNowThickness: 2,
  tabbarHeight: 64,
  radiusCard: 16,
  radiusButton: 12,
  radiusPill: 999,
  touchTargetMin: 44,
  ringSize: 280,
  ringStroke: 12,
  colorDeepStudy: '#5E5CE6',
  colorWork: '#64D2FF',
  colorTransport: '#98989D',
  colorBody: '#30D158',
  colorSleep: '#BF5AF2',
  colorRest: '#66D4CF',
  colorLeak: '#FF453A',
  colorSurface: '#1C1C1E',
  colorSurfaceHigh: '#2C2C2E',
  colorBorder: '#38383A',
  colorTextPrimary: '#FFFFFF',
  colorTextSecondary: '#98989D',
  colorBackground: '#000000',
};

/** Slider constraints for the Developer Panel */
export const TOKEN_CONSTRAINTS: Partial<Record<keyof DesignTokens, TokenConstraint>> = {
  fontScale:     { min: 0.8, max: 1.4, step: 0.05, group: 'typography', label: 'Escala global', unit: '' },
  fontDisplay:   { min: 28, max: 80, step: 1, group: 'typography', label: 'Timer / hero', unit: 'px' },
  fontTitle:     { min: 14, max: 32, step: 1, group: 'typography', label: 'Títulos', unit: 'px' },
  fontBody:      { min: 12, max: 24, step: 1, group: 'typography', label: 'Cuerpo', unit: 'px' },
  fontCaption:   { min: 9, max: 18, step: 1, group: 'typography', label: 'Captions', unit: 'px' },
  cardHeightSm:  { min: 36, max: 64, step: 2, group: 'layout', label: 'Tarjeta S', unit: 'px' },
  cardHeightMd:  { min: 48, max: 96, step: 2, group: 'layout', label: 'Tarjeta M', unit: 'px' },
  cardHeightLg:  { min: 64, max: 128, step: 2, group: 'layout', label: 'Tarjeta L', unit: 'px' },
  cardPadding:   { min: 8, max: 32, step: 2, group: 'layout', label: 'Padding tarjetas', unit: 'px' },
  gridGap:       { min: 4, max: 24, step: 2, group: 'layout', label: 'Grid gap', unit: 'px' },
  sectionGap:    { min: 8, max: 48, step: 4, group: 'layout', label: 'Section gap', unit: 'px' },
  timelineHourHeight: { min: 36, max: 96, step: 2, group: 'layout', label: 'Altura hora', unit: 'px' },
  timelineGutter:     { min: 32, max: 80, step: 2, group: 'layout', label: 'Gutter agenda', unit: 'px' },
  timelineBlockRadius:{ min: 0, max: 24, step: 2, group: 'layout', label: 'Radio bloque', unit: 'px' },
  timelineBlockMinHeight:{ min: 8, max: 32, step: 2, group: 'layout', label: 'Min bloque', unit: 'px' },
  timelineNowThickness:  { min: 1, max: 8, step: 1, group: 'layout', label: 'Línea actual', unit: 'px' },
  tabbarHeight:          { min: 48, max: 96, step: 2, group: 'layout', label: 'Altura tabbar', unit: 'px' },
  radiusCard:    { min: 0, max: 32, step: 2, group: 'radii', label: 'Radio tarjetas', unit: 'px' },
  radiusButton:  { min: 0, max: 24, step: 2, group: 'radii', label: 'Radio botones', unit: 'px' },
  radiusPill:    { min: 8, max: 999, step: 1, group: 'radii', label: 'Radio pill', unit: 'px' },
  touchTargetMin:{ min: 44, max: 64, step: 2, group: 'touch', label: 'Touch target mín.', unit: 'px' },
  ringSize:      { min: 180, max: 360, step: 10, group: 'ring', label: 'Tamaño anillo', unit: 'px' },
  ringStroke:    { min: 4, max: 24, step: 1, group: 'ring', label: 'Grosor anillo', unit: 'px' },
};
