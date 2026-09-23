export async function fetchAllUsersPurchases(forceRefresh = false) {

    if (!forceRefresh && state.allUsersPurchasesMap && Object.keys(state.allUsersPurchasesMap).length > 0 && (Date.now() - _lastFetchAllUsersPurchasesTime < FETCH_ALL_CACHE_TTL_MS)) {

        return { allUsersMap: state.allUsersPurchasesMap, mergedLedger: state.allUsersMergedLedger || {} };

    }



    if (_inFlightFetchAllUsersPurchasesPromise) {

        return _inFlightFetchAllUsersPurchasesPromise;

    }



    const firestore = window.db || (db && typeof db.getFirestore === 'function' ? db.getFirestore() : null);

    if (!firestore) return {};



    _inFlightFetchAllUsersPurchasesPromise = (async () => {

        try {

            const [pSnapshot, uSnapshot] = await Promise.all([

                firestore.collection('lotto_purchases').get().catch(err => { console.warn('[Purchases Fetch Error]', err); return { forEach: () => {} }; }),

                firestore.collection('lotto_users').get().catch(err => { console.warn('[Users Fetch Error]', err); return null; })

            ]);

        

        const userNames = {};

        if (uSnapshot && !uSnapshot.empty) {

            state.allRegisteredUsersList = [];

            uSnapshot.forEach(doc => {

                const uId = doc.id.trim().toLowerCase();

                if (isSystemOrDummyUser(uId)) return;

                const d = doc.data() || {};

                if (d.isDeleted === true || d.status === 'trash' || d.status === 'deleted') return;

                const rName = d.realName || doc.id;

                userNames[doc.id] = rName;

                userNames[uId] = rName;

                if (d.realName && typeof setUserNameCache === 'function') {

                    setUserNameCache(doc.id, d.realName);

                }

                const isAdm = !!(d.isAdmin === true || d.role === 'admin' || doc.id === 'master' || doc.id === 'admin');

                const isPerm = !!(d.isPermanent === true || d.isPermanent === 'true' || d.userType === 'permanent' || isAdm);

                if (typeof window !== 'undefined' && typeof window.setIsPermanentCache === 'function') {

                    window.setIsPermanentCache(doc.id, isPerm);

                }

                if (typeof window !== 'undefined' && typeof window.setIsAdminCache === 'function') {

                    window.setIsAdminCache(doc.id, isAdm);

                }

                if (d.createdAt) {

                    try {

                        localStorage.setItem(`lotto_user_created_${uId}`, d.createdAt);

                        localStorage.setItem(`created_${uId}`, d.createdAt);

                        sessionStorage.setItem(`created_${uId}`, d.createdAt);

                        if (typeof window !== 'undefined') {

                            if (!window.__userCreatedMap) window.__userCreatedMap = {};

                            window.__userCreatedMap[uId] = d.createdAt;

                        }

                    } catch(e) {}

                }

                state.allRegisteredUsersList.push({

                    id: doc.id,

                    name: rName,

                    realName: rName,

                    phone: d.phoneNumber || '',

                    isAdmin: !!(d.isAdmin === true || d.role === 'admin' || doc.id === 'master' || doc.id === 'admin'),

                    isPermanent: isPerm,

                    userType: d.userType || (isPerm ? 'permanent' : 'regular'),

                    createdAt: d.createdAt || null

                });



                // ??? Cloud-Synced Immutable Recommendation Snapshots Preload

                if (d.recommendationSnapshots && typeof d.recommendationSnapshots === 'object') {

                    if (!state.userRecommendationSnapshots) state.userRecommendationSnapshots = {};

                    for (const rKey in d.recommendationSnapshots) {

                        const snapData = d.recommendationSnapshots[rKey];

                        if (snapData && (snapData.v4Combos || snapData.v3Combos || snapData.extraPacks)) {

                            const mapKey = `${uId}_${parseInt(rKey, 10)}`;

                            state.userRecommendationSnapshots[mapKey] = snapData;

                        }

                    }

                }

            });



            // ??? Ensure master and wdy are always present in state.allRegisteredUsersList

            if (!state.allRegisteredUsersList.some(u => (u.id || '').toLowerCase().trim() === 'master')) {

                state.allRegisteredUsersList.unshift({

                    id: 'master',

                    name: '??????',

                    realName: '??????',

                    phone: '',

                    isAdmin: true,

                    isPermanent: true,

                    userType: 'permanent',

                    createdAt: '2026-07-25T12:00:00+09:00'

                });

            }

            if (!state.allRegisteredUsersList.some(u => (u.id || '').toLowerCase().trim() === 'wdy')) {

                state.allRegisteredUsersList.push({

                    id: 'wdy',

                    name: '??????,

                    realName: '??????,

                    phone: '',

                    isAdmin: false,

                    isPermanent: false,

                    userType: 'regular',

                    createdAt: '2026-08-01T12:00:00+09:00'

                });

            }



            try { localStorage.setItem('lotto_all_users_list_cache', JSON.stringify(state.allRegisteredUsersList)); } catch(e) {}

        }



        const allUsersMap = {};

        const mergedLedger = {};



        let docCounter = 0; const docsArr = pSnapshot.docs || []; for (const doc of docsArr) { docCounter++; if (docCounter % 15 === 0) { await new Promise(r => setTimeout(r, 0)); }

            const rawUserId = doc.id;

            const userId = rawUserId.trim().toLowerCase();

            if (isSystemOrDummyUser(userId)) {
                continue; // Exclude test accounts from aggregation!
            }
            const data = doc.data() || {};

            let rawUserLedger = data.ledger || {};

            if (typeof rawUserLedger === 'string') {

                try { rawUserLedger = JSON.parse(rawUserLedger); } catch(e) { rawUserLedger = {}; }

            }

            if (!rawUserLedger || typeof rawUserLedger !== 'object') rawUserLedger = {};

            const cleanUserLedger = {};

            let hadPollution = false;



            const isMasterDoc = (userId === 'master' || userId === 'admin');



            for (const r in rawUserLedger) {

                const roundNum = parseInt(r);

                if (isNaN(roundNum) || !Array.isArray(rawUserLedger[r])) continue;



                const validReceipts = [];

                rawUserLedger[r].forEach(receipt => {

                    if (!receipt || !receipt.combos || !Array.isArray(receipt.combos)) return;

                    

                    const pUser = (receipt.user || receipt.userId || '').trim().toLowerCase();



                    // If normal user doc contains master/other user receipts, it's polluted!

                    if (!isMasterDoc && pUser && pUser !== userId) {

                        hadPollution = true;

                        return; // Exclude leaked master receipt!

                    }



                    const sanitizedReceipt = syncPurchaseWithQrUrl({

                        ...receipt,

                        user: isMasterDoc ? (pUser || 'master') : userId,

                        userName: userNames[rawUserId] || rawUserId

                    });

                    validReceipts.push(sanitizedReceipt);

                });



                if (validReceipts.length > 0) {

                    cleanUserLedger[roundNum] = deduplicateReceipts(validReceipts);

                }

            }



                cleanUserLedger[1239] = normalizeMaster1239Order(cleanUserLedger[1239]);

                cleanUserLedger[1239] = normalizeMaster1239Order(cleanUserLedger[1239].map(syncPurchaseWithQrUrl));

            }



            // ??? Master Fallback: Ensure all verified rounds (1235~1240) are populated

            if (isMasterDoc) {

                [1235, 1236, 1237, 1238, 1239, 1240].forEach(r => {

                    if (!cleanUserLedger[r] || cleanUserLedger[r].length === 0) {

                        const off = getOfficialPastRecommendation(r);

                        if (off && off.length > 0) {

                            cleanUserLedger[r] = off.map(syncPurchaseWithQrUrl);

                        }

                    }

                });

                if (cleanUserLedger[1239]) {

                    cleanUserLedger[1239] = normalizeMaster1239Order(cleanUserLedger[1239]);

                }

            }



            // If pollution detected in cloud, automatically repair and rewrite clean ledger to Firestore

            if (hadPollution && !isMasterDoc) {

                console.warn(`[Firestore Cloud Repair] Automatically purged leaked receipts for user: ${userId}`);

                try {

                    firestore.collection('lotto_purchases').doc(rawUserId).set({ ledger: cleanUserLedger }, { merge: true });

                } catch(repairErr) {

                    console.error('[Cloud Repair Failed]', repairErr);

                }

            }



            // ??? Also preload recommendationSnapshots from lotto_purchases (for master, wdy, or fallback)

            if (data.recommendationSnapshots && typeof data.recommendationSnapshots === 'object') {

                if (!state.userRecommendationSnapshots) state.userRecommendationSnapshots = {};

                for (const rKey in data.recommendationSnapshots) {

                    const snapData = data.recommendationSnapshots[rKey];

                    if (snapData && (snapData.v4Combos || snapData.v3Combos || snapData.extraPacks)) {

                        const mapKey = `${userId}_${parseInt(rKey, 10)}`;

                        if (!state.userRecommendationSnapshots[mapKey]) {

                            state.userRecommendationSnapshots[mapKey] = snapData;

                        }

                    }

                }

            }



            allUsersMap[rawUserId] = {

                userId: rawUserId,

                realName: userNames[rawUserId] || rawUserId,

                createdAt: (state.allRegisteredUsersList.find(u => u.id === rawUserId)?.createdAt) || null,

                ledger: cleanUserLedger

            };



            for (const r in cleanUserLedger) {

                const roundNum = parseInt(r);

                if (!mergedLedger[roundNum]) mergedLedger[roundNum] = [];









                cleanUserLedger[r].forEach(receipt => {

                    mergedLedger[roundNum].push(receipt);

                });

                mergedLedger[roundNum] = deduplicateReceipts(mergedLedger[roundNum]); if (roundNum === 1239) { mergedLedger[1239] = normalizeMaster1239Order(mergedLedger[1239]); }

            }

        }



        // ??? Ensure master is always registered in allUsersMap

        if (!allUsersMap['master']) {

            const masterCleanLedger = {};

            [1235, 1236, 1237, 1238, 1239, 1240].forEach(r => {

                masterCleanLedger[r] = (getOfficialPastRecommendation(r) || []).map(syncPurchaseWithQrUrl);

            });

            if (masterCleanLedger[1239]) {

                masterCleanLedger[1239] = normalizeMaster1239Order(masterCleanLedger[1239]);

            }

            allUsersMap['master'] = {

                userId: 'master',

                realName: userNames['master'] || '??????',

                createdAt: null,

                ledger: masterCleanLedger

            };

            for (const r in masterCleanLedger) {

                const roundNum = parseInt(r);

                if (!mergedLedger[roundNum]) mergedLedger[roundNum] = [];

                masterCleanLedger[r].forEach(receipt => mergedLedger[roundNum].push(syncPurchaseWithQrUrl(receipt)));

                mergedLedger[roundNum] = deduplicateReceipts(mergedLedger[roundNum].map(syncPurchaseWithQrUrl));

                if (roundNum === 1239) {

                    mergedLedger[1239] = normalizeMaster1239Order(mergedLedger[1239]);

                }

            }

        }



        state.allUsersPurchasesMap = allUsersMap;

        state.allUsersMergedLedger = mergedLedger;

        _lastFetchAllUsersPurchasesTime = Date.now();

        _allUsersFinancialsCache = null;

        state.ledgerFinancialsCache = null;



        // Invalidate in-memory 70 review memo cache so fresh cloud users/snapshots are used

        if (typeof window !== 'undefined' && typeof window.clearUser70ReviewCache === 'function') {

            window.clearUser70ReviewCache();

        }



        // Auto-refresh landing dashboard or currently active lotto tab to ensure synchronized live data

        if (typeof window !== 'undefined') {

            const landingPage = document.getElementById('landingPage');

            const appContainer = document.getElementById('appContainer');



            if (landingPage && (landingPage.classList.contains('active') || landingPage.style.display !== 'none')) {

                if (typeof window.renderLandingDashboard === 'function' && !window.__isRenderingDashboard) {

                    try { window.renderLandingDashboard(); } catch(dashErr) {}

                }

            } else if (appContainer && (appContainer.classList.contains('active') || appContainer.style.display !== 'none')) {

                const curTab = window.__currentLottoTab || 'tab-generator';

                if (curTab === 'tab-review' && typeof window.renderReviewTab === 'function') {

                    try { window.renderReviewTab(); } catch(revErr) {}

                } else if (curTab === 'tab-algorithms' && typeof window.renderAlgorithmsTab === 'function') {

                    try { window.renderAlgorithmsTab(); } catch(algoErr) {}

                } else if (curTab === 'tab-confirmed-list' && typeof window.renderConfirmedPurchasesList === 'function') {

                    try { window.renderConfirmedPurchasesList(); } catch(confErr) {}

                }

            }

        }



        return { allUsersMap, mergedLedger };

    } catch(e) {

        console.error('[fetchAllUsersPurchases Error]', e);

        return {};

    }

    })().finally(() => {

        _inFlightFetchAllUsersPurchasesPromise = null;

    });



    return _inFlightFetchAllUsersPurchasesPromise;

}



/**

 * Get the current active ledger (Individual user ledger or Admin multi-user merged ledger)

 * Strictly isolates normal users' data so they only ever see their own purchases.

 * @param {string|null} explicitTarget

 * @returns {Object}

 */
