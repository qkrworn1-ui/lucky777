import unittest
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
FIRST_CUTOFF = datetime(2002, 12, 7, 20, 0, 0, tzinfo=KST)

def calc_round_from_date(dt_input):
    if isinstance(dt_input, str):
        s = dt_input.replace('Z', '+00:00')
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=KST)
        else:
            dt = dt.astimezone(KST)
    elif isinstance(dt_input, (int, float)):
        ts = dt_input if dt_input > 1e11 else dt_input * 1000
        dt = datetime.fromtimestamp(ts / 1000, tz=KST)
    else:
        dt = dt_input
    diff = dt - FIRST_CUTOFF
    if diff.total_seconds() < 0:
        return 1
    weeks = int(diff.total_seconds() // (7 * 24 * 3600))
    return 2 + weeks

def get_user_join_round(user_id, created_at, is_admin=False):
    clean_id = (user_id or '').lower().strip()
    if clean_id in ('master', 'admin', 'all') or is_admin:
        return 1235
    if not created_at:
        return 1235
    calced = calc_round_from_date(created_at)
    return max(calced, 1235)

class TestEngineIntegrity(unittest.TestCase):
    def test_01_round_date_formula(self):
        dt_1235 = datetime(2026, 7, 25, 20, 0, 0, tzinfo=KST)
        self.assertEqual(calc_round_from_date(dt_1235), 1235)
        dt_1240 = datetime(2026, 8, 29, 20, 0, 0, tzinfo=KST)
        self.assertEqual(calc_round_from_date(dt_1240), 1240)
        dt_1241 = datetime(2026, 9, 5, 20, 0, 0, tzinfo=KST)
        self.assertEqual(calc_round_from_date(dt_1241), 1241)

    def test_02_user_join_round_isolation(self):
        self.assertEqual(get_user_join_round('master', None, is_admin=True), 1235)
        self.assertEqual(get_user_join_round('admin', '2026-09-01T00:00:00+09:00', is_admin=True), 1235)
        self.assertEqual(get_user_join_round('early_user', '2025-01-01T00:00:00+09:00'), 1235)
        self.assertEqual(get_user_join_round('user_1240', '2026-08-30T10:00:00+09:00'), 1240)
        self.assertEqual(get_user_join_round('user_1241', '2026-09-06T12:00:00+09:00'), 1241)

    def test_03_pre_join_exclusion_logic(self):
        user_join_round = 1240
        evaluated_rounds = [1235, 1236, 1237, 1238, 1239, 1240, 1241]
        active_rounds = [r for r in evaluated_rounds if r >= user_join_round]
        self.assertEqual(active_rounds, [1240, 1241])
        self.assertNotIn(1235, active_rounds)
        self.assertNotIn(1239, active_rounds)

    def test_04_kpi_math_consistency(self):
        games = 70
        invest = games * 1000
        prize = 550000
        roi = (prize / invest) * 100
        self.assertEqual(invest, 70000)
        self.assertAlmostEqual(roi, 785.7142857, places=4)
        zero_invest = 0 * 1000
        zero_roi = (0 / zero_invest * 100) if zero_invest > 0 else 0.0
        self.assertEqual(zero_roi, 0.0)

if __name__ == '__main__':
    unittest.main()
