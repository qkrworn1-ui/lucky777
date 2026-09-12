import { state, applyNewDrawData } from '../state.js';
import { db } from '../../../shared/db.js';
import { showToast, getDrawDateByRound, removeUndefined } from '../../../shared/utils.js';
import { isAdminUser } from '../../../shared/auth-mgmt.js';
import { recalculateGroups } from '../statistics.js';
import { renderLatestDrawBanner } from './draw-banner.js';
import { renderTop5Combinations } from './generator-tab.js';
import { populateSimRoundSelector, renderSimulationTab } from './simulation-tab.js';
import { getHistoricalTop10Combinations } from '../ledger.js';
import { renderConfirmedPurchasesList } from './confirmed-tab.js';
import { renderReviewTab } from './review-tab.js';
import { checkRoundWinningPurchases, showCelebrationOverlay } from './celebration.js';
import { fetchFullPrizeDetailsFromHTML, generateFallbackPrizeDetails } from '../scraper.js';

export function syncDrawDateWithRound(roundVal) {
    const dateInput = document.getElementById('mInputDrwDate');
    if (!dateInput) return;

    const round = parseInt(roundVal);
    if (!isNaN(round) && round >= 1) {
        // Check if round already exists in history
        const existing = state.mergedHistory && state.mergedHistory[round];
        if (existing && existing.drwNoDate) {
            const rawDate = existing.drwNoDate.replace(/\./g, '-').trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
                dateInput.value = rawDate;
                return;
            }
        }
        // Calculate standard Saturday draw date
        const calculatedDate = getDrawDateByRound(round);
        if (calculatedDate) {
            dateInput.value = calculatedDate;
        }
    }
}

export function openManualModal() {
    const authId = (typeof window.SafeAuth !== 'undefined' ? window.SafeAuth.get() : null) || sessionStorage.getItem('lotto_auth') || localStorage.getItem('lotto_auth');
    if (!authId) {
        alert('⚠️ 로그인이 필요합니다.');
        return;
    }

    const isAdmin = (typeof isAdminUser === 'function' ? isAdminUser(authId) : (authId === 'master' || authId === 'admin'));
    if (!isAdmin) {
        alert('⚠️ 관리자 전용 기능입니다.');
        return;
    }

    const mModal = document.getElementById('manualDrawModal');
    if (mModal) {
        mModal.style.display = 'flex';
        mModal.style.visibility = 'visible';
        mModal.classList.remove('hidden');
        
        // Auto-focus and suggest next round if empty
        const drwInput = document.getElementById('mInputDrwNo');
        if (drwInput) {
            if (!drwInput.value) {
                const nextRound = state.latestDrawNo ? (state.latestDrawNo + 1) : 1160;
                drwInput.value = nextRound;
            }
            syncDrawDateWithRound(drwInput.value);
        }
    } else {
        console.error('[ManualDraw] modal element #manualDrawModal not found in DOM.');
    }
}

export function closeManualModal() {
    const mModal = document.getElementById('manualDrawModal');
    if (mModal) {
        mModal.style.display = 'none';
        mModal.classList.add('hidden');
    }
}

export function setupManualDrawModal() {
    // Event delegation on document for robust click handling
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (!target) return;

        // Open button click (supports clicking icon inside button as well)
        if (target.closest('#btnOpenManualDrawModal') || target.closest('[data-action="open-manual-draw"]')) {
            e.preventDefault();
            openManualModal();
            return;
        }

        // Close button click
        if (target.closest('#btnCloseManualDrawModal')) {
            e.preventDefault();
            closeManualModal();
            return;
        }

        // Modal backdrop click
        const mModal = document.getElementById('manualDrawModal');
        if (mModal && target === mModal) {
            closeManualModal();
            return;
        }
    });

    // Real-time date synchronization when round number changes
    document.addEventListener('input', (e) => {
        if (e.target && e.target.id === 'mInputDrwNo') {
            syncDrawDateWithRound(e.target.value);
        }
    });
    document.addEventListener('change', (e) => {
        if (e.target && e.target.id === 'mInputDrwNo') {
            syncDrawDateWithRound(e.target.value);
        }
    });

    // Form submission
    document.addEventListener('submit', async (e) => {
        if (e.target && e.target.id === 'manualDrawForm') {
            e.preventDefault();
            const authId = (typeof SafeStorage !== 'undefined' ? SafeStorage.getItem('lotto_auth') : null) || sessionStorage.getItem('lotto_auth');
            if (authId !== 'master') {
                alert('⚠️ 권한이 없습니다.\n당첨번호 등록은 관리자(master) 계정만 가능합니다.');
                return;
            }
            const drwNoEl = document.getElementById('mInputDrwNo');
            const drwDateEl = document.getElementById('mInputDrwDate');
            const rawNumsEl = document.getElementById('mInputNumbers');
            const bonusEl = document.getElementById('mInputBonus');

            const drwNo = parseInt(drwNoEl ? drwNoEl.value : '0');
            const drwDate = drwDateEl ? drwDateEl.value.trim() : '';
            const rawNumsStr = rawNumsEl ? rawNumsEl.value.trim() : '';
            const bonusVal = parseInt(bonusEl ? bonusEl.value : '0');

            const parsedNums = rawNumsStr.replace(/,/g, ' ').split(/\s+/).map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 1 && n <= 45);

            if (parsedNums.length !== 6) {
                alert('당첨번호 6개를 올바르게 입력해주세요 (1~45 중 6개).');
                return;
            }

            if (isNaN(bonusVal) || bonusVal < 1 || bonusVal > 45) {
                alert('보너스 번호를 올바르게 입력해주세요 (1~45 중 1개).');
                return;
            }

            const defaultPrizes = generateFallbackPrizeDetails(drwNo);

            const drawObj = {
                drwNo: drwNo,
                drwNoDate: drwDate || '수동 입력',
                date: drwDate || '수동 입력',
                numbers: parsedNums.sort((a,b) => a - b),
                bonus: bonusVal,
                firstWinamnt: defaultPrizes[1].prize,
                firstPrzwnerCo: defaultPrizes[1].winners,
                rank1Prize: defaultPrizes[1].prize,
                rank1Winners: defaultPrizes[1].winners,
                rank2Prize: defaultPrizes[2].prize,
                rank2Winners: defaultPrizes[2].winners,
                rank3Prize: defaultPrizes[3].prize,
                rank3Winners: defaultPrizes[3].winners,
                rank4Prize: defaultPrizes[4].prize,
                rank4Winners: defaultPrizes[4].winners,
                rank5Prize: defaultPrizes[5].prize,
                rank5Winners: defaultPrizes[5].winners,
                prizes: defaultPrizes,
                prizeInfo: defaultPrizes,
                isManual: true
            };

            // Attempt online prize scrape in background
            fetchFullPrizeDetailsFromHTML(drwNo).then(prizes => {
                if (prizes) {
                    drawObj.firstWinamnt = prizes[1].prize;
                    drawObj.firstPrzwnerCo = prizes[1].winners;
                    drawObj.rank1Prize = prizes[1].prize;
                    drawObj.rank2Prize = prizes[2].prize;
                    drawObj.rank3Prize = prizes[3].prize;
                    drawObj.prizes = prizes;
                    drawObj.prizeInfo = prizes;
                    if (db && typeof db.set === 'function') {
                        db.set('lotto_draw_history', 'extra_history', state.lottoExtraHistory).catch(console.error);
                    }
                    renderLatestDrawBanner();
                }
            }).catch(console.error);

            state.mergedHistory[drwNo] = drawObj;
            applyNewDrawData(drawObj);
            state.lottoExtraHistory[drwNo] = drawObj;
            
            // 1. Dual persistence: LocalStorage backup
            try {
                localStorage.setItem('lotto_extra_history', JSON.stringify(state.lottoExtraHistory));
            } catch (e) {
                console.warn('[Storage] Local storage backup failed:', e);
            }

            // 2. Cloud persistence: Firestore server
            let isCloudSaved = false;
            if (db && typeof db.set === 'function') {
                try {
                    const cleanData = typeof removeUndefined === 'function' ? removeUndefined(state.lottoExtraHistory) : state.lottoExtraHistory;
                    isCloudSaved = await db.set('lotto_draw_history', 'extra_history', cleanData);
                    if (isCloudSaved) {
                        console.log(`[DB] Successfully saved round ${drwNo} draw to Firestore.`);
                    }
                } catch (err) {
                    console.error('[DB] Cloud save error:', err);
                }
            }
            
            recalculateGroups();
            renderLatestDrawBanner();
            renderTop5Combinations(true);

            populateSimRoundSelector();
            renderSimulationTab(drwNo);
            if (typeof renderConfirmedPurchasesList === 'function') {
                renderConfirmedPurchasesList();
            }
            if (typeof renderReviewTab === 'function') {
                renderReviewTab();
            }

            closeManualModal();
            const saveMsg = isCloudSaved ? '서버 및 기기에 안전하게 저장되었습니다!' : '기기에 정상 반영되었습니다!';
            showToast(`🎉 제 ${drwNo}회 당첨번호가 ${saveMsg}`);

            // --- 🏆 Check winning games in confirmed purchases & Trigger Celebration ---
            try {
                const purchases = getHistoricalTop10Combinations(drwNo);
                const winResult = checkRoundWinningPurchases(drwNo, drawObj.numbers, drawObj.bonus, purchases);
                if (winResult && winResult.winningGames && winResult.winningGames.length > 0) {
                    setTimeout(() => {
                        showCelebrationOverlay(winResult);
                    }, 400);
                }
            } catch (err) {
                console.error('[Celebration] Error evaluating winning purchases:', err);
            }
        }
    });

    // Expose globally for direct inline onclick or console triggers
    if (typeof window !== 'undefined') {
        window.openManualDrawModal = openManualModal;
        window.closeManualDrawModal = closeManualModal;
        window.openManualModal = openManualModal;
        window.closeManualModal = closeManualModal;
    }
}
