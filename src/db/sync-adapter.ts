// Sync adapter interface — stub for future remote backup integration

export interface SyncAdapter {
  /** Push local changes to remote */
  push(): Promise<{ success: boolean; error?: string }>;
  /** Pull remote changes to local */
  pull(): Promise<{ success: boolean; error?: string }>;
  /** Check connection status */
  getStatus(): Promise<{ connected: boolean; lastSync?: number }>;
}

/** No-op implementation for Phase 1 (local-only) */
export class LocalOnlySyncAdapter implements SyncAdapter {
  async push() {
    return { success: true };
  }
  async pull() {
    return { success: true };
  }
  async getStatus() {
    return { connected: false };
  }
}

export const syncAdapter: SyncAdapter = new LocalOnlySyncAdapter();
