const PERMISSION_CHECK_INTERVAL = 5000;

interface PermissionState {
  microphone: PermissionStateValue;
  audioPlayback: boolean;
}

type PermissionStateValue = "prompt" | "granted" | "denied" | "unknown";

let currentState: PermissionState = {
  microphone: "unknown",
  audioPlayback: true,
};

let permissionAlertElement: HTMLElement | null = null;
let checkInterval: number | null = null;
let audioContext: AudioContext | null = null;

function createPermissionAlert(): HTMLElement {
  const alert = document.createElement("div");
  alert.className = "permission-alert";
  alert.innerHTML = `
    <div class="permission-alert-content">
      <div class="permission-alert-icon">⚠️</div>
      <div class="permission-alert-text">
        <div class="permission-alert-title">Permission Required</div>
        <div class="permission-alert-message"></div>
      </div>
      <button class="permission-alert-button">Grant Permission</button>
    </div>
  `;
  return alert;
}

function showAlert(message: string, onGrant: () => void) {
  if (!permissionAlertElement) {
    permissionAlertElement = createPermissionAlert();
    document.body.appendChild(permissionAlertElement);
  }

  const messageEl = permissionAlertElement.querySelector(
    ".permission-alert-message",
  ) as HTMLElement;
  const buttonEl = permissionAlertElement.querySelector(
    ".permission-alert-button",
  ) as HTMLButtonElement;

  messageEl.textContent = message;
  buttonEl.onclick = () => {
    onGrant();
  };

  permissionAlertElement.classList.add("visible");
}

function hideAlert() {
  if (permissionAlertElement) {
    permissionAlertElement.classList.remove("visible");
  }
}

async function checkMicrophonePermission(): Promise<PermissionStateValue> {
  try {
    // Check if the Permissions API is supported for microphone
    if (navigator.permissions && "query" in navigator.permissions) {
      const result = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      return result.state as PermissionStateValue;
    }
  } catch {
    // Permissions API not supported or failed
  }

  // Fallback: try to get user media
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return "granted";
  } catch (err) {
    if (err instanceof DOMException) {
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        return "denied";
      }
      if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        return "unknown";
      }
    }
    return "prompt";
  }
}

async function checkAudioPlaybackPermission(): Promise<boolean> {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  // Check if audio context is suspended (indicates autoplay restrictions)
  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
      return true;
    } catch {
      return false;
    }
  }

  return true;
}

async function requestMicrophonePermission(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    currentState.microphone = "granted";
    return true;
  } catch (err) {
    currentState.microphone = "denied";
    return false;
  }
}

async function requestAudioPlaybackPermission(): Promise<boolean> {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  try {
    await audioContext.resume();
    currentState.audioPlayback = true;
    return true;
  } catch {
    currentState.audioPlayback = false;
    return false;
  }
}

async function performPermissionCheck() {
  const micPermission = await checkMicrophonePermission();
  currentState.microphone = micPermission;

  // Check audio playback permission
  const audioPermission = await checkAudioPlaybackPermission();
  currentState.audioPlayback = audioPermission;

  // Determine what to show
  const needsMicrophone = micPermission === "denied" || micPermission === "prompt";
  const needsAudio = !audioPermission;

  if (needsMicrophone && needsAudio) {
    showAlert(
      "Microphone and audio playback permissions are needed to record and play sounds.",
      async () => {
        await requestMicrophonePermission();
        await requestAudioPlaybackPermission();
      },
    );
  } else if (needsMicrophone) {
    showAlert(
      "Microphone permission is needed to record sounds. Please grant access to continue.",
      async () => {
        const granted = await requestMicrophonePermission();
        if (granted) {
          hideAlert();
        }
      },
    );
  } else if (needsAudio) {
    showAlert(
      "Audio playback permission is needed to play sounds. Click to enable audio.",
      async () => {
        const granted = await requestAudioPlaybackPermission();
        if (granted) {
          hideAlert();
        }
      },
    );
  } else {
    hideAlert();
  }
}

export function initPermissionAlerts() {
  // Perform initial check
  performPermissionCheck();

  // Set up periodic checks
  checkInterval = setInterval(performPermissionCheck, PERMISSION_CHECK_INTERVAL) as unknown as number;

  // Also check on user interaction (for audio context)
  const interactionEvents = ["click", "touchstart", "keydown"];
  interactionEvents.forEach((event) => {
    document.addEventListener(event, () => {
      checkAudioPlaybackPermission();
    }, { once: true });
  });
}

export function disposePermissionAlerts() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  hideAlert();
  if (permissionAlertElement) {
    permissionAlertElement.remove();
    permissionAlertElement = null;
  }
}

export function getPermissionState(): Readonly<PermissionState> {
  return { ...currentState };
}

export async function ensureMicrophonePermission(): Promise<boolean> {
  if (currentState.microphone === "granted") {
    return true;
  }
  return await requestMicrophonePermission();
}

export async function ensureAudioPlaybackPermission(): Promise<boolean> {
  if (currentState.audioPlayback) {
    return true;
  }
  return await requestAudioPlaybackPermission();
}
