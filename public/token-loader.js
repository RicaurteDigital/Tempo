/**
 * Synchronous token loader — runs in <head> before app render.
 *
 * Correction A: IndexedDB has no sync API, so we mirror active tokens
 * to localStorage on every save. This script reads that mirror and
 * applies CSS custom properties to :root before first paint.
 * Dexie remains the source of truth; theme.ts re-syncs after boot.
 */
(function () {
  try {
    var raw = localStorage.getItem('tempo-tokens');
    if (!raw) return;

    var tokens = JSON.parse(raw);
    var root = document.documentElement;

    /** Map of JS key → CSS custom property name */
    var map = {
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

    /** Numeric tokens that require a 'px' unit suffix */
    var pxKeys = {
      fontDisplay: 1, fontTitle: 1, fontBody: 1, fontCaption: 1,
      cardHeightSm: 1, cardHeightMd: 1, cardHeightLg: 1,
      cardPadding: 1, gridGap: 1, sectionGap: 1,
      radiusCard: 1, radiusButton: 1, radiusPill: 1,
      touchTargetMin: 1, ringSize: 1, ringStroke: 1,
    };

    for (var key in map) {
      if (tokens[key] !== undefined) {
        var val = tokens[key];
        if (pxKeys[key]) val = val + 'px';
        root.style.setProperty(map[key], String(val));
      }
    }
  } catch (_) {
    /* Silent fail — tokens.css defaults apply */
  }
})();
