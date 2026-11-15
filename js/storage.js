const DB = "niyayesh-space";

function openDb() {
  if (!window.indexedDB) return Promise.reject(new Error("no-idb"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("save")) db.createObjectStore("save");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadSave() {
  const db = await openDb();
  const value = await new Promise((resolve, reject) => {
    const request = db.transaction("save").objectStore("save").get("game");
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}

export async function writeSave(data) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("save", "readwrite");
    tx.objectStore("save").put(data, "game");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
