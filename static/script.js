document.addEventListener("DOMContentLoaded", () => {
  const navEl = document.querySelector(".v-nav");
  const galleryEl = document.getElementById("gallery");
  const searchInput = document.getElementById("searchInput");
  const searchWrapper = searchInput.closest(".search-wrapper");
  const clearSearchBtn = document.getElementById("clearSearchBtn");
  const shuffleBtn = document.getElementById("shuffleBtn");
  const resetLogo = document.getElementById("resetLogo");
  const globalTagCloud = document.getElementById("globalTagCloud");
  const selectModeBtn = document.getElementById("selectModeBtn");
  const autocompleteBox = document.getElementById("autocompleteDropdown");
  const boardSelectWrapper = document.getElementById("boardSelectWrapper");
  const boardSelectTrigger = document.getElementById("boardSelectTrigger");
  const boardSelectOptions = document.getElementById("boardSelectOptions");

  const mobileMenuToggle = document.getElementById("mobileMenuToggle");
  const navFilters = document.getElementById("navFilters");

  const lightbox = document.getElementById("lightbox");
  const lightboxClose = document.getElementById("lightboxClose");
  const lightboxContent = document.getElementById("lightboxContent");
  const lightboxTags = document.getElementById("lightboxTags");

  let allImages = [];
  let currentRenderList = [];

  function getItemsPerPage() {
    return window.innerWidth <= 768 ? 50 : 150;
  }
  function getChunkSize() {
    return window.innerWidth <= 768 ? 15 : 30;
  }

  let currentPage = 1;
  let itemsRenderedThisPage = 0;
  let isRenderingChunk = false;
  let currentRenderId = 0;
  let currentCols = getColumnCount();

  let searchDebounceTimer;

  const paginationContainer = document.createElement("div");
  paginationContainer.className = "pagination-container";
  galleryEl.parentNode.insertBefore(paginationContainer, galleryEl.nextSibling);

  let masonryColumns = [];
  let colHeights = [];

  let allKnownTags = [];
  let isSelectMode = false;
  let selectedImages = new Set();
  let lastSelectedIndex = null;

  let activeInputEl = null;
  let autocompleteMode = null;
  let activeImgData = null;
  let activeTagsListEl = null;
  let activeSuggestionIndex = -1;

  let currentLightboxIndex = -1;
  let isShuffled = false;
  let currentBoard = "All";

  const videoObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target
            .play()
            .catch((e) => console.log("Autoplay prevented:", e));
        } else {
          entry.target.pause();
        }
      });
    },
    { threshold: 0.1 }
  );

  function getColumnCount() {
    const width = window.innerWidth;
    if (width <= 600) return 1;
    if (width <= 900) return 2;
    if (width <= 1400) return 3;
    return 4;
  }

  function getSortedBoards() {
    const rawBoards = allImages.map((img) => img.board).filter((b) => b);
    let allFolders = new Set();

    rawBoards.forEach((board) => {
      let parts = board.split("/");
      let currentPath = "";
      for (let i = 0; i < parts.length; i++) {
        currentPath = currentPath ? currentPath + "/" + parts[i] : parts[i];
        allFolders.add(currentPath);
      }
    });

    const uniqueBoards = [...allFolders];
    uniqueBoards.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return ["All", ...uniqueBoards];
  }

  // --- NEW: Helper function to recursively grab images from subfolders ---
  function getActiveBoardImages() {
    if (currentBoard === "All") return allImages;
    return allImages.filter(
      (img) =>
        img.board === currentBoard || img.board.startsWith(currentBoard + "/")
    );
  }

  window.addEventListener("resize", () => {
    const newCols = getColumnCount();
    if (newCols !== currentCols) {
      currentCols = newCols;
      renderGallery(currentRenderList, true);
    }
  });

  window.addEventListener("scroll", () => {
    const scrollPosition = window.innerHeight + window.scrollY;
    const threshold = document.body.offsetHeight - 800;

    if (scrollPosition >= threshold && !isRenderingChunk) {
      const pageStartIndex = (currentPage - 1) * getItemsPerPage();
      const totalItemsForThisPage = Math.min(
        getItemsPerPage(),
        currentRenderList.length - pageStartIndex
      );

      if (itemsRenderedThisPage < totalItemsForThisPage) {
        renderNextChunk(currentRenderId);
      }
    }
  });

  window.addEventListener("popstate", (e) => {
    setBoardFromURL();
    buildCustomDropdown();
    applyFiltersAndRender();
  });

  mobileMenuToggle.addEventListener("click", () => {
    navFilters.classList.toggle("is-open");
    mobileMenuToggle.classList.toggle("active-mode");
  });

  async function fetchGallery() {
    const response = await fetch("/api/gallery");
    allImages = await response.json();

    const boards = getSortedBoards();
    const savedBoard = localStorage.getItem("tallo_board");

    currentBoard =
      savedBoard && boards.includes(savedBoard) ? savedBoard : "All";

    setBoardFromURL();
    buildCustomDropdown();
    currentPage = 1;

    if (currentBoard === "All") {
      isShuffled = true;
      shuffleBtn.classList.add("active-mode");
      updateGlobalTags();
      renderGallery(shuffleArray([...allImages]));
    } else {
      isShuffled = false;
      shuffleBtn.classList.remove("active-mode");
      updateGlobalTags();
      // Replace hard match with recursive match
      renderGallery(getActiveBoardImages());
    }
  }

  function setBoardFromURL() {
    const boards = getSortedBoards();
    const urlPath = window.location.pathname.replace(/^\/|\/$/g, "");

    if (!urlPath) {
      currentBoard = "All";
      return;
    }

    const matchedBoard = boards.find(
      (b) => b.toLowerCase() === urlPath.toLowerCase()
    );
    currentBoard = matchedBoard || "All";

    if (!matchedBoard && urlPath !== "") {
      window.history.replaceState(null, "", "/");
    }
  }

  function shuffleArray(array) {
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
  }

  function buildCustomDropdown() {
    const boards = getSortedBoards();
    boardSelectOptions.innerHTML = "";

    boardSelectTrigger.title =
      currentBoard === "All" ? "All Boards" : currentBoard;
    if (currentBoard === "All") {
      boardSelectTrigger.classList.remove("active-mode");
    } else {
      boardSelectTrigger.classList.add("active-mode");
    }

    boards.forEach((b) => {
      const opt = document.createElement("div");
      opt.className = "custom-option";

      if (b === "All") {
        opt.textContent = "All Boards";
        opt.classList.add("all-boards-opt");
        if (currentBoard === "All") opt.classList.add("is-selected");
      } else {
        // --- NEW: Visual Indentation Logic for Subfolders ---
        const parts = b.split("/");
        const depth = parts.length - 1;
        const displayName = parts[parts.length - 1]; // Only show the active subfolder name

        if (depth > 0) {
          opt.innerHTML = `<span style="opacity: 0.4; font-size: 0.9em; margin-right: 6px;">↳</span>${displayName}`;
          // Multiply indent spacing by depth level
          opt.style.paddingLeft = `calc(1rem + ${depth * 18}px)`;
        } else {
          opt.textContent = displayName;
        }

        if (currentBoard === b) opt.classList.add("is-selected");
      }

      opt.addEventListener("click", (e) => {
        e.stopPropagation();

        boardSelectOptions
          .querySelectorAll(".custom-option")
          .forEach((el) => el.classList.remove("is-selected"));
        opt.classList.add("is-selected");

        currentBoard = b;
        localStorage.setItem("tallo_board", b);

        boardSelectTrigger.title =
          currentBoard === "All" ? "All Boards" : currentBoard;
        if (currentBoard === "All") {
          boardSelectTrigger.classList.remove("active-mode");
        } else {
          boardSelectTrigger.classList.add("active-mode");
        }

        boardSelectOptions.classList.remove("is-open");
        boardSelectTrigger.classList.remove("is-open");

        const newUrl = b === "All" ? "/" : `/${b}`;
        window.history.pushState({ board: b }, "", newUrl);

        searchInput.value = "";
        isShuffled = false;
        shuffleBtn.classList.remove("active-mode");

        if (window.innerWidth <= 768) {
          navFilters.classList.remove("is-open");
          mobileMenuToggle.classList.remove("active-mode");
        }

        updateGlobalTags();
        applyFiltersAndRender();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      boardSelectOptions.appendChild(opt);
    });
  }

  boardSelectTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = boardSelectOptions.classList.contains("is-open");

    if (isOpen) {
      boardSelectOptions.classList.remove("is-open");
      boardSelectTrigger.classList.remove("is-open");
    } else {
      hideAutocomplete();
      boardSelectOptions.classList.add("is-open");
      boardSelectTrigger.classList.add("is-open");
    }
  });

  document.addEventListener("click", (e) => {
    if (!boardSelectWrapper.contains(e.target)) {
      boardSelectOptions.classList.remove("is-open");
      boardSelectTrigger.classList.remove("is-open");
    }
  });

  function updateGlobalTags() {
    let freq = {};
    let untaggedCount = 0;

    // Replace hard match with recursive match
    let activeBoardImages = getActiveBoardImages();

    activeBoardImages.forEach((img) => {
      let hasRealTag = false;

      img.tags.forEach((t) => {
        const isUrl = t.startsWith("http://") || t.startsWith("https://");
        if (!isUrl) {
          freq[t] = (freq[t] || 0) + 1;
          hasRealTag = true;
        }
      });

      if (!hasRealTag) {
        untaggedCount++;
      }
    });

    let sortedTags = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .map((e) => e[0]);
    allKnownTags = sortedTags;

    globalTagCloud.innerHTML = "";

    sortedTags.slice(0, 10).forEach((tag) => {
      const span = document.createElement("span");
      span.className = "cloud-tag";
      span.textContent = tag;
      span.addEventListener("click", () => {
        if (isSelectMode && selectedImages.size > 0) {
          applyBatchTag(tag);
        } else {
          searchInput.value = tag;
          applyFiltersAndRender();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
      globalTagCloud.appendChild(span);
    });

    if (untaggedCount > 0) {
      const untaggedSpan = document.createElement("span");
      untaggedSpan.className = "cloud-tag system-tag";
      untaggedSpan.textContent = `∅ Untagged (${untaggedCount})`;
      untaggedSpan.addEventListener("click", () => {
        if (isSelectMode) return;
        searchInput.value = "is:untagged";
        applyFiltersAndRender();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      globalTagCloud.appendChild(untaggedSpan);
    }
  }

  function renderGallery(images, isPageChange = false) {
    if (!isPageChange) {
      currentPage = 1;
    }

    currentRenderList = images;
    itemsRenderedThisPage = 0;

    galleryEl.innerHTML = "";
    renderPaginationNumbers();

    const ObjectCols = getColumnCount();
    masonryColumns = [];
    colHeights = new Array(ObjectCols).fill(0);

    for (let i = 0; i < ObjectCols; i++) {
      const colDiv = document.createElement("div");
      colDiv.className = "masonry-column";
      masonryColumns.push(colDiv);
      galleryEl.appendChild(colDiv);
    }

    currentRenderId++;
    renderNextChunk(currentRenderId);

    if (isPageChange) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function renderNextChunk(renderId) {
    if (renderId !== currentRenderId) return;

    const pageStartIndex = (currentPage - 1) * getItemsPerPage();
    const totalItemsForThisPage = Math.min(
      getItemsPerPage(),
      currentRenderList.length - pageStartIndex
    );

    if (itemsRenderedThisPage >= totalItemsForThisPage) return;

    isRenderingChunk = true;
    const targetCount = Math.min(
      itemsRenderedThisPage + getChunkSize(),
      totalItemsForThisPage
    );

    function placeNextCard() {
      if (renderId !== currentRenderId) return;

      if (itemsRenderedThisPage >= targetCount) {
        isRenderingChunk = false;
        return;
      }

      const globalIndex = pageStartIndex + itemsRenderedThisPage;
      const imgData = currentRenderList[globalIndex];

      const card = document.createElement("div");
      card.className = "glass-card";
      card.style.animation = "fadeIn 0.5s ease backwards";
      card.dataset.filename = imgData.filename;

      if (selectedImages.has(imgData.filename)) {
        card.classList.add("is-selected");
      }

      const expandBtn = document.createElement("button");
      expandBtn.className = "card-expand-btn";
      expandBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`;

      expandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openLightbox(globalIndex);
      });
      card.appendChild(expandBtn);

      card.addEventListener("click", (e) => {
        if (
          e.target.tagName === "INPUT" ||
          e.target.classList.contains("tag-del") ||
          e.target.closest(".tag")
        )
          return;

        if (isSelectMode) {
          if (e.shiftKey && lastSelectedIndex !== null) {
            const start = Math.min(lastSelectedIndex, globalIndex);
            const end = Math.max(lastSelectedIndex, globalIndex);

            for (let i = start; i <= end; i++) {
              const itemToSelect = currentRenderList[i];
              selectedImages.add(itemToSelect.filename);
              const renderedCard = document.querySelector(
                `.glass-card[data-filename="${itemToSelect.filename}"]`
              );
              if (renderedCard) renderedCard.classList.add("is-selected");
            }
            document.getSelection().removeAllRanges();
          } else {
            if (selectedImages.has(imgData.filename)) {
              selectedImages.delete(imgData.filename);
              card.classList.remove("is-selected");
              lastSelectedIndex = globalIndex;
            } else {
              selectedImages.add(imgData.filename);
              card.classList.add("is-selected");
              lastSelectedIndex = globalIndex;
            }
          }
        } else {
          if (window.innerWidth <= 768) {
            card.classList.toggle("show-mobile-overlay");
          } else {
            openLightbox(globalIndex);
          }
        }
      });

      const filenameLower = imgData.filename.toLowerCase();
      const isVideo =
        filenameLower.endsWith(".webm") || filenameLower.endsWith(".mp4");

      let mediaEl;
      if (isVideo) {
        mediaEl = document.createElement("video");
        mediaEl.src = imgData.url;
        mediaEl.loading = "lazy";
        mediaEl.loop = true;
        mediaEl.muted = true;
        mediaEl.playsInline = true;
        mediaEl.preload = "metadata";
        videoObserver.observe(mediaEl);
      } else {
        mediaEl = document.createElement("img");
        mediaEl.src = imgData.url;
      }

      const tagContainer = document.createElement("div");
      tagContainer.className = "tag-container";
      const tagsList = document.createElement("div");
      tagsList.className = "tags-list";

      imgData.tags.forEach((tag) => {
        tagsList.appendChild(createTagElement(tag, imgData, tagsList));
      });

      const input = document.createElement("input");
      input.type = "text";
      input.className = "tag-input";
      input.placeholder = "Add a tag & press Enter...";

      input.addEventListener("focus", (e) =>
        showAutocomplete(e.target, "tag", imgData, tagsList)
      );
      input.addEventListener("input", (e) =>
        filterAutocomplete(e.target.value)
      );
      input.addEventListener("blur", () => setTimeout(hideAutocomplete, 200));

      input.addEventListener("keydown", (e) => {
        if (handleAutocompleteKeyboardNav(e)) return;

        if (e.key === "Enter" && activeSuggestionIndex === -1) {
          e.preventDefault();
          const rawTag = input.value.trim();
          const isUrl =
            rawTag.startsWith("http://") || rawTag.startsWith("https://");
          const newTag = isUrl ? rawTag : rawTag.toLowerCase();

          if (newTag) {
            hideAutocomplete();
            if (isSelectMode && selectedImages.has(imgData.filename)) {
              applyBatchTag(newTag);
            } else if (!imgData.tags.includes(newTag)) {
              imgData.tags.push(newTag);
              tagsList.appendChild(createTagElement(newTag, imgData, tagsList));
              saveTags(imgData);
              updateGlobalTags();
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
        if (renderId !== currentRenderId) return;

        let aspect = isVideo
          ? mediaEl.videoHeight / mediaEl.videoWidth || 1
          : mediaEl.naturalHeight / mediaEl.naturalWidth || 1;
        let shortestIndex = 0;
        let minHeight = colHeights[0];
        const cols = getColumnCount();

        for (let i = 1; i < cols; i++) {
          if (colHeights[i] < minHeight) {
            minHeight = colHeights[i];
            shortestIndex = i;
          }
        }

        colHeights[shortestIndex] += aspect + 0.15;
        masonryColumns[shortestIndex].appendChild(card);

        itemsRenderedThisPage++;
        placeNextCard();
      };

      if (isVideo) {
        mediaEl.addEventListener("loadeddata", handleMediaLoad, { once: true });
        mediaEl.addEventListener("error", handleMediaLoad, { once: true });
      } else {
        if (mediaEl.complete && mediaEl.naturalWidth !== 0) {
          setTimeout(handleMediaLoad, 0);
        } else {
          mediaEl.addEventListener("load", handleMediaLoad, { once: true });
          mediaEl.addEventListener("error", handleMediaLoad, { once: true });
        }
      }
    }

    placeNextCard();
  }

  function renderPaginationNumbers() {
    paginationContainer.innerHTML = "";
    const totalPages = Math.ceil(currentRenderList.length / getItemsPerPage());

    if (totalPages <= 1) return;

    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement("button");
      btn.className = "page-num-btn";

      if (i === currentPage) {
        btn.classList.add("active");
      }

      btn.textContent = i;

      btn.addEventListener("click", () => {
        if (currentPage !== i) {
          currentPage = i;
          renderGallery(currentRenderList, true);
        }
      });

      paginationContainer.appendChild(btn);
    }
  }

  function createTagElement(tagText, imgData, tagsListEl) {
    const tag = document.createElement("div");
    tag.className = "tag";
    const isUrl =
      tagText.startsWith("http://") || tagText.startsWith("https://");
    let isMap = false;

    if (isUrl) {
      tag.classList.add("url-tag");
      if (
        tagText.includes("google.com/maps") ||
        tagText.includes("goo.gl/maps") ||
        tagText.includes("maps.app.goo.gl")
      ) {
        isMap = true;
        tag.classList.add("map-tag");
      }
    }

    if (tagText === "All Boards") tag.style.fontSize = "0.2rem";

    tag.addEventListener("click", (e) => {
      if (isSelectMode) return;
      if (isUrl) {
        window.open(tagText, "_blank");
        return;
      }
      searchInput.value = tagText;
      applyFiltersAndRender();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const text = document.createElement("span");
    text.className = "tag-text";

    if (isUrl) {
      try {
        const urlObj = new URL(tagText);
        if (isMap) {
          text.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
        } else {
          text.textContent = "↗ " + urlObj.hostname.replace("www.", "");
        }
      } catch (e) {
        text.textContent = "↗ Link";
      }
    } else {
      text.textContent = tagText;
    }

    const del = document.createElement("span");
    del.className = "tag-del";
    del.textContent = "×";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      imgData.tags = imgData.tags.filter((t) => t !== tagText);
      tagsListEl.removeChild(tag);
      saveTags(imgData);
      updateGlobalTags();
    });

    tag.appendChild(text);
    tag.appendChild(del);
    return tag;
  }

  async function saveTags(imgData) {
    await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: imgData.filename, tags: imgData.tags }),
    });
  }

  selectModeBtn.addEventListener("click", () => {
    isSelectMode = !isSelectMode;
    selectModeBtn.classList.toggle("active-mode", isSelectMode);
    document.body.classList.toggle("select-mode-active", isSelectMode);

    if (!isSelectMode) {
      selectedImages.clear();
      lastSelectedIndex = null;
      document
        .querySelectorAll(".glass-card")
        .forEach((c) => c.classList.remove("is-selected"));
    }
  });

  async function applyBatchTag(tagText) {
    let promises = [];

    // Replace hard match with recursive match
    let activeBoardImages = getActiveBoardImages();

    activeBoardImages.forEach((img) => {
      if (selectedImages.has(img.filename) && !img.tags.includes(tagText)) {
        img.tags.push(tagText);
        promises.push(saveTags(img));

        document.querySelectorAll(".glass-card").forEach((card) => {
          if (card.dataset.filename === img.filename) {
            const tagsList = card.querySelector(".tags-list");
            if (tagsList)
              tagsList.appendChild(createTagElement(tagText, img, tagsList));
          }
        });
      }
    });

    await Promise.all(promises);
    updateGlobalTags();
  }

  function showAutocomplete(inputEl, mode, imgData = null, tagsListEl = null) {
    activeInputEl = inputEl;
    autocompleteMode = mode;
    activeImgData = imgData;
    activeTagsListEl = tagsListEl;
    filterAutocomplete("");
  }

  function filterAutocomplete(query) {
    if (!activeInputEl) return;

    activeSuggestionIndex = -1;

    const rect = activeInputEl.getBoundingClientRect();
    autocompleteBox.style.width = `${rect.width}px`;

    if (window.innerWidth <= 768) {
      autocompleteBox.style.position = "fixed";
      autocompleteBox.style.left = `${rect.left}px`;

      if (navEl.classList.contains("keyboard-open")) {
        autocompleteBox.style.bottom = "auto";
        autocompleteBox.style.top = `${rect.bottom + 4}px`;
      } else {
        autocompleteBox.style.top = "auto";
        autocompleteBox.style.bottom = `${window.innerHeight - rect.top + 4}px`;
      }
    } else {
      autocompleteBox.style.position = "absolute";
      autocompleteBox.style.left = `${rect.left + window.scrollX}px`;
      autocompleteBox.style.bottom = "auto";
      autocompleteBox.style.top = `${rect.bottom + window.scrollY + 4}px`;
    }

    const q = query.toLowerCase();
    let suggestions = [];

    if (autocompleteMode === "search") {
      suggestions = allKnownTags.filter((t) => t.includes(q));
    } else {
      suggestions = allKnownTags.filter(
        (t) => t.includes(q) && !activeImgData.tags.includes(t)
      );
    }

    if (suggestions.length === 0) {
      autocompleteBox.style.display = "none";
      return;
    }

    autocompleteBox.innerHTML = "";
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

        if (autocompleteMode === "search") {
          activeInputEl.value = selectedTag;
          applyFiltersAndRender();
        } else {
          if (isSelectMode && selectedImages.has(activeImgData.filename)) {
            applyBatchTag(selectedTag);
          } else {
            activeImgData.tags.push(selectedTag);
            activeTagsListEl.appendChild(
              createTagElement(selectedTag, activeImgData, activeTagsListEl)
            );
            saveTags(activeImgData);
            updateGlobalTags();
          }
        }

        activeInputEl.value = autocompleteMode === "search" ? selectedTag : "";
        hideAutocomplete();
      });
      autocompleteBox.appendChild(item);
    });

    autocompleteBox.style.display = "flex";
  }

  function handleAutocompleteKeyboardNav(e) {
    const isDropdownOpen = autocompleteBox.style.display === "flex";
    if (!isDropdownOpen) return false;

    const items = autocompleteBox.querySelectorAll(".autocomplete-item");

    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeSuggestionIndex++;
      if (activeSuggestionIndex >= items.length) activeSuggestionIndex = 0;
      updateAutocompleteHighlight(items);
      return true;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeSuggestionIndex--;
      if (activeSuggestionIndex < 0) activeSuggestionIndex = items.length - 1;
      updateAutocompleteHighlight(items);
      return true;
    } else if (e.key === "Escape") {
      hideAutocomplete();
      return true;
    } else if (e.key === "Tab" || e.key === "Enter") {
      if (activeSuggestionIndex > -1 && items.length > 0) {
        e.preventDefault();
        items[activeSuggestionIndex].dispatchEvent(new MouseEvent("mousedown"));
        return true;
      }
    }
    return false;
  }

  function updateAutocompleteHighlight(items) {
    items.forEach((item) => item.classList.remove("is-highlighted"));
    if (activeSuggestionIndex > -1 && items[activeSuggestionIndex]) {
      items[activeSuggestionIndex].classList.add("is-highlighted");
      items[activeSuggestionIndex].scrollIntoView({ block: "nearest" });
    }
  }

  function hideAutocomplete() {
    autocompleteBox.style.display = "none";
    activeInputEl = null;
    activeSuggestionIndex = -1;
  }

  searchInput.addEventListener("focus", (e) => {
    boardSelectOptions.classList.remove("is-open");
    boardSelectTrigger.classList.remove("is-open");

    if (window.innerWidth <= 768) {
      navEl.classList.add("keyboard-open");
    }
    showAutocomplete(e.target, "search");
  });

  searchInput.addEventListener("input", (e) => {
    filterAutocomplete(e.target.value);
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      applyFiltersAndRender();
    }, 300);
  });

  searchInput.addEventListener("blur", () => {
    setTimeout(() => {
      hideAutocomplete();
      navEl.classList.remove("keyboard-open");
    }, 200);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (handleAutocompleteKeyboardNav(e)) return;

    if (e.key === "Enter" && activeSuggestionIndex === -1) {
      e.preventDefault();
      searchInput.blur();
    }
  });

  function applyFiltersAndRender() {
    const query = searchInput.value.toLowerCase().trim();
    lastSelectedIndex = null;
    currentPage = 1;

    isShuffled = false;
    shuffleBtn.classList.remove("active-mode");

    // Replace hard match with recursive match
    let baseArray = getActiveBoardImages();

    if (!query) {
      searchWrapper.classList.remove("is-active");
      renderGallery(baseArray);
      return;
    }

    searchWrapper.classList.add("is-active");

    let filtered;
    if (query === "is:untagged") {
      filtered = baseArray.filter((img) => {
        const hasTextTags = img.tags.some(
          (tag) => !tag.startsWith("http://") && !tag.startsWith("https://")
        );
        return !hasTextTags;
      });
    } else {
      filtered = baseArray.filter(
        (img) =>
          img.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          img.filename.toLowerCase().includes(query)
      );
    }

    renderGallery(filtered);
  }

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    applyFiltersAndRender();
    searchInput.focus();
  });

  resetLogo.addEventListener("click", () => {
    searchInput.value = "";

    currentBoard = "All";
    localStorage.setItem("tallo_board", "All");
    window.history.pushState(null, "", "/");

    boardSelectTrigger.title = "All Boards";
    boardSelectTrigger.classList.remove("active-mode");

    boardSelectOptions.querySelectorAll(".custom-option").forEach((el) => {
      el.classList.toggle(
        "is-selected",
        el.classList.contains("all-boards-opt")
      );
    });

    isShuffled = true;
    shuffleBtn.classList.add("active-mode");
    currentPage = 1;
    lastSelectedIndex = null;
    searchWrapper.classList.remove("is-active");

    navFilters.classList.remove("is-open");
    mobileMenuToggle.classList.remove("active-mode");

    updateGlobalTags();
    renderGallery(shuffleArray([...allImages]));
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  shuffleBtn.addEventListener("click", () => {
    isShuffled = !isShuffled;
    shuffleBtn.classList.toggle("active-mode", isShuffled);

    if (!isShuffled) {
      applyFiltersAndRender();
      return;
    }

    const query = searchInput.value.toLowerCase().trim();
    lastSelectedIndex = null;
    currentPage = 1;

    // Replace hard match with recursive match
    let targetArray = getActiveBoardImages();

    if (query === "is:untagged") {
      targetArray = targetArray.filter((img) => {
        const hasTextTags = img.tags.some(
          (tag) => !tag.startsWith("http://") && !tag.startsWith("https://")
        );
        return !hasTextTags;
      });
    } else if (query) {
      targetArray = targetArray.filter(
        (img) =>
          img.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          img.filename.toLowerCase().includes(query)
      );
    }

    renderGallery(shuffleArray([...targetArray]));
  });

  function openLightbox(index) {
    if (index < 0 || index >= currentRenderList.length) return;

    currentLightboxIndex = index;
    const imgData = currentRenderList[index];

    lightboxContent.innerHTML = "";
    lightboxTags.innerHTML = "";

    const filenameLower = imgData.filename.toLowerCase();
    const isVideo =
      filenameLower.endsWith(".webm") || filenameLower.endsWith(".mp4");

    if (isVideo) {
      const vid = document.createElement("video");
      vid.src = imgData.url;
      vid.autoplay = true;
      vid.loop = true;
      vid.controls = true;
      lightboxContent.appendChild(vid);
    } else {
      const img = document.createElement("img");
      img.src = imgData.url;
      lightboxContent.appendChild(img);
    }

    imgData.tags.forEach((tagText) => {
      const isUrl =
        tagText.startsWith("http://") || tagText.startsWith("https://");
      let isMap = false;

      const span = document.createElement("span");
      span.className = "cloud-tag";

      if (isUrl) {
        span.classList.add("url-tag");
        if (
          tagText.includes("google.com/maps") ||
          tagText.includes("goo.gl/maps") ||
          tagText.includes("maps.app.goo.gl")
        ) {
          isMap = true;
          span.classList.add("map-tag");
        }
      }

      if (isUrl) {
        try {
          const urlObj = new URL(tagText);
          if (isMap) {
            span.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block; margin: 0 auto;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
            span.style.padding = "4px 8px";
          } else {
            span.textContent = "↗ " + urlObj.hostname.replace("www.", "");
            span.style.background = "rgba(13, 148, 136, 0.15)";
            span.style.borderColor = "rgba(13, 148, 136, 0.3)";
            span.style.textTransform = "none";
          }
        } catch (e) {
          span.textContent = "↗ Link";
        }
        span.addEventListener("click", () => window.open(tagText, "_blank"));
      } else {
        span.textContent = tagText;
        span.addEventListener("click", () => {
          closeLightbox();
          searchInput.value = tagText;
          applyFiltersAndRender();
          window.scrollTo({ top: 0, behavior: "smooth" });
        });
      }
      lightboxTags.appendChild(span);
    });

    document.querySelectorAll("#gallery video").forEach((vid) => vid.pause());

    document.body.classList.add("lightbox-open");
    lightbox.classList.add("is-active");
  }

  function closeLightbox() {
    lightbox.classList.remove("is-active");
    document.body.classList.remove("lightbox-open");
    currentLightboxIndex = -1;

    setTimeout(() => {
      lightboxContent.innerHTML = "";
      lightboxTags.innerHTML = "";

      document.querySelectorAll("#gallery video").forEach((vid) => {
        const rect = vid.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom >= 0;
        if (isVisible)
          vid.play().catch((e) => console.log("Autoplay prevented:", e));
      });
    }, 300);
  }

  lightboxClose.addEventListener("click", closeLightbox);

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox || e.target === lightboxTags) closeLightbox();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      if (e.key === "Escape") {
        e.target.blur();
        hideAutocomplete();
      }
      return;
    }

    if (e.key === "/") {
      e.preventDefault();
      searchInput.focus();
      return;
    }

    if (e.key.toLowerCase() === "s") {
      e.preventDefault();
      shuffleBtn.click();
      return;
    }

    if (autocompleteBox.style.display === "flex") {
      if (e.key === "Escape") hideAutocomplete();
      return;
    }

    if (boardSelectOptions.classList.contains("is-open")) {
      if (e.key === "Escape") {
        boardSelectOptions.classList.remove("is-open");
        boardSelectTrigger.classList.remove("is-open");
      }
      return;
    }

    if (lightbox.classList.contains("is-active")) {
      if (e.key === "Escape") {
        closeLightbox();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        let newIndex = currentLightboxIndex - 1;
        if (newIndex < 0) newIndex = currentRenderList.length - 1;
        if (currentRenderList.length > 0) openLightbox(newIndex);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        let newIndex = currentLightboxIndex + 1;
        if (newIndex >= currentRenderList.length) newIndex = 0;
        if (currentRenderList.length > 0) openLightbox(newIndex);
      }
    } else if (isSelectMode && e.key === "Escape") {
      selectModeBtn.click();
    }
  });

  const dropZone = document.body;
  const uploadOverlay = document.createElement("div");
  uploadOverlay.className = "upload-overlay";
  uploadOverlay.innerHTML = "<h2>Drop files to upload</h2>";
  document.body.appendChild(uploadOverlay);

  let dragCounter = 0;

  dropZone.addEventListener("dragenter", (e) => {
    e.preventDefault();
    dragCounter++;
    uploadOverlay.classList.add("active");
  });

  dropZone.addEventListener("dragleave", (e) => {
    e.preventDefault();
    dragCounter--;
    if (dragCounter === 0) uploadOverlay.classList.remove("active");
  });

  dropZone.addEventListener("dragover", (e) => e.preventDefault());

  dropZone.addEventListener("drop", async (e) => {
    e.preventDefault();
    dragCounter = 0;
    uploadOverlay.classList.remove("active");

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      uploadOverlay.innerHTML = "<h2>Uploading...</h2>";
      uploadOverlay.classList.add("active");

      for (let file of files) await uploadFile(file);

      uploadOverlay.classList.remove("active");
      setTimeout(() => {
        uploadOverlay.innerHTML = "<h2>Drop files to upload</h2>";
      }, 300);
      fetchGallery();
    }
  });

  async function uploadFile(file) {
    await fetch("/api/upload", {
      method: "POST",
      headers: { "X-File-Name": encodeURIComponent(file.name) },
      body: file,
    });
  }

  fetchGallery();

  // --- NEW: Smart Idle/Sleep Manager ---
  // Browsers prevent Mac sleep when videos are playing.
  // This pauses all media if you step away for 5 minutes.
  let idleTimer;
  const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  function wakeUp() {
    clearTimeout(idleTimer);

    // If we are waking up, check which videos are currently on screen and play them
    document.querySelectorAll("#gallery video").forEach((vid) => {
      const rect = vid.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight && rect.bottom >= 0;
      if (isVisible) {
        vid.play().catch((e) => console.log("Autoplay prevented:", e));
      }
    });

    // Start the countdown to sleep
    idleTimer = setTimeout(() => {
      console.log("Tallo is idle: Pausing videos to allow system sleep.");
      document.querySelectorAll("video").forEach((vid) => vid.pause());
    }, IDLE_TIMEOUT_MS);
  }

  // Listen for any human interaction to reset the timer
  ["mousemove", "scroll", "keydown", "click", "touchstart"].forEach((evt) => {
    window.addEventListener(evt, wakeUp, { passive: true });
  });

  wakeUp(); // Start the timer on initial load
});
