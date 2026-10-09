// VS Code's own commands that people run most from the Command Palette. The extension API exposes
// only their ids, so titles and default keys are kept here (English, as VS Code has them). Ids
// that do not exist in the running VS Code are dropped when the catalog is built.
//
// `key` is the default on Windows and Linux, `mac` the macOS one when it differs.

export interface CoreCommand {
  id: string;
  category?: string;
  title: string;
  key?: string;
  mac?: string;
}

export const CORE_COMMANDS: readonly CoreCommand[] = [
  // ── Files ─────────────────────────────────────────────────────────────────────
  { id: 'workbench.action.files.newUntitledFile', category: 'File', title: 'New Untitled Text File', key: 'ctrl+n', mac: 'cmd+n' },
  { id: 'workbench.action.files.openFile', category: 'File', title: 'Open File...', key: 'ctrl+o', mac: 'cmd+o' },
  { id: 'workbench.action.files.openFolder', category: 'File', title: 'Open Folder...', key: 'ctrl+k ctrl+o' },
  { id: 'workbench.action.openRecent', category: 'File', title: 'Open Recent...', key: 'ctrl+r', mac: 'ctrl+r' },
  { id: 'workbench.action.files.save', category: 'File', title: 'Save', key: 'ctrl+s', mac: 'cmd+s' },
  { id: 'workbench.action.files.saveAs', category: 'File', title: 'Save As...', key: 'ctrl+shift+s', mac: 'cmd+shift+s' },
  { id: 'workbench.action.files.saveAll', category: 'File', title: 'Save All', key: 'ctrl+k s', mac: 'alt+cmd+s' },
  { id: 'workbench.action.files.saveWithoutFormatting', category: 'File', title: 'Save without Formatting', key: 'ctrl+k ctrl+shift+s', mac: 'cmd+k s' },
  { id: 'workbench.action.files.revert', category: 'File', title: 'Revert File' },
  { id: 'workbench.action.files.copyPathOfActiveFile', category: 'File', title: 'Copy Path of Active File', key: 'ctrl+k p', mac: 'cmd+k p' },
  { id: 'workbench.action.closeFolder', category: 'Workspaces', title: 'Close Folder', key: 'ctrl+k f', mac: 'cmd+k f' },
  { id: 'workbench.action.newWindow', category: 'Window', title: 'New Window', key: 'ctrl+shift+n', mac: 'cmd+shift+n' },
  { id: 'workbench.action.closeWindow', category: 'Window', title: 'Close Window', key: 'ctrl+shift+w', mac: 'cmd+shift+w' },

  // ── Editors and groups ────────────────────────────────────────────────────────
  { id: 'workbench.action.closeActiveEditor', category: 'View', title: 'Close Editor', key: 'ctrl+w', mac: 'cmd+w' },
  { id: 'workbench.action.closeAllEditors', category: 'View', title: 'Close All Editors', key: 'ctrl+k ctrl+w', mac: 'cmd+k cmd+w' },
  { id: 'workbench.action.closeOtherEditors', category: 'View', title: 'Close Other Editors in Group' },
  { id: 'workbench.action.closeEditorsInGroup', category: 'View', title: 'Close All Editors in Group', key: 'ctrl+k w', mac: 'cmd+k w' },
  { id: 'workbench.action.closeEditorsToTheRight', category: 'View', title: 'Close Editors to the Right in Group' },
  { id: 'workbench.action.closeUnmodifiedEditors', category: 'View', title: 'Close Saved Editors in Group', key: 'ctrl+k u', mac: 'cmd+k u' },
  { id: 'workbench.action.reopenClosedEditor', category: 'View', title: 'Reopen Closed Editor', key: 'ctrl+shift+t', mac: 'cmd+shift+t' },
  { id: 'workbench.action.splitEditor', category: 'View', title: 'Split Editor', key: 'ctrl+\\', mac: 'cmd+\\' },
  { id: 'workbench.action.nextEditor', category: 'View', title: 'Open Next Editor', key: 'ctrl+pagedown', mac: 'alt+cmd+right' },
  { id: 'workbench.action.previousEditor', category: 'View', title: 'Open Previous Editor', key: 'ctrl+pageup', mac: 'alt+cmd+left' },
  { id: 'workbench.action.keepEditor', category: 'View', title: 'Keep Editor', key: 'ctrl+k enter', mac: 'cmd+k enter' },
  { id: 'workbench.action.pinEditor', category: 'View', title: 'Pin Editor', key: 'ctrl+k shift+enter', mac: 'cmd+k shift+enter' },
  { id: 'workbench.action.moveEditorToNextGroup', category: 'View', title: 'Move Editor into Next Group', key: 'ctrl+alt+right', mac: 'ctrl+cmd+right' },
  { id: 'workbench.action.moveEditorToPreviousGroup', category: 'View', title: 'Move Editor into Previous Group', key: 'ctrl+alt+left', mac: 'ctrl+cmd+left' },
  { id: 'workbench.action.focusFirstEditorGroup', category: 'View', title: 'Focus First Editor Group', key: 'ctrl+1', mac: 'cmd+1' },
  { id: 'workbench.action.gotoLine', category: 'Go', title: 'Go to Line/Column...', key: 'ctrl+g', mac: 'ctrl+g' },

  // ── Layout and views ──────────────────────────────────────────────────────────
  { id: 'workbench.action.toggleSidebarVisibility', category: 'View', title: 'Toggle Primary Side Bar Visibility', key: 'ctrl+b', mac: 'cmd+b' },
  { id: 'workbench.action.toggleAuxiliaryBar', category: 'View', title: 'Toggle Secondary Side Bar Visibility', key: 'ctrl+alt+b', mac: 'alt+cmd+b' },
  { id: 'workbench.action.togglePanel', category: 'View', title: 'Toggle Panel Visibility', key: 'ctrl+j', mac: 'cmd+j' },
  { id: 'workbench.action.toggleMaximizedPanel', category: 'View', title: 'Toggle Maximized Panel' },
  { id: 'workbench.action.toggleStatusbarVisibility', category: 'View', title: 'Toggle Status Bar Visibility' },
  { id: 'workbench.action.toggleZenMode', category: 'View', title: 'Toggle Zen Mode', key: 'ctrl+k z', mac: 'cmd+k z' },
  { id: 'workbench.action.toggleFullScreen', category: 'View', title: 'Toggle Full Screen', key: 'f11', mac: 'ctrl+cmd+f' },
  { id: 'workbench.action.toggleCenteredLayout', category: 'View', title: 'Toggle Centered Layout' },
  { id: 'editor.action.toggleMinimap', category: 'View', title: 'Toggle Minimap' },
  { id: 'breadcrumbs.toggle', category: 'View', title: 'Toggle Breadcrumbs' },
  { id: 'editor.action.toggleRenderWhitespace', category: 'View', title: 'Toggle Render Whitespace' },
  { id: 'editor.action.toggleWordWrap', category: 'View', title: 'Toggle Word Wrap', key: 'alt+z', mac: 'alt+z' },
  { id: 'workbench.action.zoomIn', category: 'View', title: 'Zoom In', key: 'ctrl+=', mac: 'cmd+=' },
  { id: 'workbench.action.zoomOut', category: 'View', title: 'Zoom Out', key: 'ctrl+-', mac: 'cmd+-' },
  { id: 'workbench.action.zoomReset', category: 'View', title: 'Reset Zoom', key: 'ctrl+numpad0', mac: 'cmd+numpad0' },
  { id: 'workbench.view.explorer', category: 'View', title: 'Show Explorer', key: 'ctrl+shift+e', mac: 'cmd+shift+e' },
  { id: 'workbench.view.search', category: 'View', title: 'Show Search', key: 'ctrl+shift+f', mac: 'cmd+shift+f' },
  { id: 'workbench.view.scm', category: 'View', title: 'Show Source Control', key: 'ctrl+shift+g', mac: 'ctrl+shift+g' },
  { id: 'workbench.view.debug', category: 'View', title: 'Show Run and Debug', key: 'ctrl+shift+d', mac: 'cmd+shift+d' },
  { id: 'workbench.view.extensions', category: 'View', title: 'Show Extensions', key: 'ctrl+shift+x', mac: 'cmd+shift+x' },
  { id: 'workbench.actions.view.problems', category: 'View', title: 'Show Problems', key: 'ctrl+shift+m', mac: 'cmd+shift+m' },
  { id: 'workbench.action.output.toggleOutput', category: 'View', title: 'Toggle Output', key: 'ctrl+k ctrl+h', mac: 'cmd+k cmd+h' },

  // ── Editing ───────────────────────────────────────────────────────────────────
  { id: 'editor.action.formatDocument', category: 'Editor', title: 'Format Document', key: 'shift+alt+f', mac: 'shift+alt+f' },
  { id: 'editor.action.formatSelection', category: 'Editor', title: 'Format Selection', key: 'ctrl+k ctrl+f', mac: 'cmd+k cmd+f' },
  { id: 'editor.action.organizeImports', category: 'Editor', title: 'Organize Imports', key: 'shift+alt+o', mac: 'shift+alt+o' },
  { id: 'editor.action.commentLine', category: 'Editor', title: 'Toggle Line Comment', key: 'ctrl+/', mac: 'cmd+/' },
  { id: 'editor.action.blockComment', category: 'Editor', title: 'Toggle Block Comment', key: 'shift+alt+a', mac: 'shift+alt+a' },
  { id: 'editor.foldAll', category: 'Editor', title: 'Fold All', key: 'ctrl+k ctrl+0', mac: 'cmd+k cmd+0' },
  { id: 'editor.unfoldAll', category: 'Editor', title: 'Unfold All', key: 'ctrl+k ctrl+j', mac: 'cmd+k cmd+j' },
  { id: 'editor.action.rename', category: 'Editor', title: 'Rename Symbol', key: 'f2', mac: 'f2' },
  { id: 'editor.action.revealDefinition', category: 'Editor', title: 'Go to Definition', key: 'f12', mac: 'f12' },
  { id: 'editor.action.goToReferences', category: 'Editor', title: 'Go to References', key: 'shift+f12', mac: 'shift+f12' },
  { id: 'editor.action.quickFix', category: 'Editor', title: 'Quick Fix...', key: 'ctrl+.', mac: 'cmd+.' },
  { id: 'editor.action.marker.nextInFiles', category: 'Editor', title: 'Go to Next Problem in Files', key: 'f8', mac: 'f8' },
  { id: 'editor.action.trimTrailingWhitespace', category: 'Editor', title: 'Trim Trailing Whitespace', key: 'ctrl+k ctrl+x', mac: 'cmd+k cmd+x' },
  { id: 'editor.action.transformToUppercase', category: 'Editor', title: 'Transform to Uppercase' },
  { id: 'editor.action.transformToLowercase', category: 'Editor', title: 'Transform to Lowercase' },
  { id: 'editor.action.sortLinesAscending', category: 'Editor', title: 'Sort Lines Ascending' },
  { id: 'editor.action.sortLinesDescending', category: 'Editor', title: 'Sort Lines Descending' },
  { id: 'editor.action.copyLinesDownAction', category: 'Editor', title: 'Copy Line Down', key: 'shift+alt+down', mac: 'shift+alt+down' },
  { id: 'editor.action.moveLinesUpAction', category: 'Editor', title: 'Move Line Up', key: 'alt+up', mac: 'alt+up' },
  { id: 'editor.action.moveLinesDownAction', category: 'Editor', title: 'Move Line Down', key: 'alt+down', mac: 'alt+down' },
  { id: 'editor.action.deleteLines', category: 'Editor', title: 'Delete Line', key: 'ctrl+shift+k', mac: 'shift+cmd+k' },
  { id: 'editor.action.joinLines', category: 'Editor', title: 'Join Lines', mac: 'ctrl+j' },
  { id: 'editor.action.selectHighlights', category: 'Editor', title: 'Select All Occurrences of Find Match', key: 'ctrl+shift+l', mac: 'shift+cmd+l' },
  { id: 'editor.action.indentationToSpaces', category: 'Editor', title: 'Convert Indentation to Spaces' },
  { id: 'editor.action.indentationToTabs', category: 'Editor', title: 'Convert Indentation to Tabs' },
  { id: 'workbench.action.editor.changeLanguageMode', category: 'Editor', title: 'Change Language Mode', key: 'ctrl+k m', mac: 'cmd+k m' },
  { id: 'workbench.action.editor.changeEOL', category: 'Editor', title: 'Change End of Line Sequence' },
  { id: 'workbench.action.editor.changeEncoding', category: 'Editor', title: 'Change File Encoding' },

  // ── Terminal, tasks, debugging ────────────────────────────────────────────────
  { id: 'workbench.action.terminal.toggleTerminal', category: 'View', title: 'Toggle Terminal', key: 'ctrl+`', mac: 'ctrl+`' },
  { id: 'workbench.action.terminal.new', category: 'Terminal', title: 'Create New Terminal', key: 'ctrl+shift+`', mac: 'ctrl+shift+`' },
  { id: 'workbench.action.terminal.kill', category: 'Terminal', title: 'Kill the Active Terminal Instance' },
  { id: 'workbench.action.terminal.clear', category: 'Terminal', title: 'Clear' },
  { id: 'workbench.action.tasks.runTask', category: 'Tasks', title: 'Run Task' },
  { id: 'workbench.action.tasks.build', category: 'Tasks', title: 'Run Build Task', key: 'ctrl+shift+b', mac: 'cmd+shift+b' },
  { id: 'workbench.action.debug.start', category: 'Debug', title: 'Start Debugging', key: 'f5', mac: 'f5' },
  { id: 'workbench.action.debug.run', category: 'Debug', title: 'Start Without Debugging', key: 'ctrl+f5', mac: 'ctrl+f5' },
  { id: 'workbench.action.debug.stop', category: 'Debug', title: 'Stop', key: 'shift+f5', mac: 'shift+f5' },
  { id: 'workbench.action.debug.restart', category: 'Debug', title: 'Restart', key: 'ctrl+shift+f5', mac: 'shift+cmd+f5' },
  { id: 'editor.debug.action.toggleBreakpoint', category: 'Debug', title: 'Toggle Breakpoint', key: 'f9', mac: 'f9' },

  // ── Settings, window, developer ───────────────────────────────────────────────
  { id: 'workbench.action.openSettings', category: 'Preferences', title: 'Open Settings (UI)', key: 'ctrl+,', mac: 'cmd+,' },
  { id: 'workbench.action.openSettingsJson', category: 'Preferences', title: 'Open User Settings (JSON)' },
  { id: 'workbench.action.openGlobalKeybindings', category: 'Preferences', title: 'Open Keyboard Shortcuts', key: 'ctrl+k ctrl+s', mac: 'cmd+k cmd+s' },
  { id: 'workbench.action.openGlobalKeybindingsFile', category: 'Preferences', title: 'Open Keyboard Shortcuts (JSON)' },
  { id: 'workbench.action.selectTheme', category: 'Preferences', title: 'Color Theme', key: 'ctrl+k ctrl+t', mac: 'cmd+k cmd+t' },
  { id: 'workbench.action.selectIconTheme', category: 'Preferences', title: 'File Icon Theme' },
  { id: 'workbench.action.configureLocale', category: 'Configure', title: 'Configure Display Language' },
  { id: 'workbench.extensions.action.showInstalledExtensions', category: 'Extensions', title: 'Show Installed Extensions' },
  { id: 'workbench.action.reloadWindow', category: 'Developer', title: 'Reload Window' },
  { id: 'workbench.action.toggleDevTools', category: 'Developer', title: 'Toggle Developer Tools' },
];
