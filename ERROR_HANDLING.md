# Error Handling System

This document describes EchoChamber's structured error handling system.

## Overview

The error handling system provides:

1. **Typed error classes** for different failure domains
2. **Error boundary wrappers** for critical operations
3. **User-facing notifications** for actionable failures
4. **Debug logging integration** for development and troubleshooting
5. **Graceful degradation** where possible

## Error Classes

All custom errors extend `EchoChamberError` which provides:

- `category`: Debug logging category (audio, sync, persistence, app, items)
- `userMessage`: User-friendly error message
- `isRecoverable`: Whether the error allows continued operation
- `timestamp`: When the error occurred
- `cause`: Original error that caused this error

### Available Error Types

```typescript
import {
  AudioError,
  SyncError,
  StorageError,
  ImportExportError,
  ValidationError,
} from "./util/error-handler";
```

#### AudioError

Used for audio-related failures:
- Recording errors (microphone access, hardware issues)
- Decoding errors (corrupted audio, unsupported formats)
- Playback errors (Web Audio API failures)

```typescript
throw new AudioError("Failed to decode audio", {
  userMessage: "Audio file is corrupted or in an unsupported format",
  cause: originalError,
});
```

#### SyncError

Used for sync and network failures:
- WebSocket connection errors
- Sync message processing errors
- Network timeouts

```typescript
throw new SyncError("Sync message processing failed", {
  userMessage: "Failed to sync changes. Please check your connection.",
  cause: originalError,
});
```

#### StorageError

Used for storage operations:
- IndexedDB errors (open, transaction, quota)
- localStorage errors
- Data corruption

```typescript
throw new StorageError("IndexedDB quota exceeded", {
  userMessage: "Storage is full. Please delete some sounds.",
  isRecoverable: true,
});
```

#### ImportExportError

Used for import/export operations:
- Invalid file format
- Version mismatches
- Corrupted data

```typescript
throw new ImportExportError("Invalid export file", {
  userMessage: "The file is not a valid EchoChamber export",
  isRecoverable: false,
});
```

#### ValidationError

Used for validation failures:
- Invalid input data
- Schema validation errors
- Constraint violations

```typescript
throw new ValidationError("Invalid soundboard name", {
  userMessage: "Name must be between 1 and 50 characters",
});
```

## Error Boundary Wrappers

### Synchronous Operations

```typescript
import { errorBoundary } from "./util/error-handler";

const result = errorBoundary(
  () => {
    // Your risky operation
    return performOperation();
  },
  {
    operation: "operation-name",
    category: "audio", // or sync, persistence, app, items
    showNotification: true, // Show user notification on error
    fallback: defaultValue, // Return this if operation fails
    rethrow: false, // Set to true to rethrow after handling
    onError: (error) => {
      // Custom error handling
    },
  }
);
```

### Asynchronous Operations

```typescript
import { asyncErrorBoundary } from "./util/error-handler";

const result = await asyncErrorBoundary(
  async () => {
    // Your async operation
    return await performAsyncOperation();
  },
  {
    operation: "async-operation-name",
    category: "sync",
    showNotification: true,
    fallback: null,
  }
);
```

## Specialized Error Handlers

Pre-configured handlers for common error scenarios:

### Audio Errors

```typescript
import {
  handleAudioRecordingError,
  handleAudioDecodingError,
  handleAudioPlaybackError,
} from "./util/error-handler";

// Recording
try {
  await startRecording();
} catch (error) {
  handleAudioRecordingError(error);
}

// Decoding
try {
  const buffer = await audioContext.decodeAudioData(arrayBuffer);
} catch (error) {
  handleAudioDecodingError(error);
}

// Playback (usually silent - no notification)
try {
  playSound();
} catch (error) {
  handleAudioPlaybackError(error);
}
```

### Storage Errors

```typescript
import { handleIndexedDBError } from "./util/error-handler";

try {
  await saveToIndexedDB(data);
} catch (error) {
  handleIndexedDBError("save", error);
}
```

### Sync Errors

```typescript
import {
  handleSyncConnectionError,
  handleSyncMessageError,
} from "./util/error-handler";

// Connection errors (silent - UI shows connection status)
socket.onerror = (error) => {
  handleSyncConnectionError(error);
};

// Message errors (may show notification for critical errors)
try {
  processMessage(message);
} catch (error) {
  handleSyncMessageError(error);
}
```

### Import/Export Errors

```typescript
import { handleImportError, handleExportError } from "./util/error-handler";

// Import
try {
  await importFromFile(file);
} catch (error) {
  handleImportError(error);
}

// Export
try {
  const blob = await exportToFile();
} catch (error) {
  handleExportError(error);
}
```

## User Notifications

### Showing Notifications

```typescript
import { showErrorNotification } from "./util/error-handler";

showErrorNotification("Operation failed. Please try again.", {
  duration: 5000, // Auto-dismiss after 5 seconds (default)
  type: "error", // or "warning", "info"
});
```

### Clearing Notifications

```typescript
import { clearAllNotifications } from "./util/error-handler";

clearAllNotifications();
```

## Integration with Debug Logging

All errors are automatically logged using the debug utility:

```typescript
// Error boundary automatically logs to the appropriate category
errorBoundary(
  () => {
    throw new Error("Something failed");
  },
  {
    operation: "test-operation",
    category: "audio", // Logs to debug.audio.error()
  }
);
```

## Best Practices

### 1. Use Typed Errors

Always use the appropriate error class for the domain:

```typescript
// Good
throw new AudioError("Failed to decode", { cause: error });

// Less helpful
throw new Error("Failed to decode");
```

### 2. Provide User-Friendly Messages

```typescript
// Good
throw new StorageError("Database transaction failed", {
  userMessage: "Could not save your changes. Please try again.",
  cause: error,
});

// Less helpful
throw new StorageError("Transaction failed");
```

### 3. Use Error Boundaries for Critical Paths

```typescript
// Critical path - wrap with error boundary
async function saveUserData() {
  return asyncErrorBoundary(
    async () => {
      await saveAudio(key, buffer);
      await updateDocument(data);
    },
    {
      operation: "save-user-data",
      category: "persistence",
      showNotification: true,
      userMessage: "Failed to save. Please try again.",
    }
  );
}
```

### 4. Graceful Degradation

```typescript
// Good - provides fallback
const audio = await asyncErrorBoundary(
  async () => await loadAudio(key),
  {
    operation: "load-audio",
    category: "audio",
    fallback: null, // Continue without audio
    showNotification: false,
  }
);

if (!audio) {
  // Handle missing audio gracefully
  setState("empty");
}
```

### 5. Don't Over-Notify Users

```typescript
// Silent errors for non-critical operations
errorBoundary(
  () => deleteOldCache(),
  {
    operation: "cache-cleanup",
    showNotification: false, // Don't bother user
  }
);

// Show notifications for user-initiated actions
errorBoundary(
  () => exportData(),
  {
    operation: "export",
    showNotification: true, // User needs to know
  }
);
```

## Testing

Error handling is fully tested in `tests/error-handler.test.ts`:

```bash
bun test tests/error-handler.test.ts
```

## CSS Customization

Error notification styles are defined in `/src/ui/styles.css`:

```css
.error-notification {
  /* Customize appearance */
}

.error-notification-error {
  /* Error state (red) */
}

.error-notification-warning {
  /* Warning state (orange) */
}

.error-notification-info {
  /* Info state (blue) */
}
```

## Common Patterns

### Pattern 1: Try-Catch with Specialized Handler

```typescript
try {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  // ... recording logic
} catch (error) {
  handleAudioRecordingError(error); // Shows appropriate message
  setState("empty");
}
```

### Pattern 2: Error Boundary with Fallback

```typescript
const buffer = await asyncErrorBoundary(
  async () => await loadAudio(key, audioContext),
  {
    operation: "load-audio",
    category: "audio",
    fallback: null,
    showNotification: false,
  }
);

return buffer || createDefaultBuffer();
```

### Pattern 3: Chained Error Boundaries

```typescript
await asyncErrorBoundary(
  async () => {
    // Save to IndexedDB
    await saveAudio(audioKey, audioBuffer);

    // Upload to R2 (wrapped separately)
    await asyncErrorBoundary(
      async () => await uploadAudio(id, audioBuffer),
      {
        operation: "upload-audio",
        category: "sync",
        showNotification: false, // Fail silently
      }
    );

    // Continue even if upload fails
    persistence.setAudioFile(id, audioKey);
  },
  {
    operation: "save-recording",
    category: "audio",
    showNotification: true,
    userMessage: "Failed to save recording",
  }
);
```

## Monitoring and Debugging

All errors are logged to the console with:
- Timestamp
- Category
- Operation name
- Error details
- Stack trace

Enable debug logging:

```javascript
// In browser console
debugControl.enable("audio", "sync", "persistence");
```

View all errors:

```javascript
// Errors always show, even if category is disabled
debugControl.disableAll();
// You'll still see all errors in the console
```
