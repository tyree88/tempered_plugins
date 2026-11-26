// restyle desktop: the only way from the window to the main process. CommonJS: a sandboxed preload is not a module.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('restyle', {
  /** `{ board, catalog }`: the board of the last audit (or null) and the recipes. */
  state: () => ipcRenderer.invoke('state'),
  /** Audits the app at `url`, `pages` pages at most. Resolves with the new board. */
  run: (url, pages) => ipcRenderer.invoke('run', url, pages),
  /** `{ id, verdict: 'accept' | 'dismiss' | 'open', reason, comment, picks }`. Resolves with the stored verdict. */
  verdict: (body) => ipcRenderer.invoke('verdict', body),
  /** The fix prompt of an accepted card. */
  prompt: (id) => ipcRenderer.invoke('prompt', id),
  copy: (text) => ipcRenderer.invoke('copy', text),
  onProgress: (fn) => {
    ipcRenderer.on('progress', (_e, text) => fn(text))
  },
})
