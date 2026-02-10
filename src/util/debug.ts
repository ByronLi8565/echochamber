/**
 * Structured debug logging utility for EchoChamber
 *
 * Features:
 * - Categorized logging (app, sync, persistence, audio, drag, canvas, items)
 * - localStorage toggle support (echochamber-debug)
 * - URL parameter support (?debug=app,sync)
 * - Environment-aware defaults (dev: all enabled, prod: errors only)
 * - Color-coded console output
 * - Auto-prefixing with timestamp and category
 */

import { DEBUG_STORAGE_KEY } from "../config/constants";

type DebugCategory =
  | "app"
  | "sync"
  | "persistence"
  | "audio"
  | "drag"
  | "canvas"
  | "items";

type LogLevel = "log" | "warn" | "error";

interface CategoryLogger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

interface DebugConfig {
  enabled: Set<DebugCategory>;
  colors: Record<DebugCategory, string>;
}

const CATEGORY_COLORS: Record<DebugCategory, string> = {
  app: "#9b59b6",
  sync: "#3498db",
  persistence: "#2ecc71",
  audio: "#e74c3c",
  drag: "#f39c12",
  canvas: "#1abc9c",
  items: "#e91e63",
};

const isDevelopment = (): boolean => {
  try {
    return (
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname.includes("local"))
    );
  } catch {
    return false;
  }
};

function getUrlDebugCategories(): DebugCategory[] | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const debugParam = params.get("debug");

  if (!debugParam) return null;

  if (debugParam === "*" || debugParam === "all") {
    return ["app", "sync", "persistence", "audio", "drag", "canvas", "items"];
  }

  const categories = debugParam.split(",").map((c) => c.trim());
  const validCategories: DebugCategory[] = [];

  for (const cat of categories) {
    if (isValidCategory(cat)) {
      validCategories.push(cat as DebugCategory);
    }
  }

  return validCategories.length > 0 ? validCategories : null;
}

function getStorageDebugCategories(): DebugCategory[] | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(DEBUG_STORAGE_KEY);
    if (!stored) return null;

    if (stored === "*" || stored === "all") {
      return ["app", "sync", "persistence", "audio", "drag", "canvas", "items"];
    }

    const categories = stored.split(",").map((c) => c.trim());
    const validCategories: DebugCategory[] = [];

    for (const cat of categories) {
      if (isValidCategory(cat)) {
        validCategories.push(cat as DebugCategory);
      }
    }

    return validCategories.length > 0 ? validCategories : null;
  } catch {
    return null;
  }
}

function getDefaultCategories(): DebugCategory[] {
  // In development, enable all categories
  if (isDevelopment()) {
    return ["app", "sync", "persistence", "audio", "drag", "canvas", "items"];
  }
  // In production, no categories enabled by default (only errors will show)
  return [];
}

function isValidCategory(cat: string): cat is DebugCategory {
  return [
    "app",
    "sync",
    "persistence",
    "audio",
    "drag",
    "canvas",
    "items",
  ].includes(cat);
}

function initializeConfig(): DebugConfig {
  // Priority: URL params > localStorage > environment defaults
  const urlCategories = getUrlDebugCategories();
  const storageCategories = getStorageDebugCategories();
  const defaultCategories = getDefaultCategories();

  const enabledCategories =
    urlCategories ?? storageCategories ?? defaultCategories;

  return {
    enabled: new Set(enabledCategories),
    colors: CATEGORY_COLORS,
  };
}

let config = initializeConfig();

function formatTimestamp(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

function createPrefix(category: DebugCategory): string {
  const timestamp = formatTimestamp();
  const categoryUpper = category.toUpperCase().padEnd(11); // Align category names
  return `[${timestamp}] [${categoryUpper}]`;
}

function logWithCategory(
  category: DebugCategory,
  level: LogLevel,
  args: unknown[]
): void {
  // Always show errors, regardless of enabled state
  if (level === "error") {
    const prefix = createPrefix(category);
    const color = config.colors[category];
    console.error(`%c${prefix}`, `color: ${color}; font-weight: bold`, ...args);
    return;
  }

  // For log and warn, check if category is enabled
  if (!config.enabled.has(category)) {
    return;
  }

  const prefix = createPrefix(category);
  const color = config.colors[category];
  const consoleMethod = level === "warn" ? console.warn : console.log;

  consoleMethod(`%c${prefix}`, `color: ${color}; font-weight: bold`, ...args);
}

function createCategoryLogger(category: DebugCategory): CategoryLogger {
  return {
    log: (...args: unknown[]) => logWithCategory(category, "log", args),
    warn: (...args: unknown[]) => logWithCategory(category, "warn", args),
    error: (...args: unknown[]) => logWithCategory(category, "error", args),
  };
}

export const debug = {
  app: createCategoryLogger("app"),
  sync: createCategoryLogger("sync"),
  persistence: createCategoryLogger("persistence"),
  audio: createCategoryLogger("audio"),
  drag: createCategoryLogger("drag"),
  canvas: createCategoryLogger("canvas"),
  items: createCategoryLogger("items"),
} as const;

export const debugControl = {
  enable(...categories: DebugCategory[]): void {
    for (const cat of categories) {
      config.enabled.add(cat);
    }
    this.save();
  },

  disable(...categories: DebugCategory[]): void {
    for (const cat of categories) {
      config.enabled.delete(cat);
    }
    this.save();
  },

  enableAll(): void {
    config.enabled = new Set([
      "app",
      "sync",
      "persistence",
      "audio",
      "drag",
      "canvas",
      "items",
    ]);
    this.save();
  },

  disableAll(): void {
    config.enabled.clear();
    this.save();
  },

  isEnabled(category: DebugCategory): boolean {
    return config.enabled.has(category);
  },

  getEnabled(): DebugCategory[] {
    return Array.from(config.enabled);
  },

  save(): void {
    if (typeof window === "undefined") return;

    try {
      const categories = Array.from(config.enabled).join(",");
      if (categories) {
        localStorage.setItem(DEBUG_STORAGE_KEY, categories);
      } else {
        localStorage.removeItem(DEBUG_STORAGE_KEY);
      }
      debug.app.log("Debug configuration saved:", categories || "(none)");
    } catch (error) {
      console.error("Failed to save debug configuration:", error);
    }
  },

  reset(): void {
    config = initializeConfig();
    debug.app.log("Debug configuration reset to defaults");
  },

  help(): void {
    console.log(`
%cEchoChamber Debug Utility
%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

%cAvailable categories:%c
  • app         - Application lifecycle and initialization
  • sync        - Real-time synchronization and networking
  • persistence - Automerge document and storage operations
  • audio       - Audio playback, recording, and processing
  • drag        - Drag and drop interactions
  • canvas      - Canvas rendering and viewport
  • items       - Item creation, updates, and management

%cUsage:%c
  debugControl.enable("app", "sync")    - Enable specific categories
  debugControl.disable("audio")         - Disable specific categories
  debugControl.enableAll()              - Enable all categories
  debugControl.disableAll()             - Disable all categories
  debugControl.isEnabled("app")         - Check if category is enabled
  debugControl.getEnabled()             - Get list of enabled categories
  debugControl.save()                   - Save to localStorage
  debugControl.reset()                  - Reset to environment defaults

%cURL parameter:%c
  ?debug=app,sync                       - Enable via URL
  ?debug=all                            - Enable all via URL

%cLocalStorage key:%c
  ${DEBUG_STORAGE_KEY}

%cCurrent configuration:%c
  Enabled: ${Array.from(config.enabled).join(", ") || "(none)"}
  Environment: ${isDevelopment() ? "development" : "production"}
`,
      "font-size: 16px; font-weight: bold; color: #9b59b6",
      "color: #666",
      "font-weight: bold",
      "font-weight: normal",
      "font-weight: bold",
      "font-weight: normal",
      "font-weight: bold",
      "font-weight: normal",
      "font-weight: bold",
      "font-weight: normal",
      "font-weight: bold",
      "font-weight: normal"
    );
  },
};

if (typeof window !== "undefined") {
  (window as any).debugControl = debugControl;
  debug.app.log(
    "Debug utility initialized. Type 'debugControl.help()' for usage."
  );
}
