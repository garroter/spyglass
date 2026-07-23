import * as vscode from 'vscode';

export interface UiStrings {
  // Tabs
  project: string;
  openFiles: string;
  files: string;
  recent: string;
  dir: string;
  symbols: string;
  git: string;
  doc: string;
  refs: string;

  // Button tooltips (without keybinding suffix, appended at render time)
  regex: string;
  caseSensitive: string;
  wholeWord: string;
  replaceMode: string;
  togglePreview: string;
  groupByFile: string;
  sortDefault: string;
  sortFilename: string;
  sortCount: string;
  includeFilter: string;
  savedSearches: string;
  keyboardShortcuts: string;
  moreOptions: string;

  // Input placeholders
  searchPlaceholder: string;
  replacePlaceholder: string;
  includePlaceholder: string;

  // Labels
  replaceLabel: string;
  replaceAll: string;
  includeLabel: string;

  // Scope-specific placeholders
  searchFilesByName: string;
  filterRecentFiles: string;
  searchWorkspaceSymbols: string;
  filterDocumentSymbols: string;
  searchInCurrentDir: string;
  filterChangedFiles: string;
  refsToSymbol: string;
  searchInProject: string;

  // Toasts
  groupedByFile: string;
  flatList: string;
  selectedResults: string;
  copiedPaths: string;
  copied: string;
  noFileSelected: string;

  // Errors
  ripgrepNotFound: string;
  openSettings: string;
  noWorkspace: string;
  searchFailed: string;
  symbolSearchFailed: string;
  docSymbolSearchFailed: string;
  referenceSearchFailed: string;

  // Spinner
  searching: string;
  zeroResults: string;

  // Bookmarks
  savedSearchesTitle: string;
  noSavedSearches: string;
  removeSearch: string;

  // Shortcuts overlay
  shortcutsTitle: string;
  shortcutsContent: string;
}

const zh: UiStrings = {
  project: '项目',
  openFiles: '已打开',
  files: '文件',
  recent: '最近',
  dir: '目录',
  symbols: '符号',
  git: 'Git',
  doc: '文档',
  refs: '引用',

  regex: '正则',
  caseSensitive: '大小写',
  wholeWord: '全词',
  replaceMode: '替换模式',
  togglePreview: '切换预览',
  groupByFile: '按文件分组',
  sortDefault: '排序: 默认',
  sortFilename: '排序: 按文件名',
  sortCount: '排序: 按匹配数',
  includeFilter: '包含过滤',
  savedSearches: '已保存搜索',
  keyboardShortcuts: '键盘快捷键',
  moreOptions: '更多选项',

  searchPlaceholder: '搜索文件...',
  replacePlaceholder: '替换文本',
  includePlaceholder: '*.ts, src/**',

  replaceLabel: '替换:',
  replaceAll: '全部替换',
  includeLabel: '包含:',

  searchFilesByName: '按文件名搜索...',
  filterRecentFiles: '筛选最近文件...',
  searchWorkspaceSymbols: '搜索工作区符号...',
  filterDocumentSymbols: '筛选文档符号...',
  searchInCurrentDir: 'query *.ts — 当前目录搜索...',
  filterChangedFiles: '筛选已变更文件...',
  refsToSymbol: '光标处符号的引用',
  searchInProject: 'query *.ts — 项目搜索...',

  groupedByFile: '已按文件分组',
  flatList: '平铺列表',
  selectedResults: '已选择',
  copiedPaths: '已复制',
  copied: '已复制:',
  noFileSelected: '未选择文件',

  ripgrepNotFound: 'Spyglass: 未找到或无法自动安装 ripgrep。请系统级安装或在设置中指定 spyglass.ripgrepPath。',
  openSettings: '打开设置',
  noWorkspace: '未打开工作区文件夹。',
  searchFailed: '搜索失败。',
  symbolSearchFailed: '符号搜索失败。',
  docSymbolSearchFailed: '文档符号搜索失败。',
  referenceSearchFailed: '引用搜索失败。',

  searching: '搜索中…',
  zeroResults: '0 条结果',

  savedSearchesTitle: '已保存的搜索',
  noSavedSearches: '暂无保存的搜索。使用 Shift+Alt+S 保存当前搜索。',
  removeSearch: '删除',

  shortcutsTitle: '键盘快捷键',
  shortcutsContent: `<h4>导航</h4>
<div class="shortcut-row"><span>浏览结果</span><div class="shortcut-keys"><kbd>↑</kbd><kbd>↓</kbd></div></div>
<div class="shortcut-row"><span>打开文件</span><div class="shortcut-keys"><kbd>Enter</kbd></div></div>
<div class="shortcut-row"><span>并排打开</span><div class="shortcut-keys"><kbd>Ctrl</kbd><kbd>Enter</kbd></div></div>
<div class="shortcut-row"><span>切换页面</span><div class="shortcut-keys"><kbd>Tab</kbd></div></div>
<div class="shortcut-row"><span>关闭</span><div class="shortcut-keys"><kbd>Esc</kbd></div></div>
<h4>搜索</h4>
<div class="shortcut-row"><span>内联过滤</span><div class="shortcut-keys"><kbd>query *.ts</kbd></div></div>
<div class="shortcut-row"><span>切换正则</span><div class="shortcut-keys"><kbd>Shift</kbd><kbd>Alt</kbd><kbd>R</kbd></div></div>
<div class="shortcut-row"><span>大小写</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>C</kbd></div></div>
<div class="shortcut-row"><span>全词匹配</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>W</kbd></div></div>
<div class="shortcut-row"><span>按文件分组</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>L</kbd></div></div>
<div class="shortcut-row"><span>排序切换</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>S</kbd></div></div>
<div class="shortcut-row"><span>包含过滤</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>I</kbd></div></div>
<div class="shortcut-row"><span>替换模式</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>R</kbd></div></div>
<div class="shortcut-row"><span>替换输入</span><div class="shortcut-keys"><kbd>Tab</kbd><span style="font-size:9px;color:var(--f-dim)"> （替换模式下）</span></div></div>
<div class="shortcut-row"><span>历史记录</span><div class="shortcut-keys"><kbd>Ctrl</kbd><kbd>↑</kbd><kbd>↓</kbd></div></div>
<div class="shortcut-row"><span>保存搜索</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>B</kbd></div></div>
<h4>选择</h4>
<div class="shortcut-row"><span>多选切换</span><div class="shortcut-keys"><kbd>Ctrl</kbd><kbd>Click</kbd></div></div>
<div class="shortcut-row"><span>键盘多选</span><div class="shortcut-keys"><kbd>Ctrl</kbd><kbd>Space</kbd></div></div>
<div class="shortcut-row"><span>全选</span><div class="shortcut-keys"><kbd>Ctrl</kbd><kbd>A</kbd></div></div>
<div class="shortcut-row"><span>打开已选</span><div class="shortcut-keys"><kbd>Shift</kbd><kbd>Enter</kbd></div></div>
<div class="shortcut-row"><span>复制路径</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>Y</kbd></div></div>
<div class="shortcut-row"><span>固定/取消</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>P</kbd></div></div>
<div class="shortcut-row"><span>资源管理器</span><div class="shortcut-keys"><kbd>点击预览标题</kbd></div></div>
<h4>视图</h4>
<div class="shortcut-row"><span>切换预览</span><div class="shortcut-keys"><kbd>Shift</kbd><kbd>Alt</kbd><kbd>P</kbd></div></div>
<h4>Git</h4>
<div class="shortcut-row"><span>刷新变更</span><div class="shortcut-keys"><kbd>F5</kbd></div></div>`,
};

const en: UiStrings = {
  project: 'Project',
  openFiles: 'Open Files',
  files: 'Files',
  recent: 'Recent',
  dir: 'Dir',
  symbols: 'Symbols',
  git: 'Git',
  doc: 'Doc',
  refs: 'Refs',

  regex: 'Regex',
  caseSensitive: 'Case sensitive',
  wholeWord: 'Whole word',
  replaceMode: 'Replace mode',
  togglePreview: 'Toggle preview',
  groupByFile: 'Group by file',
  sortDefault: 'Sort: default',
  sortFilename: 'Sort: by filename',
  sortCount: 'Sort: by match count',
  includeFilter: 'Include filter',
  savedSearches: 'Saved searches',
  keyboardShortcuts: 'Keyboard shortcuts',
  moreOptions: 'More options',

  searchPlaceholder: 'Search in files...',
  replacePlaceholder: 'replacement text',
  includePlaceholder: '*.ts, src/**',

  replaceLabel: 'replace:',
  replaceAll: 'Replace all',
  includeLabel: 'include:',

  searchFilesByName: 'Search files by name...',
  filterRecentFiles: 'Filter recent files...',
  searchWorkspaceSymbols: 'Search workspace symbols...',
  filterDocumentSymbols: 'Filter document symbols...',
  searchInCurrentDir: 'query *.ts  — search in current dir...',
  filterChangedFiles: 'Filter changed files...',
  refsToSymbol: 'References to symbol at cursor',
  searchInProject: 'query *.ts  — search in project...',

  groupedByFile: 'Grouped by file',
  flatList: 'Flat list',
  selectedResults: 'Selected',
  copiedPaths: 'Copied',
  copied: 'Copied:',
  noFileSelected: 'No file selected',

  ripgrepNotFound: 'Spyglass: could not find or auto-install ripgrep. Install it system-wide or set spyglass.ripgrepPath in settings.',
  openSettings: 'Open Settings',
  noWorkspace: 'No workspace folder open.',
  searchFailed: 'Search failed.',
  symbolSearchFailed: 'Symbol search failed.',
  docSymbolSearchFailed: 'Document symbol search failed.',
  referenceSearchFailed: 'Reference search failed.',

  searching: 'Searching…',
  zeroResults: '0 results',

  savedSearchesTitle: 'Saved Searches',
  noSavedSearches: 'No saved searches. Use Shift+Alt+S to save the current search.',
  removeSearch: 'Remove',

  shortcutsTitle: 'Keyboard Shortcuts',
  shortcutsContent: `<h4>Navigation</h4>
<div class="shortcut-row"><span>Navigate results</span><div class="shortcut-keys"><kbd>↑</kbd><kbd>↓</kbd></div></div>
<div class="shortcut-row"><span>Open file</span><div class="shortcut-keys"><kbd>Enter</kbd></div></div>
<div class="shortcut-row"><span>Open in split</span><div class="shortcut-keys"><kbd>Ctrl</kbd><kbd>Enter</kbd></div></div>
<div class="shortcut-row"><span>Switch scope</span><div class="shortcut-keys"><kbd>Tab</kbd></div></div>
<div class="shortcut-row"><span>Close</span><div class="shortcut-keys"><kbd>Esc</kbd></div></div>
<h4>Search</h4>
<div class="shortcut-row"><span>Glob filter inline</span><div class="shortcut-keys"><kbd>query *.ts</kbd></div></div>
<div class="shortcut-row"><span>Toggle regex</span><div class="shortcut-keys"><kbd>Shift</kbd><kbd>Alt</kbd><kbd>R</kbd></div></div>
<div class="shortcut-row"><span>Case sensitive</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>C</kbd></div></div>
<div class="shortcut-row"><span>Whole word</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>W</kbd></div></div>
<div class="shortcut-row"><span>Group by file</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>L</kbd></div></div>
<div class="shortcut-row"><span>Sort (cycle)</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>S</kbd></div></div>
<div class="shortcut-row"><span>Include filter</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>I</kbd></div></div>
<div class="shortcut-row"><span>Replace mode</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>R</kbd></div></div>
<div class="shortcut-row"><span>Focus replace input</span><div class="shortcut-keys"><kbd>Tab</kbd><span style="font-size:9px;color:var(--f-dim)"> (in replace mode)</span></div></div>
<div class="shortcut-row"><span>History prev / next</span><div class="shortcut-keys"><kbd>Ctrl</kbd><kbd>↑</kbd><kbd>↓</kbd></div></div>
<div class="shortcut-row"><span>Save search (bookmark)</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>B</kbd></div></div>
<h4>Selection</h4>
<div class="shortcut-row"><span>Multi-select toggle</span><div class="shortcut-keys"><kbd>Ctrl</kbd><kbd>Click</kbd></div></div>
<div class="shortcut-row"><span>Multi-select (keyboard)</span><div class="shortcut-keys"><kbd>Ctrl</kbd><kbd>Space</kbd></div></div>
<div class="shortcut-row"><span>Select all</span><div class="shortcut-keys"><kbd>Ctrl</kbd><kbd>A</kbd></div></div>
<div class="shortcut-row"><span>Open all selected</span><div class="shortcut-keys"><kbd>Shift</kbd><kbd>Enter</kbd></div></div>
<div class="shortcut-row"><span>Copy path</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>Y</kbd></div></div>
<div class="shortcut-row"><span>Pin / Unpin file</span><div class="shortcut-keys"><kbd>Alt</kbd><kbd>P</kbd></div></div>
<div class="shortcut-row"><span>Reveal in Explorer</span><div class="shortcut-keys"><kbd>click preview header</kbd></div></div>
<h4>View</h4>
<div class="shortcut-row"><span>Toggle preview</span><div class="shortcut-keys"><kbd>Shift</kbd><kbd>Alt</kbd><kbd>P</kbd></div></div>
<h4>Git</h4>
<div class="shortcut-row"><span>Refresh changed files</span><div class="shortcut-keys"><kbd>F5</kbd></div></div>`,
};

export function getUiStrings(): UiStrings {
  const lang = vscode.env.language?.toLowerCase() ?? 'en';
  if (lang.startsWith('zh')) { return zh; }
  return en;
}
