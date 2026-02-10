import { persistence } from "../sync/persistence.ts";
import { startSync } from "../sync/sync.ts";
import {
  checkForNewAudioKeys,
  setAudioSyncRoom,
  uploadAllExistingAudio,
} from "../sync/audio-sync.ts";
import { setAudioStorageRoom } from "../sync/audio-storage.ts";
import { createItem, itemRegistry } from "../core/items.ts";

export function initDeployModal(currentRoomCode: string | null): void {
  const btnDeploy = document.getElementById("btn-deploy")!;
  const modal = document.getElementById("deploy-modal")!;
  const modalHeader = modal.querySelector(
    ".modal-header",
  ) as HTMLElement | null;
  const modalUrl = document.getElementById(
    "deploy-modal-url",
  ) as HTMLTextAreaElement;
  const btnRedeploy = document.getElementById(
    "deploy-modal-redeploy",
  ) as HTMLButtonElement | null;
  const btnCopy = document.getElementById("deploy-modal-copy")!;
  const btnClose = document.getElementById("deploy-modal-close")!;
  let syncReconcilerInitialized = false;

  const updateModalMode = (): void => {
    const isShared = !!currentRoomCode;
    btnDeploy.textContent = isShared ? "Share" : "Deploy";
    if (modalHeader) {
      modalHeader.textContent = isShared
        ? "Share your soundboard"
        : "Deploy your soundboard";
    }
    if (btnRedeploy) {
      btnRedeploy.style.display = isShared ? "" : "none";
    }
  };

  const deployCurrentBoard = async (): Promise<string> => {
    const payloadBytes = new Uint8Array(persistence.getDocBytes());
    const payload = new Blob([payloadBytes], {
      type: "application/octet-stream",
    });
    const response = await fetch("/api/rooms", {
      method: "POST",
      body: payload,
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const { roomCode } = (await response.json()) as { roomCode?: unknown };
    if (typeof roomCode !== "string") {
      throw new Error("Invalid room creation response");
    }
    return roomCode;
  };

  const activateSharedRoom = async (roomCode: string): Promise<void> => {
    // Upload all existing audio to R2
    setAudioSyncRoom(roomCode);
    const doc = persistence.getDoc();
    if (Object.keys(doc.audioFiles).length > 0) {
      btnDeploy.textContent = "Uploading audio...";
      await uploadAllExistingAudio(doc.audioFiles);
    }

    // Switch IndexedDB namespace to this room for future local loads/saves.
    setAudioStorageRoom(roomCode);

    // Update URL without reload
    history.pushState(null, "", `/${roomCode}`);

    // Keep DOM state reconciled with remote sync updates when entering a room via Deploy.
    if (!syncReconcilerInitialized) {
      persistence.subscribeGlobal((doc) => {
        const docItemIds = new Set(Object.keys(doc.items ?? {}));
        const registryIds = new Set(itemRegistry.keys());

        // Create items that are in the doc but not in the registry (remote additions)
        for (const itemId of docItemIds) {
          if (!registryIds.has(itemId)) {
            const itemData = doc.items[itemId];
            if (!itemData) continue;
            createItem(itemData.type, itemData.x, itemData.y, itemId);
          }
        }

        // Remove items that are in the registry but not in the doc (remote deletions)
        for (const itemId of registryIds) {
          if (docItemIds.has(itemId)) continue;
          const item = itemRegistry.get(itemId);
          if (!item) continue;
          if (item.cleanup) item.cleanup();
          if ((item as any).cleanupDrag) (item as any).cleanupDrag();
          item.element.remove();
          itemRegistry.delete(itemId);
        }

        // Download audio for new/updated remote items
        checkForNewAudioKeys(doc.audioFiles ?? {});
      });
      syncReconcilerInitialized = true;
    }

    // Enable sync
    persistence.enableSync();
    startSync(
      {
        roomCode,
        getDoc: () => persistence.getDoc(),
        applyRemoteDoc: (newDoc) => persistence.applyRemoteDoc(newDoc),
        onRemoteAudioPlay: (itemId) => {
          const item = itemRegistry.get(itemId);
          item?.play?.(true);
        },
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

    currentRoomCode = roomCode;
    updateModalMode();
    btnDeploy.textContent = "Share";

    const wrapperEl = document.getElementById("connection-wrapper");
    if (wrapperEl) wrapperEl.style.display = "flex";
  };

  updateModalMode();

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
      const roomCode = await deployCurrentBoard();
      const shareUrl = `${window.location.origin}/${roomCode}`;
      await activateSharedRoom(roomCode);

      showModal(shareUrl);
    } catch (error) {
      console.error("[Deploy] Failed:", error);
      alert("Failed to deploy soundboard");
      btnDeploy.textContent = "Deploy";
    } finally {
      btnDeploy.removeAttribute("disabled");
    }
  });

  if (btnRedeploy) {
    btnRedeploy.addEventListener("click", async () => {
      if (!currentRoomCode) return;
      const shouldRedeploy = window.confirm(
        "Create a fresh shared room from your current board state?",
      );
      if (!shouldRedeploy) return;

      const originalText = btnRedeploy.textContent;
      btnRedeploy.textContent = "Redeploying...";
      btnRedeploy.setAttribute("disabled", "true");
      btnDeploy.setAttribute("disabled", "true");
      try {
        const roomCode = await deployCurrentBoard();
        const shareUrl = `${window.location.origin}/${roomCode}`;
        await activateSharedRoom(roomCode);
        showModal(shareUrl);
      } catch (error) {
        console.error("[Deploy] Redeploy failed:", error);
        alert("Failed to redeploy soundboard");
      } finally {
        btnRedeploy.textContent = originalText ?? "Redeploy";
        btnRedeploy.removeAttribute("disabled");
        btnDeploy.removeAttribute("disabled");
      }
    });
  }

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
