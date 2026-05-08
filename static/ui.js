import { CONFIG, DOM, State, API } from "./core.js";
import { Navigation, SearchTags } from "./views.js";
import { AppRouter } from "./app.js";

/* ==========================================================================
   1. TOAST NOTIFICATIONS
   ========================================================================== */
const Toast = {
  container: null,
  init() {
    this.container = document.createElement("div");
    this.container.className = "toast-container";
    document.body.appendChild(this.container);
  },
  show(message, onUndo = null) {
    const toast = document.createElement("div");
    toast.className = "v-toast";

    const text = document.createElement("span");
    text.textContent = message;
    toast.appendChild(text);

    let timeoutId;
    if (onUndo) {
      const undoBtn = document.createElement("button");
      undoBtn.className = "toast-undo-btn";
      undoBtn.textContent = "Undo";
      undoBtn.addEventListener("click", () => {
        clearTimeout(timeoutId);
        toast.classList.add("hiding");
        setTimeout(() => toast.remove(), 300);
        onUndo();
      });
      toast.appendChild(undoBtn);
    }

    this.container.appendChild(toast);
    timeoutId = setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.classList.add("hiding");
        setTimeout(() => toast.remove(), 300);
      }
    }, 4000);
  },
};

/* ==========================================================================
   2. ACTION MODALS (PROMISE BASED)
   ========================================================================== */
const ActionModals = {
  resolvePrompt: null,
  resolveConfirm: null,

  init() {
    if (DOM.renameModalSave) {
      DOM.renameModalSave.addEventListener("click", () => {
        if (this.resolvePrompt) this.resolvePrompt(DOM.renameModalInput.value);
        this.closePrompt();
      });
    }
    if (DOM.renameModalCancel) {
      DOM.renameModalCancel.addEventListener("click", () => {
        if (this.resolvePrompt) this.resolvePrompt(null);
        this.closePrompt();
      });
    }
    if (DOM.renameModalInput) {
      DOM.renameModalInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (this.resolvePrompt)
            this.resolvePrompt(DOM.renameModalInput.value);
          this.closePrompt();
        }
      });
    }

    if (DOM.deleteModalConfirm) {
      DOM.deleteModalConfirm.addEventListener("click", () => {
        if (this.resolveConfirm) this.resolveConfirm(true);
        this.closeConfirm();
      });
    }
    if (DOM.deleteModalCancel) {
      DOM.deleteModalCancel.addEventListener("click", () => {
        if (this.resolveConfirm) this.resolveConfirm(false);
        this.closeConfirm();
      });
    }
  },

  prompt(defaultVal = "") {
    return new Promise((resolve) => {
      this.resolvePrompt = resolve;
      if (DOM.renameModalInput) DOM.renameModalInput.value = defaultVal;
      if (DOM.renameModalOverlay)
        DOM.renameModalOverlay.classList.add("is-active");
      setTimeout(() => {
        if (DOM.renameModalInput) DOM.renameModalInput.focus();
      }, 100);
    });
  },

  closePrompt() {
    if (DOM.renameModalOverlay)
      DOM.renameModalOverlay.classList.remove("is-active");
    if (DOM.renameModalInput) DOM.renameModalInput.blur();
    this.resolvePrompt = null;
  },

  confirm() {
    return new Promise((resolve) => {
      this.resolveConfirm = resolve;
      if (DOM.deleteModalOverlay)
        DOM.deleteModalOverlay.classList.add("is-active");
    });
  },

  closeConfirm() {
    if (DOM.deleteModalOverlay)
      DOM.deleteModalOverlay.classList.remove("is-active");
    this.resolveConfirm = null;
  },
};

/* ==========================================================================
   3. CUSTOM BOARD ADD MODAL
   ========================================================================== */
const BoardModal = {
  init() {
    SmartBoardModal.init();

    if (!DOM.boardModalOverlay) return;

    if (DOM.boardModalCancel)
      DOM.boardModalCancel.addEventListener("click", () => this.close());
    if (DOM.boardModalSave)
      DOM.boardModalSave.addEventListener("click", () => this.save());

    if (DOM.boardModalInput) {
      DOM.boardModalInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.save();
        } else if (e.key === "Escape") {
          this.close();
        }
      });
    }

    DOM.boardModalOverlay.addEventListener("click", (e) => {
      if (e.target === DOM.boardModalOverlay) this.close();
    });

    if (DOM.batchBoardBtn) {
      DOM.batchBoardBtn.addEventListener("click", () => {
        if (State.selectedImages.size === 0) {
          Toast.show("Select some media first!");
          return;
        }
        this.open();
      });
    }
  },

  open() {
    if (
      State.currentLightboxIndex === -1 &&
      (!State.isSelectMode || State.selectedImages.size === 0)
    )
      return;

    if (DOM.boardModalInput) DOM.boardModalInput.value = "";
    this.renderExistingBoards();

    if (DOM.boardModalOverlay) DOM.boardModalOverlay.classList.add("is-active");
    setTimeout(() => {
      if (DOM.boardModalInput) DOM.boardModalInput.focus();
    }, 100);
  },

  close() {
    if (DOM.boardModalOverlay)
      DOM.boardModalOverlay.classList.remove("is-active");
    if (DOM.boardModalInput) DOM.boardModalInput.blur();
  },

  renderExistingBoards() {
    if (!DOM.modalExistingBoards) return;
    const normalBoards = Navigation.getSortedVirtualBoards();
    const smartBoards = (State.smartBoards || []).map((sb) => sb.name);

    DOM.modalExistingBoards.innerHTML = "";

    if (normalBoards.length === 0 && smartBoards.length === 0) {
      DOM.modalExistingBoards.innerHTML = `<span style="color: var(--text-secondary); font-size: 0.85rem;">No existing boards. Type below to create one!</span>`;
      return;
    }

    normalBoards.forEach((board) => {
      const chip = document.createElement("div");
      chip.className = "modal-board-chip";
      chip.textContent = board;

      chip.addEventListener("click", () => {
        if (DOM.boardModalInput) {
          DOM.boardModalInput.value = board;
          DOM.boardModalInput.focus();
        }
        document
          .querySelectorAll(".modal-board-chip")
          .forEach((c) => c.classList.remove("is-selected"));
        chip.classList.add("is-selected");
      });
      DOM.modalExistingBoards.appendChild(chip);
    });

    smartBoards.forEach((board) => {
      const chip = document.createElement("div");
      chip.className = "modal-board-chip";
      chip.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: -2px;"><path d="M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74z"/><path d="m20 14.285 1.5.845a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74l1.5-.845"/></svg>${board}`;

      chip.style.opacity = "0.4";
      chip.style.cursor = "not-allowed";
      chip.title =
        "Smart Boards populate automatically. You cannot manually add items to them.";

      DOM.modalExistingBoards.appendChild(chip);
    });
  },

  async save() {
    if (!DOM.boardModalInput) return;
    const boardNameRaw = DOM.boardModalInput.value;
    if (!boardNameRaw || !boardNameRaw.trim()) {
      this.close();
      return;
    }

    const cleanBoardName = boardNameRaw.trim().toLowerCase();

    const smartBoards = (State.smartBoards || []).map((sb) =>
      sb.name.toLowerCase()
    );
    if (smartBoards.includes(cleanBoardName)) {
      Toast.show("A Smart Board with this name already exists.");
      return;
    }

    const newTag = `board:${cleanBoardName}`;

    if (State.isSelectMode && State.selectedImages.size > 0) {
      let promises = [];
      let count = 0;

      State.getActiveFolderImages().forEach((img) => {
        if (State.selectedImages.has(img.filename)) {
          if (!img.tags) img.tags = [];
          if (!img.tags.includes(newTag)) {
            img.tags.push(newTag);
            promises.push(API.saveMetadata(img));
            count++;
          }
        }
      });

      if (promises.length > 0) {
        Toast.show(`Adding ${count} item${count !== 1 ? "s" : ""} to board...`);
        await Promise.all(promises);
        SearchTags.updateGlobalTags();
        Navigation.buildVirtualBoardDropdown();
        Toast.show(`Added to Board: ${cleanBoardName}`);
      } else {
        Toast.show(`Items already in Board: ${cleanBoardName}`);
      }
    } else if (State.currentLightboxIndex > -1) {
      const imgData = State.renderList[State.currentLightboxIndex];

      if (!imgData.tags) imgData.tags = [];
      if (!imgData.tags.includes(newTag)) {
        imgData.tags.push(newTag);
        await API.saveMetadata(imgData);
        SearchTags.updateGlobalTags();
        Navigation.buildVirtualBoardDropdown();
        Toast.show(`Added to Board: ${cleanBoardName}`);
      } else {
        Toast.show(`Already in Board: ${cleanBoardName}`);
      }
    }

    this.close();
  },
};

/* ==========================================================================
   4. SMART BOARD GENERATOR MODAL (REBUILT WITH CHIPS & DROPDOWNS)
   ========================================================================== */
const SmartBoardModal = {
  editId: null,
  includeTags: [],
  excludeTags: [],
  mediaType: "all",
  targetFolder: "All",

  init() {
    const cancelBtn = document.getElementById("smartBoardCancel");
    const saveBtn = document.getElementById("smartBoardSave");
    const overlay = document.getElementById("smartBoardModalOverlay");

    if (cancelBtn) cancelBtn.addEventListener("click", () => this.close());
    if (saveBtn) saveBtn.addEventListener("click", () => this.save());
    if (overlay) {
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.close();
      });
    }

    this.setupTagInput(
      "sbIncludeTagsContainer",
      "sbIncludeTagsInput",
      "includeTags"
    );
    this.setupTagInput(
      "sbExcludeTagsContainer",
      "sbExcludeTagsInput",
      "excludeTags"
    );
    this.setupCustomDropdowns();
  },

  populateDatalist() {
    const datalist = document.getElementById("allKnownTagsList");
    if (!datalist) return;
    datalist.innerHTML = "";
    (State.allKnownTags || []).forEach((tag) => {
      const opt = document.createElement("option");
      opt.value = tag;
      datalist.appendChild(opt);
    });
  },

  setupTagInput(containerId, inputId, arrayName) {
    const container = document.getElementById(containerId);
    const input = document.getElementById(inputId);
    if (!container || !input) return;

    container.addEventListener("click", (e) => {
      if (e.target === container) input.focus();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        const val = input.value.trim().toLowerCase();
        if (val && !this[arrayName].includes(val)) {
          this[arrayName].push(val);
          this.renderChips(container, input, arrayName);
        }
        input.value = "";
      } else if (e.key === "Backspace" && input.value === "") {
        if (this[arrayName].length > 0) {
          this[arrayName].pop();
          this.renderChips(container, input, arrayName);
        }
      }
    });
  },

  renderChips(container, input, arrayName) {
    const existingChips = container.querySelectorAll(".modal-tag-chip");
    existingChips.forEach((chip) => chip.remove());

    this[arrayName].forEach((tag, index) => {
      const chip = document.createElement("div");
      chip.className = "modal-tag-chip";
      chip.innerHTML = `
        ${tag}
        <span class="remove-chip" data-index="${index}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </span>
      `;

      chip.querySelector(".remove-chip").addEventListener("click", (e) => {
        e.stopPropagation();
        this[arrayName].splice(index, 1);
        this.renderChips(container, input, arrayName);
        input.focus();
      });

      container.insertBefore(chip, input);
    });
  },

  setupCustomDropdowns() {
    const mediaWrapper = document.getElementById("sbMediaSelectWrapper");
    const mediaBtn = document.getElementById("sbMediaSelectBtn");
    const mediaOptions = document.getElementById("sbMediaSelectOptions");
    const mediaLabel = document.getElementById("sbMediaSelectLabel");

    const folderWrapper = document.getElementById("sbFolderSelectWrapper");
    const folderBtn = document.getElementById("sbFolderSelectBtn");
    const folderOptions = document.getElementById("sbFolderSelectOptions");
    const folderLabel = document.getElementById("sbFolderSelectLabel");

    const closeAll = () => {
      if (mediaOptions) mediaOptions.classList.remove("is-open");
      if (folderOptions) folderOptions.classList.remove("is-open");
    };

    document.addEventListener("click", (e) => {
      if (
        mediaWrapper &&
        !mediaWrapper.contains(e.target) &&
        folderWrapper &&
        !folderWrapper.contains(e.target)
      ) {
        closeAll();
      }
    });

    if (mediaBtn) {
      mediaBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = mediaOptions.classList.contains("is-open");
        closeAll();
        if (!isOpen) mediaOptions.classList.add("is-open");
      });
    }

    if (mediaOptions) {
      mediaOptions.addEventListener("click", (e) => {
        const item = e.target.closest(".tree-header");
        if (item) {
          this.mediaType = item.dataset.value;
          mediaLabel.textContent = item.textContent;
          closeAll();
        }
      });
    }

    if (folderBtn) {
      folderBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = folderOptions.classList.contains("is-open");
        closeAll();
        if (!isOpen) folderOptions.classList.add("is-open");
      });
    }

    if (folderOptions) {
      folderOptions.addEventListener("click", (e) => {
        const item = e.target.closest(".tree-header");
        if (item) {
          this.targetFolder = item.dataset.value;
          folderLabel.textContent = item.textContent;
          closeAll();
        }
      });
    }
  },

  open(smartBoardIdToEdit = null) {
    this.populateDatalist();

    const nameInput = document.getElementById("smartBoardNameInput");
    const title = document.getElementById("smartBoardModalTitle");
    const saveBtn = document.getElementById("smartBoardSave");
    const folderOptions = document.getElementById("sbFolderSelectOptions");

    if (folderOptions) {
      folderOptions.innerHTML = "";
      const folders = Navigation.getSortedFolders();
      folders.forEach((f) => {
        folderOptions.innerHTML += `<div class="tree-item"><div class="tree-header" data-value="${f}">${f}</div></div>`;
      });
    }

    if (smartBoardIdToEdit) {
      const existingSB = (State.smartBoards || []).find(
        (sb) => sb.id === smartBoardIdToEdit
      );
      if (existingSB) {
        this.editId = existingSB.id;
        title.textContent = "Edit Smart Board";
        saveBtn.textContent = "Save Changes";
        if (nameInput) nameInput.value = existingSB.name;

        this.includeTags = [...(existingSB.include_tags || [])];
        this.excludeTags = [...(existingSB.exclude_tags || [])];
        this.mediaType = existingSB.media_type || "all";
        this.targetFolder = existingSB.folder_path || "All";
      }
    } else {
      this.editId = null;
      title.textContent = "Smart Board";
      saveBtn.textContent = "Create";
      if (nameInput) nameInput.value = "";
      this.includeTags = [];
      this.excludeTags = [];
      this.mediaType = "all";
      this.targetFolder = "All";
    }

    this.renderChips(
      document.getElementById("sbIncludeTagsContainer"),
      document.getElementById("sbIncludeTagsInput"),
      "includeTags"
    );
    this.renderChips(
      document.getElementById("sbExcludeTagsContainer"),
      document.getElementById("sbExcludeTagsInput"),
      "excludeTags"
    );

    const mediaMap = {
      all: "All Media",
      image: "Images Only",
      video: "Videos Only",
    };
    const mediaLabel = document.getElementById("sbMediaSelectLabel");
    if (mediaLabel) mediaLabel.textContent = mediaMap[this.mediaType];

    const folderLabel = document.getElementById("sbFolderSelectLabel");
    if (folderLabel) folderLabel.textContent = this.targetFolder;

    const overlay = document.getElementById("smartBoardModalOverlay");
    if (overlay) overlay.classList.add("is-active");
  },

  close() {
    const overlay = document.getElementById("smartBoardModalOverlay");
    if (overlay) overlay.classList.remove("is-active");
  },

  async save() {
    const nameInput = document.getElementById("smartBoardNameInput");
    const nameRaw = nameInput ? nameInput.value.trim() : "";

    if (!nameRaw) {
      Toast.show("Please enter a name for your Smart Board.");
      return;
    }

    const cleanName = nameRaw.toLowerCase();

    // BUG FIX 1: Isolate true "Regular Boards" from the raw metadata
    const normalBoardsSet = new Set();
    State.allImages.forEach((img) => {
      (img.tags || []).forEach((t) => {
        const str = String(t);
        if (str.startsWith("board:"))
          normalBoardsSet.add(str.replace("board:", "").toLowerCase());
      });
    });

    // BUG FIX 2: Exclude the board we are currently editing from the Smart Board check
    const smartBoards = (State.smartBoards || [])
      .filter((sb) => sb.id !== this.editId)
      .map((sb) => sb.name.toLowerCase());

    if (normalBoardsSet.has(cleanName)) {
      Toast.show("A regular board with this name already exists.");
      return;
    }
    if (smartBoards.includes(cleanName)) {
      Toast.show("A Smart Board with this name already exists.");
      return;
    }

    const newSB = {
      id: this.editId || "sb_" + Date.now(),
      name: nameRaw,
      include_tags: this.includeTags,
      exclude_tags: this.excludeTags,
      media_type: this.mediaType,
      folder_path: this.targetFolder,
      excluded_filenames: [],
    };

    if (this.editId) {
      const oldSB = State.smartBoards.find((sb) => sb.id === this.editId);
      if (oldSB) newSB.excluded_filenames = oldSB.excluded_filenames || [];

      const idx = State.smartBoards.findIndex((sb) => sb.id === this.editId);
      if (idx > -1) State.smartBoards[idx] = newSB;
      Toast.show(`Smart Board updated!`);
    } else {
      State.smartBoards.push(newSB);
      Toast.show(`Smart Board created: ${nameRaw}`);
    }

    await API.saveSmartBoards();

    Navigation.buildVirtualBoardDropdown();
    AppRouter.resolve(window.location.pathname);

    this.close();
  },
};

/* ==========================================================================
   5. VIDEO PERFORMANCE OBSERVER
   ========================================================================== */
const VideoObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting && !State.isLightboxOpen) {
        const playPromise = entry.target.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              if (State.isLightboxOpen) {
                entry.target.pause();
              }
            })
            .catch(() => {});
        }
      } else {
        entry.target.pause();
      }
    });
  },
  { threshold: 0.1 }
);

/* ==========================================================================
   6. IDLE MANAGER (BACKGROUND VIDEO PAUSER)
   ========================================================================== */
const IdleManager = {
  timer: null,
  timeoutMs: CONFIG.video.idleTimeoutMinutes * 60 * 1000,
  init() {
    const events = ["mousemove", "scroll", "keydown", "click", "touchstart"];
    events.forEach((evt) =>
      window.addEventListener(evt, () => this.wakeUp(), { passive: true })
    );
    this.wakeUp();
  },
  wakeUp() {
    clearTimeout(this.timer);

    if (!State.isLightboxOpen) {
      document
        .querySelectorAll("#gallery video:not([data-hover-only='true'])")
        .forEach((vid) => {
          const rect = vid.getBoundingClientRect();
          const isVisible = rect.top < window.innerHeight && rect.bottom >= 0;
          if (isVisible) {
            const playPromise = vid.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  if (State.isLightboxOpen) vid.pause();
                })
                .catch(() => {});
            }
          }
        });
    }

    this.timer = setTimeout(() => {
      console.log("Tallo is idle: Pausing videos.");
      document.querySelectorAll("video").forEach((vid) => vid.pause());
    }, this.timeoutMs);
  },
};

/* ==========================================================================
   7. DRAG & DROP UPLOADER
   ========================================================================== */
const Uploader = {
  dragCounter: 0,
  init() {
    this.overlay = document.createElement("div");
    this.overlay.className = "upload-overlay";
    this.overlay.innerHTML = "<h2>Drop files & folders to upload</h2>";
    document.body.appendChild(this.overlay);

    const dropZone = document.body;
    dropZone.addEventListener("dragenter", (e) => {
      e.preventDefault();
      this.dragCounter++;
      this.overlay.classList.add("active");
    });
    dropZone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      this.dragCounter--;
      if (this.dragCounter === 0) this.overlay.classList.remove("active");
    });
    dropZone.addEventListener("dragover", (e) => e.preventDefault());

    dropZone.addEventListener("drop", async (e) => {
      e.preventDefault();
      this.dragCounter = 0;
      this.overlay.innerHTML = "<h2>Uploading...</h2>";

      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        let promises = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === "file") {
            const entry = item.webkitGetAsEntry();
            if (entry) {
              promises.push(this.processEntry(entry, State.currentFolder));
            }
          }
        }

        await Promise.all(promises);

        this.overlay.classList.remove("active");
        setTimeout(
          () =>
            (this.overlay.innerHTML =
              "<h2>Drop files & folders to upload</h2>"),
          300
        );
        import("./app.js").then((module) => {
          module.App.loadInitialData();
        });
      }
    });
  },

  async processEntry(entry, currentPath) {
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file(async (file) => {
          if (!file.name.startsWith(".")) {
            await API.uploadFile(file, currentPath);
          }
          resolve();
        });
      });
    } else if (entry.isDirectory) {
      let nextPath =
        currentPath === "All" || currentPath === "Main"
          ? entry.name
          : `${currentPath}/${entry.name}`;

      return new Promise((resolve) => {
        const dirReader = entry.createReader();
        let allEntries = [];

        const readEntries = () => {
          dirReader.readEntries(async (entries) => {
            if (entries.length === 0) {
              let promises = [];
              for (let child of allEntries) {
                promises.push(this.processEntry(child, nextPath));
              }
              await Promise.all(promises);
              resolve();
            } else {
              allEntries = allEntries.concat(entries);
              readEntries();
            }
          });
        };
        readEntries();
      });
    }
  },
};

export {
  Toast,
  ActionModals,
  BoardModal,
  SmartBoardModal,
  VideoObserver,
  IdleManager,
  Uploader,
};
