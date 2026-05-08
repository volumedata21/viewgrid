import { DOM, State, API } from "./core.js";
import {
  Toast,
  Uploader,
  BoardModal,
  ActionModals,
  IdleManager,
} from "./ui.js";
import { Navigation, SearchTags, Lightbox, Gallery, Boards } from "./views.js";

/* ==========================================================================
   1. SINGLE PAGE APP ROUTER
   ========================================================================== */
const AppRouter = {
  navigate(path, updateState = true) {
    if (updateState) window.history.pushState({}, "", path);
    this.resolve(path);
  },

  resolve(path) {
    try {
      const cleanPath = decodeURIComponent(path.replace(/^\/|\/$/g, ""));

      // Default visibility resets
      if (DOM.galleryEl) DOM.galleryEl.style.display = "flex";
      if (DOM.paginationContainer)
        DOM.paginationContainer.style.display = "flex";
      if (DOM.topPaginationContainer)
        DOM.topPaginationContainer.style.display = "flex";
      if (DOM.boardsHome) DOM.boardsHome.style.display = "none";
      if (DOM.globalTagCloud && DOM.globalTagCloud.parentElement)
        DOM.globalTagCloud.parentElement.style.display = "block";

      if (cleanPath === "boards") {
        // BOARDS HOMEPAGE VIEW
        if (DOM.galleryEl) DOM.galleryEl.style.display = "none";
        if (DOM.paginationContainer)
          DOM.paginationContainer.style.display = "none";
        if (DOM.topPaginationContainer)
          DOM.topPaginationContainer.style.display = "none";
        if (DOM.globalTagCloud && DOM.globalTagCloud.parentElement)
          DOM.globalTagCloud.parentElement.style.display = "none";
        if (DOM.boardsHome) DOM.boardsHome.style.display = "block";

        if (DOM.searchInput) {
          DOM.searchInput.value = "";
          if (DOM.searchWrapper)
            DOM.searchWrapper.classList.remove("is-active");
        }
        if (DOM.folderSelectTrigger)
          DOM.folderSelectTrigger.classList.remove("active-mode");
        if (DOM.virtualBoardSelectTrigger)
          DOM.virtualBoardSelectTrigger.classList.add("active-mode");

        Boards.renderHome();
      } else if (cleanPath.startsWith("boards/")) {
        // SPECIFIC BOARD GALLERY VIEW
        const boardName = cleanPath.replace("boards/", "");
        if (DOM.searchInput) DOM.searchInput.value = `board:${boardName}`;
        if (DOM.folderSelectTrigger)
          DOM.folderSelectTrigger.classList.remove("active-mode");
        if (DOM.virtualBoardSelectTrigger)
          DOM.virtualBoardSelectTrigger.classList.add("active-mode");
        SearchTags.applyFiltersAndRender();
      } else {
        // STANDARD FOLDER VIEW
        if (DOM.searchInput) DOM.searchInput.value = "";
        const validFolders = Navigation.getSortedFolders();
        const matchedFolder = validFolders.find(
          (f) => f.toLowerCase() === cleanPath.toLowerCase()
        );
        State.currentFolder = matchedFolder || "All";
        Navigation.buildCustomDropdown();
        SearchTags.applyFiltersAndRender();
      }
      SearchTags.updateGlobalTags();
    } catch (e) {
      console.error("Router failed to resolve path:", e);
    }
  },
};

/* ==========================================================================
   2. GLOBAL EVENT ROUTER
   ========================================================================== */
const GlobalEvents = {
  init() {
    window.addEventListener("popstate", () => {
      if (DOM.lightbox && DOM.lightbox.classList.contains("is-active")) {
        Lightbox.close({ fromPopState: true });
        return;
      }
      AppRouter.resolve(window.location.pathname);
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
        if (DOM.searchInput) DOM.searchInput.focus();
        return;
      }
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (DOM.shuffleBtn) DOM.shuffleBtn.click();
        return;
      }
      if (DOM.autocompleteBox && DOM.autocompleteBox.style.display === "flex") {
        if (e.key === "Escape") SearchTags.hideAutocomplete();
        return;
      }
      if (
        DOM.folderSelectOptions &&
        DOM.folderSelectOptions.classList.contains("is-open")
      ) {
        if (e.key === "Escape") Navigation.closeFolderSelect();
        return;
      }
      if (
        DOM.virtualBoardSelectOptions &&
        DOM.virtualBoardSelectOptions.classList.contains("is-open")
      ) {
        if (e.key === "Escape") Navigation.closeVirtualBoardSelect();
        return;
      }

      if (
        DOM.boardModalOverlay &&
        DOM.boardModalOverlay.classList.contains("is-active")
      ) {
        if (e.key === "Escape") BoardModal.close();
        return;
      }
      if (
        DOM.renameModalOverlay &&
        DOM.renameModalOverlay.classList.contains("is-active")
      ) {
        if (e.key === "Escape") ActionModals.closePrompt();
        return;
      }
      if (
        DOM.deleteModalOverlay &&
        DOM.deleteModalOverlay.classList.contains("is-active")
      ) {
        if (e.key === "Escape") ActionModals.closeConfirm();
        return;
      }

      if (DOM.lightbox && DOM.lightbox.classList.contains("is-active")) {
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
   3. CORE APP BOOTSTRAPPER
   ========================================================================== */
const App = {
  async init() {
    console.log("🚀 Tallo JS Boot Sequence Started...");

    try {
      DOM.init();
      console.log("✅ DOM cached");
    } catch (e) {
      console.error("❌ DOM init failed", e);
    }
    try {
      Toast.init();
      console.log("✅ Toast initialized");
    } catch (e) {
      console.error("❌ Toast init failed", e);
    }
    try {
      Uploader.init();
      console.log("✅ Uploader initialized");
    } catch (e) {
      console.error("❌ Uploader init failed", e);
    }
    try {
      BoardModal.init();
      console.log("✅ BoardModal initialized");
    } catch (e) {
      console.error("❌ BoardModal init failed", e);
    }
    try {
      ActionModals.init();
      console.log("✅ ActionModals initialized");
    } catch (e) {
      console.error("❌ ActionModals init failed", e);
    }
    try {
      Boards.init();
      console.log("✅ Boards initialized");
    } catch (e) {
      console.error("❌ Boards init failed", e);
    }
    try {
      IdleManager.init();
      console.log("✅ IdleManager initialized");
    } catch (e) {
      console.error("❌ IdleManager init failed", e);
    }
    try {
      Navigation.init();
      console.log("✅ Navigation initialized");
    } catch (e) {
      console.error("❌ Navigation init failed", e);
    }
    try {
      SearchTags.init();
      console.log("✅ SearchTags initialized");
    } catch (e) {
      console.error("❌ SearchTags init failed", e);
    }
    try {
      Lightbox.init();
      console.log("✅ Lightbox initialized");
    } catch (e) {
      console.error("❌ Lightbox init failed", e);
    }
    try {
      Gallery.init();
      console.log("✅ Gallery initialized");
    } catch (e) {
      console.error("❌ Gallery init failed", e);
    }
    try {
      GlobalEvents.init();
      console.log("✅ GlobalEvents initialized");
    } catch (e) {
      console.error("❌ GlobalEvents init failed", e);
    }

    console.log("📥 Fetching Gallery Data...");
    await this.loadInitialData();
  },

  async loadInitialData() {
    await API.fetchGallery();
    await API.fetchSmartBoards();

    // Let the AppRouter resolve the initial URL on load
    AppRouter.resolve(window.location.pathname);

    if (DOM.shuffleBtn)
      DOM.shuffleBtn.classList.toggle("active-mode", State.isShuffled);
  },
};

// Start the application securely
const startApp = () => App.init();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  startApp();
}

// Export the things needed by circular dependencies in other files
export { AppRouter, App };
