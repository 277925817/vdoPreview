const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("previewTool", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  openPreview: (config) => ipcRenderer.invoke("preview:open", config),
  closePreview: () => ipcRenderer.invoke("preview:close"),
  reloadPreview: () => ipcRenderer.invoke("preview:reload"),
  onPreviewState: (callback) => {
    const listener = (event, state) => callback(state);
    ipcRenderer.on("preview:state", listener);
    return () => ipcRenderer.removeListener("preview:state", listener);
  }
});
