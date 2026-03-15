import {
  Plugin,
  ItemView,
  WorkspaceLeaf,
  TFile,
  CachedMetadata,
  FrontMatterCache,
} from "obsidian";

const VIEW_TYPE = "clean-cards-view";

// ── Canvas types (Obsidian .canvas JSON format) ──

interface CanvasNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  type?: string;
  text?: string;
}

interface CanvasData {
  nodes?: CanvasNode[];
  edges?: unknown[];
}

// ── Chip icon names ──

type ChipIconName = "layers" | "inbox" | "frame";

// ── View ──

class CleanCardsView extends ItemView {
  private _grid!: HTMLElement;
  private _filterBar!: HTMLElement;
  private _activeTag: string | null = null;
  private _lastColumnCount = 0;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _resizeRenderTimer: ReturnType<typeof setTimeout> | null = null;
  private _resizeObserver: ResizeObserver | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Cards View";
  }

  getIcon(): string {
    return "layout-grid";
  }

  async onOpen(): Promise<void> {
    this.containerEl.empty();
    this.containerEl.addClass("clean-cards-root");

    // Header (visible on mobile) — outside wrapper for sticky positioning
    this.containerEl.createEl("div", {
      cls: "clean-cards-header",
      text: "Cards View",
    });

    const wrapper = this.containerEl.createDiv({ cls: "clean-cards-wrapper" });

    // Tag filter bar
    this._filterBar = wrapper.createDiv({ cls: "clean-cards-filter-bar" });
    this._activeTag = null;

    const grid = wrapper.createDiv({ cls: "clean-cards-grid" });
    this._grid = grid;
    this._lastColumnCount = 0;

    this.renderFilterBar();
    await this.renderCards(grid);

    // Re-render when files change — hide immediately
    const fileChanged = (): void => {
      grid.addClass("is-hidden");
      this.debounceRender(grid);
    };
    this.registerEvent(this.app.vault.on("modify", fileChanged));
    this.registerEvent(this.app.vault.on("create", fileChanged));
    this.registerEvent(this.app.vault.on("delete", fileChanged));
    this.registerEvent(this.app.vault.on("rename", fileChanged));

    // Re-render when grid resizes (e.g. tab switch, window resize)
    this._resizeObserver = new ResizeObserver(() => {
      const newCount = this.getColumnCount(grid);
      if (newCount !== this._lastColumnCount && newCount > 0) {
        grid.addClass("is-hidden");
        this._lastColumnCount = newCount;
        if (this._resizeRenderTimer) clearTimeout(this._resizeRenderTimer);
        this._resizeRenderTimer = setTimeout(() => {
          void this.renderCards(grid);
        }, 50);
      }
    });
    this._resizeObserver.observe(grid);
  }

  // ── Layout helpers ──

  private getColumnCount(grid: HTMLElement): number {
    const gridWidth = grid.clientWidth;
    const isMobile = gridWidth < 500;
    return isMobile ? 2 : Math.max(1, Math.floor(gridWidth / 224));
  }

  private createChipIconSvg(name: ChipIconName): SVGSVGElement {
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

    const paths: Record<ChipIconName, Array<{ tag: string; attrs: Record<string, string> }>> = {
      layers: [
        { tag: "path", attrs: { d: "M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" } },
        { tag: "path", attrs: { d: "m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" } },
        { tag: "path", attrs: { d: "m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" } },
      ],
      inbox: [
        { tag: "polyline", attrs: { points: "22 12 16 12 14 15 10 15 8 12 2 12" } },
        { tag: "path", attrs: { d: "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" } },
      ],
      frame: [
        { tag: "line", attrs: { x1: "22", x2: "2", y1: "6", y2: "6" } },
        { tag: "line", attrs: { x1: "22", x2: "2", y1: "18", y2: "18" } },
        { tag: "line", attrs: { x1: "6", x2: "6", y1: "2", y2: "22" } },
        { tag: "line", attrs: { x1: "18", x2: "18", y1: "2", y2: "22" } },
      ],
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

  private setChipContent(chip: HTMLElement, icon: ChipIconName, label: string): void {
    chip.empty();
    chip.appendChild(this.createChipIconSvg(icon));
    chip.appendText(label);
  }

  // ── Filter bar ──

  private renderFilterBar(): void {
    this._filterBar.empty();

    // Collect all tags from all files
    const allTags = new Set<string>();
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      const cache = this.app.metadataCache.getFileCache(file);
      const frontmatter = cache?.frontmatter ?? {};
      const tags = this.getTags(frontmatter, cache);
      tags.forEach((t) => allTags.add(t));
    }

    const sortedTags = [...allTags].sort((a, b) => a.localeCompare(b));

    // "All" chip
    const allChip = this._filterBar.createEl("button", {
      cls:
        "clean-cards-filter-chip" +
        (this._activeTag === null ? " is-active" : ""),
    });
    this.setChipContent(allChip, "layers", "All");
    allChip.addEventListener("click", () => {
      this._activeTag = null;
      this.renderFilterBar();
      this._grid.addClass("is-hidden");
      void this.renderCards(this._grid);
    });

    // "Untagged" chip
    const untaggedChip = this._filterBar.createEl("button", {
      cls:
        "clean-cards-filter-chip" +
        (this._activeTag === "__untagged__" ? " is-active" : ""),
    });
    this.setChipContent(untaggedChip, "inbox", "Untagged");
    untaggedChip.addEventListener("click", () => {
      this._activeTag = "__untagged__";
      this.renderFilterBar();
      this._grid.addClass("is-hidden");
      void this.renderCards(this._grid);
    });

    // "Canvases" chip
    const canvasFiles = this.app.vault
      .getFiles()
      .filter((f) => f.extension === "canvas");
    if (canvasFiles.length > 0) {
      const canvasChip = this._filterBar.createEl("button", {
        cls:
          "clean-cards-filter-chip" +
          (this._activeTag === "__canvases__" ? " is-active" : ""),
      });
      this.setChipContent(canvasChip, "frame", "Canvases");
      canvasChip.addEventListener("click", () => {
        this._activeTag = "__canvases__";
        this.renderFilterBar();
        this._grid.addClass("is-hidden");
        void this.renderCards(this._grid);
      });
    }

    // Divider between system filters and tags
    if (sortedTags.length > 0) {
      this._filterBar.createEl("div", { cls: "clean-cards-filter-divider" });
    }

    // Tag chips
    for (const tag of sortedTags) {
      const chip = this._filterBar.createEl("button", {
        cls:
          "clean-cards-filter-chip" +
          (this._activeTag === tag ? " is-active" : ""),
        text: tag,
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

  private debounceRender(grid: HTMLElement): void {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this.renderFilterBar();
      void this.renderCards(grid);
    }, 500);
  }

  private async renderCards(grid: HTMLElement): Promise<void> {
    // Hide grid before rebuilding to prevent flash of wrong layout
    grid.addClass("is-hidden");

    grid.empty();

    // Get both markdown and canvas files
    const mdFiles = this.app.vault.getMarkdownFiles();
    const canvasFiles = this.app.vault
      .getFiles()
      .filter((f) => f.extension === "canvas");
    const allFiles: TFile[] = [...mdFiles, ...canvasFiles];

    // Sort by modification time, newest first
    allFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);

    // Filter by active tag
    let filteredFiles: TFile[] = allFiles;
    if (this._activeTag === "__canvases__") {
      filteredFiles = allFiles.filter((f) => f.extension === "canvas");
    } else if (this._activeTag === "__untagged__") {
      filteredFiles = [];
      for (const file of allFiles) {
        if (file.extension === "canvas") continue;
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter ?? {};
        const tags = this.getTags(frontmatter, cache);
        if (tags.length === 0) {
          filteredFiles.push(file);
        }
      }
    } else if (this._activeTag) {
      filteredFiles = [];
      for (const file of allFiles) {
        if (file.extension === "canvas") continue;
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter ?? {};
        const tags = this.getTags(frontmatter, cache);
        if (tags.includes(this._activeTag)) {
          filteredFiles.push(file);
        }
      }
    }

    // Calculate number of columns based on width
    const columnCount = this.getColumnCount(grid);
    this._lastColumnCount = columnCount;

    // Create column containers
    const columns: HTMLElement[] = [];
    for (let c = 0; c < columnCount; c++) {
      columns.push(grid.createDiv({ cls: "clean-cards-column" }));
    }

    // Distribute cards sequentially across columns
    for (let i = 0; i < filteredFiles.length; i++) {
      try {
        const file = filteredFiles[i];
        const card =
          file.extension === "canvas"
            ? await this.createCanvasCard(file)
            : await this.createCard(file);
        columns[i % columnCount].appendChild(card);
      } catch (e) {
        console.error("Clean Cards View: Error creating card", e);
      }
    }

    // Fade in after layout is ready
    requestAnimationFrame(() => {
      grid.removeClass("is-hidden");
    });
  }

  // ── Card builders ──

  private async createCard(file: TFile): Promise<HTMLElement> {
    const card = document.createElement("div");
    card.className = "clean-card";
    card.addEventListener("click", () => {
      this.app.workspace.getLeaf(false).openFile(file);
    });

    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter ?? {};
    const content = await this.app.vault.cachedRead(file);

    // Cover image
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

    // Body
    const body = document.createElement("div");
    body.className = "clean-card-body";

    // Title
    const title = (frontmatter.title as string) || file.basename;
    const titleEl = document.createElement("div");
    titleEl.className = "clean-card-title";
    titleEl.textContent = title;
    body.appendChild(titleEl);

    // Text preview
    const preview = this.getPreviewText(content);
    if (preview) {
      const previewEl = document.createElement("div");
      previewEl.className = "clean-card-preview";
      previewEl.textContent = preview;
      body.appendChild(previewEl);
    }

    // Tags
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

  private async createCanvasCard(file: TFile): Promise<HTMLElement> {
    const card = document.createElement("div");
    card.className = "clean-card clean-card-canvas";
    card.addEventListener("click", () => {
      this.app.workspace.getLeaf(false).openFile(file);
    });

    // Read and parse canvas JSON
    let nodes: CanvasNode[] = [];
    try {
      const content = await this.app.vault.read(file);
      if (content && content.trim()) {
        const canvasData: CanvasData = JSON.parse(content);
        nodes = canvasData.nodes ?? [];
      }
    } catch (e) {
      console.warn("Clean Cards View: Could not read canvas", file.path, e);
    }

    // Mini-map preview
    if (nodes.length > 0) {
      const coverEl = document.createElement("div");
      coverEl.className = "clean-card-cover clean-card-canvas-cover";
      const svg = this.renderCanvasMiniMap(nodes);
      coverEl.appendChild(svg);
      card.appendChild(coverEl);
    }

    // Body
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

  private renderCanvasMiniMap(nodes: CanvasNode[]): SVGSVGElement {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const w = node.width ?? 100;
      const h = node.height ?? 60;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
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
      const x = (node.x ?? 0) - minX + padding;
      const y = (node.y ?? 0) - minY + padding;
      const w = node.width ?? 100;
      const h = node.height ?? 60;

      const rect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      );
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(w));
      rect.setAttribute("height", String(h));
      rect.setAttribute("rx", "6");
      rect.setAttribute("fill", node.color ?? colors[i % colors.length]);
      rect.setAttribute("opacity", "0.6");
      svg.appendChild(rect);
    }

    return svg;
  }

  // ── Data extraction helpers ──

  private getCoverImage(
    frontmatter: FrontMatterCache,
    content: string,
    file: TFile
  ): string | null {
    // 1. Check frontmatter: cover, image, banner
    const coverField =
      (frontmatter.cover as string) ||
      (frontmatter.image as string) ||
      (frontmatter.banner as string);
    if (coverField) {
      return this.resolveImagePath(coverField, file);
    }

    // 2. YouTube from frontmatter (source, url)
    const sourceField = String(frontmatter.source ?? frontmatter.url ?? "");
    const ytIdFromFrontmatter = this.getYouTubeId(sourceField);
    if (ytIdFromFrontmatter) {
      return `https://img.youtube.com/vi/${ytIdFromFrontmatter}/mqdefault.jpg`;
    }

    // 3. Find first markdown image in note body
    const imgRegex = /!\[.*?\]\((.*?)\)/;
    const match = content.match(imgRegex);
    if (match?.[1]) {
      return this.resolveImagePath(match[1], file);
    }

    // 4. Wikilink image
    const wikiImgRegex =
      /!\[\[(.*?(?:\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg|\.bmp).*?)\]\]/i;
    const wikiMatch = content.match(wikiImgRegex);
    if (wikiMatch?.[1]) {
      const linkPath = wikiMatch[1].split("|")[0].trim();
      return this.resolveImagePath(linkPath, file);
    }

    // 5. YouTube thumbnail from body
    const ytId = this.getYouTubeId(content);
    if (ytId) {
      return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
    }

    return null;
  }

  private getYouTubeId(content: string): string | null {
    const patterns: RegExp[] = [
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([\w-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([\w-]{11})/,
      /(?:https?:\/\/)?youtu\.be\/([\w-]{11})/,
      /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([\w-]{11})/,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }
    return null;
  }

  private resolveImagePath(src: string, file: TFile): string | null {
    // External URL
    if (src.startsWith("http://") || src.startsWith("https://")) {
      return src;
    }

    // Resolve internal vault path
    const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(
      src,
      file.path
    );
    if (resolvedFile) {
      return this.app.vault.getResourcePath(resolvedFile);
    }

    return null;
  }

  private getPreviewText(content: string): string | null {
    // Remove frontmatter
    let text = content.replace(/^---[\s\S]*?---\n?/, "");

    // Remove images, links formatting, headers markers, bold/italic markers
    text = text
      .replace(/!\[.*?\]\(.*?\)/g, "")
      .replace(/!\[\[.*?\]\]/g, "")
      .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
      .replace(/\[\[([^\]|]*?)(?:\|([^\]]*?))?\]\]/g, "$2 || $1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*|__/g, "")
      .replace(/\*|_/g, "")
      .replace(/~~(.*?)~~/g, "$1")
      .replace(/`{1,3}[^`]*`{1,3}/g, "")
      .replace(/^[-*+]\s+/gm, "")
      .replace(/^\d+\.\s+/gm, "")
      .replace(/^>\s+/gm, "")
      .replace(/\n{2,}/g, "\n")
      .trim();

    if (text.length > 160) {
      return text.substring(0, 160).trim() + "…";
    }
    return text || null;
  }

  private getTags(
    frontmatter: FrontMatterCache,
    cache: CachedMetadata | null
  ): string[] {
    const tags = new Set<string>();

    // From frontmatter
    if (frontmatter.tags) {
      const fmTags = Array.isArray(frontmatter.tags)
        ? (frontmatter.tags as string[])
        : String(frontmatter.tags)
            .split(",")
            .map((t) => t.trim());
      fmTags.forEach((t) => tags.add(t.replace("#", "")));
    }

    // From inline tags in content
    if (cache?.tags) {
      cache.tags.forEach((t) => tags.add(t.tag.replace("#", "")));
    }

    return [...tags];
  }

  // ── Cleanup ──

  async onClose(): Promise<void> {
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    if (this._resizeRenderTimer) clearTimeout(this._resizeRenderTimer);
    if (this._resizeObserver) this._resizeObserver.disconnect();
  }
}

// ── Plugin ──

export default class CleanCardsPlugin extends Plugin {
  onload(): void {
    this.registerView(VIEW_TYPE, (leaf) => new CleanCardsView(leaf));

    this.addRibbonIcon("layout-grid", "Cards View", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-view",
      name: "Open cards view",
      callback: () => {
        void this.activateView();
      },
    });
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;

    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];

    if (!leaf) {
      leaf = workspace.getLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }

    workspace.revealLeaf(leaf);
  }

  onunload(): void {}
}
