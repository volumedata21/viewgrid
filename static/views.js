import { Utils, State, API, DOM } from "./core.js";
import {
  Toast,
  ActionModals,
  BoardModal,
  SmartBoardModal,
  VideoObserver,
} from "./ui.js";
import { AppRouter } from "./app.js";

/* ==========================================================================
   SMART BOARD HELPER
   ========================================================================== */
function isImageInSmartBoard(img, smartBoard) {
  if (
    smartBoard.excluded_filenames &&
    smartBoard.excluded_filenames.includes(img.filename)
  )
    return false;

  if (smartBoard.folder_path && smartBoard.folder_path !== "All") {
    if (
      img.board !== smartBoard.folder_path &&
      !img.board.startsWith(smartBoard.folder_path + "/")
    ) {
      return false;
    }
  }

  const isVid = (img.filename || "").toLowerCase().match(/\.(webm|mp4|mov)$/);
  if (smartBoard.media_type === "image" && isVid) return false;
  if (smartBoard.media_type === "video" && !isVid) return false;

  const safeTags = img.tags || [];
  if (smartBoard.include_tags && smartBoard.include_tags.length > 0) {
    const hasAll = smartBoard.include_tags.every((t) => safeTags.includes(t));
    if (!hasAll) return false;
  }

  if (smartBoard.exclude_tags && smartBoard.exclude_tags.length > 0) {
    const hasExcluded = smartBoard.exclude_tags.some((t) =>
      safeTags.includes(t)
    );
    if (hasExcluded) return false;
  }

  return true;
}

/* ==========================================================================
   1. NAVIGATION MODULE
   ========================================================================== */
const Navigation = {
  isCompactMode: false,

  init() {
    if (DOM.mobileMenuToggle) {
      DOM.mobileMenuToggle.addEventListener("click", () => {
        if (DOM.navFilters) DOM.navFilters.classList.toggle("is-open");
        DOM.mobileMenuToggle.classList.toggle("active-mode");
      });
    }

    if (DOM.folderSelectTrigger) {
      DOM.folderSelectTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (
          DOM.folderSelectOptions &&
          DOM.folderSelectOptions.classList.contains("is-open")
        ) {
          this.closeFolderSelect();
        } else {
          this.closeVirtualBoardSelect();
          SearchTags.hideAutocomplete();
          if (DOM.folderSelectOptions)
            DOM.folderSelectOptions.classList.add("is-open");
          DOM.folderSelectTrigger.classList.add("is-open");

          if (
            window.innerWidth > 768 &&
            document.getElementById("folderFilterInput")
          ) {
            document.getElementById("folderFilterInput").focus();
          }
        }
      });
    }

    if (DOM.virtualBoardSelectTrigger) {
      DOM.virtualBoardSelectTrigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (
          DOM.virtualBoardSelectOptions &&
          DOM.virtualBoardSelectOptions.classList.contains("is-open")
        ) {
          this.closeVirtualBoardSelect();
        } else {
          this.closeFolderSelect();
          SearchTags.hideAutocomplete();
          this.buildVirtualBoardDropdown();
          if (DOM.virtualBoardSelectOptions)
            DOM.virtualBoardSelectOptions.classList.add("is-open");
          DOM.virtualBoardSelectTrigger.classList.add("is-open");
        }
      });
    }

    document.addEventListener("click", (e) => {
      if (
        DOM.folderSelectWrapper &&
        !DOM.folderSelectWrapper.contains(e.target)
      )
        this.closeFolderSelect();
      if (
        DOM.virtualBoardSelectWrapper &&
        !DOM.virtualBoardSelectWrapper.contains(e.target)
      )
        this.closeVirtualBoardSelect();
    });

    if (DOM.resetLogo) {
      DOM.resetLogo.addEventListener("click", () => {
        AppRouter.navigate("/");
      });
    }
  },

  closeFolderSelect() {
    if (DOM.folderSelectOptions)
      DOM.folderSelectOptions.classList.remove("is-open");
    if (DOM.folderSelectTrigger)
      DOM.folderSelectTrigger.classList.remove("is-open");

    const filterInput = document.getElementById("folderFilterInput");
    if (filterInput && filterInput.value !== "") {
      filterInput.value = "";
      this.buildCustomDropdown();
    }
  },

  closeVirtualBoardSelect() {
    if (DOM.virtualBoardSelectOptions)
      DOM.virtualBoardSelectOptions.classList.remove("is-open");
    if (DOM.virtualBoardSelectTrigger)
      DOM.virtualBoardSelectTrigger.classList.remove("is-open");
  },

  getSortedVirtualBoards() {
    let boards = new Set();
    State.allImages.forEach((img) => {
      (img.tags || []).forEach((t) => {
        const str = String(t);
        if (str.startsWith("board:")) boards.add(str.replace("board:", ""));
      });
    });
    (State.smartBoards || []).forEach((sb) => boards.add(sb.name));

    const emptyBoards = JSON.parse(
      localStorage.getItem("tallo_empty_boards") || "[]"
    );
    emptyBoards.forEach((b) => boards.add(b));

    return [...boards].sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    );
  },

  buildVirtualBoardDropdown() {
    if (!DOM.virtualBoardSelectOptions) return;
    const boards = this.getSortedVirtualBoards();
    DOM.virtualBoardSelectOptions.innerHTML = "";

    let currentSearch = "";
    if (DOM.searchInput)
      currentSearch = DOM.searchInput.value.toLowerCase().trim();

    const isActive =
      currentSearch.startsWith("board:") ||
      window.location.pathname.startsWith("/boards");
    if (DOM.virtualBoardSelectTrigger) {
      DOM.virtualBoardSelectTrigger.classList.toggle("active-mode", isActive);
    }

    const viewAllItem = document.createElement("div");
    viewAllItem.className = "tree-item";
    viewAllItem.innerHTML = `<div class="tree-header view-all-boards"><span class="tree-name" style="font-weight: 600; color: var(--select-color);">❖ View All Boards</span></div>`;
    viewAllItem.addEventListener("click", (e) => {
      e.stopPropagation();
      this.closeVirtualBoardSelect();
      AppRouter.navigate("/boards");
    });
    DOM.virtualBoardSelectOptions.appendChild(viewAllItem);

    if (boards.length === 0) {
      const emptyMsg = document.createElement("div");
      emptyMsg.style.padding = "16px";
      emptyMsg.style.fontSize = "0.8rem";
      emptyMsg.style.color = "var(--text-secondary)";
      emptyMsg.style.textAlign = "center";
      emptyMsg.innerHTML = `No boards yet.<br><br>Open a photo and click the bookmark icon to create one!`;
      DOM.virtualBoardSelectOptions.appendChild(emptyMsg);
      return;
    }

    boards.forEach((board) => {
      const item = document.createElement("div");
      item.className = "tree-item";

      const header = document.createElement("div");
      header.className = `tree-header ${
        currentSearch === `board:${board.toLowerCase()}` ? "is-selected" : ""
      }`;
      header.style.paddingLeft = "16px";

      const isSmart = (State.smartBoards || []).some(
        (sb) => sb.name.toLowerCase() === board.toLowerCase()
      );
      const iconHTML = isSmart
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px; color: var(--select-color); vertical-align: -1px;"><path d="M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74z"/><path d="m20 14.285 1.5.845a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74l1.5-.845"/></svg>`
        : ``;

      header.innerHTML = `${iconHTML}<span class="tree-name" style="text-transform: capitalize;">${board}</span>`;

      header.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeVirtualBoardSelect();
        if (DOM.navFilters) DOM.navFilters.classList.remove("is-open");
        AppRouter.navigate(`/boards/${board}`);
      });

      item.appendChild(header);
      DOM.virtualBoardSelectOptions.appendChild(item);
    });
  },

  getSortedFolders() {
    const rawFolders = State.allImages.map((img) => img.board).filter((b) => b);
    let allFolders = new Set();
    rawFolders.forEach((folder) => {
      let parts = folder.split("/");
      let currentPath = "";
      for (let i = 0; i < parts.length; i++) {
        currentPath = currentPath ? currentPath + "/" + parts[i] : parts[i];
        allFolders.add(currentPath);
      }
    });
    return [
      "All",
      ...[...allFolders].sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
      ),
    ];
  },

  buildCustomDropdown() {
    const folders = this.getSortedFolders();
    if (!DOM.folderSelectOptions) return;
    DOM.folderSelectOptions.innerHTML = "";

    if (DOM.folderSelectTrigger) {
      DOM.folderSelectTrigger.title =
        State.currentFolder === "All" ? "All Folders" : State.currentFolder;
      const isFolderActive =
        State.currentFolder !== "All" &&
        !window.location.pathname.startsWith("/boards");
      DOM.folderSelectTrigger.classList.toggle("active-mode", isFolderActive);
    }

    const totalFolders = folders.length - 1;
    this.isCompactMode = totalFolders > 40;

    const tree = {};
    folders.forEach((path) => {
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
    searchBox.className = "folder-search-container";
    searchBox.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 16px; top: 14px; color: var(--text-secondary);"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      <input type="text" id="folderFilterInput" placeholder="Filter folders..." autocomplete="off">
    `;
    DOM.folderSelectOptions.appendChild(searchBox);

    const filterInput = searchBox.querySelector("#folderFilterInput");
    if (filterInput) {
      filterInput.addEventListener("click", (e) => e.stopPropagation());
      filterInput.addEventListener("input", (e) =>
        this.filterTree(e.target.value)
      );
    }

    this.treeContainer = document.createElement("div");
    this.treeContainer.className = "folder-tree-container";
    DOM.folderSelectOptions.appendChild(this.treeContainer);

    this.renderNode(
      { name: "All Folders", fullPath: "All", children: {} },
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
      State.currentFolder === node.fullPath &&
      !window.location.pathname.startsWith("/boards")
        ? "is-selected"
        : ""
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

    html += `<span class="tree-name ${isAll ? "all-folders-opt" : ""}">${
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
      this.closeFolderSelect();
      if (DOM.navFilters) DOM.navFilters.classList.remove("is-open");
      if (DOM.mobileMenuToggle)
        DOM.mobileMenuToggle.classList.remove("active-mode");
      const targetPath = node.fullPath === "All" ? "/" : "/" + node.fullPath;
      AppRouter.navigate(targetPath);
    });

    item.appendChild(header);

    if (hasChildren) {
      const childrenContainer = document.createElement("div");
      childrenContainer.className = "tree-children";
      childrenContainer.style.display = isCollapsed ? "none" : "block";
      Object.values(node.children).forEach((child) =>
        this.renderNode(child, childrenContainer, depth + 1, false)
      );
      item.appendChild(childrenContainer);
    }
    container.appendChild(item);
  },

  filterTree(query) {
    const q = query.toLowerCase().trim();
    if (!this.treeContainer) return;
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
};

/* ==========================================================================
   2. SEARCH & TAGS MODULE
   ========================================================================== */
const SearchTags = {
  init() {
    if (DOM.searchInput) {
      DOM.searchInput.addEventListener("focus", (e) => {
        Navigation.closeFolderSelect();
        Navigation.closeVirtualBoardSelect();
        if (window.innerWidth <= 768 && DOM.navEl)
          DOM.navEl.classList.add("keyboard-open");
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
          if (DOM.navEl) DOM.navEl.classList.remove("keyboard-open");
        }, 200);
      });

      DOM.searchInput.addEventListener("keydown", (e) => {
        if (this.handleKeyboardNav(e)) return;
        if (e.key === "Enter" && State.autocomplete.activeIndex === -1) {
          e.preventDefault();
          DOM.searchInput.blur();
        }
      });
    }

    if (DOM.clearSearchBtn) {
      DOM.clearSearchBtn.addEventListener("click", () => {
        if (DOM.searchInput) DOM.searchInput.value = "";
        this.applyFiltersAndRender();
        if (DOM.searchInput) DOM.searchInput.focus();
      });
    }

    if (DOM.shuffleBtn) {
      DOM.shuffleBtn.addEventListener("click", () => {
        State.isShuffled = !State.isShuffled;
        DOM.shuffleBtn.classList.toggle("active-mode", State.isShuffled);
        this.applyFiltersAndRender();
      });
    }
  },

  updateGlobalTags() {
    let freq = {};
    let untaggedCount = 0;
    let favoriteCount = 0;
    let videoCount = 0;
    const activeFolderImages = State.getActiveFolderImages();

    activeFolderImages.forEach((img) => {
      let hasRealTag = false;
      const safeTags = img.tags || [];

      if (safeTags.includes("is:favorite")) favoriteCount++;

      if ((img.filename || "").toLowerCase().match(/\.(webm|mp4|mov)$/)) {
        videoCount++;
      }

      safeTags.forEach((t) => {
        const str = String(t);
        if (
          !str.startsWith("http://") &&
          !str.startsWith("https://") &&
          str !== "is:favorite" &&
          !str.startsWith("board:")
        ) {
          freq[str] = (freq[str] || 0) + 1;
          hasRealTag = true;
        }
      });
      if (!hasRealTag) untaggedCount++;
    });

    const sortedByFreq = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0]);
    State.allKnownTags = sortedByFreq;

    if (!DOM.globalTagCloud) return;
    DOM.globalTagCloud.innerHTML = "";

    if (favoriteCount > 0) {
      const favSpan = document.createElement("span");
      favSpan.className = "cloud-tag favorite-tag";
      if (State.activeCloudTag === "is:favorite")
        favSpan.classList.add("active");
      favSpan.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg> Favorites (${favoriteCount})`;

      favSpan.addEventListener("click", () => {
        if (State.isSelectMode) return;
        State.activeCloudTag =
          State.activeCloudTag === "is:favorite" ? null : "is:favorite";
        if (DOM.searchInput) DOM.searchInput.value = State.activeCloudTag || "";
        this.updateGlobalTags();
        this.applyFiltersAndRender();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      DOM.globalTagCloud.appendChild(favSpan);
    }

    if (videoCount > 0) {
      const videoSpan = document.createElement("span");
      videoSpan.className = "cloud-tag system-tag";
      if (State.activeCloudTag === "is:video")
        videoSpan.classList.add("active");
      videoSpan.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> Videos (${videoCount})`;

      videoSpan.addEventListener("click", () => {
        if (State.isSelectMode) return;
        State.activeCloudTag =
          State.activeCloudTag === "is:video" ? null : "is:video";
        if (DOM.searchInput) DOM.searchInput.value = State.activeCloudTag || "";
        this.updateGlobalTags();
        this.applyFiltersAndRender();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      DOM.globalTagCloud.appendChild(videoSpan);
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
          State.activeCloudTag = State.activeCloudTag === tag ? null : tag;
          if (DOM.searchInput)
            DOM.searchInput.value = State.activeCloudTag || "";
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
        State.activeCloudTag =
          State.activeCloudTag === "is:untagged" ? null : "is:untagged";
        if (DOM.searchInput) DOM.searchInput.value = State.activeCloudTag || "";
        this.updateGlobalTags();
        this.applyFiltersAndRender();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      DOM.globalTagCloud.appendChild(untaggedSpan);
    }
  },

  applyFiltersAndRender() {
    let query = "";
    if (DOM.searchInput) query = DOM.searchInput.value.toLowerCase().trim();

    State.lastSelectedIndex = null;
    State.currentPage = 1;

    let baseArray = State.getActiveFolderImages();

    if (!query) {
      if (DOM.searchWrapper) DOM.searchWrapper.classList.remove("is-active");
      Navigation.buildVirtualBoardDropdown();
      Gallery.render(
        State.isShuffled ? Utils.shuffleArray([...baseArray]) : baseArray
      );
      return;
    }

    if (DOM.searchWrapper) DOM.searchWrapper.classList.add("is-active");
    Navigation.buildVirtualBoardDropdown();
    let filtered;

    if (query.startsWith("board:")) {
      const boardName = query.replace("board:", "").trim();
      const smartBoard = (State.smartBoards || []).find(
        (sb) => sb.name.toLowerCase() === boardName
      );

      if (smartBoard) {
        filtered = baseArray.filter((img) =>
          isImageInSmartBoard(img, smartBoard)
        );
      } else {
        filtered = baseArray.filter((img) =>
          (img.tags || []).some((tag) => String(tag).toLowerCase() === query)
        );
      }
    } else if (query === "is:untagged") {
      filtered = baseArray.filter(
        (img) =>
          !(img.tags || []).some((tag) => {
            const str = String(tag);
            return (
              !str.startsWith("http") &&
              str !== "is:favorite" &&
              !str.startsWith("board:")
            );
          })
      );
    } else if (query === "is:favorite") {
      filtered = baseArray.filter((img) =>
        (img.tags || []).includes("is:favorite")
      );
    } else if (query === "is:video") {
      filtered = baseArray.filter((img) =>
        (img.filename || "").toLowerCase().match(/\.(webm|mp4|mov)$/)
      );
    } else {
      filtered = baseArray.filter(
        (img) =>
          (img.tags || []).some(
            (tag) =>
              String(tag).toLowerCase().includes(query) &&
              String(tag) !== "is:favorite"
          ) ||
          (img.filename || "").toLowerCase().includes(query) ||
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
    if (DOM.autocompleteBox) DOM.autocompleteBox.style.display = "none";
    State.autocomplete.inputEl = null;
    State.autocomplete.activeIndex = -1;
  },

  filterAutocomplete(query) {
    const ac = State.autocomplete;
    if (!ac.inputEl || !DOM.autocompleteBox) return;

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
            (t) => t.includes(q) && !(ac.imgData.tags || []).includes(t)
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
            if (!ac.imgData.tags) ac.imgData.tags = [];
            ac.imgData.tags.push(selectedTag);
            API.saveMetadata(ac.imgData);
            this.updateGlobalTags();

            if (ac.tagsListEl) {
              ac.tagsListEl.innerHTML = "";
              Utils.sortTags(ac.imgData.tags).forEach((t) => {
                if (t !== "is:favorite" && !String(t).startsWith("board:")) {
                  ac.tagsListEl.appendChild(
                    Gallery.createTagElement(t, ac.imgData, ac.tagsListEl)
                  );
                }
              });
            }
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
    const isDropdownOpen =
      DOM.autocompleteBox && DOM.autocompleteBox.style.display === "flex";
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
   3. LIGHTBOX MODULE
   ========================================================================== */
const Lightbox = {
  init() {
    if (DOM.lightboxClose)
      DOM.lightboxClose.addEventListener("click", () => this.close());
    if (DOM.lightbox)
      DOM.lightbox.addEventListener("click", (e) => {
        if (e.target === DOM.lightbox) this.close();
      });

    if (DOM.lightboxContent) {
      DOM.lightboxContent.addEventListener("click", (e) => {
        if (DOM.lightbox.classList.contains("is-editing")) return;
        DOM.lightbox.classList.toggle("hide-ui");
      });
    }

    if (DOM.lightbox) {
      const lockScroll = (e) => {
        if (!DOM.lightbox.classList.contains("is-editing")) e.preventDefault();
      };
      DOM.lightbox.addEventListener("touchmove", lockScroll, {
        passive: false,
      });
      DOM.lightbox.addEventListener("wheel", lockScroll, { passive: false });
    }

    let touchStartX = 0,
      touchStartY = 0,
      touchEndX = 0,
      touchEndY = 0;

    if (DOM.lightbox) {
      DOM.lightbox.addEventListener(
        "touchstart",
        (e) => {
          touchStartX = e.changedTouches[0].screenX;
          touchStartY = e.changedTouches[0].screenY;
        },
        { passive: true }
      );

      DOM.lightbox.addEventListener(
        "touchend",
        (e) => {
          touchEndX = e.changedTouches[0].screenX;
          touchEndY = e.changedTouches[0].screenY;

          if (DOM.lightbox.classList.contains("is-editing")) return;

          const deltaX = touchEndX - touchStartX;
          const deltaY = touchEndY - touchStartY;

          if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
            let newIndex = State.currentLightboxIndex + (deltaX < 0 ? 1 : -1);
            if (newIndex >= State.renderList.length) newIndex = 0;
            if (newIndex < 0) newIndex = State.renderList.length - 1;
            if (State.renderList.length > 0) Lightbox.open(newIndex);
          }
        },
        { passive: true }
      );
    }

    if (DOM.lightboxBoardBtn) {
      DOM.lightboxBoardBtn.addEventListener("click", () => BoardModal.open());
    }

    if (DOM.lightboxFavoriteBtn) {
      DOM.lightboxFavoriteBtn.addEventListener("click", () => {
        if (State.currentLightboxIndex > -1) {
          const imgData = State.renderList[State.currentLightboxIndex];
          if (!imgData.tags) imgData.tags = [];
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

          const gridCardFavBtn = document.querySelector(
            `.glass-card[data-filename="${imgData.filename}"] .card-favorite-btn`
          );
          if (gridCardFavBtn)
            gridCardFavBtn.classList.toggle("is-active", !isFav);
        }
      });
    }

    if (DOM.lightboxEditDescBtn) {
      DOM.lightboxEditDescBtn.addEventListener("click", () => {
        if (!DOM.lightbox) return;
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

          if (State.currentLightboxIndex > -1) {
            const newDesc = DOM.lightboxDescription
              ? DOM.lightboxDescription.value.trim()
              : "";
            if (newDesc) {
              if (DOM.lightboxDescText) {
                DOM.lightboxDescText.textContent = newDesc;
                DOM.lightboxDescText.style.display = "block";
              }
              if (DOM.lightboxDescription)
                DOM.lightboxDescription.style.display = "none";
            } else {
              if (DOM.lightboxDescContainer)
                DOM.lightboxDescContainer.style.display = "none";
              if (DOM.lightboxDescText) DOM.lightboxDescText.textContent = "";
              if (DOM.lightboxDescription)
                DOM.lightboxDescription.style.display = "none";
            }
          }
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
        }
      });
    }

    if (DOM.lightboxContextBtn) {
      DOM.lightboxContextBtn.addEventListener("click", () => {
        const targetImage = State.renderList[State.currentLightboxIndex];
        if (!targetImage) return;

        this.close({ skipHistoryBack: true });

        State.isShuffled = false;
        if (DOM.shuffleBtn) DOM.shuffleBtn.classList.remove("active-mode");

        if (DOM.searchInput) DOM.searchInput.value = "";
        State.activeCloudTag = null;
        if (DOM.searchWrapper) DOM.searchWrapper.classList.remove("is-active");
        SearchTags.updateGlobalTags();
        Navigation.buildVirtualBoardDropdown();

        const baseArray = State.getActiveFolderImages();
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
    }

    let deleteConfirmTimer;
    if (DOM.lightboxDeleteBtn) {
      DOM.lightboxDeleteBtn.addEventListener("click", async () => {
        const targetImage = State.renderList[State.currentLightboxIndex];
        if (!targetImage) return;

        if (!DOM.lightboxDeleteBtn.classList.contains("confirm-delete")) {
          DOM.lightboxDeleteBtn.classList.add("confirm-delete");
          Toast.show("Click again to permanently delete");

          clearTimeout(deleteConfirmTimer);
          deleteConfirmTimer = setTimeout(() => {
            if (DOM.lightboxDeleteBtn)
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
        const originalRenderIndex = State.renderList.findIndex(
          (img) => img.filename === targetImage.filename
        );

        State.allImages = State.allImages.filter(
          (img) => img.filename !== targetImage.filename
        );
        State.renderList = State.renderList.filter(
          (img) => img.filename !== targetImage.filename
        );

        this.close({ skipHistoryBack: true });
        SearchTags.updateGlobalTags();
        Navigation.buildVirtualBoardDropdown();
        Gallery.render(State.renderList, true);

        const physicalDeleteTimer = setTimeout(async () => {
          await API.deleteMedia(deletedImage.filename);
        }, 4500);

        Toast.show("File deleted.", () => {
          clearTimeout(physicalDeleteTimer);
          if (originalIndex > -1)
            State.allImages.splice(originalIndex, 0, deletedImage);
          else State.allImages.push(deletedImage);

          if (originalRenderIndex > -1)
            State.renderList.splice(originalRenderIndex, 0, deletedImage);
          else State.renderList.push(deletedImage);

          SearchTags.updateGlobalTags();
          Navigation.buildVirtualBoardDropdown();
          Gallery.render(State.renderList, true);
        });
      });
    }

    let ignoreConfirmTimer;
    if (DOM.lightboxIgnoreBtn) {
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
            if (DOM.lightboxIgnoreBtn)
              DOM.lightboxIgnoreBtn.classList.remove("confirm-delete");
          }, 3000);
          return;
        }

        clearTimeout(ignoreConfirmTimer);
        if (DOM.lightboxIgnoreBtn)
          DOM.lightboxIgnoreBtn.classList.remove("confirm-delete");

        await API.ignoreFolder(targetImage.board);

        State.allImages = State.allImages.filter(
          (img) => !img.board || !img.board.startsWith(targetImage.board)
        );
        State.renderList = State.renderList.filter(
          (img) => !img.board || !img.board.startsWith(targetImage.board)
        );

        this.close({ skipHistoryBack: true });

        if (State.currentFolder.startsWith(targetImage.board)) {
          AppRouter.navigate("/");
        }

        Navigation.buildCustomDropdown();
        SearchTags.updateGlobalTags();
        Navigation.buildVirtualBoardDropdown();
        Gallery.render(State.renderList, true);

        Toast.show(`Folder hidden! Edit .talloignore file to undo.`);
      });
    }
  },

  open(index) {
    if (index < 0 || index >= State.renderList.length) return;

    State.isLightboxOpen = true;

    if (DOM.lightbox) DOM.lightbox.classList.remove("is-editing");

    if (DOM.lightbox && !DOM.lightbox.classList.contains("is-active")) {
      window.history.pushState(
        { lightbox: true },
        "",
        window.location.pathname
      );
    } else {
      window.history.replaceState(
        { lightbox: true },
        "",
        window.location.pathname
      );
    }

    State.currentLightboxIndex = index;
    const imgData = State.renderList[index];

    if (DOM.lightboxContent) DOM.lightboxContent.innerHTML = "";
    if (DOM.lightboxTags) DOM.lightboxTags.innerHTML = "";

    if (DOM.lightboxFavoriteBtn) {
      DOM.lightboxFavoriteBtn.classList.toggle(
        "is-active",
        (imgData.tags || []).includes("is:favorite")
      );
    }

    const descText = imgData.description || "";
    if (descText) {
      if (DOM.lightboxDescContainer)
        DOM.lightboxDescContainer.style.display = "block";
      if (DOM.lightboxDescText) {
        DOM.lightboxDescText.textContent = descText;
        DOM.lightboxDescText.style.display = "block";
      }
      if (DOM.lightboxDescription)
        DOM.lightboxDescription.style.display = "none";
    } else {
      if (DOM.lightboxDescContainer)
        DOM.lightboxDescContainer.style.display = "none";
      if (DOM.lightboxDescText) DOM.lightboxDescText.textContent = "";
      if (DOM.lightboxDescription)
        DOM.lightboxDescription.style.display = "none";
    }
    if (DOM.lightboxDescription) DOM.lightboxDescription.value = descText;

    const quickBoardsContainer = document.getElementById("lightboxQuickBoards");
    if (quickBoardsContainer) {
      quickBoardsContainer.innerHTML = "";

      const currentPath = window.location.pathname;
      let activeBoardContext = null;
      if (currentPath.startsWith("/boards/")) {
        activeBoardContext = decodeURIComponent(
          currentPath.replace("/boards/", "")
        ).toLowerCase();
      } else if (
        DOM.searchInput &&
        DOM.searchInput.value.toLowerCase().startsWith("board:")
      ) {
        activeBoardContext = DOM.searchInput.value
          .toLowerCase()
          .replace("board:", "")
          .trim();
      }

      const activeSmartBoard = (State.smartBoards || []).find(
        (sb) => sb.name.toLowerCase() === activeBoardContext
      );
      if (activeSmartBoard) {
        const btn = document.createElement("button");
        btn.className = "quick-board-btn is-active";
        btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> ${activeSmartBoard.name}`;

        btn.addEventListener("click", async (e) => {
          e.stopPropagation();

          if (!activeSmartBoard.excluded_filenames.includes(imgData.filename)) {
            activeSmartBoard.excluded_filenames.push(imgData.filename);
            await API.saveSmartBoards();

            Toast.show(`Excluded from ${activeSmartBoard.name}`, async () => {
              activeSmartBoard.excluded_filenames =
                activeSmartBoard.excluded_filenames.filter(
                  (f) => f !== imgData.filename
                );
              await API.saveSmartBoards();
              SearchTags.applyFiltersAndRender();
            });

            SearchTags.applyFiltersAndRender();
            btn.style.opacity = "0";
            setTimeout(() => btn.remove(), 200);
          }
        });
        quickBoardsContainer.appendChild(btn);
      }

      const recentBoards = [];
      for (let img of State.allImages) {
        if (recentBoards.length >= 3) break;
        (img.tags || []).forEach((t) => {
          const str = String(t);
          if (str.startsWith("board:")) {
            const bName = str.replace("board:", "");
            if (!recentBoards.includes(bName)) recentBoards.push(bName);
          }
        });
      }

      recentBoards.forEach((bName) => {
        const btn = document.createElement("button");
        btn.className = "quick-board-btn";
        const newTag = `board:${bName.toLowerCase()}`;

        const updateBtnVisuals = () => {
          const isAlreadyInBoard = (imgData.tags || []).includes(newTag);
          if (isAlreadyInBoard) {
            btn.classList.add("is-active");
            btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg> ${bName}`;
          } else {
            btn.classList.remove("is-active");
            btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> ${bName}`;
          }
        };

        updateBtnVisuals();

        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (!imgData.tags) imgData.tags = [];

          const isAlreadyInBoard = imgData.tags.includes(newTag);

          if (isAlreadyInBoard) {
            imgData.tags = imgData.tags.filter((t) => t !== newTag);
            await API.saveMetadata(imgData);
            Toast.show(`Removed from ${bName}`);
          } else {
            imgData.tags.push(newTag);
            await API.saveMetadata(imgData);
            Toast.show(`Added to ${bName}`);
          }

          SearchTags.updateGlobalTags();
          Navigation.buildVirtualBoardDropdown();
          updateBtnVisuals();
        });

        quickBoardsContainer.appendChild(btn);
      });
    }

    const isVideo = (imgData.filename || "")
      .toLowerCase()
      .match(/\.(webm|mp4)$/);
    let mediaEl;
    if (isVideo) {
      mediaEl = document.createElement("video");
      mediaEl.autoplay = true;
      mediaEl.loop = true;
      mediaEl.controls = true;
      mediaEl.preload = "metadata";

      const savedTime = localStorage.getItem(
        `tallo_progress_${imgData.filename}`
      );
      if (savedTime) {
        mediaEl.currentTime = parseFloat(savedTime);
      }

      mediaEl.addEventListener("timeupdate", () => {
        if (mediaEl.currentTime > 2) {
          localStorage.setItem(
            `tallo_progress_${imgData.filename}`,
            mediaEl.currentTime
          );
        } else {
          localStorage.removeItem(`tallo_progress_${imgData.filename}`);
        }
      });
    } else {
      mediaEl = document.createElement("img");
    }
    mediaEl.src = imgData.url;

    if (isVideo && imgData.poster) {
      mediaEl.poster = imgData.poster;
    }

    if (isVideo && imgData.subtitle) {
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = "English";
      track.srclang = "en";
      track.src = imgData.subtitle;
      track.default = true;
      mediaEl.appendChild(track);
    }

    if (DOM.lightboxContent) DOM.lightboxContent.appendChild(mediaEl);

    Utils.sortTags(imgData.tags || []).forEach((tagText) => {
      if (tagText !== "is:favorite" && !String(tagText).startsWith("board:")) {
        if (DOM.lightboxTags) {
          DOM.lightboxTags.appendChild(
            Gallery.createTagElement(tagText, imgData, DOM.lightboxTags, true)
          );
        }
      }
    });

    document.querySelectorAll("#gallery video").forEach((vid) => vid.pause());

    setTimeout(() => {
      if (State.isLightboxOpen) {
        document
          .querySelectorAll("#gallery video")
          .forEach((vid) => vid.pause());
      }
    }, 150);

    document.body.classList.add("lightbox-open");
    if (DOM.lightbox) DOM.lightbox.classList.add("is-active");
  },

  close(options = {}) {
    const { fromPopState = false, skipHistoryBack = false } = options;

    State.isLightboxOpen = false;

    if (
      !fromPopState &&
      window.history.state &&
      window.history.state.lightbox
    ) {
      if (skipHistoryBack) {
        window.history.replaceState({}, "", window.location.pathname);
      } else {
        window.history.back();
        return;
      }
    }

    if (DOM.lightbox) {
      DOM.lightbox.classList.remove("is-active");
      DOM.lightbox.classList.remove("is-editing");
      DOM.lightbox.classList.remove("hide-ui");
    }
    document.body.classList.remove("lightbox-open");
    State.currentLightboxIndex = -1;
    if (DOM.lightboxDescContainer)
      DOM.lightboxDescContainer.style.display = "none";
    if (DOM.lightboxDeleteBtn)
      DOM.lightboxDeleteBtn.classList.remove("confirm-delete");
    if (DOM.lightboxIgnoreBtn)
      DOM.lightboxIgnoreBtn.classList.remove("confirm-delete");

    setTimeout(() => {
      if (DOM.lightboxContent) DOM.lightboxContent.innerHTML = "";
      if (DOM.lightboxTags) DOM.lightboxTags.innerHTML = "";
      window.dispatchEvent(new Event("lightbox-closed"));
    }, 300);
  },
};

/* ==========================================================================
   4. GALLERY UI MODULE
   ========================================================================== */
const Gallery = {
  init() {
    if (DOM.selectModeBtn) {
      DOM.selectModeBtn.addEventListener("click", () =>
        this.toggleSelectMode()
      );
    }
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
    if (DOM.selectModeBtn)
      DOM.selectModeBtn.classList.toggle("active-mode", State.isSelectMode);

    if (DOM.batchBoardBtn) {
      DOM.batchBoardBtn.style.display = State.isSelectMode ? "flex" : "none";
    }

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
      this.createCard(
        State.renderList[globalIndex],
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

    const favBtn = document.createElement("button");
    favBtn.className = "card-favorite-btn";
    if ((imgData.tags || []).includes("is:favorite"))
      favBtn.classList.add("is-active");
    favBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;

    favBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!imgData.tags) imgData.tags = [];
      const isFav = imgData.tags.includes("is:favorite");
      const targetState = !isFav;

      if (State.isSelectMode && State.selectedImages.has(imgData.filename)) {
        let promises = [];
        let count = 0;

        State.getActiveFolderImages().forEach((img) => {
          if (State.selectedImages.has(img.filename)) {
            if (!img.tags) img.tags = [];
            const currentlyFav = img.tags.includes("is:favorite");

            if (targetState && !currentlyFav) {
              img.tags.push("is:favorite");
              promises.push(API.saveMetadata(img));
              count++;
            } else if (!targetState && currentlyFav) {
              img.tags = img.tags.filter((t) => t !== "is:favorite");
              promises.push(API.saveMetadata(img));
              count++;
            }

            const renderedCardFavBtn = document.querySelector(
              `.glass-card[data-filename="${img.filename}"] .card-favorite-btn`
            );
            if (renderedCardFavBtn) {
              renderedCardFavBtn.classList.toggle("is-active", targetState);
            }
          }
        });

        if (promises.length > 0) {
          Toast.show(`Updating ${count} item${count !== 1 ? "s" : ""}...`);
          await Promise.all(promises);
        }
        SearchTags.updateGlobalTags();
      } else {
        if (isFav) {
          imgData.tags = imgData.tags.filter((t) => t !== "is:favorite");
          favBtn.classList.remove("is-active");
        } else {
          imgData.tags.push("is:favorite");
          favBtn.classList.add("is-active");
        }
        API.saveMetadata(imgData);
        SearchTags.updateGlobalTags();
      }
    });
    card.appendChild(favBtn);

    let lastClickTime = 0;
    card.addEventListener("click", (e) => {
      if (
        e.target.tagName === "INPUT" ||
        e.target.classList.contains("tag-del") ||
        e.target.closest(".tag") ||
        e.target.closest(".card-favorite-btn")
      )
        return;
      const currentTime = new Date().getTime();
      const isDoubleClick =
        currentTime - lastClickTime < 300 && currentTime - lastClickTime > 0;
      lastClickTime = currentTime;

      if (State.isSelectMode) {
        if (e.shiftKey && State.lastSelectedIndex !== null) {
          const start = Math.min(State.lastSelectedIndex, globalIndex);
          const end = Math.max(State.lastSelectedIndex, globalIndex);
          for (let i = start; i <= end; i++) {
            State.selectedImages.add(State.renderList[i].filename);
            const renderedCard = document.querySelector(
              `.glass-card[data-filename="${State.renderList[i].filename}"]`
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

            if (isVideo && imgData.poster) {
              if (mediaEl.paused) {
                const playPromise = mediaEl.play();
                if (playPromise !== undefined) playPromise.catch(() => {});
              } else {
                mediaEl.pause();
              }
            }
          }
        } else {
          Lightbox.open(globalIndex);
        }
      }
    });

    const isVideo = (imgData.filename || "")
      .toLowerCase()
      .match(/\.(webm|mp4)$/);
    let mediaEl;

    if (isVideo) {
      mediaEl = document.createElement("video");
      mediaEl.src = imgData.url;
      mediaEl.loading = "lazy";
      mediaEl.loop = true;
      mediaEl.muted = true;
      mediaEl.preload = "metadata";
      mediaEl.playsInline = true;

      if (imgData.poster) {
        mediaEl.poster = imgData.poster;
        mediaEl.autoplay = false;
        mediaEl.dataset.hoverOnly = "true";

        card.addEventListener("mouseenter", () => {
          const playPromise = mediaEl.play();
          if (playPromise !== undefined) playPromise.catch(() => {});
        });

        card.addEventListener("mouseleave", () => {
          mediaEl.pause();
          mediaEl.load();
        });
      } else {
        mediaEl.autoplay = true;
        VideoObserver.observe(mediaEl);
      }
      if (imgData.subtitle) {
        const track = document.createElement("track");
        track.kind = "subtitles";
        track.label = "English";
        track.srclang = "en";
        track.src = imgData.subtitle;
        track.default = true;
        mediaEl.appendChild(track);
      }
    } else {
      mediaEl = document.createElement("img");
      mediaEl.src = imgData.url;
    }

    const tagContainer = document.createElement("div");
    tagContainer.className = "tag-container";
    const tagsList = document.createElement("div");
    tagsList.className = "tags-list";

    Utils.sortTags(imgData.tags || []).forEach((tag) => {
      if (tag !== "is:favorite" && !String(tag).startsWith("board:")) {
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
          } else if (!(imgData.tags || []).includes(newTag)) {
            if (!imgData.tags) imgData.tags = [];
            imgData.tags.push(newTag);
            API.saveMetadata(imgData);
            SearchTags.updateGlobalTags();
            Navigation.buildVirtualBoardDropdown();
            tagsList.innerHTML = "";
            Utils.sortTags(imgData.tags).forEach((t) => {
              if (t !== "is:favorite" && !String(t).startsWith("board:")) {
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
    if (isVideo && imgData.poster) {
      const vidBadge = document.createElement("div");
      vidBadge.className = "video-indicator";
      vidBadge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      card.appendChild(vidBadge);
    }
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
    if (tagText === "All Folders") tag.style.fontSize = "0.2rem";

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
      Navigation.buildVirtualBoardDropdown();

      tagsListEl.innerHTML = "";
      Utils.sortTags(imgData.tags).forEach((t) => {
        if (t !== "is:favorite" && !String(t).startsWith("board:")) {
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
            if (t !== "is:favorite" && !String(t).startsWith("board:")) {
              bgCardTags.appendChild(
                this.createTagElement(t, imgData, bgCardTags, false)
              );
            }
          });
        }
      }

      Toast.show(`Removed tag: ${tagText}`, () => {
        if (!imgData.tags) imgData.tags = [];
        imgData.tags.push(tagText);
        API.saveMetadata(imgData);
        SearchTags.updateGlobalTags();
        Navigation.buildVirtualBoardDropdown();

        tagsListEl.innerHTML = "";
        Utils.sortTags(imgData.tags).forEach((t) => {
          if (t !== "is:favorite" && !String(t).startsWith("board:")) {
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
              if (t !== "is:favorite" && !String(t).startsWith("board:")) {
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
      if (DOM.searchInput) DOM.searchInput.value = tagText;
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

      if (State.currentPage > 1)
        container.appendChild(createPageBtn("←", State.currentPage - 1));

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
      range.unshift(1);
      if (State.currentPage + delta < totalPages - 1) range.push("...");
      if (totalPages > 1) range.push(totalPages);

      range.forEach((i) => {
        if (i === "...")
          container.appendChild(createPageBtn("...", null, false, true));
        else
          container.appendChild(createPageBtn(i, i, State.currentPage === i));
      });

      if (State.currentPage < totalPages)
        container.appendChild(createPageBtn("→", State.currentPage + 1));

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
              targetPage = Math.max(1, Math.min(targetPage, totalPages));
              if (targetPage !== State.currentPage) {
                State.currentPage = targetPage;
                this.render(State.renderList, true);
              }
            }
            jumpInput.value = "";
            jumpInput.blur();
          }
        });
        container.appendChild(jumpInput);
      }
    };

    buildPaginationUI(DOM.topPaginationContainer);
    buildPaginationUI(DOM.paginationContainer);
  },

  async applyBatchTag(tagText) {
    let promises = [];
    State.getActiveFolderImages().forEach((img) => {
      if (
        State.selectedImages.has(img.filename) &&
        !(img.tags || []).includes(tagText)
      ) {
        if (!img.tags) img.tags = [];
        img.tags.push(tagText);
        promises.push(API.saveMetadata(img));
        document.querySelectorAll(".glass-card").forEach((card) => {
          if (card.dataset.filename === img.filename) {
            const tagsList = card.querySelector(".tags-list");
            if (tagsList) {
              tagsList.innerHTML = "";
              Utils.sortTags(img.tags).forEach((t) => {
                if (t !== "is:favorite" && !String(t).startsWith("board:")) {
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
    Navigation.buildVirtualBoardDropdown();
  },
};

/* ==========================================================================
   5. BOARDS HOMEPAGE CONTROLLER
   ========================================================================== */
const Boards = {
  init() {
    document.querySelectorAll(".sort-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document
          .querySelectorAll(".sort-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        State.boardSort = btn.dataset.sort;
        this.renderHome();
      });
    });

    const createSmartBtn = document.getElementById("createSmartBoardBtn");
    if (createSmartBtn) {
      createSmartBtn.addEventListener("click", () => {
        SmartBoardModal.open();
      });
    }

    const createRegBtn = document.getElementById("createRegularBoardBtn");
    if (createRegBtn) {
      createRegBtn.addEventListener("click", async () => {
        const renameTitle = document.querySelector("#renameModalOverlay h3");
        const renameDesc = document.querySelector("#renameModalDesc");
        const oldTitle = renameTitle ? renameTitle.textContent : "";
        const oldDesc = renameDesc ? renameDesc.textContent : "";

        if (renameTitle) renameTitle.textContent = "New Board";
        if (renameDesc)
          renameDesc.textContent = "Enter a name for the new board.";

        const newNameRaw = await ActionModals.prompt("");

        if (renameTitle) renameTitle.textContent = oldTitle;
        if (renameDesc) renameDesc.textContent = oldDesc;

        if (newNameRaw && newNameRaw.trim()) {
          const cleanName = newNameRaw.trim();
          const allBoards = Navigation.getSortedVirtualBoards().map((b) =>
            b.toLowerCase()
          );

          if (allBoards.includes(cleanName.toLowerCase())) {
            Toast.show("A board with this name already exists.");
            return;
          }

          let emptyBoards = JSON.parse(
            localStorage.getItem("tallo_empty_boards") || "[]"
          );
          emptyBoards.push(cleanName);
          localStorage.setItem(
            "tallo_empty_boards",
            JSON.stringify(emptyBoards)
          );

          Toast.show(`Board created: ${cleanName}`);
          Navigation.buildVirtualBoardDropdown();
          Boards.renderHome();
        }
      });
    }
  },

  renderHome() {
    if (!DOM.boardsGrid) return;
    const boardsMap = new Map();

    State.allImages.forEach((img, index) => {
      (img.tags || []).forEach((t) => {
        const strTag = String(t);
        if (strTag.startsWith("board:")) {
          const bName = strTag.replace("board:", "");
          if (!boardsMap.has(bName)) {
            boardsMap.set(bName, {
              count: 0,
              latestImg: img,
              latestIndex: index,
              isSmart: false,
              isEmpty: false,
            });
          }
          const bData = boardsMap.get(bName);
          bData.count++;

          if (index < bData.latestIndex) {
            bData.latestImg = img;
            bData.latestIndex = index;
          }
        }
      });
    });

    (State.smartBoards || []).forEach((sb) => {
      const matchingImages = State.allImages.filter((img) =>
        isImageInSmartBoard(img, sb)
      );

      if (matchingImages.length > 0) {
        boardsMap.set(sb.name, {
          count: matchingImages.length,
          latestImg: matchingImages[0],
          latestIndex: State.allImages.indexOf(matchingImages[0]),
          isSmart: true,
          smartId: sb.id,
          isEmpty: false,
        });
      } else {
        boardsMap.set(sb.name, {
          count: 0,
          latestImg: null,
          latestIndex: 999999,
          isSmart: true,
          smartId: sb.id,
          isEmpty: false,
        });
      }
    });

    // --- IMPROVED: Inject empty regular boards with Auto-Scrub ---
    let emptyBoards = JSON.parse(
      localStorage.getItem("tallo_empty_boards") || "[]"
    );
    let scrubbedEmptyBoards = [];
    let boardsChanged = false;

    emptyBoards.forEach((bName) => {
      const lowerName = bName.toLowerCase();

      // FIX: Check if this board already has real media tags from Step 1
      const hasMedia = boardsMap.has(bName);
      const isSmart = (State.smartBoards || []).some(
        (sb) => sb.name.toLowerCase() === lowerName
      );

      if (hasMedia || isSmart) {
        // Board now has media or is a smart collection — scrub from localStorage
        boardsChanged = true;
      } else {
        // Still empty, keep it and render placeholder
        scrubbedEmptyBoards.push(bName);
        boardsMap.set(bName, {
          count: 0,
          latestImg: null,
          latestIndex: 999999,
          isSmart: false,
          isEmpty: true,
        });
      }
    });

    if (boardsChanged) {
      localStorage.setItem(
        "tallo_empty_boards",
        JSON.stringify(scrubbedEmptyBoards)
      );
    }

    DOM.boardsGrid.innerHTML = "";

    let sortedBoards = [...boardsMap.keys()];
    if (State.boardSort === "name") {
      sortedBoards.sort((a, b) => a.localeCompare(b));
    } else if (State.boardSort === "count") {
      sortedBoards.sort(
        (a, b) => boardsMap.get(b).count - boardsMap.get(a).count
      );
    } else {
      sortedBoards.sort(
        (a, b) => boardsMap.get(a).latestIndex - boardsMap.get(b).latestIndex
      );
    }

    if (sortedBoards.length === 0) {
      DOM.boardsGrid.innerHTML = `<div style="color:var(--text-secondary); padding: 20px;">You haven't created any boards yet.<br>Open a photo and click the bookmark icon to start curating!</div>`;
      return;
    }

    sortedBoards.forEach((bName) => {
      const bData = boardsMap.get(bName);
      const card = document.createElement("div");
      card.className = "board-card";

      if (bData.isEmpty) {
        card.style.opacity = "0.6";
      }

      const isPlaceholder = !bData.latestImg || !bData.latestImg.url;

      if (isPlaceholder) {
        const gradientBg = document.createElement("div");
        gradientBg.className = "board-card-bg board-placeholder-gradient";
        card.appendChild(gradientBg);
      } else {
        const isVideo = (bData.latestImg.url || "").match(/\.(mp4|webm)$/i);
        const bg = document.createElement(isVideo ? "video" : "img");
        bg.className = "board-card-bg";

        if (isVideo) {
          bg.muted = true;
          bg.loop = true;
          bg.autoplay = true;
          bg.playsInline = true;
          if (bData.latestImg.poster) bg.poster = bData.latestImg.poster;
        }
        bg.src = bData.latestImg.url || "";
        card.appendChild(bg);
      }

      const overlay = document.createElement("div");
      overlay.className = "board-card-overlay";

      const iconHTML = bData.isSmart
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: -1px; color: var(--select-color);"><path d="M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74z"/><path d="m20 14.285 1.5.845a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74l1.5-.845"/></svg>`
        : "";

      overlay.innerHTML = `<h3 class="board-card-title">${iconHTML}${bName}</h3><p class="board-card-count">${
        bData.count
      } item${bData.count !== 1 ? "s" : ""}</p>`;

      const actions = document.createElement("div");
      actions.className = "board-card-actions";

      if (bData.isSmart) {
        const editBtn = document.createElement("div");
        editBtn.className = "board-action-btn";
        editBtn.title = "Edit Smart Board";
        editBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"></path><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"></path><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>`;

        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          SmartBoardModal.open(bData.smartId);
        });
        actions.appendChild(editBtn);
      } else {
        const renameBtn = document.createElement("div");
        renameBtn.className = "board-action-btn";
        renameBtn.title = "Rename Board";
        renameBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

        renameBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const newNameRaw = await ActionModals.prompt(bName);
          if (
            newNameRaw &&
            newNameRaw.trim() &&
            newNameRaw.trim().toLowerCase() !== bName.toLowerCase()
          ) {
            const cleanNewName = newNameRaw.trim().toLowerCase();

            let eb = JSON.parse(
              localStorage.getItem("tallo_empty_boards") || "[]"
            );
            const ebIndex = eb.findIndex(
              (b) => b.toLowerCase() === bName.toLowerCase()
            );
            if (ebIndex > -1) {
              eb[ebIndex] = newNameRaw.trim();
              localStorage.setItem("tallo_empty_boards", JSON.stringify(eb));
            }

            const newTag = `board:${cleanNewName}`;
            const oldTag = `board:${bName.toLowerCase()}`;
            let promises = [];

            State.allImages.forEach((img) => {
              const strTags = (img.tags || []).map((t) => String(t));
              if (strTags.includes(oldTag)) {
                img.tags = strTags.filter((t) => t !== oldTag);
                if (!img.tags.includes(newTag)) img.tags.push(newTag);
                promises.push(API.saveMetadata(img));
              }
            });

            Toast.show("Renaming board...");
            await Promise.all(promises);
            Toast.show("Board renamed!");
            this.renderHome();
            Navigation.buildVirtualBoardDropdown();
          }
        });
        actions.appendChild(renameBtn);
      }

      const delBtn = document.createElement("div");
      delBtn.className = "board-action-btn delete";
      delBtn.title = "Delete Board";
      delBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const confirmed = await ActionModals.confirm();
        if (confirmed) {
          let eb = JSON.parse(
            localStorage.getItem("tallo_empty_boards") || "[]"
          );
          eb = eb.filter((b) => b.toLowerCase() !== bName.toLowerCase());
          localStorage.setItem("tallo_empty_boards", JSON.stringify(eb));

          if (bData.isSmart) {
            State.smartBoards = State.smartBoards.filter(
              (sb) => sb.id !== bData.smartId
            );
            await API.saveSmartBoards();
            Toast.show("Smart Board deleted!");
          } else {
            const oldTag = `board:${bName.toLowerCase()}`;
            let promises = [];

            State.allImages.forEach((img) => {
              const strTags = (img.tags || []).map((t) => String(t));
              if (strTags.includes(oldTag)) {
                img.tags = strTags.filter((t) => t !== oldTag);
                promises.push(API.saveMetadata(img));
              }
            });

            Toast.show("Deleting board...");
            await Promise.all(promises);
            Toast.show("Board deleted!");
          }
          this.renderHome();
          Navigation.buildVirtualBoardDropdown();
        }
      });

      actions.appendChild(delBtn);

      if (
        !isPlaceholder &&
        (bData.latestImg.url || "").match(/\.(mp4|webm)$/i) &&
        bData.latestImg.poster
      ) {
        const vidBadge = document.createElement("div");
        vidBadge.className = "video-indicator";
        vidBadge.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
        card.appendChild(vidBadge);
      }

      card.appendChild(overlay);
      card.appendChild(actions);

      if (bData.isEmpty) {
        card.addEventListener("click", () => {
          Toast.show("Add media to this board first!");
        });
      } else {
        card.addEventListener("click", () => {
          AppRouter.navigate(`/boards/${bName}`);
        });
      }

      DOM.boardsGrid.appendChild(card);
    });
  },
};

export { Navigation, SearchTags, Lightbox, Gallery, Boards };
