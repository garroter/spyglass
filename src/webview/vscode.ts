// Single acquireVsCodeApi() call — imported by all modules that need postMessage

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

export const vscode = acquireVsCodeApi();
