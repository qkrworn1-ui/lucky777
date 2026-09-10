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
    async get(collection, docId) {
        const fs = this.getFirestore();
        if (!fs) return null;
        try {
            const doc = await fs.collection(collection).doc(docId).get();
            return doc.exists ? doc.data() : null;
        } catch(e) { console.error('DB get error:', e); return null; }
    },
    async set(collection, docId, data, merge = true) {
        const fs = this.getFirestore();
        if (!fs) return false;
        try {
            await fs.collection(collection).doc(docId).set(data, { merge });
            return true;
        } catch(e) { 
            console.error('DB set error:', e); 
            return false;
        }
    },
    onSnapshot(collection, docId, callback) {
        const fs = this.getFirestore();
        if (!fs) return () => {};
        return fs.collection(collection).doc(docId).onSnapshot(callback);
    }
};
