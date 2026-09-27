let _isReconnecting = false;
let _lastReconnectTimestamp = 0;

export async function reconnectFirebaseNetwork(force = false, timeoutMs = 2500) {
    if (typeof window === 'undefined' || !window.db) return;

    const now = Date.now();
    if (!force && _isReconnecting) return;
    if (!force && (now - _lastReconnectTimestamp < 1200)) return;

    _isReconnecting = true;
    _lastReconnectTimestamp = now;

    try {
        // 1. Force drop any dead half-open TCP stream caused by mobile sleep / tab backgrounding
        if (typeof window.db.disableNetwork === 'function') {
            try {
                await window.db.disableNetwork();
            } catch(e) {}
        }
        // 2. Open fresh WebChannel/stream connection
        if (typeof window.db.enableNetwork === 'function') {
            const enablePromise = window.db.enableNetwork();
            const timeoutPromise = new Promise(resolve => setTimeout(resolve, timeoutMs));
            await Promise.race([enablePromise, timeoutPromise]);
            console.log('[Firestore] Network connection revived instantly on app wakeup');
        }
    } catch(e) {
        console.warn('[Firestore Reconnect Note]', e);
    } finally {
        _isReconnecting = false;
    }
}

/**
 * Fast cache-first document fetcher with strict timeout fallback.
 * Prevents mobile sleep / network freeze from hanging requests.
 */
export async function safeDocGet(docRef, timeoutMs = 2500) {
    if (!docRef || typeof docRef.get !== 'function') return null;

    // 1. Try local offline cache first (0ms instantaneous response)
    try {
        const cachedDoc = await docRef.get({ source: 'cache' });
        if (cachedDoc && cachedDoc.exists) {
            // Background refresh from live server without blocking caller
            docRef.get({ source: 'server' }).catch(() => {});
            return cachedDoc;
        }
    } catch(cErr) {
        // Cache miss or doc not in offline IndexedDB
    }

    // 2. Fall back to server fetch with strict timeout race
    try {
        const queryPromise = docRef.get();
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), timeoutMs));
        const res = await Promise.race([queryPromise, timeoutPromise]);
        return res;
    } catch(e) {
        console.warn('[safeDocGet Error]', e);
        return null;
    }
}

export const db = {
    getFirestore() {
        if (typeof firebase !== 'undefined' && typeof firebase.firestore === 'function') {
            try {
                return firebase.firestore();
            } catch(e) {}
        }
        if (window.db && window.db !== this && typeof window.db.collection === 'function' && !window.db.getFirestore) {
            return window.db;
        }
        return null;
    },
    collection(name) {
        const fs = this.getFirestore();
        if (!fs) {
            return {
                doc: (id) => ({
                    get: async () => ({ exists: false, data: () => null }),
                    set: async () => {},
                    update: async () => {},
                    delete: async () => {},
                    onSnapshot: () => () => {}
                }),
                get: async () => ({ docs: [] })
            };
        }
        return fs.collection(name);
    },
    async get(collection, docId, timeoutMs = 2500) {
        const fs = this.getFirestore();
        if (!fs) return null;
        const docRef = fs.collection(collection).doc(docId);

        // 1. Instant Cache retrieval (0ms from IndexedDB / local memory)
        try {
            const cached = await docRef.get({ source: 'cache' });
            if (cached && cached.exists) {
                // Background refresh from server without blocking
                docRef.get({ source: 'server' }).catch(() => {});
                return cached.data();
            }
        } catch(cacheErr) {}

        // 2. Server fetch with timeout race
        try {
            const queryPromise = docRef.get();
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), timeoutMs));
            const doc = await Promise.race([queryPromise, timeoutPromise]);
            return (doc && doc.exists) ? doc.data() : null;
        } catch(e) { 
            console.error('DB get error:', e); 
            return null; 
        }
    },
    async set(collection, docId, data, merge = true, timeoutMs = 4000) {
        const fs = this.getFirestore();
        if (!fs) return false;
        try {
            const setPromise = fs.collection(collection).doc(docId).set(data, { merge });
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(false), timeoutMs));
            const res = await Promise.race([setPromise.then(() => true), timeoutPromise]);
            return !!res;
        } catch(e) { 
            console.error('DB set error:', e); 
            return false; 
        }
    },
    onSnapshot(collection, docId, callback) {
        const fs = this.getFirestore();
        if (!fs) return () => {};
        return fs.collection(collection).doc(docId).onSnapshot(callback, err => {
            console.warn(`[onSnapshot note for ${collection}/${docId}]`, err);
        });
    }
};

if (typeof window !== 'undefined') {
    window.reconnectFirebaseNetwork = reconnectFirebaseNetwork;
    window.safeDocGet = safeDocGet;
}

