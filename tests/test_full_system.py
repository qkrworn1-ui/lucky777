import unittest
import json
import re
import os
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
FIRST_CUTOFF = datetime(2002, 12, 7, 20, 0, 0, tzinfo=KST)

# --- 1. Core Service Logic Emulation ---
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
    elif isinstance(dt_input, dict) and ('seconds' in dt_input or '_seconds' in dt_input):
        sec = dt_input.get('seconds', dt_input.get('_seconds', 0))
        dt = datetime.fromtimestamp(sec, tz=KST)
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

def evaluate_lotto_rank(numbers, winning_numbers, bonus_number):
    match_count = len(set(numbers).intersection(set(winning_numbers)))
    has_bonus = bonus_number in numbers
    if match_count == 6:
        return 1, 2000000000
    elif match_count == 5 and has_bonus:
        return 2, 50000000
    elif match_count == 5:
        return 3, 1500000
    elif match_count == 4:
        return 4, 50000
    elif match_count == 3:
        return 5, 5000
    else:
        return 0, 0

def calculate_roi(total_prize, total_games, cost_per_game=1000):
    total_invest = total_games * cost_per_game
    if total_invest <= 0:
        return 0.0
    return (total_prize / total_invest) * 100.0


# --- 2. Test Suite ---
class TestFullSystem(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        cls.root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

    # [Test 1] Version & Asset Synchronization
    def test_01_version_sync_consistency(self):
        version_file = os.path.join(self.root_dir, 'version.json')
        self.assertTrue(os.path.exists(version_file), "version.json must exist")
        with open(version_file, 'r', encoding='utf-8') as f:
            vdata = json.load(f)
        current_version = vdata.get('version')
        self.assertTrue(current_version, "Version must not be empty")

        v_num = current_version.lstrip('v')

        # Check index.html badge & cache query
        index_file = os.path.join(self.root_dir, 'index.html')
        with open(index_file, 'r', encoding='utf-8') as f:
            index_html = f.read()
        self.assertIn(f"styles.css?v={v_num}", index_html)
        self.assertIn(f"window.APP_VERSION = '{current_version}'", index_html)
        self.assertIn(current_version, index_html)

        # Check sw.js cache name
        sw_file = os.path.join(self.root_dir, 'sw.js')
        with open(sw_file, 'r', encoding='utf-8') as f:
            sw_js = f.read()
        self.assertIn(f"lucky777-pwa-{current_version}", sw_js)

    # [Test 2] Lotto Time & Round Calculations
    def test_02_lotto_time_service_calculations(self):
        # Round 1 cutoff: 2002-12-07 20:00:00 KST
        dt_pre = datetime(2002, 12, 1, 10, 0, 0, tzinfo=KST)
        self.assertEqual(calc_round_from_date(dt_pre), 1)

        # Round 1235 period: 2026-07-25 20:00:00 KST ~ 2026-08-01 19:59:59 KST
        dt_1234 = datetime(2026, 7, 25, 19, 59, 59, tzinfo=KST)
        dt_1235_start = datetime(2026, 7, 25, 20, 0, 0, tzinfo=KST)
        dt_1235_mid = datetime(2026, 7, 28, 12, 0, 0, tzinfo=KST)
        
        self.assertEqual(calc_round_from_date(dt_1234), 1234)
        self.assertEqual(calc_round_from_date(dt_1235_start), 1235)
        self.assertEqual(calc_round_from_date(dt_1235_mid), 1235)

        # Epoch timestamp & Firestore timestamp formats
        ts_millis = int(datetime(2026, 8, 29, 20, 0, 0, tzinfo=KST).timestamp() * 1000)
        self.assertEqual(calc_round_from_date(ts_millis), 1240)
        firestore_ts = {'_seconds': int(ts_millis / 1000), '_nanoseconds': 0}
        self.assertEqual(calc_round_from_date(firestore_ts), 1240)

    # [Test 3] User Context & Pre-Join Isolation
    def test_03_user_context_and_prejoin_isolation(self):
        # Admin / Master gets system baseline round 1235
        self.assertEqual(get_user_join_round('master', None, is_admin=True), 1235)
        self.assertEqual(get_user_join_round('admin', '2026-09-01T00:00:00+09:00', is_admin=True), 1235)
        
        # General user registered during round 1240
        user_1240_join = get_user_join_round('user_normal', '2026-08-30T12:00:00+09:00', is_admin=False)
        self.assertEqual(user_1240_join, 1240)

        # Simulation of round reviews for user_1240
        all_rounds = [1235, 1236, 1237, 1238, 1239, 1240, 1241]
        user_eligible_rounds = [r for r in all_rounds if r >= user_1240_join]
        self.assertEqual(user_eligible_rounds, [1240, 1241])
        self.assertNotIn(1235, user_eligible_rounds)

    # [Test 4] 7-Quant Rank Evaluation Engine
    def test_04_quant_rank_evaluation(self):
        winning = [7, 14, 21, 28, 35, 42]
        bonus = 45

        # 1st Rank (6 matches)
        rank, prize = evaluate_lotto_rank([7, 14, 21, 28, 35, 42], winning, bonus)
        self.assertEqual((rank, prize), (1, 2000000000))

        # 2nd Rank (5 matches + bonus)
        rank, prize = evaluate_lotto_rank([7, 14, 21, 28, 35, 45], winning, bonus)
        self.assertEqual((rank, prize), (2, 50000000))

        # 3rd Rank (5 matches without bonus)
        rank, prize = evaluate_lotto_rank([7, 14, 21, 28, 35, 1], winning, bonus)
        self.assertEqual((rank, prize), (3, 1500000))

        # 4th Rank (4 matches)
        rank, prize = evaluate_lotto_rank([7, 14, 21, 28, 2, 3], winning, bonus)
        self.assertEqual((rank, prize), (4, 50000))

        # 5th Rank (3 matches)
        rank, prize = evaluate_lotto_rank([7, 14, 21, 1, 2, 3], winning, bonus)
        self.assertEqual((rank, prize), (5, 5000))

        # Unranked (2 matches or fewer)
        rank, prize = evaluate_lotto_rank([7, 14, 1, 2, 3, 4], winning, bonus)
        self.assertEqual((rank, prize), (0, 0))

    # [Test 5] Financial ROI & Investment Math
    def test_05_financial_roi_and_aggregation(self):
        # 7 algorithms * 10 games = 70 games per round = 70,000 KRW
        games_per_round = 70
        round_investment = games_per_round * 1000
        self.assertEqual(round_investment, 70000)

        # Winning 1x 4th rank (50,000) + 2x 5th rank (10,000) = 60,000 KRW
        round_prize = 50000 + 10000
        roi = calculate_roi(round_prize, games_per_round)
        self.assertAlmostEqual(roi, 85.7142857, places=4)

        # Zero games protection (guard against division by zero)
        self.assertEqual(calculate_roi(0, 0), 0.0)
        self.assertEqual(calculate_roi(100000, 0), 0.0)

    # [Test 6] Multi-Round Aggregate Aggregation Safeguard
    def test_06_multi_round_aggregation_safety(self):
        round_results = [
            {'round': 1240, 'games': 70, 'prize': 50000},
            {'round': 1241, 'games': 70, 'prize': 1500000},
        ]
        total_games = sum(r['games'] for r in round_results)
        total_prize = sum(r['prize'] for r in round_results)
        total_invest = total_games * 1000
        roi = calculate_roi(total_prize, total_games)

        self.assertEqual(total_games, 140)
        self.assertEqual(total_invest, 140000)
        self.assertEqual(total_prize, 1550000)
        self.assertAlmostEqual(roi, 1107.142857, places=4)

    # [Test 7] Bundle File Integrity Check
    def test_07_bundle_file_integrity(self):
        app_js = os.path.join(self.root_dir, 'app_v2.js')
        self.assertTrue(os.path.exists(app_js), "app_v2.js must exist")
        
        with open(app_js, 'r', encoding='utf-8') as f:
            content = f.read()

        # Check key components present in bundle
        self.assertIn("LottoTimeService", content)
        self.assertIn("UserContextManager", content)
        self.assertIn("renderAllRoundsReviewDetail", content)
        self.assertIn("scoreUserRoundPurchases", content)
        self.assertIn("buildUserWinningReportTemplate", content)
        self.assertIn("initLottoService", content)
        self.assertIn("toggleReceiptCombos", content)
        self.assertIn("toggleRoundAllReceipts", content)

    # [Test 8] User Join Date Review Report Complete Isolation
    def test_08_user_join_date_review_report_isolation(self):
        # 5 Users with different join dates:
        users = [
            {'id': 'master', 'created_at': None, 'is_admin': True, 'expected_join': 1235},
            {'id': 'user_early', 'created_at': '2026-07-20T10:00:00+09:00', 'is_admin': False, 'expected_join': 1235},
            {'id': 'user_1238', 'created_at': '2026-08-16T10:00:00+09:00', 'is_admin': False, 'expected_join': 1238},
            {'id': 'user_1240', 'created_at': '2026-08-30T10:00:00+09:00', 'is_admin': False, 'expected_join': 1240},
            {'id': 'user_1241', 'created_at': '2026-09-06T11:00:00+09:00', 'is_admin': False, 'expected_join': 1241}
        ]

        evaluated_rounds = [1235, 1236, 1237, 1238, 1239, 1240, 1241]

        for u in users:
            join_round = get_user_join_round(u['id'], u['created_at'], u['is_admin'])
            self.assertEqual(join_round, u['expected_join'], f"User {u['id']} join round mismatch")

            # Review Tab Round Filter Simulation
            active_rounds = [r for r in evaluated_rounds if r >= join_round]
            excluded_rounds = [r for r in evaluated_rounds if r < join_round]

            self.assertTrue(all(r >= join_round for r in active_rounds))
            self.assertTrue(all(r < join_round for r in excluded_rounds))

            # Verify that user_1238 has zero exposure to 1235, 1236, 1237
            if u['id'] == 'user_1238':
                self.assertEqual(active_rounds, [1238, 1239, 1240, 1241])
                self.assertEqual(excluded_rounds, [1235, 1236, 1237])
            
            # Verify that user_1240 has zero exposure to 1235..1239
            if u['id'] == 'user_1240':
                self.assertEqual(active_rounds, [1240, 1241])
                self.assertEqual(excluded_rounds, [1235, 1236, 1237, 1238, 1239])

    # [Test 9] Actual Purchase Receipts Ledger Scoring and Isolation
    def test_09_actual_purchase_receipts_ledger_scoring(self):
        winning_1240 = [3, 11, 15, 29, 35, 44]
        bonus_1240 = 10

        # Receipt 1: 5 combos
        combos_user_a = [
            [3, 11, 15, 29, 35, 44], # 1st Rank (2,000,000,000)
            [3, 11, 15, 29, 35, 10], # 2nd Rank (50,000,000)
            [3, 11, 15, 29, 35, 1],  # 3rd Rank (1,500,000)
            [3, 11, 15, 29, 2, 4],   # 4th Rank (50,000)
            [3, 11, 15, 1, 2, 4],    # 5th Rank (5,000)
        ]

        # Evaluate Receipt 1
        r_hits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 0: 0 }
        r_prize = 0
        for c in combos_user_a:
            rank, prize = evaluate_lotto_rank(c, winning_1240, bonus_1240)
            r_hits[rank] += 1
            r_prize += prize

        self.assertEqual(r_hits[1], 1)
        self.assertEqual(r_hits[2], 1)
        self.assertEqual(r_hits[3], 1)
        self.assertEqual(r_hits[4], 1)
        self.assertEqual(r_hits[5], 1)
        self.assertEqual(r_prize, 2051555000)

        # Receipt 2: All miss
        combos_user_b = [
            [1, 2, 4, 5, 6, 7],
            [8, 9, 12, 13, 14, 16]
        ]
        r2_hits = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 0: 0 }
        r2_prize = 0
        for c in combos_user_b:
            rank, prize = evaluate_lotto_rank(c, winning_1240, bonus_1240)
            r2_hits[rank] += 1
            r2_prize += prize

        self.assertEqual(r2_hits[0], 2)
        self.assertEqual(r2_prize, 0)

        # Non-admin privacy isolation test:
        ledger_all = [
            {'id': 'r1', 'user': 'user_a', 'combos': combos_user_a},
            {'id': 'r2', 'user': 'user_b', 'combos': combos_user_b},
        ]
        
        # When user_a accesses confirmed tab
        user_a_view = [r for r in ledger_all if r['user'] == 'user_a']
        self.assertEqual(len(user_a_view), 1)
        self.assertEqual(user_a_view[0]['id'], 'r1')

        # When user_b accesses confirmed tab
        user_b_view = [r for r in ledger_all if r['user'] == 'user_b']
        self.assertEqual(len(user_b_view), 1)
        self.assertEqual(user_b_view[0]['id'], 'r2')

    # [Test 10] Admin Multi-User Combined Review Aggregation Math
    def test_10_admin_all_users_combined_review_math(self):
        # Simulate active users across rounds 1238, 1239, 1240
        registered_users = [
            {'id': 'user_alpha', 'created_at': '2026-07-20T10:00:00+09:00'}, # join 1235
            {'id': 'user_beta', 'created_at': '2026-08-16T10:00:00+09:00'},  # join 1238
            {'id': 'user_gamma', 'created_at': '2026-08-30T10:00:00+09:00'}, # join 1240
        ]

        # Round 1238 active users: alpha (join 1235), beta (join 1238) -> 2 users
        active_1238 = [u for u in registered_users if 1238 >= get_user_join_round(u['id'], u['created_at'])]
        self.assertEqual([u['id'] for u in active_1238], ['user_alpha', 'user_beta'])

        # Round 1239 active users: alpha, beta -> 2 users
        active_1239 = [u for u in registered_users if 1239 >= get_user_join_round(u['id'], u['created_at'])]
        self.assertEqual([u['id'] for u in active_1239], ['user_alpha', 'user_beta'])

        # Round 1240 active users: alpha, beta, gamma -> 3 users
        active_1240 = [u for u in registered_users if 1240 >= get_user_join_round(u['id'], u['created_at'])]
        self.assertEqual([u['id'] for u in active_1240], ['user_alpha', 'user_beta', 'user_gamma'])

        # Multi-user total games calculation
        # 70 games per user per active round
        total_games_1238 = len(active_1238) * 70  # 140 games
        total_games_1239 = len(active_1239) * 70  # 140 games
        total_games_1240 = len(active_1240) * 70  # 210 games
        grand_total_games = total_games_1238 + total_games_1239 + total_games_1240
        self.assertEqual(grand_total_games, 490)
        self.assertEqual(grand_total_games * 1000, 490000)

    # [Test 11] Immutability & Locking Integrity Verification
    def test_11_immutability_and_locking_integrity(self):
        # 1. Recommendation Snapshot Write-Once Simulation
        # Simulate local/cloud snapshot storage
        snapshot_store = {}

        def save_snapshot_write_once(user_id, round_num, combos):
            key = f"{user_id}_{round_num}"
            if key in snapshot_store:
                # Write-once guard: never mutate existing snapshot
                return snapshot_store[key]
            
            # Create immutable snapshot with fingerprint
            snapshot = {
                'round': round_num,
                'userId': user_id,
                'combinations': [list(c) for c in combos],
                'hashFingerprint': f"hash_{user_id}_{round_num}_{len(combos)}",
                'createdAt': '2026-09-01T12:00:00+09:00',
                'isLocked': True
            }
            snapshot_store[key] = snapshot
            return snapshot

        # First write: User Alpha Round 1240
        initial_combos = [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]]
        s1 = save_snapshot_write_once('user_alpha', 1240, initial_combos)
        self.assertEqual(s1['combinations'], initial_combos)
        self.assertTrue(s1['isLocked'])

        # Attempted overwrite with different combinations (e.g. recalculation)
        different_combos = [[10, 20, 30, 40, 41, 42], [11, 22, 33, 44, 45, 46]]
        s2 = save_snapshot_write_once('user_alpha', 1240, different_combos)
        
        # Verify immutability: must still equal initial_combos!
        self.assertEqual(s2['combinations'], initial_combos)
        self.assertEqual(s2['hashFingerprint'], s1['hashFingerprint'])

        # 2. Receipt Immutability & Locking
        receipt = {
            'id': 'rcpt_1240_001',
            'round': 1240,
            'user': 'user_alpha',
            'qrSerial': 'TR-1240-8849-0192',
            'qrRawUrl': 'http://m.dhlottery.co.kr/?v=1240q...',
            'combos': initial_combos,
            'isLocked': True,
            'qrScannedAt': '2026-09-02T15:30:00+09:00'
        }

        # Check lock status
        self.assertTrue(receipt.get('isLocked', False))
        self.assertTrue(bool(receipt.get('qrSerial')))
        self.assertTrue(bool(receipt.get('qrRawUrl')))

        # Deduplication check: receipt with duplicate serial is ignored
        existing_receipts = [receipt]
        duplicate_receipt = {
            'id': 'rcpt_1240_002',
            'round': 1240,
            'user': 'user_alpha',
            'qrSerial': 'TR-1240-8849-0192', # duplicate serial
            'combos': [[1, 2, 3, 4, 5, 6]],
        }
        
        seen_serials = {r['qrSerial'] for r in existing_receipts if 'qrSerial' in r}
        is_duplicate = duplicate_receipt['qrSerial'] in seen_serials
        self.assertTrue(is_duplicate, "Duplicate receipt with identical QR serial must be detected and rejected")


if __name__ == '__main__':
    unittest.main()

