const listeners = new Map();
export const EventBus = {
    on(event, callback) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event).add(callback);
    },
    off(event, callback) {
        if (listeners.has(event)) listeners.get(event).delete(callback);
    },
    emit(event, data) {
        if (listeners.has(event)) {
            listeners.get(event).forEach(cb => cb(data));
        }
    }
};
