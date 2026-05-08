/* ==========================================================================
   0. CONFIGURATION (CENTRAL CONTROL PANEL)
   ========================================================================== */
const CONFIG = {
  gallery: {
    itemsPerPageMobile: 50,
    itemsPerPageDesktop: 150,
    chunkSizeMobile: 15,
    chunkSizeDesktop: 30,
  },
  video: {
    idleTimeoutMinutes: 5, // Minutes before background videos auto-pause
  },
};

/* ==========================================================================
   1. UTILITIES & CONFIG
   ========================================================================== */
const Utils = {
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  shuffleArray(array) {
    let currentIndex = array.length,
      randomIndex;
    while (currentIndex !== 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex],
        array[currentIndex],
      ];
    }
    return array;
  },

  sortTags(tagsArray) {
    return [...tagsArray].sort((a, b) => {
      const aIsUrl = a.startsWith("http://") || a.startsWith("https://");
      const bIsUrl = b.startsWith("http://") || b.startsWith("https://");
      if (aIsUrl && !bIsUrl) return -1;
      if (!aIsUrl && bIsUrl) return 1;
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
  },

  getColumnCount() {
    const width = window.innerWidth;
    if (width <= 600) return 1;
    if (width <= 900) return 2;
    if (width <= 1400) return 3;
    return 4;
  },

  getItemsPerPage: () =>
    window.innerWidth <= 768
      ? CONFIG.gallery.itemsPerPageMobile
      : CONFIG.gallery.itemsPerPageDesktop,
  getChunkSize: () =>
    window.innerWidth <= 768
      ? CONFIG.gallery.chunkSizeMobile
      : CONFIG.gallery.chunkSizeDesktop,
};

/* ==========================================================================
       2. STATE MANAGEMENT
       ========================================================================== */
const State = {
  allImages: [],
  renderList: [],
  allKnownTags: [],
  smartBoards: [], // <-- NEW: Store our smart boards in memory

  currentPage: 1,
  currentRenderId: 0,
  itemsRenderedThisPage: 0,
  isRenderingChunk: false,
  masonryColumns: [],
  colHeights: [],

  currentFolder: "All",
  isShuffled: false,
  boardSort: "modified",
  activeCloudTag: null,
  targetImageToScrollTo: null,

  isSelectMode: false,
  selectedImages: new Set(),
  lastSelectedIndex: null,

  currentLightboxIndex: -1,
  isLightboxOpen: false,

  autocomplete: {
    mode: null,
    inputEl: null,
    imgData: null,
    tagsListEl: null,
    activeIndex: -1,
  },

  getActiveFolderImages() {
    if (this.currentFolder === "All") return this.allImages;
    return this.allImages.filter(
      (img) =>
        img.board &&
        (img.board === this.currentFolder ||
          img.board.startsWith(this.currentFolder + "/"))
    );
  },
};

/* ==========================================================================
       3. API SERVICE
       ========================================================================== */
const API = {
  async fetchGallery() {
    try {
      const response = await fetch("/api/gallery");
      State.allImages = await response.json();
    } catch (e) {
      console.error("API Fetch Failed:", e);
      State.allImages = [];
    }
  },

  // --- NEW: Smart Board APIs ---
  async fetchSmartBoards() {
    try {
      const response = await fetch("/api/smart_boards");
      State.smartBoards = await response.json();
    } catch (e) {
      console.error("Failed to fetch smart boards:", e);
      State.smartBoards = [];
    }
  },

  async saveSmartBoards() {
    try {
      await fetch("/api/smart_boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(State.smartBoards),
      });
    } catch (e) {
      console.error("Failed to save smart boards:", e);
    }
  },

  async saveMetadata(imgData) {
    await fetch("/api/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: imgData.filename,
        tags: imgData.tags || [],
        description: imgData.description || "",
      }),
    });
  },

  async uploadFile(file, targetFolder) {
    const headers = { "X-File-Name": encodeURIComponent(file.name) };
    if (targetFolder && targetFolder !== "All" && targetFolder !== "Main") {
      headers["X-Board-Name"] = encodeURIComponent(targetFolder);
    }
    await fetch("/api/upload", {
      method: "POST",
      headers: headers,
      body: file,
    });
  },

  async deleteMedia(filename) {
    const res = await fetch("/api/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    });
    return res.ok;
  },

  async ignoreFolder(folderName) {
    await fetch("/api/ignore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board: folderName }),
    });
  },
};

/* ==========================================================================
       4. DOM CACHE
       ========================================================================== */
const DOM = {
  init() {
    this.navEl = document.querySelector(".v-nav");
    this.galleryEl = document.getElementById("gallery");
    this.searchInput = document.getElementById("searchInput");
    if (this.searchInput)
      this.searchWrapper = this.searchInput.closest(".search-wrapper");
    this.clearSearchBtn = document.getElementById("clearSearchBtn");
    this.shuffleBtn = document.getElementById("shuffleBtn");
    this.resetLogo = document.getElementById("resetLogo");
    this.globalTagCloud = document.getElementById("globalTagCloud");
    this.selectModeBtn = document.getElementById("selectModeBtn");
    this.batchBoardBtn = document.getElementById("batchBoardBtn");
    this.autocompleteBox = document.getElementById("autocompleteDropdown");

    this.folderSelectWrapper = document.getElementById("folderSelectWrapper");
    this.folderSelectTrigger = document.getElementById("folderSelectTrigger");
    this.folderSelectOptions = document.getElementById("folderSelectOptions");

    this.virtualBoardSelectWrapper = document.getElementById(
      "virtualBoardSelectWrapper"
    );
    this.virtualBoardSelectTrigger = document.getElementById(
      "virtualBoardSelectTrigger"
    );
    this.virtualBoardSelectOptions = document.getElementById(
      "virtualBoardSelectOptions"
    );

    this.boardsHome = document.getElementById("boardsHome");
    this.boardsGrid = document.getElementById("boardsGrid");

    this.mobileMenuToggle = document.getElementById("mobileMenuToggle");
    this.navFilters = document.getElementById("navFilters");

    this.lightbox = document.getElementById("lightbox");
    this.lightboxClose = document.getElementById("lightboxClose");
    this.lightboxBoardBtn = document.getElementById("lightboxBoardBtn");
    this.lightboxFavoriteBtn = document.getElementById("lightboxFavoriteBtn");
    this.lightboxContextBtn = document.getElementById("lightboxContextBtn");
    this.lightboxDeleteBtn = document.getElementById("lightboxDeleteBtn");
    this.lightboxIgnoreBtn = document.getElementById("lightboxIgnoreBtn");
    this.lightboxContent = document.getElementById("lightboxContent");
    this.lightboxTags = document.getElementById("lightboxTags");
    this.lightboxDescContainer = document.getElementById(
      "lightboxDescContainer"
    );
    this.lightboxDescText = document.getElementById("lightboxDescText");
    this.lightboxDescription = document.getElementById("lightboxDescription");
    this.lightboxEditDescBtn = document.getElementById("lightboxEditDescBtn");

    this.boardModalOverlay = document.getElementById("boardModalOverlay");
    this.boardModalInput = document.getElementById("boardModalInput");
    this.boardModalCancel = document.getElementById("boardModalCancel");
    this.boardModalSave = document.getElementById("boardModalSave");
    this.modalExistingBoards = document.getElementById("modalExistingBoards");

    // --- NEW: Smart Board Modal Cache ---
    this.smartBoardModalOverlay = document.getElementById(
      "smartBoardModalOverlay"
    );
    this.smartBoardNameInput = document.getElementById("smartBoardNameInput");
    this.smartBoardIncludeTags = document.getElementById(
      "smartBoardIncludeTags"
    );
    this.smartBoardExcludeTags = document.getElementById(
      "smartBoardExcludeTags"
    );
    this.smartBoardMediaType = document.getElementById("smartBoardMediaType");
    this.smartBoardFolder = document.getElementById("smartBoardFolder");
    this.smartBoardFolderOptions = document.getElementById(
      "smartBoardFolderOptions"
    );
    this.smartBoardCancel = document.getElementById("smartBoardCancel");
    this.smartBoardSave = document.getElementById("smartBoardSave");

    this.renameModalOverlay = document.getElementById("renameModalOverlay");
    this.renameModalInput = document.getElementById("renameModalInput");
    this.renameModalCancel = document.getElementById("renameModalCancel");
    this.renameModalSave = document.getElementById("renameModalSave");

    this.deleteModalOverlay = document.getElementById("deleteModalOverlay");
    this.deleteModalCancel = document.getElementById("deleteModalCancel");
    this.deleteModalConfirm = document.getElementById("deleteModalConfirm");

    this.topPaginationContainer = document.createElement("div");
    this.topPaginationContainer.className =
      "pagination-container top-pagination";
    if (this.galleryEl && this.galleryEl.parentNode) {
      this.galleryEl.parentNode.insertBefore(
        this.topPaginationContainer,
        this.galleryEl
      );
    }

    this.paginationContainer = document.createElement("div");
    this.paginationContainer.className = "pagination-container";
    if (this.galleryEl && this.galleryEl.parentNode) {
      this.galleryEl.parentNode.insertBefore(
        this.paginationContainer,
        this.galleryEl.nextSibling
      );
    }
  },
};

export { CONFIG, Utils, State, API, DOM };
