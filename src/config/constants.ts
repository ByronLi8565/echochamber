/**
 * Centralized constants configuration for EchoChamber
 */

export const VERSION = "1.0.0" as const;
export const APP_NAME = "EchoChamber" as const;

export const STORAGE_KEY = "echochamber-doc" as const;
export const VIEWPORT_STORAGE_KEY = "echochamber-viewport" as const;
export const DEBUG_STORAGE_KEY = "echochamber-debug" as const;
export const SYNC_COLORS_STORAGE_KEY = "echochamber-sync-colors" as const;

export const SAVE_DEBOUNCE_MS = 500 as const;
export const NOTIFY_DEBOUNCE_MS = 16 as const;
export const FRAME_RATE_MS = 16 as const;

export const REVERB_DURATION_SECONDS = 2 as const;
export const SPEED_RATE_MIN = 0.5 as const;
export const SPEED_RATE_MAX = 1.75 as const;
export const SPEED_RATE_DEFAULT = 1.0 as const;
export const REVERB_INTENSITY_MIN = 0 as const;
export const REVERB_INTENSITY_MAX = 1 as const;
export const REVERB_INTENSITY_DEFAULT = 0 as const;
export const REPEAT_COUNT_MIN = 1 as const;
export const REPEAT_COUNT_DEFAULT = 1 as const;

export const HOTKEY_POOL = "123456789QWERTYUIOPASDFGHJKLZXCVBNM".split("") as const;
export const DUPLICATE_OFFSET = 24 as const;
export const DRAG_THRESHOLD = 4 as const;
export const Z_INDEX_ITEM = 1 as const;
export const Z_INDEX_DRAGGING = 1000 as const;
export const Z_INDEX_PROGRESS_RING = 10 as const;
export const Z_INDEX_LINKS_OVERLAY = 0 as const;
export const Z_INDEX_MODAL = 2000 as const;

export const RING_STROKE_WIDTH = 2 as const;
export const RING_RADIUS_OFFSET = 3 as const;
export const RING_BACKGROUND_OPACITY = 0.15 as const;
export const RING_LOOP_DASH_OFFSET = 0.7 as const;
export const RING_ROTATION_DURATION = 2 as const;

export const LINK_STROKE_WIDTH = 2 as const;
export const LINK_MARKER_SIZE = 6 as const;
export const LINK_OPACITY = 0.5 as const;
export const LINK_HOVER_OPACITY = 0.8 as const;

export const DEFAULT_SOUNDBOARD_COLOR = "#ff6b6b" as const;
export const DEFAULT_TEXTBOX_COLOR = "#4ecdc4" as const;
export const DEFAULT_BACKGROUND_COLOR = "#1a1a1a" as const;
export const STATE_COLOR_CYAN = "#4ecdc4" as const;
export const STATE_COLOR_PURPLE = "#9b59b6" as const;
export const STATE_COLOR_RED = "#e74c3c" as const;
export const STATE_COLOR_GREEN = "#2ecc71" as const;

/**
 * WCAG AA minimum contrast ratio for normal text (4.5:1)
 * Used for determining readable text color on colored backgrounds
 */
export const WCAG_CONTRAST_NORMAL_AA = 4.5 as const;

/**
 * WCAG AAA minimum contrast ratio for normal text (7:1)
 * Higher standard for enhanced accessibility
 */
export const WCAG_CONTRAST_NORMAL_AAA = 7 as const;

/**
 * WCAG AA minimum contrast ratio for large text (3:1)
 * Large text is 18pt+ or 14pt+ bold
 */
export const WCAG_CONTRAST_LARGE_AA = 3 as const;

export const DEFAULT_SOUNDBOARD_FILTERS = {
  speedRate: SPEED_RATE_DEFAULT,
  reverbIntensity: REVERB_INTENSITY_DEFAULT,
  reversed: 0,
  playConcurrently: 0,
  loopEnabled: 0,
  loopDelaySeconds: 0,
  repeatCount: REPEAT_COUNT_DEFAULT,
  repeatDelaySeconds: 0,
} as const;

export const DEFAULT_TEXTBOX_CONTENT = "Click to edit" as const;
export const DEFAULT_TEXTBOX_FONT_SIZE = 16 as const;
export const DEFAULT_ITEM_WIDTH = 120 as const;
export const DEFAULT_ITEM_HEIGHT = 120 as const;

/**
 * Room code validation regex
 * Allows alphanumeric characters and hyphens, 1-64 characters
 */
export const ROOM_CODE_REGEX = /^[a-zA-Z0-9-]{1,64}$/ as const;
export const ROOM_CODE_MIN_LENGTH = 1 as const;
export const ROOM_CODE_MAX_LENGTH = 64 as const;

export const ZIP_COMPRESSION_LEVEL = 6 as const;
export const EXPORT_FILE_EXTENSION = ".echochamber" as const;
export const EXPORT_MANIFEST_FILENAME = "manifest.json" as const;
export const EXPORT_DOCUMENT_FILENAME = "document.automerge" as const;
export const EXPORT_AUDIO_DIR = "audio" as const;

export const ZOOM_MIN = 0.1 as const;
export const ZOOM_MAX = 5 as const;
export const ZOOM_DEFAULT = 1 as const;
export const ZOOM_STEP = 0.1 as const;

export const COUNTER_BADGE_MAX = 99 as const;

export const LINK_OVERLAY_THROTTLE_MS = 100 as const;
export const CANVAS_PAN_THROTTLE_MS = 16 as const;

export type HotkeyChar = typeof HOTKEY_POOL[number];
export type DefaultSoundboardFilters = typeof DEFAULT_SOUNDBOARD_FILTERS;
