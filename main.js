var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => CleanCardsPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var VIEW_TYPE = "clean-cards-view";
var CleanCardsView = class extends import_obsidian.ItemView {
  constructor(leaf) {
    super(leaf);
    this._activeTag = null;
    this._lastColumnCount = 0;
    this._debounceTimer = null;
    this._resizeRenderTimer = null;
    this._resizeObserver = null;
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Cards view";
  }
  getIcon() {
    return "layout-grid";
  }
  async onOpen() {
    this.containerEl.empty();
    this.containerEl.addClass("clean-cards-root");
    this.containerEl.createEl("div", {
      cls: "clean-cards-header",
      text: "Cards view"
    });
    const wrapper = this.containerEl.createDiv({ cls: "clean-cards-wrapper" });
    this._filterBar = wrapper.createDiv({ cls: "clean-cards-filter-bar" });
    this._activeTag = null;
    const grid = wrapper.createDiv({ cls: "clean-cards-grid" });
    this._grid = grid;
    this._lastColumnCount = 0;
    this.renderFilterBar();
    await this.renderCards(grid);
    const fileChanged = () => {
      grid.addClass("is-hidden");
      this.debounceRender(grid);
    };
    this.registerEvent(this.app.vault.on("modify", fileChanged));
    this.registerEvent(this.app.vault.on("create", fileChanged));
    this.registerEvent(this.app.vault.on("delete", fileChanged));
    this.registerEvent(this.app.vault.on("rename", fileChanged));
    this._resizeObserver = new ResizeObserver(() => {
      const newCount = this.getColumnCount(grid);
      if (newCount !== this._lastColumnCount && newCount > 0) {
        grid.addClass("is-hidden");
        this._lastColumnCount = newCount;
        if (this._resizeRenderTimer)
          clearTimeout(this._resizeRenderTimer);
        this._resizeRenderTimer = setTimeout(() => {
          void this.renderCards(grid);
        }, 50);
      }
    });
    this._resizeObserver.observe(grid);
  }
  // ── Layout helpers ──
  getColumnCount(grid) {
    const gridWidth = grid.clientWidth;
    const isMobile = gridWidth < 500;
    return isMobile ? 2 : Math.max(1, Math.floor(gridWidth / 224));
  }
  createChipIconSvg(name) {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "clean-cards-chip-icon");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const paths = {
      layers: [
        { tag: "path", attrs: { d: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" } },
        { tag: "path", attrs: { d: "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" } },
        { tag: "path", attrs: { d: "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" } }
      ],
      inbox: [
        { tag: "polyline", attrs: { points: "22 12 16 12 14 15 10 15 8 12 2 12" } },
        { tag: "path", attrs: { d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" } }
      ],
      frame: [
        { tag: "line", attrs: { x1: "22", x2: "2", y1: "6", y2: "6" } },
        { tag: "line", attrs: { x1: "22", x2: "2", y1: "18", y2: "18" } },
        { tag: "line", attrs: { x1: "6", x2: "6", y1: "2", y2: "22" } },
        { tag: "line", attrs: { x1: "18", x2: "18", y1: "2", y2: "22" } }
      ]
    };
    for (const def of paths[name]) {
      const el = document.createElementNS(NS, def.tag);
      for (const [k, v] of Object.entries(def.attrs)) {
        el.setAttribute(k, v);
      }
      svg.appendChild(el);
    }
    return svg;
  }
  setChipContent(chip, icon, label) {
    chip.empty();
    chip.appendChild(this.createChipIconSvg(icon));
    chip.appendText(label);
  }
  // ── Filter bar ──
  renderFilterBar() {
    var _a;
    this._filterBar.empty();
    const allTags = /* @__PURE__ */ new Set();
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = (_a = cache == null ? void 0 : cache.frontmatter) != null ? _a : {};
      const tags = this.getTags(frontmatter, cache);
      tags.forEach((t) => allTags.add(t));
    }
    const sortedTags = [...allTags].sort((a, b) => a.localeCompare(b));
    const allChip = this._filterBar.createEl("button", {
      cls: "clean-cards-filter-chip" + (this._activeTag === null ? " is-active" : "")
    });
    this.setChipContent(allChip, "layers", "All");
    allChip.addEventListener("click", () => {
      this._activeTag = null;
      this.renderFilterBar();
      this._grid.addClass("is-hidden");
      void this.renderCards(this._grid);
    });
    const untaggedChip = this._filterBar.createEl("button", {
      cls: "clean-cards-filter-chip" + (this._activeTag === "__untagged__" ? " is-active" : "")
    });
    this.setChipContent(untaggedChip, "inbox", "Untagged");
    untaggedChip.addEventListener("click", () => {
      this._activeTag = "__untagged__";
      this.renderFilterBar();
      this._grid.addClass("is-hidden");
      void this.renderCards(this._grid);
    });
    const canvasFiles = this.app.vault.getFiles().filter((f) => f.extension === "canvas");
    if (canvasFiles.length > 0) {
      const canvasChip = this._filterBar.createEl("button", {
        cls: "clean-cards-filter-chip" + (this._activeTag === "__canvases__" ? " is-active" : "")
      });
      this.setChipContent(canvasChip, "frame", "Canvases");
      canvasChip.addEventListener("click", () => {
        this._activeTag = "__canvases__";
        this.renderFilterBar();
        this._grid.addClass("is-hidden");
        void this.renderCards(this._grid);
      });
    }
    if (sortedTags.length > 0) {
      this._filterBar.createEl("div", { cls: "clean-cards-filter-divider" });
    }
    for (const tag of sortedTags) {
      const chip = this._filterBar.createEl("button", {
        cls: "clean-cards-filter-chip" + (this._activeTag === tag ? " is-active" : ""),
        text: tag
      });
      chip.addEventListener("click", () => {
        this._activeTag = tag;
        this.renderFilterBar();
        this._grid.addClass("is-hidden");
        void this.renderCards(this._grid);
      });
    }
  }
  // ── Rendering ──
  debounceRender(grid) {
    if (this._debounceTimer)
      clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this.renderFilterBar();
      void this.renderCards(grid);
    }, 500);
  }
  async renderCards(grid) {
    var _a, _b;
    grid.addClass("is-hidden");
    grid.empty();
    const mdFiles = this.app.vault.getMarkdownFiles();
    const canvasFiles = this.app.vault.getFiles().filter((f) => f.extension === "canvas");
    const allFiles = [...mdFiles, ...canvasFiles];
    allFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);
    let filteredFiles = allFiles;
    if (this._activeTag === "__canvases__") {
      filteredFiles = allFiles.filter((f) => f.extension === "canvas");
    } else if (this._activeTag === "__untagged__") {
      filteredFiles = [];
      for (const file of allFiles) {
        if (file.extension === "canvas")
          continue;
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = (_a = cache == null ? void 0 : cache.frontmatter) != null ? _a : {};
        const tags = this.getTags(frontmatter, cache);
        if (tags.length === 0) {
          filteredFiles.push(file);
        }
      }
    } else if (this._activeTag) {
      filteredFiles = [];
      for (const file of allFiles) {
        if (file.extension === "canvas")
          continue;
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = (_b = cache == null ? void 0 : cache.frontmatter) != null ? _b : {};
        const tags = this.getTags(frontmatter, cache);
        if (tags.includes(this._activeTag)) {
          filteredFiles.push(file);
        }
      }
    }
    const columnCount = this.getColumnCount(grid);
    this._lastColumnCount = columnCount;
    const columns = [];
    for (let c = 0; c < columnCount; c++) {
      columns.push(grid.createDiv({ cls: "clean-cards-column" }));
    }
    for (let i = 0; i < filteredFiles.length; i++) {
      try {
        const file = filteredFiles[i];
        const card = file.extension === "canvas" ? await this.createCanvasCard(file) : await this.createCard(file);
        columns[i % columnCount].appendChild(card);
      } catch (e) {
        console.error("Clean Cards View: Error creating card", e);
      }
    }
    requestAnimationFrame(() => {
      grid.removeClass("is-hidden");
    });
  }
  // ── Card builders ──
  async createCard(file) {
    var _a;
    const card = document.createElement("div");
    card.className = "clean-card";
    card.addEventListener("click", () => {
      this.app.workspace.getLeaf(false).openFile(file);
    });
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = (_a = cache == null ? void 0 : cache.frontmatter) != null ? _a : {};
    const content = await this.app.vault.cachedRead(file);
    const coverImage = this.getCoverImage(frontmatter, content, file);
    if (coverImage) {
      const coverEl = document.createElement("div");
      coverEl.className = "clean-card-cover";
      const img = document.createElement("img");
      img.src = coverImage;
      img.alt = "";
      img.loading = "lazy";
      coverEl.appendChild(img);
      card.appendChild(coverEl);
    }
    const body = document.createElement("div");
    body.className = "clean-card-body";
    const title = frontmatter.title || file.basename;
    const titleEl = document.createElement("div");
    titleEl.className = "clean-card-title";
    titleEl.textContent = title;
    body.appendChild(titleEl);
    const preview = this.getPreviewText(content);
    if (preview) {
      const previewEl = document.createElement("div");
      previewEl.className = "clean-card-preview";
      previewEl.textContent = preview;
      body.appendChild(previewEl);
    }
    const tags = this.getTags(frontmatter, cache);
    if (tags.length > 0) {
      const tagsContainer = document.createElement("div");
      tagsContainer.className = "clean-card-tags";
      for (const tag of tags) {
        const tagEl = document.createElement("span");
        tagEl.className = "clean-card-tag";
        tagEl.textContent = tag.replace("#", "");
        tagsContainer.appendChild(tagEl);
      }
      body.appendChild(tagsContainer);
    }
    card.appendChild(body);
    return card;
  }
  async createCanvasCard(file) {
    var _a;
    const card = document.createElement("div");
    card.className = "clean-card clean-card-canvas";
    card.addEventListener("click", () => {
      this.app.workspace.getLeaf(false).openFile(file);
    });
    let nodes = [];
    try {
      const content = await this.app.vault.read(file);
      if (content && content.trim()) {
        const canvasData = JSON.parse(content);
        nodes = (_a = canvasData.nodes) != null ? _a : [];
      }
    } catch (e) {
      console.warn("Clean Cards View: Could not read canvas", file.path, e);
    }
    if (nodes.length > 0) {
      const coverEl = document.createElement("div");
      coverEl.className = "clean-card-cover clean-card-canvas-cover";
      const svg = this.renderCanvasMiniMap(nodes);
      coverEl.appendChild(svg);
      card.appendChild(coverEl);
    }
    const body = document.createElement("div");
    body.className = "clean-card-body";
    const titleEl = document.createElement("div");
    titleEl.className = "clean-card-title";
    titleEl.textContent = file.basename;
    body.appendChild(titleEl);
    card.appendChild(body);
    return card;
  }
  // ── Canvas mini-map ──
  renderCanvasMiniMap(nodes) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      const x = (_a = node.x) != null ? _a : 0;
      const y = (_b = node.y) != null ? _b : 0;
      const w = (_c = node.width) != null ? _c : 100;
      const h = (_d = node.height) != null ? _d : 60;
      if (x < minX)
        minX = x;
      if (y < minY)
        minY = y;
      if (x + w > maxX)
        maxX = x + w;
      if (y + h > maxY)
        maxY = y + h;
    }
    const padding = 20;
    const totalW = maxX - minX + padding * 2;
    const totalH = maxY - minY + padding * 2;
    const svg = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );
    svg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.setAttribute("class", "clean-card-canvas-svg");
    const colors = ["#6C7A89", "#7B8D8E", "#8E8E93", "#A0A4A8", "#B0B3B8"];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const x = ((_e = node.x) != null ? _e : 0) - minX + padding;
      const y = ((_f = node.y) != null ? _f : 0) - minY + padding;
      const w = (_g = node.width) != null ? _g : 100;
      const h = (_h = node.height) != null ? _h : 60;
      const rect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      );
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(w));
      rect.setAttribute("height", String(h));
      rect.setAttribute("rx", "6");
      rect.setAttribute("fill", (_i = node.color) != null ? _i : colors[i % colors.length]);
      rect.setAttribute("opacity", "0.6");
      svg.appendChild(rect);
    }
    return svg;
  }
  // ── Data extraction helpers ──
  getCoverImage(frontmatter, content, file) {
    var _a, _b;
    const coverField = frontmatter.cover || frontmatter.image || frontmatter.banner;
    if (coverField) {
      return this.resolveImagePath(coverField, file);
    }
    const sourceField = String((_b = (_a = frontmatter.source) != null ? _a : frontmatter.url) != null ? _b : "");
    const ytIdFromFrontmatter = this.getYouTubeId(sourceField);
    if (ytIdFromFrontmatter) {
      return `https://img.youtube.com/vi/${ytIdFromFrontmatter}/mqdefault.jpg`;
    }
    const imgRegex = /!\[.*?\]\((.*?)\)/;
    const match = content.match(imgRegex);
    if (match == null ? void 0 : match[1]) {
      return this.resolveImagePath(match[1], file);
    }
    const wikiImgRegex = /!\[\[(.*?(?:\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg|\.bmp).*?)\]\]/i;
    const wikiMatch = content.match(wikiImgRegex);
    if (wikiMatch == null ? void 0 : wikiMatch[1]) {
      const linkPath = wikiMatch[1].split("|")[0].trim();
      return this.resolveImagePath(linkPath, file);
    }
    const ytId = this.getYouTubeId(content);
    if (ytId) {
      return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
    }
    return null;
  }
  getYouTubeId(content) {
    const patterns = [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([\w-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([\w-]{11})/,
      /(?:https?:\/\/)?youtu\.be\/([\w-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([\w-]{11})/
    ];
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match == null ? void 0 : match[1]) {
        return match[1];
      }
    }
    return null;
  }
  resolveImagePath(src, file) {
    if (src.startsWith("http://") || src.startsWith("https://")) {
      return src;
    }
    const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(
      src,
      file.path
    );
    if (resolvedFile) {
      return this.app.vault.getResourcePath(resolvedFile);
    }
    return null;
  }
  getPreviewText(content) {
    let text = content.replace(/^---[\s\S]*?---\n?/, "");
    text = text.replace(/!\[.*?\]\(.*?\)/g, "").replace(/!\[\[.*?\]\]/g, "").replace(/\[([^\]]*)\]\(.*?\)/g, "$1").replace(/\[\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/g, "$2 || $1").replace(/^#{1,6}\s+/gm, "").replace(/\*\*|__/g, "").replace(/\*|_/g, "").replace(/~~(.*?)~~/g, "$1").replace(/`{1,3}[^`]*`{1,3}/g, "").replace(/^[-*+]\s+/gm, "").replace(/^\d+\.\s+/gm, "").replace(/^>\s+/gm, "").replace(/\n{2,}/g, "\n").trim();
    if (text.length > 160) {
      return text.substring(0, 160).trim() + "\u2026";
    }
    return text || null;
  }
  getTags(frontmatter, cache) {
    const tags = /* @__PURE__ */ new Set();
    if (frontmatter.tags) {
      const fmTags = Array.isArray(frontmatter.tags) ? frontmatter.tags : String(frontmatter.tags).split(",").map((t) => t.trim());
      fmTags.forEach((t) => tags.add(t.replace("#", "")));
    }
    if (cache == null ? void 0 : cache.tags) {
      cache.tags.forEach((t) => tags.add(t.tag.replace("#", "")));
    }
    return [...tags];
  }
  // ── Cleanup ──
  async onClose() {
    if (this._debounceTimer)
      clearTimeout(this._debounceTimer);
    if (this._resizeRenderTimer)
      clearTimeout(this._resizeRenderTimer);
    if (this._resizeObserver)
      this._resizeObserver.disconnect();
  }
};
var CleanCardsPlugin = class extends import_obsidian.Plugin {
  onload() {
    this.registerView(VIEW_TYPE, (leaf) => new CleanCardsView(leaf));
    this.addRibbonIcon("layout-grid", "Cards view", () => {
      void this.activateView();
    });
    this.addCommand({
      id: "open-view",
      name: "Open cards view",
      callback: () => {
        void this.activateView();
      }
    });
  }
  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }
  onunload() {
  }
};
