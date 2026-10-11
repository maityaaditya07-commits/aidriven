const DB_NAME = 'proofly-evidence';
const STORE_NAME = 'uploads';

function openEvidenceDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('This browser does not support local image evidence storage.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local evidence storage.'));
  });
}

function runTransaction(mode, operation) {
  return openEvidenceDb().then((db) => new Promise((resolve, reject) => {
    let result;
    let settled = false;
    const transaction = db.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => {
      db.close();
      settled = true;
      resolve(result);
    };
    transaction.onabort = () => {
      db.close();
      settled = true;
      reject(transaction.error || new Error('Local evidence storage transaction was aborted.'));
    };
    transaction.onerror = () => {
      if (settled) return;
      db.close();
      settled = true;
      reject(transaction.error || new Error('Local evidence storage transaction failed.'));
    };
  }));
}

export function saveEvidenceBlob(id, file) {
  return runTransaction('readwrite', (store) => store.put(file, id));
}

export function loadEvidenceBlob(id) {
  return runTransaction('readonly', (store) => store.get(id));
}
