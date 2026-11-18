import os
import sys
import unittest

sys.dont_write_bytecode = True


class TestAllRounder3BUpgrade(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

    def test_01_source_structure_and_guards(self):
        gen_path = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'generator.js')
        stat_path = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'statistics.js')
        state_path = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'state.js')
        modal_path = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'win-prob-modal.js')

        with open(gen_path, encoding='utf-8') as f:
            gen_js = f.read()
        with open(stat_path, encoding='utf-8') as f:
            stat_js = f.read()
        with open(state_path, encoding='utf-8') as f:
            state_js = f.read()
        with open(modal_path, encoding='utf-8') as f:
            modal_js = f.read()

        self.assertIn("ALGO_REVISION_3B = 'v2026.11_3b_16wheel_planb_v6'", gen_js)
        self.assertIn("computeAllRounder3BPortfolio", gen_js)
        self.assertIn("isRound1251UpgradePending", gen_js)
        self.assertIn("roundForSeed >= 1251", gen_js)
        self.assertIn("EWMA_FREQUENCY", stat_js)
        self.assertIn("DYNAMIC_ROUND_SCORE", stat_js)
        self.assertIn("computeWalkForwardHedge8Snapshots", stat_js)
        self.assertIn("HEDGE8_EXPERT_WEIGHTS", stat_js)
        self.assertIn("CROWD_EV_RATIO", stat_js)
        self.assertIn("ar3bPortfolioCache", state_js)
        self.assertIn("invalidateRecommendationRuntimeCaches", state_js)
        self.assertIn("normSf", modal_js)

    def test_02_chromium_runtime_1250_preservation_and_1251_3b(self):
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            self.skipTest("playwright not available")

        data_path = os.path.join(self.root_dir, 'data.js')
        app_path = os.path.join(self.root_dir, 'app_v2.js')
        with open(data_path, encoding='utf-8') as f:
            data_body = f.read()
        with open(app_path, encoding='utf-8') as f:
            app_body = f.read()

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            def handle_route(route):
                url = route.request.url
                if url.endswith('test.html'):
                    route.fulfill(
                        status=200,
                        content_type='text/html; charset=utf-8',
                        body="<!DOCTYPE html><html><head><meta charset='utf-8'></head><body></body></html>"
                    )
                elif url.endswith('data.js'):
                    route.fulfill(status=200, content_type='application/javascript; charset=utf-8', body=data_body)
                elif url.endswith('app_v2.js'):
                    route.fulfill(status=200, content_type='application/javascript; charset=utf-8', body=app_body)
                else:
                    route.abort()

            page.route('http://lucky777.local/**', handle_route)
            page.goto('http://lucky777.local/test.html')
            page.add_script_tag(url='http://lucky777.local/data.js')
            page.add_script_tag(url='http://lucky777.local/app_v2.js')

            res = page.evaluate("""() => {
                window.state.lottoExtraHistory = {
                    1250: { numbers: [1, 5, 18, 23, 27, 28], bonus: 8, rank1Winners: 10, rank1Prize: 2500000000 }
                };
                window.state.mergedHistory = Object.assign({}, LOTTO_HISTORY, window.state.lottoExtraHistory);
                window.recalculateGroups();

                const v4_1250 = window.computeAbsoluteTop10Combinations(true, 1250, 'v4', true, 'master');
                const v4_1251 = window.computeAbsoluteTop10Combinations(false, 1251, 'v4', true, 'master');
                const v3_1251 = window.computeAbsoluteTop10Combinations(false, 1251, 'v3', true, 'master');
                const ar3_1251 = window.generateExtraAddonPack(1, 1251, 'master');

                const all30 = [...v4_1251, ...v3_1251, ...ar3_1251.combos];
                const pool = new Set(all30.flatMap(c => c.numbers));
                const uniqGames = new Set(all30.map(c => c.numbers.join(',')));

                const g1250 = window.isRound1251UpgradePending({ algoRevision: 'v2026.10_3stage' }, 1250, 'master');
                const g1251Old = window.isRound1251UpgradePending({ algoRevision: 'v2026.10_3stage' }, 1251, 'master');
                const g1251Prev3B = window.isRound1251UpgradePending({ algoRevision: 'v2026.11_3b_16wheel_plana_v5' }, 1251, 'master');
                const g1251New = window.isRound1251UpgradePending({ algoRevision: 'v2026.11_3b_16wheel_planb_v6' }, 1251, 'master');

                const p2Null = window.generateExtraAddonPack(2, 1251, 'master');
                const p3Null = window.generateExtraAddonPack(3, 1251, 'master');
                const p4Null = window.generateExtraAddonPack(4, 1251, 'master');
                const p5Null = window.generateExtraAddonPack(5, 1251, 'master');
                const manualCross = window.crossCheckCombosWithRecommendations(1246, [[19, 33, 34, 38, 41, 42]], 'kakao_5070244665');
                const lean = window.makeLeanSnapshot({
                    userId: 'master', round: 1251, v4Combos: v4_1251, v3Combos: v3_1251, totalGames: 70,
                    extraPacks: { '1': ar3_1251, '2': { packId: 2, combos: [[1,2,3,4,5,6]] } }
                });
                const hydrated = window.hydrateLeanSnapshot(JSON.parse(JSON.stringify(lean)));
                const frozen = window.getParkJaeGoo1246FrozenSnapshot();
                const coreSummary = window.getWeeklyCoreNumbersSummary(1251, 'master');

                const top6Sorted = coreSummary ? coreSummary.topAnchors.map(x => x.n).sort((a,b) => a-b) : [];
                const top6DirectIncluded = top6Sorted.length === 6 && JSON.stringify([...v4_1251[0].numbers].sort((a,b) => a-b)) === JSON.stringify(top6Sorted);
                const rank1OnTop6 = all30.some(c => JSON.stringify([...c.numbers].sort((a,b) => a-b)) === JSON.stringify(top6Sorted));
                const bonTop6 = top6Sorted[0];
                const outsideNum = [1,2,3,4,5,6,7,8,9,10].find(n => !top6Sorted.includes(n));
                const main5PlusOutside = [...top6Sorted.slice(1), outsideNum];
                const rank2OnTop6Bonus = all30.some(c => {
                    const m = c.numbers.filter(x => main5PlusOutside.includes(x)).length;
                    return m === 5 && c.numbers.includes(bonTop6);
                });

                window.state.mergedHistory[1251] = { numbers: [2, 9, 14, 31, 35, 45], bonus: 22 };
                window.applyNewDrawData({ drwNo: 1251, numbers: [2, 9, 14, 31, 35, 45], bonus: 22 });
                const pool1252 = new Set(window.computeAbsoluteTop10Combinations(false, 1252, 'v4', true, 'master').flatMap(c => c.numbers));

                return {
                    r1250IsLegacy: !v4_1250[0].name.includes('16수 초압축'),
                    r1251Is3B: v4_1251[0].name.includes('16수 초압축') && v3_1251[0].name.includes('16수 초압축') && ar3_1251.name.includes('16수 초압축'),
                    poolSize: pool.size,
                    uniqueCount: uniqGames.size,
                    g1250,
                    g1251Old,
                    g1251Prev3B,
                    g1251New,
                    top6DirectIncluded,
                    rank1OnTop6,
                    rank2OnTop6Bonus,
                    extra25Null: p2Null === null && p3Null === null && p4Null === null && p5Null === null,
                    manualDetected: manualCross && manualCross.detectedVersion === '수동/직접입력',
                    leanTotalGames: lean.totalGames,
                    leanKeys: Object.keys(lean.extraPacks),
                    hydratedKeys: Object.keys(hydrated.extraPacks),
                    frozenTotalGames: frozen.totalGames,
                    frozenKeys: Object.keys(frozen.extraPacks),
                    corePoolSize: coreSummary ? coreSummary.poolSize : 0,
                    coreTop6Len: coreSummary ? coreSummary.topAnchors.length : 0,
                    coreSupportLen: coreSummary ? coreSummary.supportPool.length : 0,
                    coreMatchesPool: coreSummary ? JSON.stringify(coreSummary.poolNumbers) === JSON.stringify(Array.from(pool).sort((a,b) => a-b)) : false,
                    coreFreqTotal: coreSummary ? coreSummary.itemsSortedAsc.reduce((a, x) => a + x.freq30, 0) : 0,
                    afterScrapeLatest: window.state.latestRoundNum,
                    pool1252Valid: pool1252.size <= 16 && pool1252.size >= 10,
                    hitReportValid: (() => {
                        const rep = window.evaluateRoundCoreHitReport(1251, 'test_user_demo');
                        return !!(rep && rep.round === 1251 && rep.top6Items.length === 6 && rep.support10Items.length === 10 && typeof rep.totalHits === 'number');
                    })(),
                    coreProbModalValid: (() => {
                        window.openWinProbComparisonModal();
                        const html = document.getElementById('winProbModalContent')?.innerHTML || '';
                        const sim6 = window.evaluateConditionalCoreHitScenario(6, 0, 'none');
                        window.closeWinProbComparisonModal();
                        return html.includes('핵심 코어 6수 맞춘 개수별 당첨확률') && html.includes('보조 코어 10수 맞춘 개수별 당첨확률') && sim6.rankAtLeastProbs[1] === 100;
                    })(),
                    walkForward3BParity: (() => {
                        const cache = window.buildWalkForwardCore3BScoreCache(1252);
                        const wfNext = window.generateCore3BPortfolioAtRound(1252, 'master', cache, false);
                        const directNext = window.computeAllRounder3BPortfolio(1252, 'master');
                        const wf1248 = window.generateCore3BPortfolioAtRound(1248, 'master', cache, true);
                        const wKeys = Object.keys(window.state.HEDGE8_EXPERT_WEIGHTS || {});
                        const top6Set = new Set(directNext.top6Anchors);
                        const slotDist = [0, 0, 0, 0, 0, 0, 0];
                        [...directNext.v4, ...directNext.v3, ...directNext.ar3].forEach(c => {
                            const ch = c.numbers.filter(x => top6Set.has(x)).length;
                            slotDist[ch]++;
                        });
                        return wKeys.length === 8 &&
                               window.state.HEDGE8_EXPERT_WEIGHTS.overdue <= 0.1801 &&
                               window.state.HEDGE8_EXPERT_WEIGHTS.ewma10 >= 0.0599 &&
                               JSON.stringify(slotDist) === JSON.stringify([1, 5, 11, 8, 3, 1, 1]) &&
                               JSON.stringify(wfNext.pool16) === JSON.stringify(directNext.pool16) &&
                               JSON.stringify(wfNext.v4[0].numbers) === JSON.stringify(directNext.v4[0].numbers) &&
                               wf1248.top6Anchors.length === 6 && wf1248.support10.length === 10 &&
                               wf1248.v4.length === 10 && wf1248.v3.length === 10 && wf1248.ar3.length === 10;
                    })()
                };
            }""")
            browser.close()

        self.assertTrue(res['r1250IsLegacy'])
        self.assertTrue(res['r1251Is3B'])
        self.assertEqual(res['poolSize'], 16)
        self.assertEqual(res['uniqueCount'], 30)
        self.assertFalse(res['g1250'])
        self.assertTrue(res['g1251Old'])
        self.assertTrue(res['g1251Prev3B'])
        self.assertFalse(res['g1251New'])
        self.assertTrue(res['top6DirectIncluded'])
        self.assertTrue(res['rank1OnTop6'])
        self.assertTrue(res['rank2OnTop6Bonus'])
        self.assertTrue(res['extra25Null'])
        self.assertTrue(res['manualDetected'])
        self.assertEqual(res['leanTotalGames'], 30)
        self.assertEqual(res['leanKeys'], ['1'])
        self.assertEqual(res['hydratedKeys'], ['1'])
        self.assertEqual(res['frozenTotalGames'], 30)
        self.assertEqual(res['frozenKeys'], ['1'])
        self.assertEqual(res['corePoolSize'], 16)
        self.assertEqual(res['coreTop6Len'], 6)
        self.assertEqual(res['coreSupportLen'], 10)
        self.assertTrue(res['coreMatchesPool'])
        self.assertEqual(res['coreFreqTotal'], 180)
        self.assertEqual(res['afterScrapeLatest'], 1251)
        self.assertTrue(res['pool1252Valid'])
        self.assertTrue(res['hitReportValid'])
        self.assertTrue(res['coreProbModalValid'])
        self.assertTrue(res['walkForward3BParity'])

    def test_weekly_core_numbers_ui_wiring(self):
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(os.path.join(root_dir, 'index.html'), 'r', encoding='utf-8') as f:
            idx_html = f.read()
        with open(os.path.join(root_dir, 'src', 'services', 'lotto', 'views', 'generator-tab.js'), 'r', encoding='utf-8') as f:
            gen_tab_js = f.read()
        with open(os.path.join(root_dir, 'src', 'services', 'lotto', 'views', 'draw-banner.js'), 'r', encoding='utf-8') as f:
            banner_js = f.read()
        core_pos = idx_html.find('id="weeklyCoreNumbersSection"')
        comb_pos = idx_html.find('id="combinationsContainer"')
        self.assertGreater(core_pos, 0)
        self.assertLess(core_pos, comb_pos)
        self.assertIn('id="lpCoreHitSummaryStrip"', idx_html)
        self.assertIn('id="latestDrawCoreHitPanel"', idx_html)
        self.assertIn('export function renderWeeklyCoreNumbersCard', gen_tab_js)
        self.assertIn('export function toggleWeeklyCoreNumber', gen_tab_js)
        self.assertIn('export function switchWeeklyCoreCardMode', gen_tab_js)
        self.assertIn('applyWeeklyCoreHighlightFilter', gen_tab_js)
        self.assertIn('export function renderLatestDrawCoreHitPanel', banner_js)

    def test_batch_evaluate_only_ar3(self):
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        with open(os.path.join(root_dir, 'batch_evaluate_winnings.py'), 'r', encoding='utf-8') as f:
            code = f.read()
        self.assertIn("p_obj = extra_packs.get('1') or {}", code)
        self.assertNotIn("for pid in ['1', '2', '3', '4', '5']:", code)


if __name__ == '__main__':
    unittest.main()
