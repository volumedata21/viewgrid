document.addEventListener("DOMContentLoaded", () => {
  const galleryEl = document.getElementById("gallery");
  const searchInput = document.getElementById("searchInput");
  const searchWrapper = searchInput.closest(".search-wrapper");
  const clearSearchBtn = document.getElementById("clearSearchBtn");
  const shuffleBtn = document.getElementById("shuffleBtn");
  const resetLogo = document.getElementById("resetLogo");
  const globalTagCloud = document.getElementById("globalTagCloud");
  const selectModeBtn = document.getElementById("selectModeBtn");
  const autocompleteBox = document.getElementById("autocompleteDropdown");

  const lightbox = document.getElementById("lightbox");
  const lightboxClose = document.getElementById("lightboxClose");
  const lightboxContent = document.getElementById("lightboxContent");
  const lightboxTags = document.getElementById("lightboxTags");

  let allImages = [];
  let currentRenderList = [];

  const CHUNK_SIZE = 30;
  const ITEMS_PER_PAGE = 150;

  let currentPage = 1;
  let itemsRenderedThisPage = 0;
  let isRenderingChunk = false;
  let currentRenderId = 0;
  let currentCols = getColumnCount();

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

  // --- NEW: Lightbox Tracker ---
  let currentLightboxIndex = -1;

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
    if (width <= 500) return 1;
    if (width <= 900) return 2;
    if (width <= 1400) return 3;
    return 4;
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
      const pageStartIndex = (currentPage - 1) * ITEMS_PER_PAGE;
      const totalItemsForThisPage = Math.min(
        ITEMS_PER_PAGE,
        currentRenderList.length - pageStartIndex
      );

      if (itemsRenderedThisPage < totalItemsForThisPage) {
        renderNextChunk(currentRenderId);
      }
    }
  });

  async function fetchGallery() {
    const response = await fetch("/api/gallery");
    allImages = await response.json();
    updateGlobalTags();
    currentPage = 1;
    renderGallery(allImages);
  }

  function updateGlobalTags() {
    let freq = {};
    let untaggedCount = 0;

    allImages.forEach((img) => {
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

    const pageStartIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const totalItemsForThisPage = Math.min(
      ITEMS_PER_PAGE,
      currentRenderList.length - pageStartIndex
    );

    if (itemsRenderedThisPage >= totalItemsForThisPage) return;

    isRenderingChunk = true;
    const targetCount = Math.min(
      itemsRenderedThisPage + CHUNK_SIZE,
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
              if (renderedCard) {
                renderedCard.classList.add("is-selected");
              }
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
          // --- REBUILT: Pass index instead of image data to the Lightbox ---
          openLightbox(globalIndex);
        }
      });

      const filenameLower = imgData.filename.toLowerCase();
      const isVideo =
        filenameLower.endsWith(".webm") || filenameLower.endsWith(".mp4");

      let mediaEl;
      if (isVideo) {
        mediaEl = document.createElement("video");
        mediaEl.src = imgData.url;
        mediaEl.loop = true;
        mediaEl.muted = true;
        mediaEl.playsInline = true;
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
      input.addEventListener("blur", () => {
        setTimeout(hideAutocomplete, 200);
      });

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
    const totalPages = Math.ceil(currentRenderList.length / ITEMS_PER_PAGE);

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

    if (isUrl) {
      tag.classList.add("url-tag");
    }

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
        text.textContent = "↗ " + urlObj.hostname.replace("www.", "");
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
    allImages.forEach((img) => {
      if (selectedImages.has(img.filename) && !img.tags.includes(tagText)) {
        img.tags.push(tagText);
        promises.push(saveTags(img));

        document.querySelectorAll(".glass-card").forEach((card) => {
          if (card.dataset.filename === img.filename) {
            const tagsList = card.querySelector(".tags-list");
            if (tagsList) {
              tagsList.appendChild(createTagElement(tagText, img, tagsList));
            }
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
    autocompleteBox.style.left = `${rect.left + window.scrollX}px`;
    autocompleteBox.style.top = `${rect.bottom + window.scrollY + 4}px`;
    autocompleteBox.style.width = `${rect.width}px`;

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

  searchInput.addEventListener("focus", (e) =>
    showAutocomplete(e.target, "search")
  );

  searchInput.addEventListener("input", (e) => {
    applyFiltersAndRender();
    filterAutocomplete(e.target.value);
  });

  searchInput.addEventListener("blur", () => {
    setTimeout(hideAutocomplete, 200);
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

    if (!query) {
      searchWrapper.classList.remove("is-active");
      renderGallery(allImages);
      return;
    }

    searchWrapper.classList.add("is-active");

    let filtered;
    if (query === "is:untagged") {
      filtered = allImages.filter((img) => {
        const hasTextTags = img.tags.some(
          (tag) => !tag.startsWith("http://") && !tag.startsWith("https://")
        );
        return !hasTextTags;
      });
    } else {
      filtered = allImages.filter(
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
    applyFiltersAndRender();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

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

  shuffleBtn.addEventListener("click", () => {
    const query = searchInput.value.toLowerCase().trim();
    lastSelectedIndex = null;
    currentPage = 1;

    let targetArray = allImages;

    if (query === "is:untagged") {
      targetArray = allImages.filter((img) => {
        const hasTextTags = img.tags.some(
          (tag) => !tag.startsWith("http://") && !tag.startsWith("https://")
        );
        return !hasTextTags;
      });
    } else if (query) {
      targetArray = allImages.filter(
        (img) =>
          img.tags.some((tag) => tag.toLowerCase().includes(query)) ||
          img.filename.toLowerCase().includes(query)
      );
    }

    renderGallery(shuffleArray([...targetArray]));
  });

  // --- REBUILT: Takes the global index, sets tracker, and loads media ---
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
      const span = document.createElement("span");
      span.className = "cloud-tag";

      if (isUrl) {
        span.style.background = "rgba(13, 148, 136, 0.15)";
        span.style.borderColor = "rgba(13, 148, 136, 0.3)";
        span.style.textTransform = "none";
        try {
          const urlObj = new URL(tagText);
          span.textContent = "↗ " + urlObj.hostname.replace("www.", "");
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

    document.body.classList.add("lightbox-open");
    lightbox.classList.add("is-active");
  }

  function closeLightbox() {
    lightbox.classList.remove("is-active");
    document.body.classList.remove("lightbox-open");
    currentLightboxIndex = -1; // Reset tracker

    setTimeout(() => {
      lightboxContent.innerHTML = "";
      lightboxTags.innerHTML = "";
    }, 300);
  }

  lightboxClose.addEventListener("click", closeLightbox);

  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox || e.target === lightboxTags) {
      closeLightbox();
    }
  });

  // --- REBUILT: Global Keydown Listener for Lightbox Navigation ---
  document.addEventListener("keydown", (e) => {
    // 1. If Autocomplete is open, let its own handler handle escape
    if (autocompleteBox.style.display === "flex") {
      if (e.key === "Escape") hideAutocomplete();
      return;
    }

    // 2. Lightbox Navigation
    if (lightbox.classList.contains("is-active")) {
      if (e.key === "Escape") {
        closeLightbox();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault(); // Stop page scrolling
        let newIndex = currentLightboxIndex - 1;
        // Wrap around to the very end if we are at the first item
        if (newIndex < 0) newIndex = currentRenderList.length - 1;
        if (currentRenderList.length > 0) openLightbox(newIndex);
      } else if (e.key === "ArrowRight") {
        e.preventDefault(); // Stop page scrolling
        let newIndex = currentLightboxIndex + 1;
        // Wrap around to the beginning if we hit the end
        if (newIndex >= currentRenderList.length) newIndex = 0;
        if (currentRenderList.length > 0) openLightbox(newIndex);
      }
    }
    // 3. Selection Mode Cancel
    else if (isSelectMode && e.key === "Escape") {
      selectModeBtn.click();
    }
  });

  fetchGallery();
});
