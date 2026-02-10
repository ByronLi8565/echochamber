/**
 * Centralized constants configuration for EchoChamber
 */

// =============================================================================
// VERSION & METADATA
// =============================================================================

/** Application version */
export const VERSION = "1.0.0" as const;

/** Application name */
export const APP_NAME = "EchoChamber" as const;

// =============================================================================
// STORAGE KEYS
// =============================================================================

/** IndexedDB/localStorage key for Automerge document */
export const STORAGE_KEY = "echochamber-doc" as const;

/** localStorage key for viewport state (pan offsets) */
export const VIEWPORT_STORAGE_KEY = "echochamber-viewport" as const;

/** localStorage key for debug mode toggle */
export const DEBUG_STORAGE_KEY = "echochamber-debug" as const;

/** localStorage key for sync colors setting */
export const SYNC_COLORS_STORAGE_KEY = "echochamber-sync-colors" as const;

// =============================================================================
// TIMING CONSTANTS
// =============================================================================

/** Debounce interval for saving Automerge document to storage (ms) */
export const SAVE_DEBOUNCE_MS = 500 as const;

/** Debounce interval for Automerge change notifications (~60fps) (ms) */
export const NOTIFY_DEBOUNCE_MS = 16 as const;

/** Animation frame rate target (ms per frame) */
export const FRAME_RATE_MS = 16 as const;

// =============================================================================
// AUDIO SETTINGS
// =============================================================================

/** Duration of reverb impulse response in seconds */
export const REVERB_DURATION_SECONDS = 2 as const;

/** Minimum speed rate (playback speed multiplier) */
export const SPEED_RATE_MIN = 0.5 as const;

/** Maximum speed rate (playback speed multiplier) */
export const SPEED_RATE_MAX = 1.75 as const;

/** Default speed rate (normal speed) */
export const SPEED_RATE_DEFAULT = 1.0 as const;

/** Minimum reverb intensity (0 = no reverb) */
export const REVERB_INTENSITY_MIN = 0 as const;

/** Maximum reverb intensity (1 = full reverb) */
export const REVERB_INTENSITY_MAX = 1 as const;

/** Default reverb intensity (no reverb) */
export const REVERB_INTENSITY_DEFAULT = 0 as const;

/** Minimum repeat count */
export const REPEAT_COUNT_MIN = 1 as const;

/** Default repeat count */
export const REPEAT_COUNT_DEFAULT = 1 as const;

// =============================================================================
// UI CONSTANTS
// =============================================================================

/** Pool of available hotkeys for soundboards */
export const HOTKEY_POOL = "123456789QWERTYUIOPASDFGHJKLZXCVBNM".split("") as const;

/** Offset in pixels when duplicating items */
export const DUPLICATE_OFFSET = 24 as const;

/** Drag threshold in pixels before drag is initiated */
export const DRAG_THRESHOLD = 4 as const;

/** Z-index for canvas items */
export const Z_INDEX_ITEM = 1 as const;

/** Z-index for dragging items */
export const Z_INDEX_DRAGGING = 1000 as const;

/** Z-index for progress rings */
export const Z_INDEX_PROGRESS_RING = 10 as const;

/** Z-index for links overlay */
export const Z_INDEX_LINKS_OVERLAY = 0 as const;

/** Z-index for modals */
export const Z_INDEX_MODAL = 2000 as const;

// =============================================================================
// PROGRESS RING CONFIG
// =============================================================================

/** Progress ring stroke width in pixels */
export const RING_STROKE_WIDTH = 2 as const;

/** Progress ring radius offset from bubble edge in pixels */
export const RING_RADIUS_OFFSET = 3 as const;

/** Progress ring background opacity */
export const RING_BACKGROUND_OPACITY = 0.15 as const;

/** Progress ring looping animation dash offset multiplier */
export const RING_LOOP_DASH_OFFSET = 0.7 as const;

/** Progress ring rotation animation duration in seconds */
export const RING_ROTATION_DURATION = 2 as const;

// =============================================================================
// LINK / SVG CONSTANTS
// =============================================================================

/** Link line stroke width in pixels */
export const LINK_STROKE_WIDTH = 2 as const;

/** Link marker (arrow) size in pixels */
export const LINK_MARKER_SIZE = 6 as const;

/** Link line opacity */
export const LINK_OPACITY = 0.5 as const;

/** Link hover opacity */
export const LINK_HOVER_OPACITY = 0.8 as const;

// =============================================================================
// COLOR CONSTANTS
// =============================================================================

/** Default soundboard color */
export const DEFAULT_SOUNDBOARD_COLOR = "#ff6b6b" as const;

/** Default textbox color */
export const DEFAULT_TEXTBOX_COLOR = "#4ecdc4" as const;

/** Default background color */
export const DEFAULT_BACKGROUND_COLOR = "#1a1a1a" as const;

/** State color for active/playing */
export const STATE_COLOR_CYAN = "#4ecdc4" as const;

/** State color for looping */
export const STATE_COLOR_PURPLE = "#9b59b6" as const;

/** State color for error */
export const STATE_COLOR_RED = "#e74c3c" as const;

/** State color for success */
export const STATE_COLOR_GREEN = "#2ecc71" as const;

// =============================================================================
// WCAG CONTRAST RATIOS
// =============================================================================

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

// =============================================================================
// DEFAULT VALUES
// =============================================================================

/** Default soundboard filters */
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

/** Default textbox content */
export const DEFAULT_TEXTBOX_CONTENT = "Click to edit" as const;

/** Default textbox font size in pixels */
export const DEFAULT_TEXTBOX_FONT_SIZE = 16 as const;

/** Default item width in pixels */
export const DEFAULT_ITEM_WIDTH = 120 as const;

/** Default item height in pixels */
export const DEFAULT_ITEM_HEIGHT = 120 as const;

// =============================================================================
// ROOM CODE VALIDATION
// =============================================================================

/**
 * Room code validation regex
 * Allows alphanumeric characters and hyphens, 1-64 characters
 */
export const ROOM_CODE_REGEX = /^[a-zA-Z0-9-]{1,64}$/ as const;

/** Minimum room code length */
export const ROOM_CODE_MIN_LENGTH = 1 as const;

/** Maximum room code length */
export const ROOM_CODE_MAX_LENGTH = 64 as const;

// =============================================================================
// EXPORT / IMPORT CONFIG
// =============================================================================

/** ZIP compression level (0-9, where 6 is balanced speed/compression) */
export const ZIP_COMPRESSION_LEVEL = 6 as const;

/** Export file extension */
export const EXPORT_FILE_EXTENSION = ".echochamber" as const;

/** Export manifest filename */
export const EXPORT_MANIFEST_FILENAME = "manifest.json" as const;

/** Export document filename */
export const EXPORT_DOCUMENT_FILENAME = "document.automerge" as const;

/** Export audio directory name */
export const EXPORT_AUDIO_DIR = "audio" as const;

// =============================================================================
// CANVAS SETTINGS
// =============================================================================

/** Minimum zoom level */
export const ZOOM_MIN = 0.1 as const;

/** Maximum zoom level */
export const ZOOM_MAX = 5 as const;

/** Default zoom level */
export const ZOOM_DEFAULT = 1 as const;

/** Zoom step per scroll/pinch event */
export const ZOOM_STEP = 0.1 as const;

// =============================================================================
// COUNTER BADGE
// =============================================================================

/** Maximum number to display in counter badge before showing "99+" */
export const COUNTER_BADGE_MAX = 99 as const;

// =============================================================================
// PERFORMANCE
// =============================================================================

/** Throttle interval for link overlay recalculation (ms) */
export const LINK_OVERLAY_THROTTLE_MS = 100 as const;

/** Throttle interval for canvas pan events (ms) */
export const CANVAS_PAN_THROTTLE_MS = 16 as const;

// =============================================================================
// TYPE EXPORTS
// =============================================================================

/** All hotkey characters as a union type */
export type HotkeyChar = typeof HOTKEY_POOL[number];

/** Default soundboard filters type */
export type DefaultSoundboardFilters = typeof DEFAULT_SOUNDBOARD_FILTERS;
