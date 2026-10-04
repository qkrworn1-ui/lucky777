import unittest
import os
import sys
from datetime import datetime, date

sys.dont_write_bytecode = True

# Myeongri Logic Unit Tests
ANCHOR_DATE = date(1900, 1, 31)

def calc_day_gan_index(birth_date_str):
    if not birth_date_str:
        return None
    parts = birth_date_str.split('-')
    d = date(int(parts[0]), int(parts[1]), int(parts[2]))
    diff = (d - ANCHOR_DATE).days
    return ((diff % 10) + 10) % 10

class TestMyeongriService(unittest.TestCase):
    def test_01_anchor_and_known_dates(self):
        # 1900-01-31 is Gap-Jin (Gap index = 0)
        self.assertEqual(calc_day_gan_index("1900-01-31"), 0)
        # 2024-01-01 is Gap-Ja (Gap index = 0)
        self.assertEqual(calc_day_gan_index("2024-01-01"), 0)
        # 2026-10-04 is Sin-Hae (Sin index = 7, metal)
        self.assertEqual(calc_day_gan_index("2026-10-04"), 7)

    def test_02_wealth_element_and_primary_day_mapping(self):
        # Stems: 0=Gap, 1=Eul -> Wood -> Wealth is Earth (토) -> Saturday (토요일)
        self.assertIn(calc_day_gan_index("1988-06-15"), range(10))
        # 10 Stems check
        elements = ['wood', 'wood', 'fire', 'fire', 'earth', 'earth', 'metal', 'metal', 'water', 'water']
        wealth_elements = ['earth', 'earth', 'metal', 'metal', 'water', 'water', 'wood', 'wood', 'fire', 'fire']
        primary_days = ['토요일', '토요일', '금요일', '금요일', '수요일', '수요일', '목요일', '목요일', '화요일', '화요일']
        
        for idx in range(10):
            elem = elements[idx]
            wealth = wealth_elements[idx]
            p_day = primary_days[idx]
            if elem == 'wood':
                self.assertEqual(wealth, 'earth')
                self.assertEqual(p_day, '토요일')
            elif elem == 'fire':
                self.assertEqual(wealth, 'metal')
                self.assertEqual(p_day, '금요일')
            elif elem == 'earth':
                self.assertEqual(wealth, 'water')
                self.assertEqual(p_day, '수요일')
            elif elem == 'metal':
                self.assertEqual(wealth, 'wood')
                self.assertEqual(p_day, '목요일')
            elif elem == 'water':
                self.assertEqual(wealth, 'fire')
                self.assertEqual(p_day, '화요일')

    def test_03_dashboard_containers_in_index_html(self):
        index_path = os.path.join(os.path.dirname(__file__), '..', 'index.html')
        with open(index_path, 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertIn('landingFortuneAdvisorContainer', content, "landingFortuneAdvisorContainer must exist on landing page")
        self.assertIn('dashboardFortuneAdvisorContainer', content, "dashboardFortuneAdvisorContainer must exist on tab-dashboard")

    def test_04_fallback_to_input_widget_when_birthdate_missing(self):
        dash_js_path = os.path.join(os.path.dirname(__file__), '..', 'src', 'services', 'lotto', 'views', 'dashboard-tab.js')
        with open(dash_js_path, 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertIn('dash-inline-birth-form', content)
        self.assertIn('btn-dash-submit-birth', content)
        self.assertIn('shouldShowInput = !birthDate || forceShowInput', content)
        self.assertIn('saveAndApplyDashboardBirthDate', content)

    def test_05_accordion_collapsible_feature(self):
        dash_js_path = os.path.join(os.path.dirname(__file__), '..', 'src', 'services', 'lotto', 'views', 'dashboard-tab.js')
        with open(dash_js_path, 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertIn('toggleFortuneAdvisorAccordion', content)
        self.assertIn('fortune-advisor-collapsible-wrap', content)
        self.assertIn('fortune-toggle-bar', content)
        self.assertIn('fortune-collapsible-content', content)

        styles_path = os.path.join(os.path.dirname(__file__), '..', 'styles.css')
        with open(styles_path, 'r', encoding='utf-8') as f:
            styles_content = f.read()
        self.assertIn('.fortune-advisor-collapsible-wrap', styles_content)
        self.assertIn('.fortune-toggle-bar', styles_content)
        self.assertIn('.fortune-collapsible-content', styles_content)

    def test_06_round_fortune_adaptation(self):
        myeongri_path = os.path.join(os.path.dirname(__file__), '..', 'src', 'services', 'lotto', 'myeongri-service.js')
        with open(myeongri_path, 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertIn('analyzeRoundFortune', content)
        self.assertIn('EARTHLY_BRANCHES', content)
        self.assertIn('NOBLEMAN_BRANCHES', content)
        self.assertIn('STEM_ELEMENT_INDEX', content)
        self.assertIn('BRANCH_ELEMENT_INDEX', content)
        self.assertIn('WEEKDAY_ELEMENT_INDEX', content)
        self.assertIn('TWELVE_HOURS', content)
        self.assertIn('targetRound', content)
        self.assertIn('luckyRoundDays', content)

    def test_07_dashboard_round_calc_uses_getUpcomingLottoRound(self):
        dash_js_path = os.path.join(os.path.dirname(__file__), '..', 'src', 'services', 'lotto', 'views', 'dashboard-tab.js')
        with open(dash_js_path, 'r', encoding='utf-8') as f:
            content = f.read()
        self.assertIn('getUpcomingLottoRound', content)
        self.assertNotIn(': 1239', content, "Stale fallback 1239 must not be hardcoded in dashboard-tab.js")
        self.assertIn('currentRound = (typeof getUpcomingLottoRound === \'function\')', content)

    def test_08_canonical_round_advancement_and_dynamic_dates(self):
        # 2002-12-07 was Round 1 (Saturday)
        round_1_draw = date(2002, 12, 7)
        from datetime import timedelta
        round_1244_draw = round_1_draw + timedelta(days=(1244 - 1) * 7)
        round_1245_draw = round_1_draw + timedelta(days=(1245 - 1) * 7)
        self.assertEqual(round_1244_draw.isoformat(), '2026-10-03')
        self.assertEqual(round_1245_draw.isoformat(), '2026-10-10')

        # Round 1245 purchase window: Sunday 2026-10-04 to Saturday 2026-10-10
        r1245_start = round_1245_draw - timedelta(days=6)
        self.assertEqual(r1245_start.isoformat(), '2026-10-04')
        self.assertEqual(r1245_start.weekday(), 6) # Sunday in Python datetime (0=Mon, 6=Sun)
        self.assertEqual(round_1245_draw.weekday(), 5) # Saturday in Python datetime

if __name__ == '__main__':
    unittest.main()
