/**
 * Hotkey management system for soundboards
 * Manages hotkey allocation and registration
 */

import { HOTKEY_POOL } from "../../config/constants.ts";

/**
 * Global registry mapping hotkeys to their playback functions
 * Used by the global keyboard handler to trigger sounds
 */
export const hotkeyRegistry = new Map<string, () => void>();

/**
 * Set of currently used hotkeys
 */
const usedHotkeys = new Set<string>();

/**
 * Assign the next available hotkey from the pool
 * @returns The assigned hotkey character, or empty string if pool is exhausted
 */
export function assignHotkey(): string {
  for (const key of HOTKEY_POOL) {
    if (!usedHotkeys.has(key)) {
      usedHotkeys.add(key);
      return key;
    }
  }
  return "";
}

/**
 * Release a hotkey back to the pool and remove it from the registry
 * @param key - The hotkey character to release
 */
export function releaseHotkey(key: string): void {
  usedHotkeys.delete(key);
  hotkeyRegistry.delete(key);
}
