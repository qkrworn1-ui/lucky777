import { getBallColorClass, getBallHexColor } from '../../../shared/utils.js';

/**
 * Fireworks & Confetti Particle System
 */
class CelebrationCanvas {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.fireworks = [];
        this.confettis = [];
        this.isRunning = false;
        this.animationFrameId = null;

        this.resize = this.resize.bind(this);
        this.loop = this.loop.bind(this);

        this.resize();
        window.addEventListener('resize', this.resize);
    }

    resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    start() {
        this.isRunning = true;
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                if (this.isRunning) this.launchFirework();
            }, i * 300);
        }
        this.initConfetti();
        this.loop();
    }

    stop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        window.removeEventListener('resize', this.resize);
        this.particles = [];
        this.fireworks = [];
        this.confettis = [];
    }

    initConfetti() {
        const colors = ['#f59e0b', '#fbbf24', '#ef4444', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#ffffff'];
        for (let i = 0; i < 70; i++) {
            this.confettis.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * -this.canvas.height,
                size: Math.random() * 8 + 6,
                color: colors[Math.floor(Math.random() * colors.length)],
                speedY: Math.random() * 2 + 1.5,
                speedX: (Math.random() - 0.5) * 2,
                rotation: Math.random() * 360,
                rotationSpeed: (Math.random() - 0.5) * 8,
                oscillation: Math.random() * 2,
                oscillationSpeed: Math.random() * 0.05 + 0.02
            });
        }
    }

    launchFirework() {
        const startX = Math.random() * (this.canvas.width * 0.8) + (this.canvas.width * 0.1);
        const targetY = Math.random() * (this.canvas.height * 0.45) + (this.canvas.height * 0.1);
        const colors = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#ec4899', '#a855f7', '#fbbf24', '#38bdf8'];
        const color = colors[Math.floor(Math.random() * colors.length)];

        this.fireworks.push({
            x: startX,
            y: this.canvas.height,
            targetY: targetY,
            speedY: -(Math.random() * 4 + 11),
            color: color,
            trail: []
        });
    }

    explode(x, y, baseColor) {
        const count = 65;
        const colors = [baseColor, '#ffffff', '#fbbf24', '#fef08a'];
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i + (Math.random() * 0.2);
            const speed = Math.random() * 6 + 2;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: colors[Math.floor(Math.random() * colors.length)],
                alpha: 1,
                decay: Math.random() * 0.015 + 0.01,
                size: Math.random() * 3 + 2,
                gravity: 0.12,
                sparkle: Math.random() > 0.5
            });
        }
    }

    loop() {
        if (!this.isRunning) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (Math.random() < 0.05 && this.fireworks.length < 5) {
            this.launchFirework();
        }

        for (let i = this.fireworks.length - 1; i >= 0; i--) {
            const fw = this.fireworks[i];
            fw.y += fw.speedY;
            fw.speedY += 0.08;

            this.ctx.save();
            this.ctx.beginPath();
            this.ctx.arc(fw.x, fw.y, 3, 0, Math.PI * 2);
            this.ctx.fillStyle = fw.color;
            this.ctx.shadowColor = fw.color;
            this.ctx.shadowBlur = 10;
            this.ctx.fill();
            this.ctx.restore();

            if (fw.y <= fw.targetY || fw.speedY >= 0) {
                this.explode(fw.x, fw.y, fw.color);
                this.fireworks.splice(i, 1);
            }
        }

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.vx *= 0.98;
            p.vy *= 0.98;
            p.alpha -= p.decay;

            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, p.alpha);
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.sparkle && Math.random() > 0.5 ? p.size * 1.4 : p.size, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.shadowColor = p.color;
            this.ctx.shadowBlur = 6;
            this.ctx.fill();
            this.ctx.restore();
        }

        for (let i = 0; i < this.confettis.length; i++) {
            const c = this.confettis[i];
            c.y += c.speedY;
            c.x += Math.sin(c.y * c.oscillationSpeed) * c.oscillation + c.speedX;
            c.rotation += c.rotationSpeed;

            if (c.y > this.canvas.height + 20) {
                c.y = -20;
                c.x = Math.random() * this.canvas.width;
            }

            this.ctx.save();
            this.ctx.translate(c.x, c.y);
            this.ctx.rotate(c.rotation * Math.PI / 180);
            this.ctx.fillStyle = c.color;
            this.ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.6);
            this.ctx.restore();
        }

        this.animationFrameId = requestAnimationFrame(this.loop);
    }
}

export function checkRoundWinningPurchases(round, winningNums, bonusNum, purchases) {
    if (!purchases || purchases.length === 0) return null;

    const winningSet = new Set(winningNums);
    const winningGames = [];
    const rankCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalEstimatedPrize = 0;

    purchases.forEach((pGroup, groupIdx) => {
        const combos = pGroup.combos || [];
        const versionTitle = pGroup.version || `조합 그룹 #${groupIdx + 1}`;

        combos.forEach((combo, comboIdx) => {
            const nums = Array.isArray(combo) ? combo : (combo.numbers || []);
            if (nums.length !== 6) return;

            const matches = nums.filter(n => winningSet.has(n));
            const matchCount = matches.length;
            const hasBonus = nums.includes(bonusNum);

            let rank = 0;
            let prize = 0;
            let rankLabel = '';

            if (matchCount === 6) {
                rank = 1;
                prize = 2000000000;
                rankLabel = '🥇 1등';
            } else if (matchCount === 5 && hasBonus) {
                rank = 2;
                prize = 50000000;
                rankLabel = '🥈 2등';
            } else if (matchCount === 5) {
                rank = 3;
                prize = 1500000;
                rankLabel = '🥉 3등';
            } else if (matchCount === 4) {
                rank = 4;
                prize = 50000;
                rankLabel = '⭐ 4등';
            } else if (matchCount === 3) {
                rank = 5;
                prize = 5000;
                rankLabel = '✨ 5등';
            }

            if (rank >= 1 && rank <= 5) {
                rankCounts[rank]++;
                totalEstimatedPrize += prize;
                winningGames.push({
                    versionTitle,
                    comboIndex: comboIdx + 1,
                    numbers: nums,
                    matches,
                    matchCount,
                    hasBonus,
                    rank,
                    rankLabel,
                    prize
                });
            }
        });
    });

    if (winningGames.length === 0) return null;

    const topRank = Math.min(...winningGames.map(g => g.rank));
    winningGames.sort((a, b) => a.rank - b.rank);

    return {
        round,
        winningNums,
        bonusNum,
        winningGames,
        summary: {
            rankCounts,
            totalEstimatedPrize,
            topRank,
            totalWinCount: winningGames.length
        }
    };
}

export function showCelebrationOverlay(celebrationData) {
    if (!celebrationData || !celebrationData.winningGames || celebrationData.winningGames.length === 0) return;

    const existing = document.getElementById('celebrationOverlay');
    if (existing) existing.remove();

    const { round, winningNums, bonusNum, winningGames, summary } = celebrationData;

    const rankTitles = {
        1: { title: '🏆 역대급 1등 대박 당첨!! 🏆', sub: '로또 역사의 주인공이 되셨습니다!', color: '#fbbf24', badge: '1등 대박' },
        2: { title: '🥈 기적의 2등 당첨!! 🥈', sub: '5개 번호와 보너스 번호까지 완벽 적중!', color: '#93c5fd', badge: '2등 당첨' },
        3: { title: '🥉 영광의 3등 당첨!! 🥉', sub: '5개 번호 완벽 적중! 멋진 행운입니다!', color: '#fdba74', badge: '3등 당첨' },
        4: { title: '⭐ 축하합니다! 4등 당첨! ⭐', sub: '4개 번호 적중! 행운이 가득합니다!', color: '#86efac', badge: '4등 당첨' },
        5: { title: '✨ 축하합니다! 5등 당첨! ✨', sub: '3개 번호 적중! 다음 회차도 기대하세요!', color: '#cbd5e1', badge: '5등 당첨' }
    };

    const topRankInfo = rankTitles[summary.topRank] || rankTitles[5];

    const rankBadgesHtml = Object.entries(summary.rankCounts)
        .filter(([_, count]) => count > 0)
        .map(([r, count]) => {
            const rNum = parseInt(r);
            const badgeColor = rNum === 1 ? '#fbbf24' : rNum === 2 ? '#60a5fa' : rNum === 3 ? '#fb923c' : rNum === 4 ? '#4ade80' : '#94a3b8';
            return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;background:rgba(255,255,255,0.08);border:1px solid ${badgeColor};color:${badgeColor};font-weight:700;font-size:0.85rem;">` +
                `${r}등: <strong style="font-size:1rem;color:#fff;">${count}건</strong>` +
            `</span>`;
        }).join('');

    const gamesHtml = winningGames.map((game) => {
        const ballsHtml = game.numbers.map(num => {
            const isMatch = winningNums.includes(num);
            const isBonus = num === bonusNum;
            const bg = getBallHexColor(num);
            
            let extraStyle = '';
            let label = '';
            if (isMatch) {
                extraStyle = 'box-shadow: 0 0 10px #fbbf24, 0 0 18px rgba(251,191,36,0.6); border: 2px solid #fff; transform: scale(1.08);';
            } else if (isBonus) {
                extraStyle = 'box-shadow: 0 0 10px #60a5fa; border: 2px dashed #93c5fd;';
                label = '<span style="position:absolute;bottom:-12px;font-size:9px;color:#93c5fd;font-weight:700;">보너스</span>';
            } else {
                extraStyle = 'opacity: 0.45; filter: grayscale(40%);';
            }

            return `<div style="position:relative;display:flex;flex-direction:column;align-items:center;">` +
                `<div style="width:34px;height:34px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.95rem;color:#fff;${extraStyle}">` +
                    `${num}` +
                `</div>` +
                `${label}` +
            `</div>`;
        }).join('');

        const rankBadgeColor = game.rank === 1 ? '#fbbf24' : game.rank === 2 ? '#60a5fa' : game.rank === 3 ? '#fb923c' : game.rank === 4 ? '#4ade80' : '#94a3b8';

        return `<div style="display:flex;flex-direction:column;gap:8px;padding:10px 14px;background:rgba(255,255,255,0.04);border-radius:12px;border:1px solid rgba(255,255,255,0.08);">` +
            `<div style="display:flex;justify-content:space-between;align-items:center;font-size:0.85rem;">` +
                `<div style="display:flex;align-items:center;gap:6px;">` +
                    `<span style="background:${rankBadgeColor};color:#000;font-weight:900;padding:2px 8px;border-radius:12px;font-size:0.8rem;">${game.rankLabel}</span>` +
                    `<span style="color:#94a3b8;font-size:0.8rem;">${game.versionTitle} #${game.comboIndex}</span>` +
                `</div>` +
                `<span style="color:#fbbf24;font-weight:700;font-size:0.9rem;">${game.prize > 0 ? game.prize.toLocaleString() + '원' : '당첨'}</span>` +
            `</div>` +
            `<div style="display:flex;justify-content:center;gap:8px;padding:4px 0 8px 0;">` +
                `${ballsHtml}` +
            `</div>` +
        `</div>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'celebrationOverlay';
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        z-index: 999999;
        background: radial-gradient(circle at center, rgba(15, 23, 42, 0.97) 0%, rgba(2, 6, 23, 0.99) 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
        overflow: hidden;
        user-select: none;
        animation: celebFadeIn 0.4s ease-out forwards;
    `;

    overlay.innerHTML = `
        <style>
            @keyframes celebFadeIn {
                from { opacity: 0; transform: scale(0.96); }
                to { opacity: 1; transform: scale(1); }
            }
            @keyframes celebFadeOut {
                from { opacity: 1; transform: scale(1); }
                to { opacity: 0; transform: scale(0.96); }
            }
            @keyframes trophyGlow {
                0%, 100% { transform: scale(1); filter: drop-shadow(0 0 20px rgba(251,191,36,0.6)); }
                50% { transform: scale(1.1); filter: drop-shadow(0 0 35px rgba(251,191,36,0.9)); }
            }
            @keyframes pulseText {
                0%, 100% { opacity: 0.6; }
                50% { opacity: 1; }
            }
        </style>
        <canvas id="celebrationCanvas" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;"></canvas>
        
        <div id="celebrationCard" style="
            position: relative;
            z-index: 2;
            width: 100%;
            max-width: 520px;
            max-height: 90vh;
            background: rgba(15, 23, 42, 0.85);
            backdrop-filter: blur(16px);
            border: 2px solid rgba(251, 191, 36, 0.5);
            box-shadow: 0 0 50px rgba(251, 191, 36, 0.3), inset 0 0 20px rgba(251, 191, 36, 0.08);
            border-radius: 24px;
            padding: 24px 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            box-sizing: border-box;
            overflow: hidden;
        ">
            <div style="font-size: 3.5rem; line-height: 1; animation: trophyGlow 2.5s infinite ease-in-out; margin-bottom: 6px;">
                🏆
            </div>
            
            <div style="font-size: 0.85rem; color: #94a3b8; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px;">
                제 ${round}회 구매확정 당첨 결과
            </div>

            <h2 style="margin: 0 0 4px 0; font-size: 1.5rem; font-weight: 900; color: #fbbf24; text-align: center; text-shadow: 0 0 15px rgba(251,191,36,0.5);">
                ${topRankInfo.title}
            </h2>

            <p style="margin: 0 0 14px 0; font-size: 0.9rem; color: #cbd5e1; text-align: center;">
                ${topRankInfo.sub}
            </p>

            <div style="width: 100%; background: rgba(0, 0, 0, 0.4); border-radius: 14px; padding: 12px 14px; margin-bottom: 14px; border: 1px solid rgba(255, 255, 255, 0.08); display: flex; flex-direction: column; gap: 8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-size:0.85rem;color:#94a3b8;">당첨 내역</span>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
                        ${rankBadgesHtml}
                    </div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px dashed rgba(255,255,255,0.1);padding-top:6px;">
                    <span style="font-size:0.85rem;color:#94a3b8;">총 예상 당첨금</span>
                    <span style="font-size:1.15rem;font-weight:900;color:#34d399;text-shadow:0 0 10px rgba(52,211,153,0.4);">
                        ${summary.totalEstimatedPrize > 0 ? summary.totalEstimatedPrize.toLocaleString() + ' 원' : '당첨 확인'}
                    </span>
                </div>
            </div>

            <div style="width: 100%; max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; margin-bottom: 16px;">
                ${gamesHtml}
            </div>

            <div style="color: #94a3b8; font-size: 0.82rem; text-align: center; animation: pulseText 2s infinite ease-in-out; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 12px; width: 100%;">
                ✨ <strong>아무 키(Key)</strong>를 누르거나 <strong>화면을 터치/클릭</strong>하면 닫힙니다 ✨
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const canvas = document.getElementById('celebrationCanvas');
    const celebCanvas = new CelebrationCanvas(canvas);
    celebCanvas.start();

    let isDismissed = false;
    function dismiss() {
        if (isDismissed) return;
        isDismissed = true;

        overlay.style.animation = 'celebFadeOut 0.3s ease-in forwards';
        setTimeout(() => {
            celebCanvas.stop();
            overlay.remove();
            window.removeEventListener('keydown', onKeyDown, true);
            window.removeEventListener('pointerdown', onPointerDown, true);
        }, 300);
    }

    function onKeyDown(e) {
        dismiss();
        if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
        }
    }

    function onPointerDown(e) {
        dismiss();
    }

    setTimeout(() => {
        window.addEventListener('keydown', onKeyDown, true);
        window.addEventListener('pointerdown', onPointerDown, true);
    }, 200);
}
