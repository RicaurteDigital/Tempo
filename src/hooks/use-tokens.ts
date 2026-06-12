// Reactive hook for design tokens

import { signal } from '@preact/signals';
import type { DesignTokens } from '../design/tokens';
import { DEFAULT_TOKENS } from '../design/tokens';
import { initializeTheme, saveTokens, loadTokens } from '../design/theme';

/** Reactive token state */
export const tokens = signal<DesignTokens>({ ...DEFAULT_TOKENS });

/** Initialize tokens from DB and apply to DOM */
export async function initTokens(): Promise<void> {
  const loaded = await initializeTheme();
  tokens.value = loaded;
}

/** Update a single token value */
export async function updateToken<K extends keyof DesignTokens>(
  key: K,
  value: DesignTokens[K]
): Promise<void> {
  const updated = { ...tokens.value, [key]: value };
  tokens.value = updated;
  await saveTokens(updated);
}

/** Update multiple tokens at once */
export async function updateTokens(
  partial: Partial<DesignTokens>
): Promise<void> {
  const updated = { ...tokens.value, ...partial };
  tokens.value = updated;
  await saveTokens(updated);
}

/** Reset all tokens to factory defaults */
export async function resetAllTokens(): Promise<void> {
  const defaults = { ...DEFAULT_TOKENS };
  tokens.value = defaults;
  await saveTokens(defaults);
}

/** Load a named profile */
export async function loadProfile(name: string): Promise<void> {
  const loaded = await loadTokens(name);
  tokens.value = loaded;
  await saveTokens(loaded, 'active');
}
