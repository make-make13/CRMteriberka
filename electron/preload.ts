/**
 * Electron preload script.
 *
 * CRM общается с backend через HTTP (/api/*) — специального IPC не нужно.
 * Preload существует для соблюдения contextIsolation: true и на случай
 * будущих native Electron-интеграций (диалоги файлов, уведомления).
 */

// Намеренно пустой: contextBridge.exposeInMainWorld не вызывается,
// потому что CRM не нуждается в прямом доступе к Electron API из браузера.
