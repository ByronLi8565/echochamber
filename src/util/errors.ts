/**
 * Structured error handling for EchoChamber
 *
 * Features:
 * - Typed error classes for different failure domains
 * - Error boundary wrappers for critical operations
 * - User-facing error notifications (toast/banner)
 * - Integration with debug logging
 * - Graceful degradation support
 */

import { Effect } from "effect";
import { debug } from "./debug";

type ErrorCategory = "audio" | "sync" | "persistence" | "app" | "items";

interface ErrorPayload {
  message: string;
  userMessage?: string;
  isRecoverable?: boolean;
  cause?: unknown;
}

interface EchoChamberErrorOptions extends ErrorPayload {
  category: ErrorCategory;
}

type ErrorInput = string | ErrorPayload;

type DomainErrorOptions = Omit<ErrorPayload, "message">;

function withCategory(
  input: ErrorInput,
  category: ErrorCategory,
  options: DomainErrorOptions = {},
): EchoChamberErrorOptions {
  if (typeof input === "string") {
    return {
      message: input,
      category,
      ...options,
    };
  }

  return {
    message: input.message,
    userMessage: input.userMessage,
    isRecoverable: input.isRecoverable,
    cause: input.cause,
    ...options,
    category,
  };
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return new Error((error as { message: string }).message);
  }
  return new Error(String(error));
}

function getMessageFromUnknown(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return null;
}

function getUserMessageFromUnknown(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "userMessage" in error &&
    typeof (error as { userMessage: unknown }).userMessage === "string"
  ) {
    return (error as { userMessage: string }).userMessage;
  }
  return null;
}

export class EchoChamberError extends Error {
  public readonly _tag: string;
  public readonly category: ErrorCategory;
  public readonly userMessage: string;
  public readonly isRecoverable: boolean;
  public readonly timestamp: number;

  constructor(options: EchoChamberErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = this.constructor.name;
    this._tag = this.constructor.name;
    this.category = options.category;
    this.userMessage = options.userMessage ?? options.message;
    this.isRecoverable = options.isRecoverable ?? true;
    this.timestamp = Date.now();

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class DecodeError extends EchoChamberError {
  constructor(input: ErrorInput, options: DomainErrorOptions = {}) {
    super(withCategory(input, "app", options));
  }
}

export class AudioError extends EchoChamberError {
  constructor(input: ErrorInput, options: DomainErrorOptions = {}) {
    super(withCategory(input, "audio", options));
  }
}

export class SyncError extends EchoChamberError {
  constructor(input: ErrorInput, options: DomainErrorOptions = {}) {
    super(withCategory(input, "sync", options));
  }
}

export class StorageError extends EchoChamberError {
  constructor(input: ErrorInput, options: DomainErrorOptions = {}) {
    super(withCategory(input, "persistence", options));
  }
}

export class ImportExportError extends EchoChamberError {
  constructor(input: ErrorInput, options: DomainErrorOptions = {}) {
    super(withCategory(input, "app", options));
  }
}

export class ValidationError extends EchoChamberError {
  constructor(input: ErrorInput, options: DomainErrorOptions = {}) {
    super(withCategory(input, "app", options));
  }
}

export interface ErrorBoundaryOptions {
  /** Operation name for logging */
  operation: string;
  /** Category for debug logging */
  category?: ErrorCategory;
  /** Whether to show user notification */
  showNotification?: boolean;
  /** Custom user message */
  userMessage?: string;
  /** Fallback value if operation fails */
  fallback?: unknown;
  /** Whether to rethrow the error after handling */
  rethrow?: boolean;
  /** Custom error handler */
  onError?: (error: Error) => void;
}

/**
 * Wraps a synchronous operation with error handling
 */
export function errorBoundary<T, F = undefined>(
  fn: () => T,
  options: ErrorBoundaryOptions & { fallback?: F },
): T | F | undefined {
  try {
    return fn();
  } catch (error) {
    handleError(error, options);
    if (options.rethrow) {
      throw toError(error);
    }
    return options.fallback as F | undefined;
  }
}

/**
 * Wraps an async operation with error handling
 */
export async function asyncErrorBoundary<T, F = undefined>(
  fn: () => Promise<T>,
  options: ErrorBoundaryOptions & { fallback?: F },
): Promise<T | F | undefined> {
  try {
    return await fn();
  } catch (error) {
    handleError(error, options);
    if (options.rethrow) {
      throw toError(error);
    }
    return options.fallback as F | undefined;
  }
}

export function effectErrorBoundary<A, E, R, F = undefined>(
  effect: Effect.Effect<A, E, R>,
  options: ErrorBoundaryOptions & { fallback?: F },
): Effect.Effect<A | F | undefined, never, R> {
  return Effect.catchAll(effect, (error) =>
    Effect.sync(() => {
      handleError(error, options);
      if (options.rethrow) {
        throw toError(error);
      }
      return options.fallback as F | undefined;
    }),
  );
}

/**
 * Core error handler that logs and optionally notifies the user
 */
function handleError(error: unknown, options: ErrorBoundaryOptions): void {
  const category = options.category || "app";
  const logger = debug[category];

  // Log the error
  if (error instanceof EchoChamberError) {
    logger.error(
      `[${options.operation}] ${error.message}`,
      error.cause || error,
    );
  } else if (error instanceof Error) {
    logger.error(`[${options.operation}] ${error.message}`, error);
  } else if (getMessageFromUnknown(error)) {
    logger.error(
      `[${options.operation}] ${getMessageFromUnknown(error)}`,
      error,
    );
  } else {
    logger.error(`[${options.operation}] Unknown error:`, error);
  }

  // Call custom error handler if provided
  if (options.onError) {
    try {
      options.onError(toError(error));
    } catch (handlerError) {
      logger.error("Error in custom error handler:", handlerError);
    }
  }

  // Show user notification if requested
  if (options.showNotification) {
    const userMessage = getUserMessage(error, options);
    showErrorNotification(userMessage);
  }
}

/**
 * Extract user-friendly message from error
 */
function getUserMessage(
  error: unknown,
  options: ErrorBoundaryOptions,
): string {
  if (options.userMessage) {
    return options.userMessage;
  }

  if (error instanceof EchoChamberError) {
    return error.userMessage;
  }

  const effectUserMessage = getUserMessageFromUnknown(error);
  if (effectUserMessage) {
    return effectUserMessage;
  }

  if (error instanceof Error) {
    return error.message;
  }

  const message = getMessageFromUnknown(error);
  if (message) {
    return message;
  }

  return "An unexpected error occurred";
}

interface NotificationOptions {
  duration?: number;
  type?: "error" | "warning" | "info";
}

let notificationContainer: HTMLElement | null = null;

function ensureNotificationContainer(): HTMLElement {
  if (notificationContainer && document.body.contains(notificationContainer)) {
    return notificationContainer;
  }

  notificationContainer = document.createElement("div");
  notificationContainer.id = "error-notifications";
  notificationContainer.className = "error-notifications";
  document.body.appendChild(notificationContainer);

  return notificationContainer;
}

export function showErrorNotification(
  message: string,
  options: NotificationOptions = {}
): void {
  const container = ensureNotificationContainer();
  const duration = options.duration ?? 5000;
  const type = options.type ?? "error";

  const notification = document.createElement("div");
  notification.className = `error-notification error-notification-${type}`;
  notification.textContent = message;

  // Add close button
  const closeBtn = document.createElement("button");
  closeBtn.className = "error-notification-close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Close");
  closeBtn.addEventListener("click", () => {
    removeNotification(notification);
  });
  notification.appendChild(closeBtn);

  container.appendChild(notification);

  requestAnimationFrame(() => {
    notification.classList.add("visible");
  });

  if (duration > 0) {
    setTimeout(() => {
      removeNotification(notification);
    }, duration);
  }
}

function removeNotification(notification: HTMLElement): void {
  notification.classList.remove("visible");
  notification.classList.add("hiding");

  setTimeout(() => {
    notification.remove();
  }, 300);
}

export function clearAllNotifications(): void {
  if (notificationContainer) {
    notificationContainer.innerHTML = "";
  }
}

export function handleAudioRecordingError(error: unknown): void {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "PermissionDeniedError":
        showErrorNotification(
          "Microphone access denied. Please allow microphone access in your browser settings."
        );
        break;
      case "NotFoundError":
      case "DevicesNotFoundError":
        showErrorNotification(
          "No microphone found. Please connect a microphone and try again."
        );
        break;
      case "NotReadableError":
      case "TrackStartError":
        showErrorNotification(
          "Could not access microphone. It may be in use by another application."
        );
        break;
      default:
        showErrorNotification(
          "Failed to start recording. Please check your microphone settings."
        );
    }
    debug.audio.error("Recording error:", error);
  } else {
    showErrorNotification("Failed to start recording");
    debug.audio.error("Unknown recording error:", error);
  }
}

export function handleAudioDecodingError(error: unknown): void {
  debug.audio.error("Audio decoding failed:", error);
  showErrorNotification(
    "Failed to decode audio file. The file may be corrupted or in an unsupported format."
  );
}

export function handleAudioPlaybackError(error: unknown): void {
  debug.audio.error("Audio playback failed:", error);
  // Don't show notification for playback errors - they're often transient
}

export function handleIndexedDBError(
  operation: string,
  error: unknown
): void {
  debug.persistence.error(`IndexedDB ${operation} failed:`, error);

  if (error instanceof DOMException) {
    switch (error.name) {
      case "QuotaExceededError":
        showErrorNotification(
          "Storage quota exceeded. Please free up space or delete some sounds."
        );
        break;
      case "VersionError":
        showErrorNotification(
          "Database version error. Please refresh the page."
        );
        break;
      default:
        showErrorNotification(
          `Storage operation failed: ${error.message || operation}`
        );
    }
  } else {
    showErrorNotification("Storage operation failed. Please try again.");
  }
}

export function handleSyncConnectionError(error: unknown): void {
  debug.sync.error("Sync connection failed:", error);
  // Don't show notification - the UI already shows connection status
}

export function handleSyncMessageError(error: unknown): void {
  debug.sync.error("Sync message processing failed:", error);
  // Only show notification for critical sync errors
  if (error instanceof Error && error.message.includes("corrupted")) {
    showErrorNotification(
      "Failed to sync changes. The session may be corrupted.",
      { duration: 8000 }
    );
  }
}

export function handleImportError(error: unknown): void {
  debug.app.error("Import failed:", error);

  if (error instanceof Error) {
    if (error.message.includes("version")) {
      showErrorNotification(
        "Import failed: File is from an incompatible version",
        { duration: 8000 }
      );
    } else if (error.message.includes("corrupted")) {
      showErrorNotification("Import failed: File appears to be corrupted", {
        duration: 8000,
      });
    } else {
      showErrorNotification(`Import failed: ${error.message}`, {
        duration: 8000,
      });
    }
  } else {
    showErrorNotification("Import failed. Please check the file and try again.", {
      duration: 8000,
    });
  }
}

export function handleExportError(error: unknown): void {
  debug.app.error("Export failed:", error);
  showErrorNotification("Export failed. Please try again.", {
    duration: 8000,
  });
}
