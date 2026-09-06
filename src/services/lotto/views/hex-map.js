import { state } from '../state.js';
import { getBallColorClass, getBallHexColor, formatDate } from '../../../shared/utils.js';

/* =====================================================
   45-Polygon Cumulative Frequency & Winning Numbers Map Engine
   Multi-Draw Overlay & Dynamic Interactive History Navigator (1 ~ Latest Draws)
   ===================================================== */

let currentSelectedRound = null;
let availableRounds = [];
let overlayRange = 'all'; // 'all', '100', '30', 'single'

export function getBallColor(n) {
    if (n <= 10) return '#eab308'; // Yellow
    if (n <= 20) return '#3b82f6'; // Blue
    if (n <= 30) return '#ef4444'; // Red
    if (n <= 40) return '#64748b'; // Gray
    return '#10b981'; // Green
}

export function getLottoDrawDate(round) {
    if (!round || isNaN(round)) return '';
    const d = new Date(2002, 11, 7 + (round - 1) * 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
}

export function getHistoryData() {
    let hist = {};
    if (typeof LOTTO_HISTORY !== 'undefined' && typeof LOTTO_HISTORY === 'object') {
        hist = { ...LOTTO_HISTORY };
    }
    if (typeof window.LOTTO_HISTORY !== 'undefined' && typeof window.LOTTO_HISTORY === 'object') {
        hist = { ...hist, ...window.LOTTO_HISTORY };
    }
    if (state && state.mergedHistory && Object.keys(state.mergedHistory).length > 0) {
        hist = { ...hist, ...state.mergedHistory };
    }
    if (state && state.lottoExtraHistory && Object.keys(state.lottoExtraHistory).length > 0) {
        hist = { ...hist, ...state.lottoExtraHistory };
    }
    if (typeof window.state !== 'undefined' && window.state.mergedHistory) {
        hist = { ...hist, ...window.state.mergedHistory };
    }
    if (typeof HISTORICAL_DATA !== 'undefined' && Array.isArray(HISTORICAL_DATA)) {
        HISTORICAL_DATA.forEach(d => {
            const r = d.round || d.drwNo;
            if (r) {
                hist[r] = {
                    numbers: d.numbers || [d.drwtNo1, d.drwtNo2, d.drwtNo3, d.drwtNo4, d.drwtNo5, d.drwtNo6],
                    bonus: d.bonus || d.bnusNo,
                    date: d.date || d.drwNoDate || getLottoDrawDate(r)
                };
            }
        });
    }

    // Ensure all entries have numbers, bonus, and accurate dates
    Object.keys(hist).forEach(r => {
        const roundNum = Number(r);
        const item = hist[r];
        if (item) {
            if (!item.numbers && item.drwtNo1) {
                item.numbers = [item.drwtNo1, item.drwtNo2, item.drwtNo3, item.drwtNo4, item.drwtNo5, item.drwtNo6];
            }
            if (!item.bonus && item.bnusNo) {
                item.bonus = item.bnusNo;
            }
            if (!item.date) {
                item.date = getLottoDrawDate(roundNum);
            }
        }
    });

    return hist;
}

export function getLatestRoundNumber() {
    const hist = getHistoryData();
    const rKeys = Object.keys(hist).map(Number).filter(n => !isNaN(n) && n > 0);
    if (rKeys.length > 0) return Math.max(...rKeys);
    if (state) {
        if (state.latestDrawData && state.latestDrawData.drwNo) return state.latestDrawData.drwNo;
        if (state.latestRoundNum) return state.latestRoundNum;
    }
    return 1237;
}

export function getFrequencyMap() {
    const freq = {};
    for (let n = 1; n <= 45; n++) freq[n] = 0;
    const hist = getHistoryData();
    Object.values(hist).forEach(d => {
        if (d && d.numbers && Array.isArray(d.numbers)) {
            d.numbers.forEach(num => {
                if (num >= 1 && num <= 45) freq[num]++;
            });
        }
    });
    return freq;
}

export function getMissingWeeksMap() {
    const overdue = {};
    for (let n = 1; n <= 45; n++) overdue[n] = 0;
    if (state && state.MISSING_WEEKS && Object.keys(state.MISSING_WEEKS).length > 0) {
        for (let n = 1; n <= 45; n++) overdue[n] = state.MISSING_WEEKS[n] || 0;
        return overdue;
    }
    return overdue;
}

// ── 45-Polygon Canvas Renderer ─────────────────────────────
export function render45PolygonMap() {
    const canvas = document.getElementById('hexFreqMap');
    if (!canvas) return;

    const hist = getHistoryData();
    availableRounds = Object.keys(hist).map(Number).filter(n => !isNaN(n) && n > 0).sort((a, b) => b - a);

    const maxRound = availableRounds.length > 0 ? availableRounds[0] : getLatestRoundNumber();

    if (availableRounds.length === 0) {
        availableRounds = [maxRound];
    }

    if (!currentSelectedRound || !hist[currentSelectedRound]) {
        currentSelectedRound = availableRounds[0];
    }

    const currentDraw = hist[currentSelectedRound] || null;
    const winNumbers = currentDraw && currentDraw.numbers ? currentDraw.numbers : [];
    const bonusNumber = currentDraw ? currentDraw.bonus : null;
    const winSet = new Set(winNumbers);

    // Update Winner Bar UI
    updateWinnerBar(currentSelectedRound, currentDraw);

    // Dynamically update Header Subtitle & Overlay Range Button Labels
    const descEl = document.querySelector('.poly-chart-card .chart-title p');
    if (descEl) {
        descEl.textContent = `1~45번 번호를 단일 45각형 꼭지점에 원형으로 배치하고, 1회부터 ${maxRound}회까지 역대 당첨번호 궤적을 겹쳐서 기하학적 네트워크를 시각화합니다.`;
    }

    const allRangeBtn = document.querySelector('.btn-poly-overlay[data-range="all"]');
    if (allRangeBtn) {
        allRangeBtn.textContent = `전체 ${maxRound}회`;
    }

    // Sync dropdown options & value
    const roundSelect = document.getElementById('polygonRoundSelect');
    if (roundSelect) {
        if (roundSelect.dataset.maxRound !== String(maxRound) || roundSelect.children.length !== availableRounds.length) {
            roundSelect.dataset.maxRound = String(maxRound);
            roundSelect.innerHTML = availableRounds.map(r => `
                <option value="${r}" ${r === currentSelectedRound ? 'selected' : ''}>제 ${r}회차</option>
            `).join('');
        } else if (roundSelect.value !== currentSelectedRound.toString()) {
            roundSelect.value = currentSelectedRound;
        }
    }

    // Frequency Data
    const freq = getFrequencyMap();
    const overdue = getMissingWeeksMap();
    const freqValues = Object.values(freq);
    const minFreq = Math.min(...freqValues);
    const maxFreq = Math.max(...freqValues);

    // Canvas sizing with Retina display support & Ultra-Mobile Adaptability
    const container = canvas.parentElement;
    const screenWidth = window.innerWidth || document.documentElement.clientWidth || 400;
    const maxAvail = Math.min(container && container.offsetWidth > 0 ? container.offsetWidth : screenWidth, screenWidth - 24);
    const displaySize = Math.min(Math.max(maxAvail - 8, 280), 860);
    const dpr = window.devicePixelRatio || 1;

    canvas.width = displaySize * dpr;
    canvas.height = displaySize * dpr;
    canvas.style.width = displaySize + 'px';
    canvas.style.height = displaySize + 'px';
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displaySize, displaySize);

    const cx = displaySize / 2;
    const cy = displaySize / 2;
    const N = 45;

    // Radius metrics
    const R_ball = displaySize * 0.42;      // Radius for 45 lotto ball vertices
    const R_radar_max = displaySize * 0.355; // Max radius for frequency radar polygon
    const R_radar_min = displaySize * 0.13;  // Min radius for frequency radar polygon
    const R_grid_step = (R_radar_max - R_radar_min) / 4;

    // Helper: angle for number n (1..45) in radians (1 at 12 o'clock, clockwise)
    function getAngle(n) {
        return -Math.PI / 2 + (2 * Math.PI * (n - 1)) / N;
    }

    // Helper: vertex coordinate for number n at given radius r
    function getVertexCoord(n, r) {
        const angle = getAngle(n);
        return {
            x: cx + r * Math.cos(angle),
            y: cy + r * Math.sin(angle),
            angle
        };
    }

    // 1. Background dark space
    const bgGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, displaySize * 0.48);
    bgGrad.addColorStop(0, '#111827');
    bgGrad.addColorStop(0.7, '#0b0f19');
    bgGrad.addColorStop(1, '#050811');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, displaySize * 0.49, 0, Math.PI * 2);
    ctx.fill();

    // 2. Concentric 45-gon Guide Grids (25%, 50%, 75%, 100%)
    ctx.lineWidth = 1;
    for (let step = 1; step <= 4; step++) {
        const rGrid = R_radar_min + R_grid_step * step;
        ctx.beginPath();
        for (let n = 1; n <= N; n++) {
            const pt = getVertexCoord(n, rGrid);
            if (n === 1) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.strokeStyle = step === 4 ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)';
        ctx.stroke();

        // Grid level label
        const labelVal = Math.round(minFreq + (maxFreq - minFreq) * (step / 4));
        ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${labelVal}회`, cx, cy - rGrid + 10);
    }

    // 3. Radial Axes from Center to 45 Vertices
    ctx.beginPath();
    for (let n = 1; n <= N; n++) {
        const pt1 = getVertexCoord(n, R_radar_min * 0.85);
        const pt2 = getVertexCoord(n, R_ball - 16);
        ctx.moveTo(pt1.x, pt1.y);
        ctx.lineTo(pt2.x, pt2.y);
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.stroke();

    // 4. Cumulative Frequency 45-gon Radar Area
    const freqPolygonPoints = [];
    for (let n = 1; n <= N; n++) {
        const ratio = maxFreq > minFreq ? (freq[n] - minFreq) / (maxFreq - minFreq) : 0.5;
        const rFreq = R_radar_min + (R_radar_max - R_radar_min) * ratio;
        freqPolygonPoints.push(getVertexCoord(n, rFreq));
    }

    ctx.beginPath();
    freqPolygonPoints.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();

    const radarGrad = ctx.createRadialGradient(cx, cy, R_radar_min * 0.5, cx, cy, R_radar_max);
    radarGrad.addColorStop(0, 'rgba(99, 102, 241, 0.40)');
    radarGrad.addColorStop(0.5, 'rgba(59, 130, 246, 0.20)');
    radarGrad.addColorStop(1, 'rgba(16, 185, 129, 0.10)');
    ctx.fillStyle = radarGrad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(129, 140, 248, 0.75)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // 5. 🌟 Multi-Draw Overlaid Trajectory Layer (1 ~ maxRound회 누적 겹침 궤적)
    if (overlayRange !== 'single') {
        let roundsToOverlay = [];

        if (overlayRange === 'all') {
            roundsToOverlay = availableRounds;
        } else if (overlayRange === '100') {
            roundsToOverlay = availableRounds.slice(0, 100);
        } else if (overlayRange === '30') {
            roundsToOverlay = availableRounds.slice(0, 30);
        }

        // Alpha level based on number of rounds
        const strokeAlpha = overlayRange === 'all' ? 0.035 : (overlayRange === '100' ? 0.08 : 0.18);
        ctx.strokeStyle = `rgba(99, 102, 241, ${strokeAlpha})`;
        ctx.lineWidth = overlayRange === 'all' ? 0.85 : 1.2;

        ctx.beginPath();
        roundsToOverlay.forEach(r => {
            const draw = hist[r];
            if (draw && draw.numbers && draw.numbers.length >= 6) {
                const sorted = [...draw.numbers].sort((a, b) => a - b);
                for (let i = 0; i < sorted.length; i++) {
                    const pt1 = getVertexCoord(sorted[i], R_ball);
                    const nextIdx = (i + 1) % sorted.length;
                    const pt2 = getVertexCoord(sorted[nextIdx], R_ball);
                    ctx.moveTo(pt1.x, pt1.y);
                    ctx.lineTo(pt2.x, pt2.y);
                }
            }
        });
        ctx.stroke();
    }

    // 5.5. 🔷 Previous Round Winning Trajectory (직전 회차 궤적 - 시안/하늘색 대비 표시)
    const prevRound = currentSelectedRound ? currentSelectedRound - 1 : null;
    const prevDraw = (prevRound && hist[prevRound]) ? hist[prevRound] : null;
    const prevWinNumbers = (prevDraw && prevDraw.numbers && prevDraw.numbers.length >= 6) ? prevDraw.numbers : [];
    const prevWinSet = new Set(prevWinNumbers);

    if (prevWinNumbers.length >= 6) {
        const sortedPrevWin = [...prevWinNumbers].sort((a, b) => a - b);
        const prevWinCoords = sortedPrevWin.map(n => getVertexCoord(n, R_ball));

        // Previous round polygon fill (soft cyan tint)
        ctx.beginPath();
        prevWinCoords.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(6, 182, 212, 0.12)';
        ctx.fill();

        // Previous round stroke (cyan dashed glowing stroke)
        ctx.save();
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = '#06b6d4';
        ctx.shadowColor = '#06b6d4';
        ctx.shadowBlur = 10;
        ctx.setLineDash([6, 3]);
        ctx.stroke();
        ctx.restore();

        // Auxiliary dashed lines connecting previous winning vertices to center
        prevWinCoords.forEach(pt => {
            ctx.beginPath();
            ctx.setLineDash([3, 4]);
            ctx.moveTo(cx, cy);
            ctx.lineTo(pt.x, pt.y);
            ctx.strokeStyle = 'rgba(6, 182, 212, 0.28)';
            ctx.lineWidth = 1.1;
            ctx.stroke();
            ctx.setLineDash([]);
        });
    }

    // 6. 🏆 Current Selected Round Winning Trajectory (선택 회차 황금빛 단일 궤적 강조)
    if (winNumbers.length >= 6) {
        const sortedWin = [...winNumbers].sort((a, b) => a - b);
        const winCoords = sortedWin.map(n => getVertexCoord(n, R_ball));

        // Winning polygon fill
        ctx.beginPath();
        winCoords.forEach((pt, i) => {
            if (i === 0) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
        ctx.fill();

        // Winning trajectory glowing gold stroke
        ctx.lineWidth = 3.2;
        ctx.strokeStyle = '#f59e0b';
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Auxiliary lines connecting winning vertices to center
        winCoords.forEach(pt => {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(pt.x, pt.y);
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
            ctx.lineWidth = 1.4;
            ctx.stroke();
        });
    }

    // 7. Bonus Number Line to Center
    if (bonusNumber) {
        const bonusCoord = getVertexCoord(bonusNumber, R_ball);
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(cx, cy);
        ctx.lineTo(bonusCoord.x, bonusCoord.y);
        ctx.strokeStyle = 'rgba(236, 72, 153, 0.6)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // 8. Center Hub Info
    ctx.beginPath();
    ctx.arc(cx, cy, R_radar_min * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.fillText('45각형 분석맵', cx, cy - 15);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(`${currentSelectedRound}회차`, cx, cy + 1);

    if (prevRound && prevDraw) {
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 8.5px sans-serif';
        ctx.fillText(`(직전 ${prevRound}회 대비)`, cx, cy + 16);
    } else {
        ctx.fillStyle = '#64748b';
        ctx.font = '9px sans-serif';
        ctx.fillText(`누적 1~${maxRound}회`, cx, cy + 16);
    }

    // 9. All 45 Vertex Lotto Balls and Labels
    const ballRadius = Math.max(10, displaySize * 0.016);

    for (let n = 1; n <= N; n++) {
        const pt = getVertexCoord(n, R_ball);
        const isWinner = winSet.has(n);
        const isPrevWinner = prevWinSet.has(n);
        const isBonus = bonusNumber === n;
        const ballBg = getBallColor(n);

        if (isWinner && isPrevWinner) {
            // Consecutive / Repeated Winner (이월 당첨 번호 - Cyan Outer + Gold Glow)
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, ballRadius + 6.5, 0, Math.PI * 2);
            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 2.2;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(pt.x, pt.y, ballRadius + 3.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(245, 158, 11, 0.4)';
            ctx.fill();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2.4;
            ctx.shadowColor = '#f59e0b';
            ctx.shadowBlur = 12;
            ctx.stroke();
            ctx.shadowBlur = 0;
        } else if (isWinner) {
            // Winning Ball Glow & Gold Ring
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, ballRadius + 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(245, 158, 11, 0.35)';
            ctx.fill();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2.4;
            ctx.shadowColor = '#f59e0b';
            ctx.shadowBlur = 12;
            ctx.stroke();
            ctx.shadowBlur = 0;
        } else if (isPrevWinner) {
            // Previous Round Winning Ball Glow & Cyan Ring
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, ballRadius + 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(6, 182, 212, 0.22)';
            ctx.fill();
            ctx.strokeStyle = '#06b6d4';
            ctx.lineWidth = 2.0;
            ctx.shadowColor = '#06b6d4';
            ctx.shadowBlur = 8;
            ctx.stroke();
            ctx.shadowBlur = 0;
        } else if (isBonus) {
            // Bonus Ball Glow & Ring
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, ballRadius + 5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(236, 72, 153, 0.3)';
            ctx.fill();
            ctx.strokeStyle = '#ec4899';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Ball Circle
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, ballRadius, 0, Math.PI * 2);
        ctx.fillStyle = ballBg;
        ctx.fill();
        ctx.strokeStyle = isWinner ? '#ffffff' : (isPrevWinner ? '#67e8f9' : 'rgba(255, 255, 255, 0.3)');
        ctx.lineWidth = isWinner ? 1.6 : (isPrevWinner ? 1.2 : 0.8);
        ctx.stroke();

        // Ball Number
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(9, Math.round(ballRadius * 0.95))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.toString(), pt.x, pt.y);

        // Frequency text outside the ball
        const rFreqText = R_ball + ballRadius + 11;
        const textPt = getVertexCoord(n, rFreqText);
        ctx.fillStyle = isWinner ? '#fbbf24' : (isPrevWinner ? '#38bdf8' : (isBonus ? '#f472b6' : '#94a3b8'));
        ctx.font = isWinner ? 'bold 8.5px sans-serif' : (isPrevWinner ? 'bold 8px sans-serif' : '8px sans-serif');
        ctx.fillText(`${freq[n]}`, textPt.x, textPt.y);

        // Overdue Badge
        if (overdue[n] >= 10 && !isWinner && !isPrevWinner) {
            const rBadge = R_ball - ballRadius - 4;
            const badgePt = getVertexCoord(n, rBadge);
            ctx.beginPath();
            ctx.arc(badgePt.x, badgePt.y, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = '#f59e0b';
            ctx.fill();
        }
    }
}

// ── Update Winner Summary Bar UI ─────────────────────────────
export function updateWinnerBar(round, drawData) {
    const titleEl = document.getElementById('polygonRoundTitle');
    const dateEl = document.getElementById('polygonRoundDate');
    const ballsContainer = document.getElementById('polygonWinnerBalls');

    const formattedDate = drawData && drawData.date ? drawData.date : getLottoDrawDate(round);

    if (titleEl) {
        titleEl.innerHTML = `<i class="fa-solid fa-trophy" style="color:#fbbf24;"></i> 제 ${round}회 당첨번호`;
    }
    if (dateEl) {
        dateEl.textContent = formattedDate ? `추첨일: ${formattedDate}` : '';
    }

    if (ballsContainer && drawData && drawData.numbers && drawData.numbers.length >= 6) {
        let ballsHtml = '';
        const sortedNumbers = [...drawData.numbers].sort((a, b) => a - b);
        sortedNumbers.forEach(n => {
            const bg = getBallColor(n);
            ballsHtml += `
                <div style="width:34px; height:34px; border-radius:50%; background:${bg}; color:#fff; font-weight:800; font-size:0.95rem; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 6px rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.4);">
                    ${n}
                </div>
            `;
        });

        if (drawData.bonus) {
            const bonusBg = getBallColor(drawData.bonus);
            ballsHtml += `
                <span style="color:#94a3b8; font-weight:bold; font-size:1.1rem; margin:0 4px;">+</span>
                <div style="position:relative; display:inline-block;">
                    <div style="width:34px; height:34px; border-radius:50%; background:${bonusBg}; color:#fff; font-weight:800; font-size:0.95rem; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px rgba(236,72,153,0.6); border:2px solid #ec4899;">
                        ${drawData.bonus}
                    </div>
                    <span style="position:absolute; bottom:-14px; left:50%; transform:translateX(-50%); font-size:0.65rem; color:#f472b6; font-weight:bold; white-space:nowrap;">보너스</span>
                </div>
            `;
        }

        ballsContainer.innerHTML = ballsHtml;
    } else if (ballsContainer) {
        ballsContainer.innerHTML = `<span style="color:#64748b; font-size:0.85rem;">해당 회차 데이터가 없습니다.</span>`;
    }
}

// ── AI 6개 번호 추론 (45각형 기하학 + 빈도) ───────────────────
export function pickHexMapNumbers() {
    const freq = getFrequencyMap();
    const overdue = getMissingWeeksMap();

    const freqValues = Object.values(freq);
    const minFreq = Math.min(...freqValues);
    const maxFreq = Math.max(...freqValues);

    // 45각형 공간 5개 구역 (각 9개 번호: 1~9, 10~18, 19~27, 28~36, 37~45)
    const zones = [[], [], [], [], []];
    for (let n = 1; n <= 45; n++) {
        const zIdx = Math.min(Math.floor((n - 1) / 9), 4);
        const freqRatio = maxFreq > minFreq ? (freq[n] - minFreq) / (maxFreq - minFreq) : 0.5;
        const overdueBonus = Math.min(overdue[n] / 15, 1.0);
        const score = freqRatio * 0.65 + overdueBonus * 0.35 + Math.random() * 0.1;
        zones[zIdx].push({ num: n, score });
    }

    zones.forEach(z => z.sort((a, b) => b.score - a.score));
    const picked = zones.map(z => z[0].num);

    const remaining = [];
    zones.forEach(z => {
        for (let i = 1; i < z.length; i++) remaining.push(z[i]);
    });
    remaining.sort((a, b) => b.score - a.score);
    if (remaining.length > 0) picked.push(remaining[0].num);

    picked.sort((a, b) => a - b);

    const sum = picked.reduce((a, b) => a + b, 0);
    const odds = picked.filter(n => n % 2 !== 0).length;
    const maxRound = availableRounds[0] || 1237;

    const reasons = [
        `📐 45각형 5개 공간 구역 균등 분할 기하학적 대칭 배치`,
        `📊 역대 1~${maxRound}회 누적 빈도(65%) + 미출현 반등 모멘텀(35%) 최적 스코어링`,
        `🔢 선택 조합: [ ${picked.join(', ')} ]`,
        `⚖️ 총합: ${sum} (권장 최적 100~170 구간), 홀짝 비율: ${odds}:${6 - odds}`
    ];

    return { picked, reasons };
}

// ── 초기화 및 이벤트 리스너 ───────────────────────────────────
export function initPolygonMap() {
    const canvas = document.getElementById('hexFreqMap');
    const roundSelect = document.getElementById('polygonRoundSelect');
    const btnPrev = document.getElementById('btnPolygonPrevRound');
    const btnNext = document.getElementById('btnPolygonNextRound');
    const btnLatest = document.getElementById('btnPolygonLatestRound');
    const btnPick = document.getElementById('btnPickFromHexMap');

    if (!canvas) return;

    const hist = getHistoryData();
    availableRounds = Object.keys(hist).map(Number).filter(n => !isNaN(n) && n > 0).sort((a, b) => b - a);

    const maxRound = availableRounds.length > 0 ? availableRounds[0] : getLatestRoundNumber();

    if (availableRounds.length === 0) {
        availableRounds = [maxRound];
    }

    if (!currentSelectedRound || !hist[currentSelectedRound]) {
        currentSelectedRound = availableRounds[0];
    }

    // Populate Round Select Dropdown
    if (roundSelect) {
        roundSelect.dataset.maxRound = String(maxRound);
        roundSelect.innerHTML = availableRounds.map(r => `
            <option value="${r}" ${r === currentSelectedRound ? 'selected' : ''}>제 ${r}회차</option>
        `).join('');

        roundSelect.onchange = () => {
            const val = parseInt(roundSelect.value);
            if (!isNaN(val) && hist[val]) {
                currentSelectedRound = val;
                render45PolygonMap();
            }
        };
    }

    // Previous Round (번호 감소: e.g. 1237 -> 1236)
    if (btnPrev) {
        btnPrev.onclick = () => {
            const curIdx = availableRounds.indexOf(currentSelectedRound);
            if (curIdx < availableRounds.length - 1) {
                currentSelectedRound = availableRounds[curIdx + 1];
                if (roundSelect) roundSelect.value = currentSelectedRound;
                render45PolygonMap();
            }
        };
    }

    // Next Round (번호 증가: e.g. 1236 -> 1237)
    if (btnNext) {
        btnNext.onclick = () => {
            const curIdx = availableRounds.indexOf(currentSelectedRound);
            if (curIdx > 0) {
                currentSelectedRound = availableRounds[curIdx - 1];
                if (roundSelect) roundSelect.value = currentSelectedRound;
                render45PolygonMap();
            }
        };
    }

    // Latest Round Jump
    if (btnLatest) {
        btnLatest.onclick = () => {
            currentSelectedRound = availableRounds[0];
            if (roundSelect) roundSelect.value = currentSelectedRound;
            render45PolygonMap();
        };
    }

    // Overlay Range Buttons (all / 100 / 30 / single)
    document.querySelectorAll('.btn-poly-overlay').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.btn-poly-overlay').forEach(b => {
                b.classList.remove('active');
                b.style.background = 'transparent';
                b.style.color = '#94a3b8';
                b.style.fontWeight = '600';
            });
            btn.classList.add('active');
            btn.style.background = '#f59e0b';
            btn.style.color = '#000';
            btn.style.fontWeight = '700';

            overlayRange = btn.dataset.range || 'all';
            render45PolygonMap();
        };
    });

    if (btnPick) {
        btnPick.onclick = () => {
            const { picked, reasons } = pickHexMapNumbers();
            const resultEl = document.getElementById('hexMapPickResult');
            const numbersEl = document.getElementById('hexMapPickNumbers');
            const reasonEl = document.getElementById('hexMapPickReason');

            if (numbersEl) {
                numbersEl.innerHTML = picked.map(n => {
                    const ballColor = getBallColor(n);
                    return `<div style="width:44px; height:44px; border-radius:50%; background:${ballColor}; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:1.05rem; color:#fff; box-shadow:0 4px 10px rgba(0,0,0,0.35); border:1.5px solid rgba(255,255,255,0.4);">${n}</div>`;
                }).join('');
            }

            if (reasonEl) {
                reasonEl.innerHTML = reasons.join('<br>');
            }

            if (resultEl) resultEl.style.display = 'block';
        };
    }

    render45PolygonMap();

    // Responsive resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(render45PolygonMap, 150);
    });
}

// Tab switch listener
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const tabBtns = document.querySelectorAll('.tab-btn[data-tab="tab-dashboard"], .nav-btn[data-tab="tab-dashboard"], button[data-tab="tab-dashboard"]');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                setTimeout(initPolygonMap, 80);
            });
        });

        setTimeout(() => {
            const dashTab = document.getElementById('tab-dashboard');
            if (dashTab && (dashTab.classList.contains('active') || dashTab.style.display !== 'none')) {
                initPolygonMap();
            }
        }, 300);
    });
}

// Expose globally
if (typeof window !== 'undefined') {
    window.renderHexFreqMap = render45PolygonMap;
    window.initHexMap = initPolygonMap;
    window.pickHexMapNumbers = pickHexMapNumbers;
}
