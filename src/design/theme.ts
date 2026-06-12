// Theme engine: applies tokens to :root, syncs between Dexie (source of truth) and localStorage (sync mirror)

import { DesignTokens, DEFAULT_TOKENS, TOKEN_CSS_MAP, PX_TOKENS, COLOR_TOKENS } from './tokens';
import { db } from '../db/database';
import { STORAGE_KEY_TOKENS } from '../utils/constants';

/** Apply a set of tokens to :root as CSS custom properties */
export function applyTokensToDOM(tokens: Partial<DesignTokens>): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    const cssVar = TOKEN_CSS_MAP[key as keyof DesignTokens];
    if (!cssVar) continue;

    let cssValue: string;
    if (COLOR_TOKENS.has(key as keyof DesignTokens)) {
      cssValue = String(value);
    } else if (PX_TOKENS.has(key as keyof DesignTokens)) {
      cssValue = `${value}px`;
    } else {
      cssValue = String(value);
    }
    root.style.setProperty(cssVar, cssValue);
  }
}

/** Mirror tokens to localStorage for the sync token-loader.js */
function mirrorToLocalStorage(tokens: DesignTokens): void {
  try {
    localStorage.setItem(STORAGE_KEY_TOKENS, JSON.stringify(tokens));
  } catch {
    // localStorage might be full or unavailable — non-critical
  }
}

/** Save tokens to Dexie (source of truth) + localStorage (sync mirror) */
export async function saveTokens(
  tokens: DesignTokens,
  profileName: string = 'active'
): Promise<void> {
  await db.tokens.put({ key: profileName, value: tokens as unknown as Record<string, unknown> });
  if (profileName === 'active') {
    mirrorToLocalStorage(tokens);
    applyTokensToDOM(tokens);
  }
}

/** Load tokens from Dexie. Falls back to defaults. */
export async function loadTokens(
  profileName: string = 'active'
): Promise<DesignTokens> {
  const record = await db.tokens.get(profileName);
  if (record?.value) {
    return { ...DEFAULT_TOKENS, ...record.value };
  }
  return { ...DEFAULT_TOKENS };
}

/** Boot sequence: load from Dexie, apply to DOM, sync to localStorage */
export async function initializeTheme(): Promise<DesignTokens> {
  const tokens = await loadTokens('active');
  applyTokensToDOM(tokens);
  mirrorToLocalStorage(tokens);
  return tokens;
}

/** Reset tokens to factory defaults */
export async function resetTokens(): Promise<DesignTokens> {
  const tokens = { ...DEFAULT_TOKENS };
  await saveTokens(tokens, 'active');
  return tokens;
}

/** List all saved token profiles */
export async function listProfiles(): Promise<string[]> {
  const all = await db.tokens.toArray();
  return all.map((r) => r.key).filter((k) => k !== 'active');
}

/** Delete a token profile */
export async function deleteProfile(name: string): Promise<void> {
  if (name === 'active') throw new Error('Cannot delete the active profile');
  await db.tokens.delete(name);
}
