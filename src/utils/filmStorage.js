/**
 * CineScope Film Storage — IndexedDB persistence for imported Comscore films.
 *
 * Stores complete film data (parsed venues, stats, film info) so Austin
 * doesn't need to re-import Comscore files every time he opens the app.
 *
 * DB: "cinescope"  |  Store: "films"  |  Key: film.id
 */

const DB_NAME = 'cinescope'
const DB_VERSION = 1
const STORE_NAME = 'films'

/**
 * Open (or create) the IndexedDB database.
 * Returns a promise that resolves to the IDBDatabase instance.
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Save a single film entry to IndexedDB.
 * @param {Object} film — { id, filmInfo, comscoreVenues, stats, aggregationLog }
 */
export async function saveFilm(film) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(film)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('CineScope: Could not save film to IndexedDB', err)
  }
}

/**
 * Load all saved films from IndexedDB.
 * @returns {Promise<Array>} — array of film entries (empty if none saved or DB unavailable)
 */
export async function loadAllFilms() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    console.warn('CineScope: Could not load films from IndexedDB', err)
    return []
  }
}

/**
 * Delete a single film by ID.
 * @param {string} filmId
 */
export async function deleteFilm(filmId) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(filmId)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('CineScope: Could not delete film from IndexedDB', err)
  }
}

/**
 * Clear all saved films from IndexedDB.
 */
export async function clearAllFilms() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('CineScope: Could not clear films from IndexedDB', err)
  }
}
