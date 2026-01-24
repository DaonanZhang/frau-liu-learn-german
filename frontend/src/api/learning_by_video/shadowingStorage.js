/**
 * Minimal IndexedDB helper for storing subtitle recordings.
 *
 * Storage key: `${videoId}:${subtitleId}`
 */

const DATABASE_NAME = "lv_shadowing_recordings";
const DATABASE_VERSION = 1;
const STORE_NAME = "recordings";

/**
 * Open the IndexedDB database (singleton per tab).
 *
 * @returns {Promise<IDBDatabase>} Open database instance.
 */
function openDatabase() {
	return new Promise((resolve, reject) => {
		const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains(STORE_NAME)) {
				database.createObjectStore(STORE_NAME);
			}
		};

		request.onsuccess = () => {
			resolve(request.result);
		};

		request.onerror = () => {
			reject(request.error || new Error("Failed to open IndexedDB."));
		};
	});
}

/**
 * Build storage key.
 *
 * @param {string|number} videoId - Video identifier.
 * @param {string|number} subtitleId - Subtitle identifier.
 * @returns {string} Storage key.
 */
export function buildRecordingKey(videoId, subtitleId) {
	return `${String(videoId)}:${String(subtitleId)}`;
}

/**
 * Save an audio Blob to IndexedDB.
 *
 * @param {string} key - Storage key.
 * @param {Blob} audioBlob - Recorded audio data.
 * @returns {Promise<void>} Resolves when saved.
 */
export async function saveRecordingBlob(key, audioBlob) {
	const database = await openDatabase();

	await new Promise((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, "readwrite");
		const store = transaction.objectStore(STORE_NAME);

		store.put(audioBlob, key);

		transaction.oncomplete = () => {
			resolve();
		};

		transaction.onerror = () => {
			reject(transaction.error || new Error("Failed to save recording."));
		};
	});
}

/**
 * Load an audio Blob from IndexedDB.
 *
 * @param {string} key - Storage key.
 * @returns {Promise<Blob|null>} The blob if found, else null.
 */
export async function loadRecordingBlob(key) {
	const database = await openDatabase();

	return await new Promise((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, "readonly");
		const store = transaction.objectStore(STORE_NAME);

		const request = store.get(key);

		request.onsuccess = () => {
			resolve(request.result || null);
		};

		request.onerror = () => {
			reject(request.error || new Error("Failed to load recording."));
		};
	});
}

/**
 * Delete an audio Blob from IndexedDB.
 *
 * @param {string} key - Storage key.
 * @returns {Promise<void>} Resolves when deleted.
 */
export async function deleteRecordingBlob(key) {
	const database = await openDatabase();

	await new Promise((resolve, reject) => {
		const transaction = database.transaction(STORE_NAME, "readwrite");
		const store = transaction.objectStore(STORE_NAME);

		store.delete(key);

		transaction.oncomplete = () => {
			resolve();
		};

		transaction.onerror = () => {
			reject(transaction.error || new Error("Failed to delete recording."));
		};
	});
}
