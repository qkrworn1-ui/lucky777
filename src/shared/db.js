export async function reconnectFirebaseNetwork(timeoutMs = 2500) {
    if (typeof window !== 'undefined' && window.db && typeof window.db.enableNetwork === 'function') {
        try {
            const enablePromise = window.db.enableNetwork();
            const timeoutPromise = new Promise(resolve => setTimeout(resolve, timeoutMs));
            await Promise.race([enablePromise, timeoutPromise]);
            console.log('[Firestore] Network connection revived instantly on app wakeup');
        } catch(e) {
            console.warn('[Firestore Reconnect Note]', e);
        }
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
    async get(collection, docId, timeoutMs = 3500) {
        const fs = this.getFirestore();
        if (!fs) return null;
        try {
            const queryPromise = fs.collection(collection).doc(docId).get();
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
}
