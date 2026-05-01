/**
 * ============================================================================
 * TALLO GALLERY - Core Application
 * Architecture: Modular Singleton Pattern
 * ============================================================================
 */

document.addEventListener("DOMContentLoaded", () => App.init());

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

  getItemsPerPage: () => (window.innerWidth <= 768 ? 50 : 150),
  getChunkSize: () => (window.innerWidth <= 768 ? 15 : 30),
};

/* ==========================================================================
   2. STATE MANAGEMENT
   ========================================================================== */
const State = {
  allImages: [],
  renderList: [],
  allKnownTags: [],

  currentPage: 1,
  currentRenderId: 0,
  itemsRenderedThisPage: 0,
  isRenderingChunk: false,
  masonryColumns: [],
  colHeights: [],

  currentBoard: "All",
  isShuffled: true,
  activeCloudTag: null,
  targetImageToScrollTo: null,

  isSelectMode: false,
  selectedImages: new Set(),
  lastSelectedIndex: null,

  currentLightboxIndex: -1,

  autocomplete: {
    mode: null,
    inputEl: null,
    imgData: null,
    tagsListEl: null,
    activeIndex: -1,
  },

  getActiveBoardImages() {
    if (this.currentBoard === "All") return this.allImages;
    return this.allImages.filter(
      (img) =>
        img.board === this.currentBoard ||
        img.board.startsWith(this.currentBoard + "/")
    );
  },
};

/* ==========================================================================
   3. API SERVICE
   ========================================================================== */
const API = {
  async fetchGallery() {
    const response = await fetch("/api/gallery");
    State.allImages = await response.json();
  },

  async saveMetadata(imgData) {
    await fetch("/api/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: imgData.filename,
        tags: imgData.tags,
        description: imgData.description || "",
      }),
    });
  },

  async uploadFile(file) {
    await fetch("/api/upload", {
      method: "POST",
      headers: { "X-File-Name": encodeURIComponent(file.name) },
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

  async ignoreBoard(boardName) {
    await fetch("/api/ignore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board: boardName }),
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
    this.searchWrapper = this.searchInput.closest(".search-wrapper");
    this.clearSearchBtn = document.getElementById("clearSearchBtn");
    this.shuffleBtn = document.getElementById("shuffleBtn");
    this.resetLogo = document.getElementById("resetLogo");
    this.globalTagCloud = document.getElementById("globalTagCloud");
    this.selectModeBtn = document.getElementById("selectModeBtn");
    this.autocompleteBox = document.getElementById("autocompleteDropdown");

    this.boardSelectWrapper = document.getElementById("boardSelectWrapper");
    this.boardSelectTrigger = document.getElementById("boardSelectTrigger");
    this.boardSelectOptions = document.getElementById("boardSelectOptions");
    this.mobileMenuToggle = document.getElementById("mobileMenuToggle");
    this.navFilters = document.getElementById("navFilters");

    this.lightbox = document.getElementById("lightbox");
    this.lightboxClose = document.getElementById("lightboxClose");
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

/* ==========================================================================
   5. STANDALONE MODULES (Toast, Uploader, Idle, Video)
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

const VideoObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.play().catch((e) => console.log("Autoplay prevented:", e));
      } else {
        entry.target.pause();
      }
    });
  },
  { threshold: 0.1 }
);

const IdleManager = {
  timer: null,
  timeoutMs: 5 * 60 * 1000,
  init() {
    const events = ["mousemove", "scroll", "keydown", "click", "touchstart"];
    events.forEach((evt) =>
      window.addEventListener(evt, () => this.wakeUp(), { passive: true })
    );
    this.wakeUp();
  },
  wakeUp() {
    clearTimeout(this.timer);
    document.querySelectorAll("#gallery video").forEach((vid) => {
      const rect = vid.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight && rect.bottom >= 0;
      if (isVisible)
        vid.play().catch((e) => console.log("Autoplay prevented:", e));
    });

    this.timer = setTimeout(() => {
      console.log("Tallo is idle: Pausing videos.");
      document.querySelectorAll("video").forEach((vid) => vid.pause());
    }, this.timeoutMs);
  },
};

const Uploader = {
  dragCounter: 0,
  init() {
    this.overlay = document.createElement("div");
    this.overlay.className = "upload-overlay";
    this.overlay.innerHTML = "<h2>Drop files to upload</h2>";
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
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        for (let file of files) await API.uploadFile(file);
        this.overlay.classList.remove("active");
        setTimeout(
          () => (this.overlay.innerHTML = "<h2>Drop files to upload</h2>"),
          300
        );
        App.loadInitialData();
      }
    });
  },
};

/* ==========================================================================
   6. NAVIGATION MODULE (Smart Trees, Logos, Routing)
   ========================================================================== */
const Navigation = {
  isCompactMode: false,

  init() {
    DOM.mobileMenuToggle.addEventListener("click", () => {
      DOM.navFilters.classList.toggle("is-open");
      DOM.mobileMenuToggle.classList.toggle("active-mode");
    });

    DOM.boardSelectTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      if (DOM.boardSelectOptions.classList.contains("is-open")) {
        this.closeBoardSelect();
      } else {
        SearchTags.hideAutocomplete();
        DOM.boardSelectOptions.classList.add("is-open");
        DOM.boardSelectTrigger.classList.add("is-open");

        if (window.innerWidth > 768) {
          const searchInput = document.getElementById("boardFilterInput");
          if (searchInput) searchInput.focus();
        }
      }
    });

    document.addEventListener("click", (e) => {
      if (!DOM.boardSelectWrapper.contains(e.target)) this.closeBoardSelect();
    });

    DOM.resetLogo.addEventListener("click", () => {
      DOM.searchInput.value = "";
      State.activeCloudTag = null;
      this.setBoard("All");

      State.currentPage = 1;
      State.lastSelectedIndex = null;
      DOM.searchWrapper.classList.remove("is-active");
      DOM.navFilters.classList.remove("is-open");
      DOM.mobileMenuToggle.classList.remove("active-mode");

      SearchTags.updateGlobalTags();

      let baseArray = State.allImages;
      Gallery.render(
        State.isShuffled ? Utils.shuffleArray([...baseArray]) : baseArray
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  },

  closeBoardSelect() {
    DOM.boardSelectOptions.classList.remove("is-open");
    DOM.boardSelectTrigger.classList.remove("is-open");

    const filterInput = document.getElementById("boardFilterInput");
    if (filterInput && filterInput.value !== "") {
      filterInput.value = "";
      this.buildCustomDropdown();
    }
  },

  getSortedBoards() {
    const rawBoards = State.allImages.map((img) => img.board).filter((b) => b);
    let allFolders = new Set();
    rawBoards.forEach((board) => {
      let parts = board.split("/");
      let currentPath = "";
      for (let i = 0; i < parts.length; i++) {
        currentPath = currentPath ? currentPath + "/" + parts[i] : parts[i];
        allFolders.add(currentPath);
      }
    });
    const uniqueBoards = [...allFolders].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
    return ["All", ...uniqueBoards];
  },

  setBoard(boardName) {
    State.currentBoard = boardName;
    localStorage.setItem("tallo_board", boardName);
    const newUrl = boardName === "All" ? "/" : `/${boardName}`;
    window.history.pushState({ board: boardName }, "", newUrl);
    this.buildCustomDropdown();
  },

  buildCustomDropdown() {
    const boards = this.getSortedBoards();
    DOM.boardSelectOptions.innerHTML = "";

    DOM.boardSelectTrigger.title =
      State.currentBoard === "All" ? "All Boards" : State.currentBoard;
    DOM.boardSelectTrigger.classList.toggle(
      "active-mode",
      State.currentBoard !== "All"
    );

    const totalFolders = boards.length - 1;
    this.isCompactMode = totalFolders > 40;

    const tree = {};
    boards.forEach((path) => {
      if (path === "All") return;
      const parts = path.split("/");
      let currentLevel = tree;
      parts.forEach((part, index) => {
        if (!currentLevel[part]) {
          currentLevel[part] = {
            fullPath: parts.slice(0, index + 1).join("/"),
            name: part,
            children: {},
          };
        }
        currentLevel = currentLevel[part].children;
      });
    });

    const searchBox = document.createElement("div");
    searchBox.className = "board-search-container";
    searchBox.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 16px; top: 14px; color: var(--text-secondary);"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <input type="text" id="boardFilterInput" placeholder="Filter boards..." autocomplete="off">
    `;
    DOM.boardSelectOptions.appendChild(searchBox);

    const filterInput = searchBox.querySelector("#boardFilterInput");
    filterInput.addEventListener("click", (e) => e.stopPropagation());
    filterInput.addEventListener("input", (e) =>
      this.filterTree(e.target.value)
    );

    this.treeContainer = document.createElement("div");
    this.treeContainer.className = "board-tree-container";
    DOM.boardSelectOptions.appendChild(this.treeContainer);

    this.renderNode(
      { name: "All Boards", fullPath: "All", children: {} },
      this.treeContainer,
      0,
      true
    );
    Object.values(tree).forEach((node) =>
      this.renderNode(node, this.treeContainer, 0, false)
    );
  },

  renderNode(node, container, depth, isAll = false) {
    const hasChildren = Object.keys(node.children || {}).length > 0;
    const isCollapsed = this.isCompactMode && depth > 0;

    const item = document.createElement("div");
    item.className = "tree-item";
    item.dataset.path = node.fullPath;
    item.dataset.name = node.name.toLowerCase();

    const header = document.createElement("div");
    header.className = `tree-header ${
      State.currentBoard === node.fullPath ? "is-selected" : ""
    }`;
    header.style.paddingLeft = `calc(8px + ${depth * 16}px)`;

    let html = "";
    if (hasChildren) {
      html += `<span class="tree-chevron ${
        isCollapsed ? "" : "expanded"
      }"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>`;
    } else if (!isAll) {
      html += `<span class="tree-chevron-spacer"></span>`;
    }

    html += `<span class="tree-name ${isAll ? "all-boards-opt" : ""}">${
      node.name
    }</span>`;
    header.innerHTML = html;

    if (hasChildren) {
      const chevron = header.querySelector(".tree-chevron");
      chevron.addEventListener("click", (e) => {
        e.stopPropagation();
        const childrenContainer = item.querySelector(".tree-children");
        const isNowExpanded = chevron.classList.toggle("expanded");
        childrenContainer.style.display = isNowExpanded ? "block" : "none";
      });
    }

    header.addEventListener("click", (e) => {
      if (e.target.closest(".tree-chevron")) return;

      e.stopPropagation();
      this.setBoard(node.fullPath);
      this.closeBoardSelect();

      DOM.searchInput.value = "";
      DOM.navFilters.classList.remove("is-open");
      DOM.mobileMenuToggle.classList.remove("active-mode");

      SearchTags.updateGlobalTags();
      SearchTags.applyFiltersAndRender();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    item.appendChild(header);

    if (hasChildren) {
      const childrenContainer = document.createElement("div");
      childrenContainer.className = "tree-children";
      childrenContainer.style.display = isCollapsed ? "none" : "block";

      Object.values(node.children).forEach((child) => {
        this.renderNode(child, childrenContainer, depth + 1, false);
      });
      item.appendChild(childrenContainer);
    }

    container.appendChild(item);
  },

  filterTree(query) {
    const q = query.toLowerCase().trim();
    const allItems = this.treeContainer.querySelectorAll(".tree-item");

    if (!q) {
      this.buildCustomDropdown();
      return;
    }

    allItems.forEach((item) => {
      const name = item.dataset.name;
      if (name && name.includes(q)) {
        item.style.display = "block";
        let parent = item.parentElement.closest(".tree-item");
        while (parent) {
          parent.style.display = "block";
          const childrenContainer = parent.querySelector(".tree-children");
          if (childrenContainer) childrenContainer.style.display = "block";
          const chevron = parent.querySelector(".tree-chevron");
          if (chevron) chevron.classList.add("expanded");
          parent = parent.parentElement.closest(".tree-item");
        }
      } else {
        item.style.display = "none";
      }
    });
  },

  syncBoardFromURL() {
    const boards = this.getSortedBoards();
    const urlPath = window.location.pathname.replace(/^\/|\/$/g, "");
    if (!urlPath) {
      State.currentBoard = "All";
      return;
    }
    const matchedBoard = boards.find(
      (b) => b.toLowerCase() === urlPath.toLowerCase()
    );
    State.currentBoard = matchedBoard || "All";
    if (!matchedBoard && urlPath !== "")
      window.history.replaceState(null, "", "/");
  },
};

/* ==========================================================================
   7. SEARCH & TAGS MODULE (Cloud, Autocomplete, Filters)
   ========================================================================== */
const SearchTags = {
  init() {
    DOM.searchInput.addEventListener("focus", (e) => {
      Navigation.closeBoardSelect();
      if (window.innerWidth <= 768) DOM.navEl.classList.add("keyboard-open");
      this.showAutocomplete(e.target, "search");
    });

    DOM.searchInput.addEventListener(
      "input",
      Utils.debounce((e) => {
        this.filterAutocomplete(e.target.value);
        this.applyFiltersAndRender();
      }, 300)
    );

    DOM.searchInput.addEventListener("blur", () => {
      setTimeout(() => {
        this.hideAutocomplete();
        DOM.navEl.classList.remove("keyboard-open");
      }, 200);
    });

    DOM.searchInput.addEventListener("keydown", (e) => {
      if (this.handleKeyboardNav(e)) return;
      if (e.key === "Enter" && State.autocomplete.activeIndex === -1) {
        e.preventDefault();
        DOM.searchInput.blur();
      }
    });

    DOM.clearSearchBtn.addEventListener("click", () => {
      DOM.searchInput.value = "";
      this.applyFiltersAndRender();
      DOM.searchInput.focus();
    });

    DOM.shuffleBtn.addEventListener("click", () => {
      State.isShuffled = !State.isShuffled;
      DOM.shuffleBtn.classList.toggle("active-mode", State.isShuffled);
      this.applyFiltersAndRender();
    });
  },

  updateGlobalTags() {
    let freq = {};
    let untaggedCount = 0;
    let favoriteCount = 0;
    const activeBoardImages = State.getActiveBoardImages();

    activeBoardImages.forEach((img) => {
      let hasRealTag = false;

      // Count favorites explicitly
      if (img.tags.includes("is:favorite")) {
        favoriteCount++;
      }

      img.tags.forEach((t) => {
        // Exclude the system "is:favorite" tag from the generic frequency list
        if (
          !t.startsWith("http://") &&
          !t.startsWith("https://") &&
          t !== "is:favorite"
        ) {
          freq[t] = (freq[t] || 0) + 1;
          hasRealTag = true;
        }
      });
      if (!hasRealTag) untaggedCount++;
    });

    const sortedByFreq = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0]);

    State.allKnownTags = sortedByFreq;
    DOM.globalTagCloud.innerHTML = "";

    // --- NEW: Add the Special Favorites Pill first ---
    if (favoriteCount > 0) {
      const favSpan = document.createElement("span");
      favSpan.className = "cloud-tag favorite-tag";
      if (State.activeCloudTag === "is:favorite")
        favSpan.classList.add("active");

      // Replaces the emoji with the sleek, flat SVG heart
      favSpan.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg> Favorites (${favoriteCount})`;

      favSpan.addEventListener("click", () => {
        if (State.isSelectMode) return;
        if (State.activeCloudTag === "is:favorite") {
          State.activeCloudTag = null;
          DOM.searchInput.value = "";
        } else {
          State.activeCloudTag = "is:favorite";
          DOM.searchInput.value = "is:favorite";
        }
        this.updateGlobalTags();
        this.applyFiltersAndRender();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      DOM.globalTagCloud.appendChild(favSpan);
    }

    const topTagsToDisplay = Utils.sortTags(sortedByFreq.slice(0, 10));

    topTagsToDisplay.forEach((tag) => {
      const span = document.createElement("span");
      span.className = "cloud-tag";
      if (tag === State.activeCloudTag) span.classList.add("active");
      span.textContent = tag;

      span.addEventListener("click", () => {
        if (State.isSelectMode && State.selectedImages.size > 0) {
          Gallery.applyBatchTag(tag);
        } else {
          if (State.activeCloudTag === tag) {
            State.activeCloudTag = null;
            DOM.searchInput.value = "";
          } else {
            State.activeCloudTag = tag;
            DOM.searchInput.value = tag;
          }
          this.updateGlobalTags();
          this.applyFiltersAndRender();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
      DOM.globalTagCloud.appendChild(span);
    });

    if (untaggedCount > 0) {
      const untaggedSpan = document.createElement("span");
      untaggedSpan.className = "cloud-tag system-tag";
      if (State.activeCloudTag === "is:untagged")
        untaggedSpan.classList.add("active");
      untaggedSpan.textContent = `∅ Untagged (${untaggedCount})`;

      untaggedSpan.addEventListener("click", () => {
        if (State.isSelectMode) return;
        if (State.activeCloudTag === "is:untagged") {
          State.activeCloudTag = null;
          DOM.searchInput.value = "";
        } else {
          State.activeCloudTag = "is:untagged";
          DOM.searchInput.value = "is:untagged";
        }
        this.updateGlobalTags();
        this.applyFiltersAndRender();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      DOM.globalTagCloud.appendChild(untaggedSpan);
    }
  },

  applyFiltersAndRender() {
    const query = DOM.searchInput.value.toLowerCase().trim();
    State.lastSelectedIndex = null;
    State.currentPage = 1;

    let baseArray = State.getActiveBoardImages();

    if (!query) {
      DOM.searchWrapper.classList.remove("is-active");
      Gallery.render(
        State.isShuffled ? Utils.shuffleArray([...baseArray]) : baseArray
      );
      return;
    }

    DOM.searchWrapper.classList.add("is-active");
    let filtered;

    if (query === "is:untagged") {
      filtered = baseArray.filter(
        (img) =>
          !img.tags.some(
            (tag) => !tag.startsWith("http") && tag !== "is:favorite"
          )
      );
    } else if (query === "is:favorite") {
      // System tag search: Only pull files explicitly tagged with "is:favorite"
      filtered = baseArray.filter((img) => img.tags.includes("is:favorite"));
    } else {
      // Normal generic text search
      filtered = baseArray.filter(
        (img) =>
          img.tags.some(
            (tag) => tag.toLowerCase().includes(query) && tag !== "is:favorite"
          ) ||
          img.filename.toLowerCase().includes(query) ||
          (img.description && img.description.toLowerCase().includes(query))
      );
    }

    Gallery.render(
      State.isShuffled ? Utils.shuffleArray([...filtered]) : filtered
    );
  },

  showAutocomplete(inputEl, mode, imgData = null, tagsListEl = null) {
    State.autocomplete = {
      mode,
      inputEl,
      imgData,
      tagsListEl,
      activeIndex: -1,
    };
    this.filterAutocomplete("");
  },

  hideAutocomplete() {
    DOM.autocompleteBox.style.display = "none";
    State.autocomplete.inputEl = null;
    State.autocomplete.activeIndex = -1;
  },

  filterAutocomplete(query) {
    const ac = State.autocomplete;
    if (!ac.inputEl) return;

    ac.activeIndex = -1;
    const rect = ac.inputEl.getBoundingClientRect();
    DOM.autocompleteBox.style.width = `${rect.width}px`;

    if (window.innerWidth <= 768) {
      DOM.autocompleteBox.style.position = "fixed";
      DOM.autocompleteBox.style.left = `${rect.left}px`;
      DOM.autocompleteBox.style.top = `${rect.bottom + 4}px`;
      DOM.autocompleteBox.style.bottom = "auto";
    } else {
      DOM.autocompleteBox.style.position = "absolute";
      DOM.autocompleteBox.style.left = `${rect.left + window.scrollX}px`;
      DOM.autocompleteBox.style.top = `${rect.bottom + window.scrollY + 4}px`;
      DOM.autocompleteBox.style.bottom = "auto";
    }

    const q = query.toLowerCase();
    let suggestions =
      ac.mode === "search"
        ? State.allKnownTags.filter((t) => t.includes(q))
        : State.allKnownTags.filter(
            (t) => t.includes(q) && !ac.imgData.tags.includes(t)
          );

    if (suggestions.length === 0) {
      DOM.autocompleteBox.style.display = "none";
      return;
    }

    DOM.autocompleteBox.innerHTML = "";
    suggestions.slice(0, 8).forEach((tag) => {
      const item = document.createElement("div");
      item.className = "autocomplete-item";

      if (q) {
        const matchIndex = tag.indexOf(q);
        if (matchIndex > -1) {
          const before = tag.substring(0, matchIndex);
          const match = tag.substring(matchIndex, matchIndex + q.length);
          const after = tag.substring(matchIndex + q.length);
          item.innerHTML = `${before}<span class="autocomplete-match">${match}</span>${after}`;
        }
      } else {
        item.textContent = tag;
      }

      item.dataset.value = tag;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const selectedTag = item.dataset.value;

        if (ac.mode === "search") {
          ac.inputEl.value = selectedTag;
          this.applyFiltersAndRender();
        } else {
          if (
            State.isSelectMode &&
            State.selectedImages.has(ac.imgData.filename)
          ) {
            Gallery.applyBatchTag(selectedTag);
          } else {
            ac.imgData.tags.push(selectedTag);
            API.saveMetadata(ac.imgData);
            this.updateGlobalTags();

            ac.tagsListEl.innerHTML = "";
            Utils.sortTags(ac.imgData.tags).forEach((t) => {
              if (t !== "is:favorite") {
                ac.tagsListEl.appendChild(
                  Gallery.createTagElement(t, ac.imgData, ac.tagsListEl)
                );
              }
            });
          }
        }
        ac.inputEl.value = ac.mode === "search" ? selectedTag : "";
        this.hideAutocomplete();
      });
      DOM.autocompleteBox.appendChild(item);
    });
    DOM.autocompleteBox.style.display = "flex";
  },

  handleKeyboardNav(e) {
    const isDropdownOpen = DOM.autocompleteBox.style.display === "flex";
    if (!isDropdownOpen) return false;

    const items = DOM.autocompleteBox.querySelectorAll(".autocomplete-item");
    const ac = State.autocomplete;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      ac.activeIndex = (ac.activeIndex + 1) % items.length;
      this.updateHighlight(items);
      return true;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      ac.activeIndex = (ac.activeIndex - 1 + items.length) % items.length;
      this.updateHighlight(items);
      return true;
    } else if (e.key === "Escape") {
      this.hideAutocomplete();
      return true;
    } else if (e.key === "Tab" || e.key === "Enter") {
      if (ac.activeIndex > -1 && items.length > 0) {
        e.preventDefault();
        items[ac.activeIndex].dispatchEvent(new MouseEvent("mousedown"));
        return true;
      }
    }
    return false;
  },

  updateHighlight(items) {
    items.forEach((item) => item.classList.remove("is-highlighted"));
    const active = State.autocomplete.activeIndex;
    if (active > -1 && items[active]) {
      items[active].classList.add("is-highlighted");
      items[active].scrollIntoView({ block: "nearest" });
    }
  },
};

/* ==========================================================================
   8. LIGHTBOX MODULE
   ========================================================================== */
const Lightbox = {
  init() {
    if (DOM.lightboxClose)
      DOM.lightboxClose.addEventListener("click", () => this.close());

    // Clicking the dark background closes the lightbox
    if (DOM.lightbox)
      DOM.lightbox.addEventListener("click", (e) => {
        if (e.target === DOM.lightbox) this.close();
      });

    // --- NEW: Tap Image to Toggle UI (Chromeless Mode) ---
    if (DOM.lightboxContent) {
      DOM.lightboxContent.addEventListener("click", (e) => {
        // Don't hide the UI if the user is currently typing a description!
        if (DOM.lightbox.classList.contains("is-editing")) return;

        // Toggle the hide-ui class on the main overlay
        DOM.lightbox.classList.toggle("hide-ui");
      });
    }

    // --- Lightbox Favorite Button Logic ---
    if (DOM.lightboxFavoriteBtn) {
      DOM.lightboxFavoriteBtn.addEventListener("click", () => {
        if (State.currentLightboxIndex > -1) {
          const imgData = State.renderList[State.currentLightboxIndex];
          const isFav = imgData.tags.includes("is:favorite");

          if (isFav) {
            imgData.tags = imgData.tags.filter((t) => t !== "is:favorite");
            DOM.lightboxFavoriteBtn.classList.remove("is-active");
          } else {
            imgData.tags.push("is:favorite");
            DOM.lightboxFavoriteBtn.classList.add("is-active");
          }

          API.saveMetadata(imgData);
          SearchTags.updateGlobalTags();

          // Visually sync the heart button on the grid card in the background
          const gridCardFavBtn = document.querySelector(
            `.glass-card[data-filename="${imgData.filename}"] .card-favorite-btn`
          );
          if (gridCardFavBtn) {
            gridCardFavBtn.classList.toggle("is-active", !isFav);
          }
        }
      });
    }

    if (DOM.lightboxEditDescBtn) {
      DOM.lightboxEditDescBtn.addEventListener("click", () => {
        const isEditing = DOM.lightbox.classList.toggle("is-editing");

        if (isEditing) {
          if (DOM.lightboxDescContainer)
            DOM.lightboxDescContainer.style.display = "block";
          if (DOM.lightboxDescText) DOM.lightboxDescText.style.display = "none";
          if (DOM.lightboxDescription) {
            DOM.lightboxDescription.style.display = "block";
            DOM.lightboxDescription.focus();
            DOM.lightboxDescription.setSelectionRange(
              DOM.lightboxDescription.value.length,
              DOM.lightboxDescription.value.length
            );
          }
        } else {
          if (DOM.lightboxDescription) DOM.lightboxDescription.blur();
        }
      });
    }

    if (DOM.lightboxDescription) {
      DOM.lightboxDescription.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = this.scrollHeight + "px";
      });

      DOM.lightboxDescription.addEventListener("blur", () => {
        if (State.currentLightboxIndex > -1) {
          const imgData = State.renderList[State.currentLightboxIndex];
          const newDesc = DOM.lightboxDescription.value.trim();

          if (imgData.description !== newDesc) {
            imgData.description = newDesc;
            API.saveMetadata(imgData);
            Toast.show("Description saved!");
          }

          if (newDesc) {
            if (DOM.lightboxDescText) {
              DOM.lightboxDescText.textContent = newDesc;
              DOM.lightboxDescText.style.display = "block";
            }
            DOM.lightboxDescription.style.display = "none";
          } else {
            if (DOM.lightboxDescContainer)
              DOM.lightboxDescContainer.style.display = "none";
            if (DOM.lightboxDescText) DOM.lightboxDescText.textContent = "";
            DOM.lightboxDescription.style.display = "none";
          }
        }
      });
    }

    DOM.lightboxContextBtn.addEventListener("click", () => {
      const targetImage = State.renderList[State.currentLightboxIndex];
      if (!targetImage) return;

      this.close({ skipHistoryBack: true });

      State.isShuffled = false;
      DOM.shuffleBtn.classList.remove("active-mode");

      DOM.searchInput.value = "";
      State.activeCloudTag = null;
      DOM.searchWrapper.classList.remove("is-active");
      SearchTags.updateGlobalTags();

      const baseArray = State.getActiveBoardImages();
      const chronoIndex = baseArray.findIndex(
        (img) => img.filename === targetImage.filename
      );

      if (chronoIndex !== -1) {
        State.targetImageToScrollTo = targetImage.filename;
        State.currentPage =
          Math.floor(chronoIndex / Utils.getItemsPerPage()) + 1;
        Gallery.render(baseArray, true);
      }
    });

    // Optimistic Delete Logic
    let deleteConfirmTimer;
    DOM.lightboxDeleteBtn.addEventListener("click", async () => {
      const targetImage = State.renderList[State.currentLightboxIndex];
      if (!targetImage) return;

      if (!DOM.lightboxDeleteBtn.classList.contains("confirm-delete")) {
        DOM.lightboxDeleteBtn.classList.add("confirm-delete");
        Toast.show("Click again to permanently delete");

        clearTimeout(deleteConfirmTimer);
        deleteConfirmTimer = setTimeout(() => {
          DOM.lightboxDeleteBtn.classList.remove("confirm-delete");
        }, 3000);
        return;
      }

      clearTimeout(deleteConfirmTimer);
      DOM.lightboxDeleteBtn.classList.remove("confirm-delete");

      const deletedImage = targetImage;
      const originalIndex = State.allImages.findIndex(
        (img) => img.filename === targetImage.filename
      );

      State.allImages = State.allImages.filter(
        (img) => img.filename !== targetImage.filename
      );

      this.close({ skipHistoryBack: true });
      SearchTags.applyFiltersAndRender();

      const physicalDeleteTimer = setTimeout(async () => {
        await API.deleteMedia(deletedImage.filename);
      }, 4500);

      Toast.show("File deleted.", () => {
        clearTimeout(physicalDeleteTimer);
        if (originalIndex > -1) {
          State.allImages.splice(originalIndex, 0, deletedImage);
        } else {
          State.allImages.push(deletedImage);
        }
        SearchTags.applyFiltersAndRender();
      });
    });

    // Ignore Directory Logic
    let ignoreConfirmTimer;
    DOM.lightboxIgnoreBtn.addEventListener("click", async () => {
      const targetImage = State.renderList[State.currentLightboxIndex];
      if (!targetImage || targetImage.board === "Main") {
        Toast.show("You cannot ignore the root directory.");
        return;
      }

      if (!DOM.lightboxIgnoreBtn.classList.contains("confirm-delete")) {
        DOM.lightboxIgnoreBtn.classList.add("confirm-delete");
        Toast.show(`Click again to hide "${targetImage.board}"`);

        clearTimeout(ignoreConfirmTimer);
        ignoreConfirmTimer = setTimeout(() => {
          DOM.lightboxIgnoreBtn.classList.remove("confirm-delete");
        }, 3000);
        return;
      }

      clearTimeout(ignoreConfirmTimer);
      DOM.lightboxIgnoreBtn.classList.remove("confirm-delete");

      await API.ignoreBoard(targetImage.board);

      State.allImages = State.allImages.filter(
        (img) => !img.board.startsWith(targetImage.board)
      );
      this.close({ skipHistoryBack: true });

      if (State.currentBoard.startsWith(targetImage.board)) {
        Navigation.setBoard("All");
      }

      Navigation.buildCustomDropdown();
      SearchTags.applyFiltersAndRender();
      Toast.show(`Folder hidden! Edit .talloignore file to undo.`);
    });
  },

  open(index) {
    if (index < 0 || index >= State.renderList.length) return;

    if (!DOM.lightbox.classList.contains("is-active")) {
      window.history.pushState(
        { lightbox: true, board: State.currentBoard },
        "",
        window.location.pathname
      );
    } else {
      window.history.replaceState(
        { lightbox: true, board: State.currentBoard },
        "",
        window.location.pathname
      );
    }

    State.currentLightboxIndex = index;
    const imgData = State.renderList[index];

    DOM.lightboxContent.innerHTML = "";
    DOM.lightboxTags.innerHTML = "";

    // Sync Lightbox Favorite button
    if (DOM.lightboxFavoriteBtn) {
      DOM.lightboxFavoriteBtn.classList.toggle(
        "is-active",
        imgData.tags.includes("is:favorite")
      );
    }

    const descText = imgData.description || "";
    if (descText) {
      DOM.lightboxDescContainer.style.display = "block";
      DOM.lightboxDescText.textContent = descText;
      DOM.lightboxDescText.style.display = "block";
      DOM.lightboxDescription.style.display = "none";
    } else {
      DOM.lightboxDescContainer.style.display = "none";
      DOM.lightboxDescText.textContent = "";
      DOM.lightboxDescription.style.display = "none";
    }
    DOM.lightboxDescription.value = descText;

    const isVideo = imgData.filename.toLowerCase().match(/\.(webm|mp4)$/);
    let mediaEl;
    if (isVideo) {
      mediaEl = document.createElement("video");
      mediaEl.autoplay = true;
      mediaEl.loop = true;
      mediaEl.controls = true;
    } else {
      mediaEl = document.createElement("img");
    }
    mediaEl.src = imgData.url;
    DOM.lightboxContent.appendChild(mediaEl);

    // Prevent rendering "is:favorite" as a raw text pill
    Utils.sortTags(imgData.tags).forEach((tagText) => {
      if (tagText !== "is:favorite") {
        DOM.lightboxTags.appendChild(
          Gallery.createTagElement(tagText, imgData, DOM.lightboxTags, true)
        );
      }
    });

    document.querySelectorAll("#gallery video").forEach((vid) => vid.pause());
    document.body.classList.add("lightbox-open");
    DOM.lightbox.classList.add("is-active");
  },

  close(options = {}) {
    const { fromPopState = false, skipHistoryBack = false } = options;

    if (
      !fromPopState &&
      window.history.state &&
      window.history.state.lightbox
    ) {
      if (skipHistoryBack) {
        window.history.replaceState(
          { board: State.currentBoard },
          "",
          window.location.pathname
        );
      } else {
        window.history.back();
        return;
      }
    }

    DOM.lightbox.classList.remove("is-active");
    DOM.lightbox.classList.remove("is-editing");
    DOM.lightbox.classList.remove("hide-ui");
    document.body.classList.remove("lightbox-open");
    State.currentLightboxIndex = -1;
    DOM.lightboxDescContainer.style.display = "none";
    DOM.lightboxDeleteBtn.classList.remove("confirm-delete");
    DOM.lightboxIgnoreBtn.classList.remove("confirm-delete");

    setTimeout(() => {
      DOM.lightboxContent.innerHTML = "";
      DOM.lightboxTags.innerHTML = "";
      IdleManager.wakeUp();
    }, 300);
  },
};

/* ==========================================================================
   9. GALLERY UI MODULE (Masonry, Chunking, Cards)
   ========================================================================== */
const Gallery = {
  init() {
    DOM.selectModeBtn.addEventListener("click", () => this.toggleSelectMode());
    window.addEventListener(
      "scroll",
      Utils.debounce(() => {
        const scrollPosition = window.innerHeight + window.scrollY;
        const threshold = document.body.offsetHeight - 800;
        if (scrollPosition >= threshold && !State.isRenderingChunk) {
          const pageStartIndex =
            (State.currentPage - 1) * Utils.getItemsPerPage();
          if (
            State.itemsRenderedThisPage <
            Math.min(
              Utils.getItemsPerPage(),
              State.renderList.length - pageStartIndex
            )
          ) {
            this.renderNextChunk(State.currentRenderId);
          }
        }
      }, 50)
    );
  },

  toggleSelectMode() {
    State.isSelectMode = !State.isSelectMode;
    DOM.selectModeBtn.classList.toggle("active-mode", State.isSelectMode);
    document.body.classList.toggle("select-mode-active", State.isSelectMode);

    if (!State.isSelectMode) {
      State.selectedImages.clear();
      State.lastSelectedIndex = null;
      document
        .querySelectorAll(".glass-card")
        .forEach((c) => c.classList.remove("is-selected"));
    }
  },

  render(images, isPageChange = false) {
    if (!isPageChange) State.currentPage = 1;
    State.renderList = images;
    State.itemsRenderedThisPage = 0;

    if (DOM.galleryEl) {
      const activeVideos = DOM.galleryEl.querySelectorAll("video");
      activeVideos.forEach((vid) => {
        vid.pause();
        vid.removeAttribute("src");
        vid.load();
      });
      DOM.galleryEl.innerHTML = "";
    }

    this.renderPaginationNumbers();

    State.currentCols = Utils.getColumnCount();
    State.masonryColumns = [];
    State.colHeights = new Array(State.currentCols).fill(0);

    for (let i = 0; i < State.currentCols; i++) {
      const colDiv = document.createElement("div");
      colDiv.className = "masonry-column";
      State.masonryColumns.push(colDiv);
      if (DOM.galleryEl) DOM.galleryEl.appendChild(colDiv);
    }

    State.currentRenderId++;
    this.renderNextChunk(State.currentRenderId);
    if (isPageChange) window.scrollTo({ top: 0, behavior: "smooth" });
  },

  renderNextChunk(renderId) {
    if (renderId !== State.currentRenderId) return;

    const pageStartIndex = (State.currentPage - 1) * Utils.getItemsPerPage();
    const totalItemsForThisPage = Math.min(
      Utils.getItemsPerPage(),
      State.renderList.length - pageStartIndex
    );

    if (State.itemsRenderedThisPage >= totalItemsForThisPage) return;

    State.isRenderingChunk = true;
    let chunkLimit = State.itemsRenderedThisPage + Utils.getChunkSize();

    if (State.targetImageToScrollTo) {
      const localTargetIndex = State.renderList
        .slice(pageStartIndex, pageStartIndex + totalItemsForThisPage)
        .findIndex((img) => img.filename === State.targetImageToScrollTo);
      if (
        localTargetIndex !== -1 &&
        localTargetIndex >= State.itemsRenderedThisPage
      ) {
        chunkLimit = localTargetIndex + 1;
      }
    }

    const targetCount = Math.min(chunkLimit, totalItemsForThisPage);

    const placeNextCard = () => {
      if (renderId !== State.currentRenderId) return;
      if (State.itemsRenderedThisPage >= targetCount) {
        State.isRenderingChunk = false;
        return;
      }

      const globalIndex = pageStartIndex + State.itemsRenderedThisPage;
      const imgData = State.renderList[globalIndex];
      const card = this.createCard(
        imgData,
        globalIndex,
        renderId,
        placeNextCard
      );
    };

    placeNextCard();
  },

  createCard(imgData, globalIndex, renderId, callback) {
    const card = document.createElement("div");
    card.className = "glass-card";
    card.style.animation = "fadeIn 0.5s ease backwards";
    card.dataset.filename = imgData.filename;

    if (State.selectedImages.has(imgData.filename))
      card.classList.add("is-selected");

    const expandBtn = document.createElement("button");
    expandBtn.className = "card-expand-btn";
    expandBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;
    expandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      Lightbox.open(globalIndex);
    });
    card.appendChild(expandBtn);

    // --- NEW: Card Heart Button ---
    const favBtn = document.createElement("button");
    favBtn.className = "card-favorite-btn";
    if (imgData.tags.includes("is:favorite")) favBtn.classList.add("is-active");
    favBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isFav = imgData.tags.includes("is:favorite");
      if (isFav) {
        imgData.tags = imgData.tags.filter((t) => t !== "is:favorite");
        favBtn.classList.remove("is-active");
      } else {
        imgData.tags.push("is:favorite");
        favBtn.classList.add("is-active");
      }
      API.saveMetadata(imgData);
      SearchTags.updateGlobalTags();
    });
    card.appendChild(favBtn);

    let lastClickTime = 0;

    card.addEventListener("click", (e) => {
      if (
        e.target.tagName === "INPUT" ||
        e.target.classList.contains("tag-del") ||
        e.target.closest(".tag") ||
        e.target.closest(".card-favorite-btn") // ignore heart clicks
      )
        return;

      const currentTime = new Date().getTime();
      const timeDiff = currentTime - lastClickTime;
      const isDoubleClick = timeDiff < 300 && timeDiff > 0;
      lastClickTime = currentTime;

      if (State.isSelectMode) {
        if (e.shiftKey && State.lastSelectedIndex !== null) {
          const start = Math.min(State.lastSelectedIndex, globalIndex);
          const end = Math.max(State.lastSelectedIndex, globalIndex);
          for (let i = start; i <= end; i++) {
            const itemToSelect = State.renderList[i];
            State.selectedImages.add(itemToSelect.filename);
            const renderedCard = document.querySelector(
              `.glass-card[data-filename="${itemToSelect.filename}"]`
            );
            if (renderedCard) renderedCard.classList.add("is-selected");
          }
          document.getSelection().removeAllRanges();
        } else {
          if (State.selectedImages.has(imgData.filename)) {
            State.selectedImages.delete(imgData.filename);
            card.classList.remove("is-selected");
          } else {
            State.selectedImages.add(imgData.filename);
            card.classList.add("is-selected");
          }
          State.lastSelectedIndex = globalIndex;
        }
      } else {
        if (window.innerWidth <= 768) {
          if (isDoubleClick) {
            Lightbox.open(globalIndex);
          } else {
            card.classList.toggle("show-mobile-overlay");
          }
        } else {
          Lightbox.open(globalIndex);
        }
      }
    });

    const isVideo = imgData.filename.toLowerCase().match(/\.(webm|mp4)$/);
    let mediaEl;
    if (isVideo) {
      mediaEl = document.createElement("video");
      mediaEl.src = imgData.url;
      mediaEl.loading = "lazy";
      mediaEl.loop = true;
      mediaEl.muted = true;
      mediaEl.playsInline = true;
      VideoObserver.observe(mediaEl);
    } else {
      mediaEl = document.createElement("img");
      mediaEl.src = imgData.url;
    }

    const tagContainer = document.createElement("div");
    tagContainer.className = "tag-container";
    const tagsList = document.createElement("div");
    tagsList.className = "tags-list";

    // Hide raw "is:favorite" tag from card UI
    Utils.sortTags(imgData.tags).forEach((tag) => {
      if (tag !== "is:favorite") {
        tagsList.appendChild(this.createTagElement(tag, imgData, tagsList));
      }
    });

    const input = document.createElement("input");
    input.type = "text";
    input.className = "tag-input";
    input.placeholder = "Add a tag & press Enter...";
    input.addEventListener("focus", (e) =>
      SearchTags.showAutocomplete(e.target, "tag", imgData, tagsList)
    );
    input.addEventListener("input", (e) =>
      SearchTags.filterAutocomplete(e.target.value)
    );
    input.addEventListener("blur", () =>
      setTimeout(() => SearchTags.hideAutocomplete(), 200)
    );
    input.addEventListener("keydown", (e) => {
      if (SearchTags.handleKeyboardNav(e)) return;
      if (e.key === "Enter" && State.autocomplete.activeIndex === -1) {
        e.preventDefault();
        const rawTag = input.value.trim();
        const newTag =
          rawTag.startsWith("http://") || rawTag.startsWith("https://")
            ? rawTag
            : rawTag.toLowerCase();
        if (newTag) {
          SearchTags.hideAutocomplete();
          if (
            State.isSelectMode &&
            State.selectedImages.has(imgData.filename)
          ) {
            this.applyBatchTag(newTag);
          } else if (!imgData.tags.includes(newTag)) {
            imgData.tags.push(newTag);
            API.saveMetadata(imgData);
            SearchTags.updateGlobalTags();
            tagsList.innerHTML = "";
            Utils.sortTags(imgData.tags).forEach((t) => {
              if (t !== "is:favorite") {
                tagsList.appendChild(
                  this.createTagElement(t, imgData, tagsList)
                );
              }
            });
          }
        }
        input.value = "";
      }
    });

    tagContainer.appendChild(tagsList);
    tagContainer.appendChild(input);
    card.appendChild(mediaEl);
    card.appendChild(tagContainer);

    const handleMediaLoad = () => {
      if (renderId !== State.currentRenderId) return;
      let aspect = isVideo
        ? mediaEl.videoHeight / mediaEl.videoWidth || 1
        : mediaEl.naturalHeight / mediaEl.naturalWidth || 1;
      let shortestIndex = 0;
      let minHeight = State.colHeights[0];
      for (let i = 1; i < State.currentCols; i++) {
        if (State.colHeights[i] < minHeight) {
          minHeight = State.colHeights[i];
          shortestIndex = i;
        }
      }
      State.colHeights[shortestIndex] += aspect + 0.15;
      State.masonryColumns[shortestIndex].appendChild(card);
      State.itemsRenderedThisPage++;

      if (State.targetImageToScrollTo === imgData.filename) {
        State.targetImageToScrollTo = null;
        setTimeout(() => {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          card.style.transition = "box-shadow 0.5s ease";
          card.style.boxShadow = "0 0 0 6px var(--select-color)";
          setTimeout(() => {
            card.style.boxShadow = "0 0 24px rgba(10, 132, 255, 0.3)";
            setTimeout(() => (card.style.boxShadow = "none"), 1000);
          }, 1500);
        }, 100);
      }
      callback();
    };

    if (isVideo) {
      mediaEl.addEventListener("loadeddata", handleMediaLoad, { once: true });
      mediaEl.addEventListener("error", handleMediaLoad, { once: true });
    } else {
      if (mediaEl.complete && mediaEl.naturalWidth !== 0)
        setTimeout(handleMediaLoad, 0);
      else {
        mediaEl.addEventListener("load", handleMediaLoad, { once: true });
        mediaEl.addEventListener("error", handleMediaLoad, { once: true });
      }
    }
  },

  createTagElement(tagText, imgData, tagsListEl, isLightbox = false) {
    const tag = document.createElement("div");
    tag.className = "tag cloud-tag";
    const isUrl =
      tagText.startsWith("http://") || tagText.startsWith("https://");
    let isMap =
      isUrl &&
      (tagText.includes("maps.google") || tagText.includes("goo.gl/maps"));

    if (isUrl) tag.classList.add("url-tag");
    if (isMap) tag.classList.add("map-tag");
    if (tagText === "All Boards") tag.style.fontSize = "0.2rem";

    const text = document.createElement("span");
    text.className = "tag-text";

    if (isUrl) {
      try {
        const urlObj = new URL(tagText);
        if (isMap) {
          text.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block; ${
            isLightbox ? "margin: 0 auto;" : ""
          }"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
          if (isLightbox) tag.style.padding = "4px 8px";
        } else {
          text.textContent = "↗ " + urlObj.hostname.replace("www.", "");
          if (isLightbox) {
            tag.style.background = "rgba(13, 148, 136, 0.15)";
            tag.style.borderColor = "rgba(13, 148, 136, 0.3)";
            tag.style.textTransform = "none";
          }
        }
      } catch (e) {
        text.textContent = "↗ Link";
      }
    } else {
      text.textContent = tagText;
    }

    tag.appendChild(text);

    const del = document.createElement("span");
    del.className = "tag-del";
    del.textContent = "×";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      imgData.tags = imgData.tags.filter((t) => t !== tagText);
      API.saveMetadata(imgData);
      SearchTags.updateGlobalTags();

      tagsListEl.innerHTML = "";
      Utils.sortTags(imgData.tags).forEach((t) => {
        if (t !== "is:favorite") {
          tagsListEl.appendChild(
            this.createTagElement(t, imgData, tagsListEl, isLightbox)
          );
        }
      });

      if (isLightbox) {
        const bgCardTags = document.querySelector(
          `.glass-card[data-filename="${imgData.filename}"] .tags-list`
        );
        if (bgCardTags) {
          bgCardTags.innerHTML = "";
          Utils.sortTags(imgData.tags).forEach((t) => {
            if (t !== "is:favorite") {
              bgCardTags.appendChild(
                this.createTagElement(t, imgData, bgCardTags, false)
              );
            }
          });
        }
      }

      Toast.show(`Removed tag: ${tagText}`, () => {
        imgData.tags.push(tagText);
        API.saveMetadata(imgData);
        SearchTags.updateGlobalTags();

        tagsListEl.innerHTML = "";
        Utils.sortTags(imgData.tags).forEach((t) => {
          if (t !== "is:favorite") {
            tagsListEl.appendChild(
              this.createTagElement(t, imgData, tagsListEl, isLightbox)
            );
          }
        });

        if (isLightbox) {
          const bgCardTags = document.querySelector(
            `.glass-card[data-filename="${imgData.filename}"] .tags-list`
          );
          if (bgCardTags) {
            bgCardTags.innerHTML = "";
            Utils.sortTags(imgData.tags).forEach((t) => {
              if (t !== "is:favorite") {
                bgCardTags.appendChild(
                  this.createTagElement(t, imgData, bgCardTags, false)
                );
              }
            });
          }
        }
      });
    });
    tag.appendChild(del);

    tag.addEventListener("click", (e) => {
      if (State.isSelectMode) return;
      if (isUrl) {
        window.open(tagText, "_blank");
        return;
      }
      if (isLightbox) Lightbox.close({ skipHistoryBack: true });
      DOM.searchInput.value = tagText;
      SearchTags.applyFiltersAndRender();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    return tag;
  },

  renderPaginationNumbers() {
    if (DOM.paginationContainer) DOM.paginationContainer.innerHTML = "";
    if (DOM.topPaginationContainer) DOM.topPaginationContainer.innerHTML = "";

    const totalPages = Math.ceil(
      State.renderList.length / Utils.getItemsPerPage()
    );
    if (totalPages <= 1) return;

    // Helper to create buttons or ellipses
    const createPageBtn = (
      text,
      pageNum,
      isActive = false,
      isDisabled = false
    ) => {
      const btn = document.createElement(isDisabled ? "span" : "button");
      btn.className = isDisabled ? "page-ellipsis" : "page-num-btn";
      if (isActive) btn.classList.add("active");
      btn.textContent = text;

      if (!isDisabled) {
        btn.addEventListener("click", () => {
          if (State.currentPage !== pageNum) {
            State.currentPage = pageNum;
            this.render(State.renderList, true);
          }
        });
      }
      return btn;
    };

    const buildPaginationUI = (container) => {
      if (!container) return;

      // Previous Arrow
      if (State.currentPage > 1) {
        container.appendChild(createPageBtn("←", State.currentPage - 1));
      }

      // Responsive neighbors: Show fewer numbers on mobile so it doesn't wrap
      const delta = window.innerWidth <= 768 ? 1 : 2;
      const range = [];

      for (
        let i = Math.max(2, State.currentPage - delta);
        i <= Math.min(totalPages - 1, State.currentPage + delta);
        i++
      ) {
        range.push(i);
      }

      if (State.currentPage - delta > 2) range.unshift("...");
      range.unshift(1); // Always show page 1
      if (State.currentPage + delta < totalPages - 1) range.push("...");
      if (totalPages > 1) range.push(totalPages); // Always show last page

      range.forEach((i) => {
        if (i === "...") {
          container.appendChild(createPageBtn("...", null, false, true));
        } else {
          container.appendChild(createPageBtn(i, i, State.currentPage === i));
        }
      });

      // Next Arrow
      if (State.currentPage < totalPages) {
        container.appendChild(createPageBtn("→", State.currentPage + 1));
      }

      // --- NEW: The Page Jump Input ---
      // Only render this if there are actually enough pages to warrant jumping
      if (totalPages > 5) {
        const jumpInput = document.createElement("input");
        jumpInput.type = "number";
        jumpInput.className = "page-jump-input";
        jumpInput.placeholder = "Go...";
        jumpInput.min = 1;
        jumpInput.max = totalPages;

        jumpInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            let targetPage = parseInt(jumpInput.value, 10);

            if (!isNaN(targetPage)) {
              // Safety Math: Clamp the user's input so it can't exceed bounds
              targetPage = Math.max(1, Math.min(targetPage, totalPages));

              if (targetPage !== State.currentPage) {
                State.currentPage = targetPage;
                this.render(State.renderList, true);
              }
            }

            jumpInput.value = "";
            jumpInput.blur(); // Hides the keyboard on mobile!
          }
        });

        container.appendChild(jumpInput);
      }
    };

    // Build it in both locations!
    buildPaginationUI(DOM.topPaginationContainer);
    buildPaginationUI(DOM.paginationContainer);
  },
  async applyBatchTag(tagText) {
    let promises = [];
    State.getActiveBoardImages().forEach((img) => {
      if (
        State.selectedImages.has(img.filename) &&
        !img.tags.includes(tagText)
      ) {
        img.tags.push(tagText);
        promises.push(API.saveMetadata(img));
        document.querySelectorAll(".glass-card").forEach((card) => {
          if (card.dataset.filename === img.filename) {
            const tagsList = card.querySelector(".tags-list");
            if (tagsList) {
              tagsList.innerHTML = "";
              Utils.sortTags(img.tags).forEach((t) => {
                if (t !== "is:favorite") {
                  tagsList.appendChild(this.createTagElement(t, img, tagsList));
                }
              });
            }
          }
        });
      }
    });
    await Promise.all(promises);
    SearchTags.updateGlobalTags();
  },
};

/* ==========================================================================
   10. GLOBAL EVENT ROUTER
   ========================================================================== */
const GlobalEvents = {
  init() {
    window.addEventListener("popstate", () => {
      if (DOM.lightbox.classList.contains("is-active")) {
        Lightbox.close({ fromPopState: true });
        return;
      }

      Navigation.syncBoardFromURL();
      Navigation.buildCustomDropdown();
      SearchTags.applyFiltersAndRender();
    });

    document.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        if (e.key === "Escape") {
          e.target.blur();
          SearchTags.hideAutocomplete();
        }
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        DOM.searchInput.focus();
        return;
      }
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        DOM.shuffleBtn.click();
        return;
      }
      if (DOM.autocompleteBox.style.display === "flex") {
        if (e.key === "Escape") SearchTags.hideAutocomplete();
        return;
      }
      if (DOM.boardSelectOptions.classList.contains("is-open")) {
        if (e.key === "Escape") Navigation.closeBoardSelect();
        return;
      }

      if (DOM.lightbox.classList.contains("is-active")) {
        if (e.key === "Escape") Lightbox.close();
        else if (e.key === "ArrowLeft") {
          e.preventDefault();
          let newIndex = State.currentLightboxIndex - 1;
          if (newIndex < 0) newIndex = State.renderList.length - 1;
          if (State.renderList.length > 0) Lightbox.open(newIndex);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          let newIndex = State.currentLightboxIndex + 1;
          if (newIndex >= State.renderList.length) newIndex = 0;
          if (State.renderList.length > 0) Lightbox.open(newIndex);
        }
      } else if (State.isSelectMode && e.key === "Escape") {
        Gallery.toggleSelectMode();
      }
    });
  },
};

/* ==========================================================================
   11. CORE APP BOOTSTRAPPER
   ========================================================================== */
const App = {
  async init() {
    DOM.init();
    Toast.init();
    Uploader.init();
    IdleManager.init();

    Navigation.init();
    SearchTags.init();
    Lightbox.init();
    Gallery.init();
    GlobalEvents.init();

    await this.loadInitialData();
  },

  async loadInitialData() {
    await API.fetchGallery();

    Navigation.syncBoardFromURL();
    const savedBoard = localStorage.getItem("tallo_board");
    if (savedBoard && Navigation.getSortedBoards().includes(savedBoard)) {
      State.currentBoard = savedBoard;
    }
    Navigation.buildCustomDropdown();

    State.currentPage = 1;
    SearchTags.updateGlobalTags();

    DOM.shuffleBtn.classList.toggle("active-mode", State.isShuffled);

    let baseArray = State.getActiveBoardImages();
    Gallery.render(
      State.isShuffled ? Utils.shuffleArray([...baseArray]) : baseArray
    );
  },
};
