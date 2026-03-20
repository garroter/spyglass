/* generated — edit src/webview/ instead */
"use strict";
(() => {
  // src/webview/state.ts
  var { INITIAL_HISTORY, RECENT_FILES, PINNED_FILES, DEFAULT_SCOPE } = window.__spyglass;
  var state = {
    results: [],
    fileResults: [],
    symbolResults: [],
    fileList: null,
    gitFiles: null,
    recentFiles: RECENT_FILES,
    pinnedFiles: PINNED_FILES.slice(),
    gitStatus: {},
    selected: 0,
    scope: DEFAULT_SCOPE,
    useRegex: false,
    caseSensitive: false,
    wholeWord: false,
    globFilter: "",
    replaceMode: false,
    groupResults: false,
    query: "",
    searching: false,
    showPreview: true,
    multiSelected: /* @__PURE__ */ new Set(),
    searchHistory: INITIAL_HISTORY.slice(),
    historyIndex: -1,
    historyPreQuery: "",
    currentPreviewFile: null
  };

  // src/webview/dom.ts
  var queryEl = document.getElementById("query");
  var regexBtn = document.getElementById("regex-btn");
  var caseBtn = document.getElementById("case-btn");
  var wordBtn = document.getElementById("word-btn");
  var groupBtn = document.getElementById("group-btn");
  var replaceBtn = document.getElementById("replace-btn");
  var previewBtn = document.getElementById("preview-btn");
  var replaceRow = document.getElementById("replace-row");
  var replaceInput = document.getElementById("replace-input");
  var replaceAllBtn = document.getElementById("replace-all-btn");
  var wrap = document.getElementById("results-wrap");
  var stateMsg = document.getElementById("state-msg");
  var resultInfo = document.getElementById("result-info");
  var searchTook = document.getElementById("search-took");
  var leftPanel = document.getElementById("left-panel");
  var rightPanel = document.getElementById("right-panel");
  var previewHdr = document.getElementById("preview-header");
  var previewEmpty = document.getElementById("preview-empty");
  var previewCont = document.getElementById("preview-content");
  var tabs = document.querySelectorAll(".tab");
  var helpBtn = document.getElementById("help-btn");
  var shortcutsOverlay = document.getElementById("shortcuts-overlay");
  var ctxMenu = document.getElementById("ctx-menu");
  var ctxOpen = document.getElementById("ctx-open");
  var ctxOpenSplit = document.getElementById("ctx-open-split");
  var ctxCopyAbs = document.getElementById("ctx-copy-abs");
  var ctxCopyRel = document.getElementById("ctx-copy-rel");
  var ctxReveal = document.getElementById("ctx-reveal");
  var ctxPin = document.getElementById("ctx-pin");

  // src/webview/vscode.ts
  var vscode = acquireVsCodeApi();

  // src/webview/search.ts
  function isFileScope() {
    return state.scope === "files" || state.scope === "recent" || state.scope === "git";
  }
  function isSymbolScope() {
    return state.scope === "symbols";
  }
  function isGitScope() {
    return state.scope === "git";
  }
  function isTextScope() {
    return !isFileScope() && !isSymbolScope();
  }
  function parseQueryInput(raw) {
    const words = raw.split(/\s+/);
    const globs = [], terms = [];
    for (const w of words) {
      if (w && (w.startsWith("*") || w.startsWith("!"))) {
        globs.push(w);
      } else {
        terms.push(w);
      }
    }
    return { query: terms.join(" ").trim(), globFilter: globs.join(",") };
  }
  function fuzzyScore(str, query) {
    const lStr = str.toLowerCase();
    const lQuery = query.toLowerCase();
    const positions = [];
    let si = 0, qi = 0;
    while (si < lStr.length && qi < lQuery.length) {
      if (lStr[si] === lQuery[qi]) {
        positions.push(si);
        qi++;
      }
      si++;
    }
    if (qi < lQuery.length) {
      return null;
    }
    let score = 0, consecutive = 1;
    for (let i = 1; i < positions.length; i++) {
      if (positions[i] === positions[i - 1] + 1) {
        score += consecutive * 10;
        consecutive++;
      } else {
        consecutive = 1;
      }
    }
    const basenameStart = str.lastIndexOf("/") + 1;
    if (positions[0] >= basenameStart) {
      score += 50;
    }
    if (positions[0] === basenameStart) {
      score += 30;
    }
    score -= positions[positions.length - 1] - positions[0];
    let slashes = 0;
    for (let i = 0; i < str.length; i++) {
      if (str[i] === "/") {
        slashes++;
      }
    }
    score -= slashes * 2;
    return { score, positions };
  }
  function fuzzyFilter(fileList, query) {
    if (!query.trim()) {
      return fileList.map(({ file, rel }) => ({ file, relativePath: rel, matchPositions: [] }));
    }
    const scored = [];
    for (const { file, rel } of fileList) {
      const match = fuzzyScore(rel, query);
      if (match) {
        scored.push({ file, relativePath: rel, matchPositions: match.positions, score: match.score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map(({ file, relativePath, matchPositions }) => ({ file, relativePath, matchPositions }));
  }
  function filterFilesLocally(fileList, query) {
    const maxResults = 200;
    if (state.scope === "recent" && state.pinnedFiles.length > 0) {
      const pinnedPaths = new Set(state.pinnedFiles.map((f) => f.file));
      const pinned = fuzzyFilter(state.pinnedFiles, query).map((r) => ({ ...r, isPinned: true }));
      const nonPinned = fuzzyFilter(
        fileList.filter((f) => !pinnedPaths.has(f.file)),
        query
      );
      state.fileResults = [...pinned, ...nonPinned].slice(0, maxResults);
      state.searching = false;
      state.selected = 0;
      return;
    }
    state.fileResults = fuzzyFilter(fileList, query).slice(0, maxResults);
    state.searching = false;
    state.selected = 0;
  }
  var searchTimer = null;
  function triggerSearch(renderFn) {
    clearTimeout(searchTimer);
    if (state.scope === "files") {
      if (state.fileList) {
        filterFilesLocally(state.fileList, state.query);
        renderFn();
      } else {
        state.searching = true;
        renderFn();
        searchTimer = setTimeout(() => vscode.postMessage({ type: "fileSearch" }), 180);
      }
      return;
    }
    if (state.scope === "recent") {
      filterFilesLocally(state.recentFiles, state.query);
      renderFn();
      return;
    }
    if (state.scope === "git") {
      if (state.gitFiles) {
        filterFilesLocally(state.gitFiles, state.query);
        renderFn();
      } else {
        state.searching = true;
        renderFn();
        searchTimer = setTimeout(() => vscode.postMessage({ type: "gitSearch" }), 50);
      }
      return;
    }
    searchTimer = setTimeout(() => {
      if (state.scope === "symbols") {
        state.searching = true;
        renderFn();
        vscode.postMessage({ type: "symbolSearch", query: state.query });
      } else {
        vscode.postMessage({
          type: "search",
          query: state.query,
          useRegex: state.useRegex,
          scope: state.scope,
          caseSensitive: state.caseSensitive,
          wholeWord: state.wholeWord,
          globFilter: state.globFilter
        });
      }
    }, 180);
  }

  // src/webview/highlight.ts
  var KW = /* @__PURE__ */ new Set([
    // JS / TS
    "const",
    "let",
    "var",
    "function",
    "class",
    "interface",
    "type",
    "enum",
    "import",
    "export",
    "from",
    "return",
    "if",
    "else",
    "for",
    "while",
    "do",
    "switch",
    "case",
    "break",
    "continue",
    "new",
    "typeof",
    "instanceof",
    "void",
    "null",
    "undefined",
    "true",
    "false",
    "async",
    "await",
    "extends",
    "implements",
    "static",
    "public",
    "private",
    "protected",
    "readonly",
    "abstract",
    "declare",
    "namespace",
    "default",
    "throw",
    "try",
    "catch",
    "finally",
    "in",
    "of",
    "yield",
    "get",
    "set",
    "this",
    "super",
    // Python
    "def",
    "elif",
    "except",
    "lambda",
    "with",
    "as",
    "pass",
    "del",
    "assert",
    "raise",
    "nonlocal",
    "global",
    "and",
    "or",
    "not",
    "is",
    "None",
    "True",
    "False",
    // Rust
    "fn",
    "mut",
    "struct",
    "impl",
    "trait",
    "use",
    "mod",
    "pub",
    "crate",
    "self",
    "Self",
    "match",
    "loop",
    "where",
    "unsafe",
    "extern",
    "move",
    "ref",
    // Go
    "func",
    "chan",
    "map",
    "range",
    "defer",
    "go",
    "select",
    "make",
    "len",
    "cap",
    "append",
    "copy",
    "delete",
    "close",
    "panic",
    "recover",
    "package",
    // Generic
    "include",
    "require",
    "end",
    "then",
    "begin",
    "module"
  ]);
  var HASH_COMMENT_EXTS = /* @__PURE__ */ new Set([
    "py",
    "rb",
    "sh",
    "bash",
    "zsh",
    "fish",
    "yaml",
    "yml",
    "toml",
    "conf",
    "ini",
    "r",
    "pl",
    "pm",
    "tcl",
    "coffee",
    "cr"
  ]);
  function escHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function highlightLine(text, ext) {
    const useHash = HASH_COMMENT_EXTS.has(ext);
    const out = [];
    let i = 0;
    const n = text.length;
    function push(cls, value) {
      const v = escHtml(value);
      out.push(cls ? '<span class="' + cls + '">' + v + "</span>" : v);
    }
    while (i < n) {
      const c = text[i];
      const c2 = text[i + 1];
      if (c === "/" && c2 === "/" || useHash && c === "#") {
        push("hl-cmt", text.slice(i));
        break;
      }
      if (c === "/" && c2 === "*") {
        const end = text.indexOf("*/", i + 2);
        if (end !== -1) {
          push("hl-cmt", text.slice(i, end + 2));
          i = end + 2;
        } else {
          push("hl-cmt", text.slice(i));
          break;
        }
        continue;
      }
      if (c === '"' || c === "'" || c.charCodeAt(0) === 96) {
        let j = i + 1;
        while (j < n) {
          if (text[j] === "\\") {
            j += 2;
            continue;
          }
          if (text[j] === c) {
            j++;
            break;
          }
          j++;
        }
        push("hl-str", text.slice(i, j));
        i = j;
        continue;
      }
      if (/[0-9]/.test(c) || c === "." && /[0-9]/.test(c2 || "")) {
        let j = i;
        while (j < n && /[0-9a-fA-FxXoObB._]/.test(text[j])) {
          j++;
        }
        push("hl-num", text.slice(i, j));
        i = j;
        continue;
      }
      if (/[a-zA-Z_$]/.test(c)) {
        let j = i;
        while (j < n && /[a-zA-Z0-9_$]/.test(text[j])) {
          j++;
        }
        const word = text.slice(i, j);
        let k = j;
        while (k < n && text[k] === " ") {
          k++;
        }
        if (KW.has(word)) {
          push("hl-kw", word);
        } else if (text[k] === "(") {
          push("hl-fn", word);
        } else {
          push("", word);
        }
        i = j;
        continue;
      }
      if ("+-*/%=!<>&|^~?:".includes(c)) {
        push("hl-op", c);
        i++;
      } else {
        push("", c);
        i++;
      }
    }
    return out.join("");
  }
  function applyQueryHighlight(html, rawText, queryRe) {
    queryRe.lastIndex = 0;
    const opens = /* @__PURE__ */ new Set();
    const closes = /* @__PURE__ */ new Set();
    let m;
    while ((m = queryRe.exec(rawText)) !== null) {
      if (m[0].length === 0) {
        queryRe.lastIndex++;
        continue;
      }
      opens.add(m.index);
      closes.add(m.index + m[0].length);
    }
    if (!opens.size) {
      return html;
    }
    let result = "", visPos = 0, i = 0;
    while (i < html.length) {
      if (closes.has(visPos)) {
        result += "</mark>";
      }
      if (opens.has(visPos)) {
        result += '<mark class="qm">';
      }
      if (html[i] === "<") {
        const end = html.indexOf(">", i);
        result += html.slice(i, end + 1);
        i = end + 1;
      } else if (html[i] === "&") {
        const end = html.indexOf(";", i);
        result += html.slice(i, end + 1);
        i = end + 1;
        visPos++;
      } else {
        result += html[i++];
        visPos++;
      }
    }
    if (closes.has(visPos)) {
      result += "</mark>";
    }
    return result;
  }
  function highlightMatch(text, start, end) {
    return escHtml(text.slice(0, start)) + "<mark>" + escHtml(text.slice(start, end)) + "</mark>" + escHtml(text.slice(end));
  }
  function highlightPositions(text, positions) {
    const posSet = new Set(positions);
    let html = "";
    for (let i = 0; i < text.length; i++) {
      const c = escHtml(text[i]);
      html += posSet.has(i) ? "<mark>" + c + "</mark>" : c;
    }
    return html;
  }

  // src/webview/preview.ts
  var previewTimer = null;
  function renderBreadcrumbs(relativePath) {
    const parts = relativePath.split("/");
    previewHdr.innerHTML = parts.map((part, i) => {
      const isLast = i === parts.length - 1;
      return '<span class="bc-' + (isLast ? "file" : "dir") + '">' + escHtml(part) + "</span>" + (isLast ? "" : '<span class="bc-sep"> / </span>');
    }).join("");
  }
  function clearPreview() {
    previewHdr.innerHTML = '<span class="bc-dim">No file selected</span>';
    previewEmpty.style.display = "";
    previewCont.style.display = "none";
    previewCont.innerHTML = "";
    state.currentPreviewFile = null;
  }
  function renderPreview(lines, currentLine, relativePath, ext, changedLines, highlightQuery, useRegex, preHighlighted) {
    renderBreadcrumbs(relativePath);
    state.currentPreviewFile = relativePath;
    previewEmpty.style.display = "none";
    previewCont.style.display = "block";
    let queryRe = null;
    if (highlightQuery) {
      try {
        const pattern = useRegex ? highlightQuery : highlightQuery.replace(/[.*+?^{}()|[\]\\$]/g, "\\$&");
        queryRe = new RegExp(pattern, "gi");
      } catch {
      }
    }
    const changedSet = new Set(changedLines || []);
    const frag = document.createDocumentFragment();
    lines.forEach((line, i) => {
      const num = i + 1;
      const isCur = num === currentLine;
      const isChanged = changedSet.has(num);
      const div = document.createElement("div");
      div.className = "pline" + (isCur ? " pline--cur" : "") + (isChanged ? " pline--changed" : "");
      const rawText = preHighlighted ? line.replace(/<[^>]*>/g, "") : line;
      let lineHtml = preHighlighted ? line : highlightLine(line, ext);
      if (queryRe) {
        lineHtml = applyQueryHighlight(lineHtml, rawText, queryRe);
      }
      div.innerHTML = '<span class="pnum">' + num + '</span><span class="ptext">' + lineHtml + "</span>";
      frag.appendChild(div);
    });
    previewCont.innerHTML = "";
    previewCont.appendChild(frag);
    previewCont.querySelector(".pline--cur")?.scrollIntoView({ block: "center" });
  }
  function requestPreview() {
    if (isFileScope()) {
      requestFilePreview();
    } else if (isSymbolScope()) {
      requestSymbolPreview();
    } else {
      requestTextPreview();
    }
  }
  function requestTextPreview() {
    if (!state.showPreview) {
      return;
    }
    const rd = recentDefault();
    const r = rd ? rd[state.selected] : state.results[state.selected];
    if (!r) {
      return;
    }
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      vscode.postMessage({ type: "preview", file: r.file, line: rd ? 1 : r.line });
    }, 80);
  }
  function requestFilePreview() {
    if (!state.showPreview) {
      return;
    }
    const r = state.fileResults[state.selected];
    if (!r) {
      return;
    }
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      vscode.postMessage({ type: "preview", file: r.file, line: 1 });
    }, 80);
  }
  function requestSymbolPreview() {
    if (!state.showPreview) {
      return;
    }
    const r = state.symbolResults[state.selected];
    if (!r) {
      return;
    }
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      vscode.postMessage({ type: "preview", file: r.file, line: r.line });
    }, 80);
  }
  function togglePreview() {
    state.showPreview = !state.showPreview;
    previewBtn.classList.toggle("active", state.showPreview);
    rightPanel.classList.toggle("hidden", !state.showPreview);
    leftPanel.classList.toggle("full", !state.showPreview);
    if (state.showPreview) {
      requestPreview();
    }
  }
  function recentDefault() {
    return !state.query && !state.searching && state.results.length === 0 && !isFileScope() && !isSymbolScope() ? state.recentFiles.slice(0, 12) : null;
  }

  // src/webview/render.ts
  function render() {
    if (isFileScope()) {
      renderFileResults();
    } else if (isSymbolScope()) {
      renderSymbolResults();
    } else {
      renderTextResults();
    }
  }
  function updateSelection() {
    wrap.querySelectorAll(".result").forEach((el, i) => {
      el.classList.toggle("selected", i === state.selected);
    });
    scrollToSelected();
  }
  function scrollToSelected() {
    wrap.querySelector(".result.selected")?.scrollIntoView({ block: "nearest" });
  }
  function gitBadgeHtml(relativePath) {
    const s = state.gitStatus[relativePath];
    if (!s) {
      return "";
    }
    return '<span class="git-badge git-badge--' + s + '">' + s + "</span>";
  }
  function renderTextResults() {
    wrap.querySelectorAll(".result, .file-group-header").forEach((el) => el.remove());
    const MAX_RESULTS = window.__spyglass.MAX_RESULTS;
    if (state.searching && state.results.length === 0) {
      stateMsg.innerHTML = '<span class="spinner"></span>Searching\u2026';
      stateMsg.style.display = "";
      resultInfo.textContent = "\u2026";
      return;
    }
    if (!state.searching && state.results.length === 0) {
      if (state.query) {
        stateMsg.textContent = "No results.";
        stateMsg.style.display = "";
        resultInfo.textContent = "0 results";
        return;
      }
      const recent = state.recentFiles.slice(0, 12);
      if (recent.length === 0) {
        stateMsg.textContent = "Start typing to search...";
        stateMsg.style.display = "";
        resultInfo.textContent = "";
        return;
      }
      stateMsg.style.display = "none";
      const frag2 = document.createDocumentFragment();
      recent.forEach((r, i) => {
        const lastSlash = r.rel.lastIndexOf("/");
        const basename = r.rel.slice(lastSlash + 1);
        const dir = r.rel.slice(0, lastSlash + 1);
        const div = document.createElement("div");
        div.className = "result" + (i === state.selected ? " selected" : "");
        div.dataset.index = String(i);
        div.innerHTML = '<div class="result-header"><span class="result-file">' + escHtml(basename) + "</span>" + gitBadgeHtml(r.rel) + "</div>" + (dir ? '<div class="result-text">' + escHtml(dir) + "</div>" : "");
        div.addEventListener("click", () => vscode.postMessage({ type: "open", file: r.file, line: 1 }));
        div.addEventListener("mouseenter", () => {
          state.selected = i;
          updateSelection();
          vscode.postMessage({ type: "preview", file: r.file, line: 1 });
        });
        frag2.appendChild(div);
      });
      wrap.appendChild(frag2);
      resultInfo.textContent = "recent";
      scrollToSelected();
      if (state.showPreview && recent[0]) {
        vscode.postMessage({ type: "preview", file: recent[0].file, line: 1 });
      }
      return;
    }
    if (state.searching) {
      stateMsg.innerHTML = '<span class="spinner"></span>';
      stateMsg.style.display = "";
    } else {
      stateMsg.style.display = "none";
    }
    const frag = document.createDocumentFragment();
    if (state.groupResults) {
      const groups = [];
      const seen = /* @__PURE__ */ new Map();
      state.results.forEach((r, i) => {
        let gi = seen.get(r.relativePath);
        if (gi === void 0) {
          gi = groups.length;
          seen.set(r.relativePath, gi);
          groups.push({ relativePath: r.relativePath, file: r.file, indices: [] });
        }
        groups[gi].indices.push(i);
      });
      for (const group of groups) {
        const lastSlash = group.relativePath.lastIndexOf("/");
        const basename = group.relativePath.slice(lastSlash + 1);
        const dir = group.relativePath.slice(0, lastSlash + 1);
        const cnt = group.indices.length;
        const hdr = document.createElement("div");
        hdr.className = "file-group-header";
        const pinned = state.pinnedFiles.some((f) => f.file === group.file);
        hdr.innerHTML = (pinned ? '<span class="pin-icon">\u2605</span>' : "") + '<span class="fgh-name">' + escHtml(basename) + "</span>" + (dir ? '<span class="fgh-dir">' + escHtml(dir) + "</span>" : "") + gitBadgeHtml(group.relativePath) + '<span class="fgh-count">' + cnt + "</span>";
        frag.appendChild(hdr);
        for (const i of group.indices) {
          const r = state.results[i];
          const isMultiSel = state.multiSelected.has(i);
          const div = document.createElement("div");
          div.className = "result result--grouped" + (i === state.selected ? " selected" : "") + (isMultiSel ? " multi-sel" : "");
          div.dataset.index = String(i);
          div.innerHTML = '<span class="result-line">' + r.line + '</span><div class="result-text">' + highlightMatch(r.text, r.matchStart, r.matchEnd) + "</div>";
          div.addEventListener("click", (e) => {
            if (e.ctrlKey) {
              toggleSelectResult(i);
            } else {
              openResult(i);
            }
          });
          div.addEventListener("mouseenter", () => {
            state.selected = i;
            updateSelection();
            requestPreview();
          });
          frag.appendChild(div);
        }
      }
    } else {
      state.results.forEach((r, i) => {
        const isMultiSel = state.multiSelected.has(i);
        const pinned = state.pinnedFiles.some((f) => f.file === r.file);
        const div = document.createElement("div");
        div.className = "result" + (i === state.selected ? " selected" : "") + (isMultiSel ? " multi-sel" : "");
        div.dataset.index = String(i);
        div.innerHTML = '<div class="result-header">' + (pinned ? '<span class="pin-icon">\u2605</span>' : "") + '<span class="result-file">' + escHtml(r.relativePath) + "</span>" + gitBadgeHtml(r.relativePath) + '<span class="result-line">:' + r.line + '</span></div><div class="result-text">' + highlightMatch(r.text, r.matchStart, r.matchEnd) + "</div>";
        div.addEventListener("click", (e) => {
          if (e.ctrlKey) {
            toggleSelectResult(i);
          } else {
            openResult(i);
          }
        });
        div.addEventListener("mouseenter", () => {
          state.selected = i;
          updateSelection();
          requestPreview();
        });
        frag.appendChild(div);
      });
    }
    wrap.appendChild(frag);
    const n = state.results.length;
    const capped = !state.searching && n >= MAX_RESULTS;
    resultInfo.textContent = n + (state.searching ? "\u2026" : capped ? "+" : "") + " result" + (n !== 1 ? "s" : "");
    scrollToSelected();
    requestPreview();
  }
  function renderFileResults() {
    wrap.querySelectorAll(".result").forEach((el) => el.remove());
    const MAX_RESULTS = window.__spyglass.MAX_RESULTS;
    if (state.searching) {
      stateMsg.innerHTML = '<span class="spinner"></span>Searching\u2026';
      stateMsg.style.display = "";
      resultInfo.textContent = "\u2026";
      return;
    }
    const GIT_LABEL = { M: "modified", A: "added", U: "untracked", D: "deleted", R: "renamed" };
    if (state.fileResults.length === 0) {
      stateMsg.textContent = state.query ? "No files found." : state.scope === "recent" ? "No recent files yet." : state.scope === "git" ? "Working tree is clean \u2014 no changes." : "Start typing to search files...";
      stateMsg.style.display = "";
      resultInfo.textContent = isGitScope() ? "0 changes" : "0 files";
      return;
    }
    stateMsg.style.display = "none";
    const frag = document.createDocumentFragment();
    const isRecent = state.scope === "recent";
    let sectionHeaderShown = false;
    state.fileResults.forEach((r, i) => {
      if (isRecent && !r.isPinned && !sectionHeaderShown) {
        sectionHeaderShown = true;
        if (state.fileResults.some((x) => x.isPinned)) {
          const sep = document.createElement("div");
          sep.className = "pin-section-sep";
          sep.textContent = "recent";
          frag.appendChild(sep);
        }
      }
      const lastSlash = r.relativePath.lastIndexOf("/");
      const basenameStart = lastSlash + 1;
      const basename = r.relativePath.slice(basenameStart);
      const dir = r.relativePath.slice(0, basenameStart);
      const bnPos = r.matchPositions.filter((p) => p >= basenameStart).map((p) => p - basenameStart);
      const dirPos = r.matchPositions.filter((p) => p < basenameStart);
      const div = document.createElement("div");
      div.className = "result" + (i === state.selected ? " selected" : "");
      div.dataset.index = String(i);
      if (isGitScope()) {
        const s = state.gitStatus[r.relativePath] ?? "M";
        const label = GIT_LABEL[s] ?? s;
        div.innerHTML = '<div class="result-header"><span class="git-status-pill git-badge--' + s + '">' + label + '</span><span class="result-file">' + highlightPositions(basename, bnPos) + "</span></div>" + (dir ? '<div class="result-text">' + highlightPositions(dir, dirPos) + "</div>" : "");
      } else {
        const pinIcon = r.isPinned ? '<span class="pin-icon">\u2605</span>' : "";
        div.innerHTML = '<div class="result-header">' + pinIcon + '<span class="result-file">' + highlightPositions(basename, bnPos) + "</span>" + gitBadgeHtml(r.relativePath) + "</div>" + (dir ? '<div class="result-text">' + highlightPositions(dir, dirPos) + "</div>" : "");
      }
      div.addEventListener("click", () => openResult(i));
      div.addEventListener("mouseenter", () => {
        state.selected = i;
        updateSelection();
        requestPreview();
      });
      frag.appendChild(div);
    });
    wrap.appendChild(frag);
    const nf = state.fileResults.length;
    const cappedF = nf >= MAX_RESULTS;
    resultInfo.textContent = nf + (cappedF ? "+" : "") + (state.scope === "recent" ? " recent file" : state.scope === "git" ? " change" : " file") + (nf !== 1 ? "s" : "");
    scrollToSelected();
    requestPreview();
  }
  function renderSymbolResults() {
    wrap.querySelectorAll(".result").forEach((el) => el.remove());
    const MAX_RESULTS = window.__spyglass.MAX_RESULTS;
    if (state.searching) {
      stateMsg.innerHTML = '<span class="spinner"></span>Searching\u2026';
      stateMsg.style.display = "";
      resultInfo.textContent = "\u2026";
      return;
    }
    if (state.symbolResults.length === 0) {
      stateMsg.textContent = state.query ? "No symbols found." : "Start typing to search symbols...";
      stateMsg.style.display = "";
      resultInfo.textContent = "0 symbols";
      return;
    }
    stateMsg.style.display = "none";
    const KIND_CLASS = {
      "function": "fn",
      "method": "fn",
      "constructor": "fn",
      "class": "cls",
      "interface": "cls",
      "struct": "cls",
      "variable": "var",
      "constant": "var",
      "field": "var",
      "property": "var",
      "key": "var",
      "enum": "enum",
      "enum member": "enum",
      "type param": "kw",
      "boolean": "kw",
      "operator": "op",
      "event": "op"
    };
    const frag = document.createDocumentFragment();
    state.symbolResults.forEach((r, i) => {
      const div = document.createElement("div");
      div.className = "result" + (i === state.selected ? " selected" : "");
      div.dataset.index = String(i);
      const kindCls = KIND_CLASS[r.kindLabel] ? " sym-kind--" + KIND_CLASS[r.kindLabel] : "";
      div.innerHTML = '<div class="result-header"><span class="sym-kind' + kindCls + '">' + escHtml(r.kindLabel) + '</span><span class="sym-name">' + escHtml(r.name) + "</span></div>" + (r.container ? '<div class="sym-container">' + escHtml(r.container) + "</div>" : "") + '<div class="result-text">' + escHtml(r.relativePath) + ":" + r.line + "</div>";
      div.addEventListener("click", () => openResult(i));
      div.addEventListener("mouseenter", () => {
        state.selected = i;
        updateSelection();
        requestPreview();
      });
      frag.appendChild(div);
    });
    wrap.appendChild(frag);
    const ns = state.symbolResults.length;
    const cappedS = ns >= MAX_RESULTS;
    resultInfo.textContent = ns + (cappedS ? "+" : "") + " symbol" + (ns !== 1 ? "s" : "");
    scrollToSelected();
    requestPreview();
  }
  function openResult(index) {
    if (isFileScope()) {
      const r = state.fileResults[index];
      if (r) {
        vscode.postMessage({ type: "open", file: r.file, line: 1 });
      }
    } else if (isSymbolScope()) {
      const r = state.symbolResults[index];
      if (r) {
        vscode.postMessage({ type: "open", file: r.file, line: r.line });
      }
    } else {
      const rd = recentDefault();
      const r = rd ? rd[index] : state.results[index];
      if (r) {
        vscode.postMessage({ type: "open", file: r.file, line: rd ? 1 : r.line });
      }
    }
  }
  function openResultInSplit(index) {
    if (isFileScope()) {
      const r = state.fileResults[index];
      if (r) {
        vscode.postMessage({ type: "openInSplit", file: r.file, line: 1 });
      }
    } else if (isSymbolScope()) {
      const r = state.symbolResults[index];
      if (r) {
        vscode.postMessage({ type: "openInSplit", file: r.file, line: r.line });
      }
    } else {
      const rd = recentDefault();
      const r = rd ? rd[index] : state.results[index];
      if (r) {
        vscode.postMessage({ type: "openInSplit", file: r.file, line: rd ? 1 : r.line });
      }
    }
  }
  function toggleSelectResult(i) {
    if (state.multiSelected.has(i)) {
      state.multiSelected.delete(i);
    } else {
      state.multiSelected.add(i);
    }
    render();
  }
  function selectAll() {
    const rd = recentDefault();
    const len = rd ? rd.length : isFileScope() ? state.fileResults.length : isSymbolScope() ? state.symbolResults.length : state.results.length;
    for (let i = 0; i < len; i++) {
      state.multiSelected.add(i);
    }
    showToast("Selected " + len + " result" + (len !== 1 ? "s" : ""));
    render();
  }
  function openAllSelected() {
    if (state.multiSelected.size === 0) {
      openResult(state.selected);
      return;
    }
    if (isFileScope()) {
      for (const i of state.multiSelected) {
        const r = state.fileResults[i];
        if (r) {
          vscode.postMessage({ type: "open", file: r.file, line: 1 });
        }
      }
    } else if (isSymbolScope()) {
      for (const i of state.multiSelected) {
        const r = state.symbolResults[i];
        if (r) {
          vscode.postMessage({ type: "open", file: r.file, line: r.line });
        }
      }
    } else {
      const rd = recentDefault();
      for (const i of state.multiSelected) {
        const r = rd ? rd[i] : state.results[i];
        if (r) {
          vscode.postMessage({ type: "open", file: r.file, line: rd ? 1 : r.line });
        }
      }
    }
  }
  function copyCurrentPath() {
    if (state.multiSelected.size > 0) {
      const paths = [];
      if (isFileScope()) {
        for (const i of state.multiSelected) {
          const r = state.fileResults[i];
          if (r) {
            paths.push(r.file);
          }
        }
      } else if (isSymbolScope()) {
        for (const i of state.multiSelected) {
          const r = state.symbolResults[i];
          if (r) {
            paths.push(r.file);
          }
        }
      } else {
        for (const i of state.multiSelected) {
          const r = state.results[i];
          if (r) {
            paths.push(r.file);
          }
        }
      }
      if (paths.length > 0) {
        vscode.postMessage({ type: "copyPath", path: paths.join("\n") });
        showToast("Copied " + paths.length + " path" + (paths.length !== 1 ? "s" : ""));
      }
      return;
    }
    let file = null;
    if (isFileScope()) {
      const r = state.fileResults[state.selected];
      if (r) {
        file = r.file;
      }
    } else if (isSymbolScope()) {
      const r = state.symbolResults[state.selected];
      if (r) {
        file = r.file;
      }
    } else {
      const rd = recentDefault();
      const r = rd ? rd[state.selected] : state.results[state.selected];
      if (r) {
        file = r.file;
      }
    }
    if (file) {
      vscode.postMessage({ type: "copyPath", path: file });
      showToast("Copied: " + file.split("/").pop());
    }
  }
  function currentFile() {
    if (isFileScope()) {
      const r2 = state.fileResults[state.selected];
      return r2 ? { file: r2.file, rel: r2.relativePath } : null;
    }
    if (isSymbolScope()) {
      const r2 = state.symbolResults[state.selected];
      return r2 ? { file: r2.file, rel: r2.relativePath } : null;
    }
    const rd = recentDefault();
    const r = rd ? rd[state.selected] : state.results[state.selected];
    return r ? { file: r.file, rel: "rel" in r ? r.rel : r.relativePath } : null;
  }
  function isPinnedFile(file) {
    return state.pinnedFiles.some((f) => f.file === file);
  }
  var toastTimer = null;
  function showToast(msg) {
    let el = document.getElementById("spyglass-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "spyglass-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.remove("toast-hide");
    el.classList.add("toast-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("toast-show");
      el.classList.add("toast-hide");
    }, 1800);
  }
  function togglePin() {
    const cur = currentFile();
    if (!cur) {
      return;
    }
    const basename = cur.rel.split("/").pop() ?? cur.rel;
    if (isPinnedFile(cur.file)) {
      state.pinnedFiles = state.pinnedFiles.filter((f) => f.file !== cur.file);
      showToast("Unpinned: " + basename);
    } else {
      state.pinnedFiles = [...state.pinnedFiles, { file: cur.file, rel: cur.rel }];
      showToast("\u2605 Pinned: " + basename);
    }
    vscode.postMessage({ type: "setPinnedFiles", files: state.pinnedFiles });
    if (state.scope === "recent") {
      triggerSearch(render);
    } else {
      render();
    }
  }
  function refreshGitScope(renderFn) {
    state.gitFiles = null;
    state.selected = 0;
    showToast("Refreshing\u2026");
    triggerSearch(renderFn);
  }
  function navigate(delta) {
    const rd = recentDefault();
    const len = rd ? rd.length : isFileScope() ? state.fileResults.length : isSymbolScope() ? state.symbolResults.length : state.results.length;
    state.selected = Math.max(0, Math.min(state.selected + delta, len - 1));
    updateSelection();
    requestPreview();
  }

  // src/webview/contextMenu.ts
  var ctxTarget = null;
  function getResultData(i) {
    const rd = recentDefault();
    if (rd) {
      const r2 = rd[i];
      return r2 ? { file: r2.file, rel: r2.rel, line: 1 } : null;
    }
    if (isFileScope()) {
      const r2 = state.fileResults[i];
      return r2 ? { file: r2.file, rel: r2.relativePath, line: 1 } : null;
    }
    if (isSymbolScope()) {
      const r2 = state.symbolResults[i];
      return r2 ? { file: r2.file, rel: r2.relativePath, line: r2.line } : null;
    }
    const r = state.results[i];
    return r ? { file: r.file, rel: r.relativePath, line: r.line } : null;
  }
  function showCtxMenu(x, y, index) {
    const data = getResultData(index);
    if (!data) {
      return;
    }
    ctxTarget = data;
    ctxPin.querySelector("span").textContent = isPinnedFile(data.file) ? "Unpin file" : "Pin file";
    ctxMenu.style.left = x + "px";
    ctxMenu.style.top = y + "px";
    ctxMenu.classList.add("visible");
    const rect = ctxMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      ctxMenu.style.left = x - rect.width + "px";
    }
    if (rect.bottom > window.innerHeight) {
      ctxMenu.style.top = y - rect.height + "px";
    }
  }
  function hideCtxMenu() {
    ctxMenu.classList.remove("visible");
    ctxTarget = null;
  }
  function initContextMenu() {
    wrap.addEventListener("contextmenu", (e) => {
      const el = e.target.closest(".result");
      if (!el) {
        return;
      }
      e.preventDefault();
      const i = parseInt(el.dataset.index);
      state.selected = i;
      updateSelection();
      showCtxMenu(e.clientX, e.clientY, i);
    });
    ctxOpen.addEventListener("click", () => {
      if (ctxTarget) {
        openResult(state.selected);
      }
      hideCtxMenu();
    });
    ctxOpenSplit.addEventListener("click", () => {
      if (ctxTarget) {
        openResultInSplit(state.selected);
      }
      hideCtxMenu();
    });
    ctxCopyAbs.addEventListener("click", () => {
      if (ctxTarget) {
        vscode.postMessage({ type: "copyPath", path: ctxTarget.file });
      }
      hideCtxMenu();
    });
    ctxCopyRel.addEventListener("click", () => {
      if (ctxTarget) {
        vscode.postMessage({ type: "copyPath", path: ctxTarget.rel });
      }
      hideCtxMenu();
    });
    ctxReveal.addEventListener("click", () => {
      if (ctxTarget) {
        vscode.postMessage({ type: "revealFile", file: ctxTarget.file });
      }
      hideCtxMenu();
    });
    ctxPin.addEventListener("click", () => {
      togglePin();
      hideCtxMenu();
    });
    ctxMenu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("contextmenu", (e) => {
      if (!e.target.closest("#ctx-menu") && !e.target.closest(".result")) {
        hideCtxMenu();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        hideCtxMenu();
      }
    }, true);
  }

  // src/webview/events.ts
  function matchKey(e, binding) {
    if (!binding) {
      return false;
    }
    const parts = binding.toLowerCase().split("+");
    const key = parts[parts.length - 1];
    const ctrl = parts.includes("ctrl");
    const shift = parts.includes("shift");
    const alt = parts.includes("alt");
    return e.key.toLowerCase() === key && e.ctrlKey === ctrl && e.shiftKey === shift && e.altKey === alt;
  }
  var KB = window.__spyglass.KB;
  var SCOPES = ["project", "openFiles", "files", "recent", "here", "symbols", "git"];
  function updateReplaceRowVisibility() {
    replaceRow.style.display = isTextScope() && state.replaceMode ? "" : "none";
  }
  function setScope(scope) {
    if (scope === "git") {
      state.gitFiles = null;
    }
    state.scope = scope;
    state.selected = 0;
    state.multiSelected = /* @__PURE__ */ new Set();
    state.historyIndex = -1;
    clearPreview();
    vscode.postMessage({ type: "scopeChanged", scope });
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.scope === scope));
    const isFile = isFileScope();
    const isSym = isSymbolScope();
    regexBtn.disabled = isFile || isSym;
    caseBtn.disabled = isFile || isSym;
    wordBtn.disabled = isFile || isSym;
    groupBtn.disabled = isFile || isSym;
    replaceBtn.disabled = isFile || isSym;
    updateReplaceRowVisibility();
    queryEl.placeholder = scope === "files" ? "Search files by name..." : scope === "recent" ? "Filter recent files..." : scope === "symbols" ? "Search symbols..." : scope === "here" ? "query *.ts  \u2014 search in current dir..." : scope === "git" ? "Filter changed files..." : "query *.ts  \u2014 search in project...";
    if (state.query || scope === "recent" || scope === "git") {
      triggerSearch(render);
    } else {
      state.results = [];
      state.fileResults = [];
      state.symbolResults = [];
      state.searching = false;
      render();
    }
  }
  function navigateHistory(dir) {
    if (state.searchHistory.length === 0) {
      return;
    }
    if (state.historyIndex === -1 && dir < 0) {
      state.historyPreQuery = queryEl.value;
    }
    state.historyIndex = Math.max(-1, Math.min(state.searchHistory.length - 1, state.historyIndex + dir));
    queryEl.value = state.historyIndex >= 0 ? state.searchHistory[state.historyIndex] : state.historyPreQuery;
    state.query = queryEl.value;
  }
  function toggleRegex() {
    state.useRegex = !state.useRegex;
    regexBtn.classList.toggle("active", state.useRegex);
    if (state.query) {
      triggerSearch(render);
    }
  }
  function toggleCase() {
    state.caseSensitive = !state.caseSensitive;
    caseBtn.classList.toggle("active", state.caseSensitive);
    if (state.query) {
      triggerSearch(render);
    }
  }
  function toggleWord() {
    state.wholeWord = !state.wholeWord;
    wordBtn.classList.toggle("active", state.wholeWord);
    if (state.query) {
      triggerSearch(render);
    }
  }
  function toggleGroup() {
    state.groupResults = !state.groupResults;
    groupBtn.classList.toggle("active", state.groupResults);
    showToast(state.groupResults ? "Grouped by file" : "Flat list");
    render();
  }
  function toggleReplaceMode() {
    state.replaceMode = !state.replaceMode;
    replaceBtn.classList.toggle("active", state.replaceMode);
    updateReplaceRowVisibility();
    if (state.replaceMode) {
      document.getElementById("replace-input").focus();
    }
  }
  function applyReplaceAll() {
    vscode.postMessage({
      type: "replaceAll",
      query: state.query,
      replacement: document.getElementById("replace-input").value,
      useRegex: state.useRegex,
      caseSensitive: state.caseSensitive,
      wholeWord: state.wholeWord,
      globFilter: state.globFilter,
      scope: state.scope
    });
  }
  function initEvents() {
    queryEl.addEventListener("input", () => {
      const { query, globFilter } = parseQueryInput(queryEl.value);
      state.query = query;
      if (globFilter !== state.globFilter) {
        state.globFilter = globFilter;
      }
      state.selected = 0;
      state.historyIndex = -1;
      triggerSearch(render);
    });
    queryEl.addEventListener("keydown", (e) => {
      if (e.ctrlKey && e.key === "ArrowUp") {
        e.preventDefault();
        navigateHistory(-1);
      } else if (e.ctrlKey && e.key === "ArrowDown") {
        e.preventDefault();
        navigateHistory(1);
      } else if (e.altKey && e.key === "y") {
        e.preventDefault();
        copyCurrentPath();
      } else if (e.key === "F5" && isGitScope()) {
        e.preventDefault();
        refreshGitScope(render);
      } else if (e.altKey && e.key === "p") {
        e.preventDefault();
        togglePin();
      } else if (e.altKey && e.key === "l") {
        e.preventDefault();
        toggleGroup();
      } else if (matchKey(e, KB.navigateDown)) {
        e.preventDefault();
        navigate(1);
      } else if (matchKey(e, KB.navigateUp)) {
        e.preventDefault();
        navigate(-1);
      } else if (e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        openAllSelected();
      } else if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        openResultInSplit(state.selected);
      } else if (matchKey(e, KB.open)) {
        e.preventDefault();
        openResult(state.selected);
      } else if (matchKey(e, KB.close)) {
        vscode.postMessage({ type: "close" });
      } else if (e.key === "Tab") {
        e.preventDefault();
        setScope(SCOPES[(SCOPES.indexOf(state.scope) + 1) % SCOPES.length]);
      } else if (matchKey(e, KB.toggleRegex)) {
        e.preventDefault();
        toggleRegex();
      } else if (matchKey(e, KB.togglePreview)) {
        e.preventDefault();
        togglePreview();
      } else if (e.altKey && e.key === "c") {
        e.preventDefault();
        toggleCase();
      } else if (e.altKey && e.key === "w") {
        e.preventDefault();
        toggleWord();
      } else if (e.altKey && e.key === "r") {
        e.preventDefault();
        toggleReplaceMode();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (document.activeElement === queryEl) {
        return;
      }
      if (matchKey(e, KB.navigateDown)) {
        e.preventDefault();
        navigate(1);
      } else if (matchKey(e, KB.navigateUp)) {
        e.preventDefault();
        navigate(-1);
      } else if (e.altKey && e.key === "y") {
        e.preventDefault();
        copyCurrentPath();
      } else if (e.key === "F5" && isGitScope()) {
        e.preventDefault();
        refreshGitScope(render);
      } else if (e.altKey && e.key === "p") {
        e.preventDefault();
        togglePin();
      } else if (e.altKey && e.key === "l") {
        e.preventDefault();
        toggleGroup();
      } else if (e.ctrlKey && e.key === " ") {
        e.preventDefault();
        toggleSelectResult(state.selected);
      } else if (e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        openAllSelected();
      } else if (e.ctrlKey && e.key === "a") {
        e.preventDefault();
        selectAll();
      } else if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        openResultInSplit(state.selected);
      } else if (matchKey(e, KB.open)) {
        e.preventDefault();
        openResult(state.selected);
      } else if (matchKey(e, KB.togglePreview)) {
        e.preventDefault();
        togglePreview();
      } else if (matchKey(e, KB.close)) {
        vscode.postMessage({ type: "close" });
      } else if (e.key === "Tab") {
        e.preventDefault();
        setScope(SCOPES[(SCOPES.indexOf(state.scope) + 1) % SCOPES.length]);
      }
    });
    tabs.forEach((tab) => tab.addEventListener("click", () => setScope(tab.dataset.scope)));
    regexBtn.addEventListener("click", toggleRegex);
    caseBtn.addEventListener("click", toggleCase);
    wordBtn.addEventListener("click", toggleWord);
    groupBtn.addEventListener("click", toggleGroup);
    replaceBtn.addEventListener("click", toggleReplaceMode);
    previewBtn.addEventListener("click", togglePreview);
    replaceAllBtn.addEventListener("click", applyReplaceAll);
    previewHdr.addEventListener("click", () => {
      if (state.currentPreviewFile) {
        let absFile = null;
        if (isFileScope()) {
          const r = state.fileResults[state.selected];
          if (r) {
            absFile = r.file;
          }
        } else if (isSymbolScope()) {
          const r = state.symbolResults[state.selected];
          if (r) {
            absFile = r.file;
          }
        } else {
          const r = state.results[state.selected];
          if (r) {
            absFile = r.file;
          }
        }
        if (absFile) {
          vscode.postMessage({ type: "revealFile", file: absFile });
        }
      }
    });
    document.addEventListener("click", () => {
      const shortcutsOverlay2 = document.getElementById("shortcuts-overlay");
      const helpBtn2 = document.getElementById("help-btn");
      shortcutsOverlay2.classList.remove("visible");
      helpBtn2.classList.remove("active");
      hideCtxMenu();
    });
    document.getElementById("shortcuts-overlay").addEventListener("click", (e) => e.stopPropagation());
    document.getElementById("help-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      const overlay = document.getElementById("shortcuts-overlay");
      overlay.classList.toggle("visible");
      e.currentTarget.classList.toggle("active", overlay.classList.contains("visible"));
    });
  }
  function initMessages() {
    const searchTook2 = document.getElementById("search-took");
    window.addEventListener("message", ({ data }) => {
      switch (data.type) {
        case "searching":
          state.searching = true;
          searchTook2.textContent = "";
          render();
          break;
        case "resultsChunk":
          state.results = data.results;
          state.selected = 0;
          render();
          break;
        case "results":
          state.searching = false;
          state.results = data.results;
          state.selected = 0;
          if (data.took > 0) {
            searchTook2.textContent = data.took + "ms";
          }
          render();
          break;
        case "gitStatus":
          state.gitStatus = data.status;
          render();
          break;
        case "fileList":
          state.fileList = data.files;
          if (state.scope === "files") {
            filterFilesLocally(state.fileList, state.query);
            render();
          }
          break;
        case "gitFiles":
          state.gitFiles = data.files;
          if (isGitScope()) {
            filterFilesLocally(state.gitFiles, state.query);
            render();
            const n = state.gitFiles.length;
            showToast(n === 0 ? "Working tree clean" : n + " changed file" + (n !== 1 ? "s" : ""));
          }
          break;
        case "fileResults":
          state.searching = false;
          state.fileResults = data.results;
          state.selected = 0;
          render();
          break;
        case "symbolResults":
          state.searching = false;
          state.symbolResults = data.results;
          state.selected = 0;
          render();
          break;
        case "previewContent":
          window.__renderPreview(
            data.lines,
            data.currentLine,
            data.relativePath,
            data.ext,
            data.changedLines,
            isFileScope() || isSymbolScope() ? "" : state.query,
            state.useRegex,
            data.preHighlighted
          );
          break;
        case "error":
          state.searching = false;
          document.getElementById("state-msg").textContent = data.message;
          document.getElementById("state-msg").style.display = "";
          break;
        case "focus":
          queryEl.focus();
          queryEl.select();
          break;
        case "setQuery":
          queryEl.value = data.query;
          state.query = data.query;
          state.selected = 0;
          queryEl.focus();
          queryEl.select();
          triggerSearch(render);
          break;
        case "replaceApplied":
          state.selected = 0;
          showToast("Replaced in " + data.fileCount + " file" + (data.fileCount !== 1 ? "s" : ""));
          triggerSearch(render);
          break;
      }
    });
  }

  // src/webview/main.ts
  window.onerror = (msg, _src, line, _col, err) => {
    document.body.innerHTML = '<div style="color:#f38ba8;padding:20px;font-family:monospace;font-size:12px;white-space:pre-wrap">JS Error: ' + msg + "\nLine: " + line + "\n" + (err ? err.stack : "") + "</div>";
  };
  window.__renderPreview = renderPreview;
  var { KB: KB2, INITIAL_QUERY } = window.__spyglass;
  regexBtn.dataset.tooltip = "Regex \u2014 " + (KB2.toggleRegex || "Shift+Alt+R");
  document.getElementById("preview-btn").dataset.tooltip = "Toggle preview \u2014 " + (KB2.togglePreview || "Shift+Alt+P");
  resultInfo.textContent = "0 results";
  regexBtn.classList.remove("active");
  updateReplaceRowVisibility();
  tabs.forEach((t) => t.classList.toggle("active", t.dataset.scope === state.scope));
  if (isFileScope() || isSymbolScope()) {
    regexBtn.disabled = true;
    document.getElementById("case-btn").setAttribute("disabled", "");
    document.getElementById("word-btn").setAttribute("disabled", "");
    document.getElementById("replace-btn").setAttribute("disabled", "");
    queryEl.placeholder = state.scope === "recent" ? "Filter recent files..." : state.scope === "symbols" ? "Search symbols..." : "Search files by name...";
  }
  clearPreview();
  initContextMenu();
  initEvents();
  initMessages();
  if (INITIAL_QUERY) {
    queryEl.value = INITIAL_QUERY;
    state.query = INITIAL_QUERY;
    queryEl.select();
    triggerSearch(render);
  } else if (state.scope === "recent") {
    triggerSearch(render);
  }
  queryEl.focus();
})();
