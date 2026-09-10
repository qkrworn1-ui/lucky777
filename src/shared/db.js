export const db = {
    getFirestore() {
        if (typeof firebase !== 'undefined' && typeof firebase.firestore === 'function') {
            try {
                return firebase.firestore();
            } catch(e) {}
        }
        if (typeof window !== 'undefined' && window.rawFirestore && typeof window.rawFirestore.collection === 'function') {
            return window.rawFirestore;
        }
        if (typeof window !== 'undefined' && window.db && window.db !== this && typeof window.db.collection === 'function') {
            return window.db;
        }
        return null;
    },
    collection(name) {
        const fs = this.getFirestore();
        if (fs && typeof fs.collection === 'function') {
            return fs.collection(name);
        }
        return {
            doc: (id) => ({
                get: async () => ({ exists: false, data: () => null }),
                set: async () => {},
                update: async () => {},
                delete: async () => {},
                onSnapshot: () => () => {}
            }),
            get: async () => ({ docs: [], empty: true, forEach: () => {} }),
            where: () => ({ get: async () => ({ docs: [], empty: true, forEach: () => {} }) }),
            orderBy: () => ({ get: async () => ({ docs: [], empty: true, forEach: () => {} }) }),
            limit: () => ({ get: async () => ({ docs: [], empty: true, forEach: () => {} }) }),
            add: async () => ({ id: 'mock_' + Date.now() })
        };
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

export const dbHelper = db;

