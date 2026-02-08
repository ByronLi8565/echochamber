import { persistence } from "./persistence.ts";
import { startSync } from "./sync.ts";
import { setAudioSyncRoom, uploadAllExistingAudio } from "./audio-sync.ts";

export function initDeployModal(currentRoomCode: string | null): void {
  const btnDeploy = document.getElementById("btn-deploy")!;
  const modal = document.getElementById("deploy-modal")!;
  const modalUrl = document.getElementById(
    "deploy-modal-url",
  ) as HTMLTextAreaElement;
  const btnCopy = document.getElementById("deploy-modal-copy")!;
  const btnClose = document.getElementById("deploy-modal-close")!;

  // If already in a room, show "Share" instead of "Deploy"
  if (currentRoomCode) {
    btnDeploy.textContent = "Share";
  }

  btnDeploy.addEventListener("click", async () => {
    if (currentRoomCode) {
      // Already in a room — just show the share modal
      showModal(window.location.href);
      return;
    }

    // Deploy: POST doc bytes to /api/rooms
    btnDeploy.textContent = "Deploying...";
    btnDeploy.setAttribute("disabled", "true");

    try {
      const docBytes = persistence.getDocBytes();
      const response = await fetch("/api/rooms", {
        method: "POST",
        body: docBytes,
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const { roomCode } = await response.json();
      const shareUrl = `${window.location.origin}/${roomCode}`;

      // Upload all existing audio to R2
      setAudioSyncRoom(roomCode);
      const doc = persistence.getDoc();
      if (Object.keys(doc.audioFiles).length > 0) {
        btnDeploy.textContent = "Uploading audio...";
        await uploadAllExistingAudio(doc.audioFiles);
      }

      // Update URL without reload
      history.pushState(null, "", `/${roomCode}`);

      // Enable sync
      persistence.enableSync();
      startSync(
        {
          roomCode,
          getDoc: () => persistence.getDoc(),
          applyRemoteDoc: (newDoc) => persistence.applyRemoteDoc(newDoc),
          onConnected: () => {
            const wrapper = document.getElementById("connection-wrapper");
            const indicator = document.getElementById("connection-status");
            if (wrapper) wrapper.style.display = "flex";
            if (indicator) {
              indicator.classList.add("connected");
              indicator.classList.remove("disconnected");
            }
          },
          onDisconnected: () => {
            const indicator = document.getElementById("connection-status");
            if (indicator) {
              indicator.classList.remove("connected");
              indicator.classList.add("disconnected");
            }
          },
        },
        false,
      ); // false = deploying (not joining), can send immediately

      // Update button to "Share" for subsequent clicks
      currentRoomCode = roomCode;
      btnDeploy.textContent = "Share";

      const wrapperEl = document.getElementById("connection-wrapper");
      if (wrapperEl) wrapperEl.style.display = "flex";

      showModal(shareUrl);
    } catch (error) {
      console.error("[Deploy] Failed:", error);
      alert("Failed to deploy soundboard");
      btnDeploy.textContent = "Deploy";
    } finally {
      btnDeploy.removeAttribute("disabled");
    }
  });

  let showModal = (url: string) => {
    modalUrl.value = url;
    modal.classList.add("visible");
  };

  const hideModal = () => {
    modal.classList.remove("visible");
  };

  btnCopy.addEventListener("click", () => {
    modalUrl.select();
    navigator.clipboard.writeText(modalUrl.value);
    btnCopy.textContent = "Copied!";
    setTimeout(() => {
      btnCopy.textContent = "Copy";
    }, 1500);
  });

  btnClose.addEventListener("click", hideModal);

  // Auto-hide after 5 seconds
  let autoHideTimeout: Timer | null = null;
  const originalShowModal = showModal;

  showModal = (url: string) => {
    originalShowModal(url);
    if (autoHideTimeout) clearTimeout(autoHideTimeout);
    autoHideTimeout = setTimeout(hideModal, 5000);
  };
}
