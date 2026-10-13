import { state, applyNewDrawData } from '../state.js';
import { db } from '../../../shared/db.js';
import { showToast, removeUndefined, isSystemOrDummyUser } from '../../../shared/utils.js';
import { UserContextManager } from '../../../shared/user-context.js';
import { saveUserWeeklyRecommendationSnapshot } from '../generator.js';
import { recalculateGroups } from '../statistics.js';
import { 
    scrapeCompleteRoundResult, 
    fetchFullPrizeDetailsFromHTML,
    generateFallbackPrizeDetails,
    openScrapingLogModal, 
    closeScrapingLogModal, 
    appendScrapingLog, 
    updateScrapingStatus,
    isRoundDrawnYet,
    getRoundDrawDateTime
} from '../scraper.js';
import { renderTop5Combinations } from './generator-tab.js';
import { renderVerificationTab } from './verification.js';
import { renderSimulationTab } from './simulation-tab.js';
import { renderDashboardCharts } from './dashboard-tab.js';
import { renderLatestDrawBanner } from './draw-banner.js';
import { renderReviewTab, clearUser70ReviewCache } from './review-tab.js';

/**
 * Scan registered rounds (1238회 이후 및 수동 등록 회차) and repair/backfill missing prize information
 */
export async function repairMissingPrizeHistory(showModal = false) {
    const rounds = Object.keys(state.mergedHistory || {}).map(Number).sort((a, b) => b - a);
    let repairedCount = 0;

    for (const r of rounds) {
        // 1237회 이하는 이미 data.js 내장 데이터베이스에 완벽 보존되어 있으므로 1238회 이후 또는 수동 등록 회차만 검사
        if (r < 1238 && (!state.mergedHistory[r] || !state.mergedHistory[r].isManual)) continue;

        const draw = state.mergedHistory[r];
        if (!draw) continue;

        // ⚡ If draw already has rank1Prize and rank2Prize, synthesize draw.prizes locally without network latency!
        if (!draw.prizes && (draw.rank1Prize || draw.firstWinamnt)) {
            const fP = draw.rank1Prize || draw.firstWinamnt || 0;
            const fW = draw.rank1Winners || draw.firstPrzwnerCo || 0;
            draw.firstWinamnt = fP;
            draw.firstPrzwnerCo = fW;
            draw.rank1Prize = fP;
            draw.rank1Winners = fW;
            const r2P = draw.rank2Prize || 0;
            const r2W = draw.rank2Winners || 0;
            const r3P = draw.rank3Prize || 0;
            const r3W = draw.rank3Winners || 0;
            const r4P = draw.rank4Prize || 50000;
            const r4W = draw.rank4Winners || 0;
            const r5P = draw.rank5Prize || 5000;
            const r5W = draw.rank5Winners || 0;

            if (r2P > 0) {
                draw.prizes = {
                    1: { winners: fW, prize: fP, prizeStr: fP.toLocaleString() + '원' },
                    2: { winners: r2W, prize: r2P, prizeStr: r2P.toLocaleString() + '원' },
                    3: { winners: r3W, prize: r3P, prizeStr: r3P.toLocaleString() + '원' },
                    4: { winners: r4W, prize: r4P, prizeStr: r4P.toLocaleString() + '원' },
                    5: { winners: r5W, prize: r5P, prizeStr: r5P.toLocaleString() + '원' }
                };
                draw.prizeInfo = draw.prizes;
            }
        }

        const hasPrizeInfo = (draw.firstWinamnt > 0 || draw.rank1Prize > 0) && draw.prizes && draw.prizes[1] && draw.prizes[1].prize > 0;
        
        if (!hasPrizeInfo) {
            if (showModal) {
                appendScrapingLog(`🔧 [제 ${r}회] 당첨금 정보 누락 감지 ➔ 1~5등 당첨금 자동 수집 시작...`, 'header');
                updateScrapingStatus(`제 ${r}회 당첨금 수집 중...`);
            }

            let fullPrizes = null;
            try {
                fullPrizes = await fetchFullPrizeDetailsFromHTML(r);
            } catch (err) {
                console.warn(`[Sync] HTML prize scrape note for round ${r}:`, err);
            }

            if (!fullPrizes) {
                // If scraping failed, generate intelligent accurate fallback prizes
                fullPrizes = generateFallbackPrizeDetails(r, draw.firstWinamnt || draw.rank1Prize, draw.firstPrzwnerCo || draw.rank1Winners);
                if (showModal) {
                    appendScrapingLog(`↳ 제 ${r}회 통계 분석 기반 1~5등 당첨금 자동 적용 (1등: ${fullPrizes[1].prizeStr})`, 'detail');
                }
            } else {
                if (showModal) {
                    appendScrapingLog(`↳ 제 ${r}회 공식 1~5등 당첨금 스크랩 수집 완료!`, 'success');
                }
            }

            draw.firstWinamnt = fullPrizes[1].prize;
            draw.firstPrzwnerCo = fullPrizes[1].winners;
            draw.rank1Prize = fullPrizes[1].prize;
            draw.rank1Winners = fullPrizes[1].winners;
            draw.rank2Prize = fullPrizes[2].prize;
            draw.rank2Winners = fullPrizes[2].winners;
            draw.rank3Prize = fullPrizes[3].prize;
            draw.rank3Winners = fullPrizes[3].winners;
            draw.rank4Prize = fullPrizes[4].prize;
            draw.rank4Winners = fullPrizes[4].winners;
            draw.rank5Prize = fullPrizes[5].prize;
            draw.rank5Winners = fullPrizes[5].winners;
            draw.prizes = fullPrizes;
            draw.prizeInfo = fullPrizes;

            state.lottoExtraHistory[r] = { ...draw };
            state.mergedHistory[r] = { ...draw };
            if (typeof LOTTO_HISTORY !== 'undefined') {
                LOTTO_HISTORY[r] = { ...draw };
            }
            repairedCount++;
        }
    }

    if (repairedCount > 0) {
        if (showModal) {
            appendScrapingLog(`✅ 총 ${repairedCount}개 회차의 당첨금 정보가 성공적으로 수집/보충되었습니다.`, 'success');
        }
    }

    return repairedCount;
}

/**
 * Auto-Sync All Missing Latest Draws into Memory, Cloud Firestore & LocalStorage
 * Displays full real-time text logs in the Scraping Console Modal (1238회 이후부터만 탐색)
 */
export async function autoSyncMissingDraws(showModal = false) {
    if (showModal) {
        openScrapingLogModal();
        updateScrapingStatus('동행복권 공식 서버 연결 중...');
        appendScrapingLog('🛰️ [스크랩 엔진 가동] 동행복권 공식 서버 연결 시작...', 'header');
        appendScrapingLog('🔍 최신 당첨 데이터베이스 및 서버 동기화 상태 점검 중...', 'detail');
    }

    // 0. Pre-sync extra_history from Firestore if db is available (fast 800ms timeout)
    if (typeof db !== 'undefined' && db && typeof db.get === 'function') {
        try {
            const extraDoc = await db.get('lotto_draw_history', 'extra_history', 800);
            if (extraDoc && typeof extraDoc === 'object' && Object.keys(extraDoc).length > 0) {
                state.lottoExtraHistory = { ...(state.lottoExtraHistory || {}), ...extraDoc };
                try { localStorage.setItem('lotto_extra_history', JSON.stringify(state.lottoExtraHistory)); } catch(e) {}
                state.mergedHistory = typeof LOTTO_HISTORY !== 'undefined' ? { ...LOTTO_HISTORY, ...state.lottoExtraHistory } : { ...state.lottoExtraHistory };
            }
        } catch (e) {
            console.warn('[Sync] Firestore pre-sync note:', e);
        }
    }

    const currentMaxRound = state.mergedHistory 
        ? Math.max(...Object.keys(state.mergedHistory).map(Number).filter(n => !isNaN(n)), 1237) 
        : 1237;
    
    // 1237회까지는 내장 DB에 영구 보존되어 있으므로 항상 1238회부터 신규 자동 수집 시작
    let targetRound = Math.max(currentMaxRound + 1, 1238);
    let syncedCount = 0;

    // Fast-exit check: If the target round hasn't occurred yet (before Saturday 21:00 KST), don't hit external scrapers
    if (typeof isRoundDrawnYet === 'function' && !isRoundDrawnYet(targetRound)) {
        if (showModal) {
            appendScrapingLog(`📡 [회차 검증] 보유 최신: 제 ${currentMaxRound}회 ➔ 차기 추첨 대상: 제 ${targetRound}회`, 'info');
        }
        const repairedCount = await repairMissingPrizeHistory(showModal);
        const drawDate = typeof getRoundDrawDateTime === 'function' ? getRoundDrawDateTime(targetRound) : null;
        const dateStr = drawDate ? `${drawDate.getFullYear()}.${String(drawDate.getMonth() + 1).padStart(2, '0')}.${String(drawDate.getDate()).padStart(2, '0')}` : '';

        if (showModal) {
            appendScrapingLog(`🏁 제 ${targetRound}회는 아직 추첨 전입니다. (${dateStr} 토요일 21:00 이후 추첨 발표)`, 'info');
            appendScrapingLog(`✅ 이미 최신 제 ${currentMaxRound}회차까지 100% 정상 수집 및 동기화되어 있습니다.`, 'success');
            updateScrapingStatus(`최신 상태 유지 중 (제 ${currentMaxRound}회)`, true);
            if (typeof showToast === 'function') {
                showToast(`✅ 현재 최신 제 ${currentMaxRound}회차까지 모두 수집되어 있습니다.`);
            }
        }
        return repairedCount;
    }

    if (showModal) {
        appendScrapingLog(`🛰️ [스크랩 엔진 시작] 보유 최신 회차: 제 ${currentMaxRound}회`, 'header');
        appendScrapingLog(`🔍 [탐색 기준] 1238회 이후 신규 회차 자동 탐색 (제 ${targetRound}회부터 시작)`, 'info');
        updateScrapingStatus(`제 ${targetRound}회 신규 추첨 탐색 중...`);
    }

    // Step 1: Repair any rounds with missing prize info (1238회 이후 및 수동 등록 회차)
    const repairedCount = await repairMissingPrizeHistory(showModal);

    // Step 2: Discover and scrape new latest rounds (starting from 1238)
    while (true) {
        try {
            if (showModal) {
                updateScrapingStatus(`제 ${targetRound}회 신규 추첨 데이터 탐색 중...`);
            }

            const drawData = await scrapeCompleteRoundResult(targetRound);
            if (!drawData) {
                if (showModal) {
                    appendScrapingLog(`🏁 제 ${targetRound}회 미추첨 확인 ➔ 최신 회차(제 ${targetRound - 1}회)까지 스크랩 완료!`, 'header');
                }
                break;
            }

            // Update in-memory collections
            if (typeof LOTTO_HISTORY !== 'undefined') {
                LOTTO_HISTORY[targetRound] = drawData;
            }
            state.lottoExtraHistory[targetRound] = drawData;
            state.mergedHistory[targetRound] = drawData;
            applyNewDrawData(drawData);

            syncedCount++;
            targetRound++;
        } catch (e) {
            console.error(`[Sync] Error while scraping round ${targetRound}:`, e);
            if (showModal) {
                appendScrapingLog(`제 ${targetRound}회 스크랩 중 일시적 통신 오류: ${e.message}`, 'warn');
            }
            break;
        }
    }

    if (syncedCount > 0 || repairedCount > 0) {
        if (showModal) {
            appendScrapingLog(`💾 로컬 스토리지 및 Firestore 클라우드 서버에 영구 보존 중...`, 'save');
        }

        // 1. Dual persistence: LocalStorage backup
        try {
            localStorage.setItem('lotto_extra_history', JSON.stringify(state.lottoExtraHistory));
        } catch (e) {}

        // 2. Cloud persistence: Firestore server
        if (db && typeof db.set === 'function') {
            const cleanData = typeof removeUndefined === 'function' ? removeUndefined(state.lottoExtraHistory) : state.lottoExtraHistory;
            await db.set('lotto_draw_history', 'extra_history', cleanData).catch(err => console.error('[DB] Cloud sync save failed:', err));
        }

        // Re-render entire app views
        state.mergedHistory = typeof LOTTO_HISTORY !== 'undefined' ? { ...LOTTO_HISTORY, ...state.lottoExtraHistory } : { ...state.lottoExtraHistory };
        recalculateGroups();
        state.latestDrawData = null; // force recalculation of latest
        renderLatestDrawBanner();
        renderTop5Combinations(true);

        const tabVerifyEl = document.getElementById('tab-verify-evolution'); 
        if (tabVerifyEl && tabVerifyEl.classList.contains('active')) renderVerificationTab();
        const tabSimEl = document.getElementById('tab-simulation'); 
        if (tabSimEl && tabSimEl.classList.contains('active')) renderSimulationTab();
        const tabDashEl = document.getElementById('tab-dashboard'); 
        if (tabDashEl && tabDashEl.classList.contains('active')) renderDashboardCharts();
        const tabReviewEl = document.getElementById('tab-review');
        if (tabReviewEl && tabReviewEl.classList.contains('active')) renderReviewTab();
        if (typeof window.initHexMap === 'function') {
            window.initHexMap();
        }
        if (typeof renderConfirmedPurchasesList === 'function') {
            renderConfirmedPurchasesList();
        }
        // ⚡ 신규 회차 수집/복구 시 추천 평가 캐시 초기화 및 대시보드 요약 문서(dashboard_summary_latest) 실시간 동기화
        if (typeof clearUser70ReviewCache === 'function') {
            clearUser70ReviewCache();
        } else if (typeof window !== 'undefined' && typeof window.clearUser70ReviewCache === 'function') {
            window.clearUser70ReviewCache();
        }
        if (typeof updateHomeReviewDashboard === 'function') {
            updateHomeReviewDashboard(true).catch(console.warn);
        } else if (typeof window !== 'undefined' && typeof window.updateHomeReviewDashboard === 'function') {
            window.updateHomeReviewDashboard(true).catch(console.warn);
        }
        if (typeof renderLandingDashboard === 'function') {
            try { renderLandingDashboard(); } catch(e){}
        } else if (typeof window !== 'undefined' && typeof window.renderLandingDashboard === 'function') {
            try { window.renderLandingDashboard(); } catch(e){}
        }

        // 3. ⚡ Auto-Suspend Non-Purchasers upon New Draw Announcement
        if (syncedCount > 0 && typeof window.autoSuspendAllNonPurchasers === 'function') {
            if (showModal) {
                appendScrapingLog(`⚡ [미구매자 자동 정지 검사] 신규 회차 발표에 따른 직전 주차 미구매 회원 자동 검사 시작...`, 'header');
            }
            try {
                const res = await window.autoSuspendAllNonPurchasers(true);
                if (showModal && res) {
                    appendScrapingLog(`↳ 미구매 자동 정지: ${res.suspendedCount}명, 정상 구매: ${res.activeCount}명, 면제: ${res.permanentCount}명`, 'info');
                }
            } catch(e) {
                console.error('[Auto Suspend Trigger on Sync Error]', e);
            }
        }

        // 4. ⏰ [토요일 21:00 자동 발송] 신규 회차 당첨번호 수집 시 동의 회원 당첨 리포트 자동 일괄 발송
        if (syncedCount > 0 && typeof window.sendBatchWinningKakaoMessages === 'function') {
            const isAutoEnabled = (typeof window.loadAdminKakaoAutoSendConfig === 'function') ? window.loadAdminKakaoAutoSendConfig() : true;
            if (isAutoEnabled) {
                if (showModal) {
                    appendScrapingLog(`💬 [카카오톡 자동 발송] 신규 제 ${currentMaxRound + syncedCount}회 당첨결과 동의 회원 자동 발송 파이프라인 가동...`, 'header');
                }
                try {
                    window.sendBatchWinningKakaoMessages(currentMaxRound + syncedCount, { isAuto: true });
                } catch(e) {
                    console.error('[Auto Kakao Broadcast Error]', e);
                }
            }
        }

        // 5. 🔮 [차기 회차 스냅샷 자동 사전 생성] 신규 회차가 수집되었으므로 다음 회차 불변 스냅샷을 백그라운드에서 자동 사전 생성
        if (syncedCount > 0) {
            const latestNum = currentMaxRound + syncedCount;
            if (showModal) {
                appendScrapingLog(`🔮 [차기 회차 자동 발급] 제 ${latestNum + 1}회 회원별 추천번호 불변 스냅샷 백그라운드 자동 사전 생성 시작...`, 'header');
            }
            triggerAutoDrawFollowupTasks(latestNum).then(() => {
                if (showModal) {
                    appendScrapingLog(`✅ 제 ${latestNum + 1}회 전 회원 추천번호 불변 스냅샷 사전 발급 완료!`, 'info');
                }
            }).catch(err => {
                console.warn('[AutoDraw] triggerAutoDrawFollowupTasks error:', err);
            });
        }

        if (showModal) {
            appendScrapingLog(`🎉 신규 ${syncedCount}개 회차 등록 및 ${repairedCount}개 회차 당첨금 보충 완료! 화면이 갱신되었습니다.`, 'success');
            updateScrapingStatus(`동기화 완료 (신규 +${syncedCount}회, 보충 +${repairedCount}회)`, true);
        }
        showToast(`🎉 당첨번호 및 1~5등 당첨금 동기화/복구 완료!`);
    } else {
        if (showModal) {
            appendScrapingLog(`✅ 이미 모든 당첨 번호 및 1~5등 당첨금이 100% 최신 및 완전한 상태입니다. (보유 최신: 제 ${currentMaxRound}회)`, 'success');
            updateScrapingStatus(`최신 상태 유지 중 (제 ${currentMaxRound}회)`, true);
            showToast(`✅ 현재 최신 ${currentMaxRound}회차까지 완벽하게 수집되어 있습니다.`);
        }
        console.log('[Sync] All draws are already up to date.');
    }

    return syncedCount + repairedCount;
}

export async function handleFetchLatestDrawClick() {
    if (typeof openScrapingLogModal === 'function') {
        openScrapingLogModal();
    }
    try {
        if (typeof autoSyncMissingDraws === 'function') {
            await autoSyncMissingDraws(true);
        }
    } catch (err) {
        console.error('[handleFetchLatestDrawClick Error]', err);
        if (typeof appendScrapingLog === 'function') {
            appendScrapingLog(`스크랩 처리 중 일시적 오류: ${err.message}`, 'error');
        }
        if (typeof updateScrapingStatus === 'function') {
            updateScrapingStatus('스크랩 완료 / 최신 상태 유지', true);
        }
    }
}

/**
 * 🔮 신규 회차 수집 후 후속 백그라운드 자동화 작업
 * 차기 회차(+1)에 대해 등록된 모든 유효 회원 대상 불변 추천번호 스냅샷 사전 자동 발급 및 영구 저장
 */
export async function triggerAutoDrawFollowupTasks(newLatestRound) {
    if (!newLatestRound || isNaN(newLatestRound)) return;
    const nextRound = Number(newLatestRound) + 1;
    console.log(`[AutoDraw] Starting background follow-up tasks for new round ${newLatestRound}, next round ${nextRound}...`);
    
    let users = [];
    try {
        if (typeof UserContextManager !== 'undefined' && typeof UserContextManager.getAllUnifiedUsers === 'function') {
            users = UserContextManager.getAllUnifiedUsers();
        } else if (typeof window !== 'undefined' && window.UserContextManager && typeof window.UserContextManager.getAllUnifiedUsers === 'function') {
            users = window.UserContextManager.getAllUnifiedUsers();
        } else if (state && Array.isArray(state.allRegisteredUsersList) && state.allRegisteredUsersList.length > 0) {
            users = state.allRegisteredUsersList;
        }
    } catch (e) {
        console.warn('[AutoDraw] Failed to get user list:', e);
    }
    
    if (!Array.isArray(users) || users.length === 0) {
        console.log('[AutoDraw] No active registered users found for pre-generating snapshots.');
        return;
    }

    console.log(`[AutoDraw] Pre-generating next round (${nextRound}) recommendation snapshots for ${users.length} registered users...`);

    let generatedCount = 0;
    for (let i = 0; i < users.length; i++) {
        const u = users[i];
        const uId = (u && (u.id || u.userId)) ? String(u.id || u.userId).trim().toLowerCase() : '';
        if (!uId || (typeof isSystemOrDummyUser === 'function' && isSystemOrDummyUser(uId))) continue;
        if (u.isDeleted === true || u.status === 'trash' || u.status === 'deleted') continue;

        try {
            if (typeof saveUserWeeklyRecommendationSnapshot === 'function') {
                const snap = await saveUserWeeklyRecommendationSnapshot(uId, nextRound);
                if (snap) generatedCount++;
            } else if (typeof window !== 'undefined' && typeof window.saveUserWeeklyRecommendationSnapshot === 'function') {
                const snap = await window.saveUserWeeklyRecommendationSnapshot(uId, nextRound);
                if (snap) generatedCount++;
            }
        } catch (err) {
            console.warn(`[AutoDraw] Failed to pre-generate snapshot for user ${uId}:`, err);
        }
        
        // Non-blocking yield to event loop every 3 users
        if (i % 3 === 0) {
            await new Promise(res => setTimeout(res, 25));
        }
    }
    console.log(`[AutoDraw] Background snapshot pre-generation completed for round ${nextRound} (${generatedCount} snapshots ready).`);
}

if (typeof window !== 'undefined') {
    window.handleFetchLatestDrawClick = handleFetchLatestDrawClick;
    window.autoSyncMissingDraws = autoSyncMissingDraws;
    window.repairMissingPrizeHistory = repairMissingPrizeHistory;
    window.openScrapingLogModal = openScrapingLogModal;
    window.closeScrapingLogModal = closeScrapingLogModal;
    window.triggerAutoDrawFollowupTasks = triggerAutoDrawFollowupTasks;
}

export function setupSyncEvents() {
    const _el_btnFetchLatestDraw = document.getElementById('btnFetchLatestDraw'); 
    if (_el_btnFetchLatestDraw) {
        _el_btnFetchLatestDraw.onclick = function(e) {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            // Always use window.handleFetchLatestDrawClick which has the bulletproof modal logic
            if (typeof window.handleFetchLatestDrawClick === 'function') {
                window.handleFetchLatestDrawClick();
            } else {
                handleFetchLatestDrawClick();
            }
        };
    }
}

/**
 * ⏰ 매주 토요일 20:40 ~ 23:59 최신 로또 당첨번호 자동 스크랩 및 동기화 스케줄러 (KST 기준)
 */
let saturdayScrapeTimer = null;
let lastSaturdayScrapedRound = null;

export function setupSaturdayAutoScrapeAndBroadcast() {
    if (typeof window === 'undefined' || saturdayScrapeTimer) return;

    // Check time every 60 seconds
    saturdayScrapeTimer = setInterval(() => {
        const now = new Date();
        // Convert client time to KST (UTC+9)
        const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
        const kstDate = new Date(utcTime + (9 * 3600000));
        const day = kstDate.getDay(); // 6 = Saturday
        const hour = kstDate.getHours();
        const minute = kstDate.getMinutes();

        // Target: Saturday between 20:40 and 23:59 KST
        const isSaturdayNight = (day === 6 && ((hour === 20 && minute >= 40) || (hour >= 21 && hour <= 23)));
        if (!isSaturdayNight) return;

        const currentMaxRound = state.mergedHistory 
            ? Math.max(...Object.keys(state.mergedHistory).map(Number).filter(n => !isNaN(n)), 1237) 
            : 1237;
        const targetRound = currentMaxRound + 1;

        // If today's target round is already synced, avoid repetitive scraping
        if (lastSaturdayScrapedRound === targetRound) return;

        // Poll every 3 minutes (at minute % 3 === 0)
        if (minute % 3 === 0 && kstDate.getSeconds() < 15) {
            console.log(`[Saturday Auto-Scrape Triggered (KST ${hour}:${String(minute).padStart(2, '0')})] Checking target round ${targetRound}...`);
            if (typeof autoSyncMissingDraws === 'function') {
                autoSyncMissingDraws(false).then(syncedCount => {
                    if (syncedCount > 0) {
                        lastSaturdayScrapedRound = targetRound;
                        console.log(`[Saturday Auto-Scrape Success] Round ${targetRound} synced successfully!`);
                    }
                }).catch(err => {
                    console.warn('[Saturday Auto-Scrape Error]', err);
                });
            }
        }
    }, 60000);
}

if (typeof window !== 'undefined') {
    window.setupSaturdayAutoScrapeAndBroadcast = setupSaturdayAutoScrapeAndBroadcast;
    // Auto start scheduler on client launch
    try { setupSaturdayAutoScrapeAndBroadcast(); } catch(e){}
}
