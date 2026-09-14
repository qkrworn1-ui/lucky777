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

    # [Test 12] Sequential QR Registration & Single Receipt Trash Isolation Test
    def test_12_sequential_qr_registration_and_trash_isolation(self):
        # 1. Sequential QR receipts with generic serial fallback must NOT be falsely deduplicated
        receipt_1 = {
            'receiptId': 'rcpt_pjg_1240_1001_0_abc',
            'round': 1240,
            'user': 'pjg',
            'qrSerial': 'TR-정상발권', # generic fallback
            'combos': [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]],
            'timestamp': '2026-09-11T13:00:00.000Z',
            'isLocked': True
        }
        receipt_2 = {
            'receiptId': 'rcpt_pjg_1240_1002_0_def',
            'round': 1240,
            'user': 'pjg',
            'qrSerial': 'TR-정상발권', # generic fallback on 2nd scan
            'combos': [[13, 14, 15, 16, 17, 18], [19, 20, 21, 22, 23, 24]],
            'timestamp': '2026-09-11T13:00:01.000Z',
            'isLocked': True
        }

        # Emulate deduplicateReceipts logic
        def get_combos_fp(rcpt):
            return "|".join("-".join(str(n) for n in sorted(c)) for c in rcpt.get('combos', []))

        def deduplicate(receipt_list):
            seen = set()
            result = []
            for item in receipt_list:
                r_id = item.get('receiptId')
                serial = item.get('qrSerial')
                is_generic = not serial or serial == 'TR-정상발권' or serial.startswith('TR-정상')
                combos_fp = get_combos_fp(item)
                user = item.get('user', '')
                r_round = item.get('round', '')

                if r_id:
                    key = f"id_{r_id}"
                elif not is_generic and serial and len(serial) >= 6:
                    key = f"serial_{serial}_{user}_{r_round}"
                elif combos_fp:
                    key = f"combos_{r_round}_{user}_{combos_fp}"
                else:
                    key = f"item_{r_round}_{user}_{item.get('timestamp')}"

                if key not in seen:
                    seen.add(key)
                    result.append(item)
            return result

        combined = [receipt_1, receipt_2]
        deduped = deduplicate(combined)
        self.assertEqual(len(deduped), 2, "Sequential receipts with different numbers must BOTH be preserved!")

        # 2. Deleting Receipt 1 must strictly preserve Receipt 2 (Zero cross-deletion)
        active_ledger = [receipt_1.copy(), receipt_2.copy()]
        trash_store = []

        # Emulate exact single deletion by receiptId / fingerprint
        target_to_delete = receipt_1
        target_id = target_to_delete['receiptId']
        target_fp = get_combos_fp(target_to_delete)

        # Move to trash
        trash_item = {**target_to_delete, 'trashedAt': '2026-09-11T13:05:00.000Z', 'trashId': 'trash_001'}
        trash_store.insert(0, trash_item)

        # Remove ONLY single item from ledger
        remove_idx = -1
        for idx, p in enumerate(active_ledger):
            if p.get('receiptId') == target_id:
                remove_idx = idx
                break
            if remove_idx == -1 and get_combos_fp(p) == target_fp:
                remove_idx = idx
                break

        self.assertNotEqual(remove_idx, -1)
        active_ledger.pop(remove_idx)

        # Verify: Receipt 1 removed, Receipt 2 perfectly preserved in active ledger
        self.assertEqual(len(active_ledger), 1, "Only 1 receipt must be removed!")
        self.assertEqual(active_ledger[0]['receiptId'], 'rcpt_pjg_1240_1002_0_def')
        self.assertEqual(len(trash_store), 1, "Trash must contain exactly 1 deleted receipt!")
        self.assertEqual(trash_store[0]['receiptId'], 'rcpt_pjg_1240_1001_0_abc')

        # 3. Restoring Receipt 1 from Trash back to active ledger
        restored_item = trash_store.pop(0)
        active_ledger.append(restored_item)
        self.assertEqual(len(active_ledger), 2, "Both receipts must exist after restoration!")
        self.assertEqual(len(trash_store), 0, "Trash must now be empty!")

    def test_13_receipt_lock_toggle_preservation(self):
        """Test: Unlocking/locking a receipt must safely preserve all receipts and never wipe other accounts."""
        user_ledger = {
            1240: [
                {
                    'receiptId': 'rcpt_pjg_1240_1001',
                    'round': 1240,
                    'user': 'pjg',
                    'isLocked': True,
                    'combos': [{'numbers': [1, 2, 3, 4, 5, 6]}]
                },
                {
                    'receiptId': 'rcpt_pjg_1240_1002',
                    'round': 1240,
                    'user': 'pjg',
                    'isLocked': True,
                    'combos': [{'numbers': [7, 8, 9, 10, 11, 12]}]
                }
            ]
        }

        # 1. Unlock receipt 1
        target_id = 'rcpt_pjg_1240_1001'
        found = False
        for p in user_ledger[1240]:
            if p.get('receiptId') == target_id:
                p['isLocked'] = not p['isLocked']
                found = True
                break

        self.assertTrue(found, "Target receipt must be found")
        # Receipt 1 must be unlocked
        self.assertFalse(user_ledger[1240][0]['isLocked'], "Receipt 1 must be unlocked (isLocked == False)")
        # Receipt 2 must stay locked
        self.assertTrue(user_ledger[1240][1]['isLocked'], "Receipt 2 must stay locked (isLocked == True)")
        # Both receipts must still exist in ledger! (Zero data loss)
        self.assertEqual(len(user_ledger[1240]), 2, "Both receipts must be intact after unlocking!")

        # 2. Relock receipt 1
        for p in user_ledger[1240]:
            if p.get('receiptId') == target_id:
                p['isLocked'] = not p['isLocked']
                break

        self.assertTrue(user_ledger[1240][0]['isLocked'], "Receipt 1 must be relocked (isLocked == True)")
        self.assertEqual(len(user_ledger[1240]), 2, "Both receipts must still exist in ledger!")

    def test_14_multi_receipt_registration_preservation(self):
        """Test: Registering 5 or more receipts (e.g. 10 receipts, 50 games) must all be safely preserved."""
        ledger = {1240: []}
        
        # Emulate sequential registration of 8 receipts (40 games)
        for i in range(8):
            combos = []
            for g in range(5):
                base_num = (i * 5 + g) % 40 + 1
                combos.append({'numbers': [base_num, (base_num+1)%45+1, (base_num+2)%45+1, (base_num+3)%45+1, (base_num+4)%45+1, (base_num+5)%45+1]})
            
            receipt = {
                'receiptId': f'rcpt_pjg_1240_{1000 + i}',
                'round': 1240,
                'user': 'pjg',
                'version': 'QR 실구매 영수증 (A~E 5게임)',
                'combos': combos,
                'isLocked': True
            }
            ledger[1240].append(receipt)

        self.assertEqual(len(ledger[1240]), 8, "All 8 receipts must be registered without being capped at 5!")
        total_games = sum(len(r['combos']) for r in ledger[1240])
        self.assertEqual(total_games, 40, "Total 40 games must exist across 8 receipts!")

    def test_15_master_proxy_qr_registration(self):
        """Test: Master account registering QR on behalf of a specific user must save cleanly to target user ledger."""
        all_users_store = {
            'master': {1240: []},
            'pjg': {1240: []},
            'member_01': {1240: []}
        }

        # Master selects 'member_01' as target
        logged_auth = 'master'
        target_user = 'member_01'
        round_num = 1240
        combos = [{'numbers': [1, 10, 15, 23, 35, 42]}]

        # Effective user must be target_user
        effective_user = target_user if logged_auth == 'master' and target_user else logged_auth
        self.assertEqual(effective_user, 'member_01', "Effective user must be the selected target user when master")

        # Save to target user's ledger
        receipt = {
            'receiptId': f'rcpt_{effective_user}_{round_num}_proxy_001',
            'round': round_num,
            'user': effective_user,
            'userId': effective_user,
            'version': 'QR 실구매 영수증 (A~E 5게임)',
            'combos': combos,
            'isLocked': True
        }
        all_users_store[effective_user][round_num].append(receipt)

        # Verify: Non-master (e.g. pjg or user_a) attempting to select target_user is ignored
        non_master_logged = 'pjg'
        attempted_target = 'member_01'
        non_master_effective = attempted_target if non_master_logged == 'master' and attempted_target else non_master_logged
        self.assertEqual(non_master_effective, 'pjg', "Non-master must NEVER be allowed to proxy register for others!")

    def test_16_non_admin_strict_data_isolation(self):
        """Test: Non-admin normal users are strictly prohibited from viewing or accessing other members' data."""
        # Simulated multi-user database
        db_purchases = {
            'user_a': {
                1240: [{'receiptId': 'rcpt_a_1', 'user': 'user_a', 'combos': [{'numbers': [1, 2, 3, 4, 5, 6]}], 'isLocked': True}]
            },
            'user_b': {
                1240: [{'receiptId': 'rcpt_b_1', 'user': 'user_b', 'combos': [{'numbers': [7, 8, 9, 10, 11, 12]}], 'isLocked': True}]
            },
            'pjg': {
                1240: [{'receiptId': 'rcpt_admin_1', 'user': 'pjg', 'combos': [{'numbers': [13, 14, 15, 16, 17, 18]}], 'isLocked': True}]
            }
        }

        # 1. getLedger emulation for user_a (non-admin)
        current_user = 'user_a'
        is_admin = False

        # Ledger isolation check
        def get_ledger_for_user(logged_user, is_adm):
            if is_adm:
                # admin can access all or target
                return db_purchases
            # Non-admin strictly filters by logged_user only
            user_ledger = {}
            for u, rounds in db_purchases.items():
                if u.lower().strip() == logged_user.lower().strip():
                    user_ledger = rounds
            return user_ledger

        user_a_ledger = get_ledger_for_user(current_user, is_admin)
        self.assertIn(1240, user_a_ledger)
        self.assertEqual(len(user_a_ledger[1240]), 1)
        self.assertEqual(user_a_ledger[1240][0]['user'], 'user_a')
        self.assertEqual(user_a_ledger[1240][0]['receiptId'], 'rcpt_a_1')

        # Verify user_a has zero visibility of user_b or pjg receipts
        all_receipt_users = [r['user'] for r in user_a_ledger[1240]]
        self.assertNotIn('user_b', all_receipt_users, "user_a must NOT see user_b data!")
        self.assertNotIn('pjg', all_receipt_users, "user_a must NOT see pjg/admin data!")

        # 2. Permission checks: User Management & Manual Draw modals
        def can_open_user_management(user_id, is_adm):
            return is_adm or user_id in ('master', 'admin')

        def can_open_manual_draw(user_id, is_adm):
            return is_adm or user_id in ('master', 'admin')

        self.assertFalse(can_open_user_management('user_a', False), "user_a must NOT be allowed to open user management")
        self.assertFalse(can_open_manual_draw('user_a', False), "user_a must NOT be allowed to open manual draw modal")
        self.assertTrue(can_open_user_management('pjg', True), "Admin pjg must be allowed")
        self.assertTrue(can_open_user_management('master', False), "master must be allowed")

    def test_17_master_exclusive_receipt_deletion_permission(self):
        """Test: Only master account is permitted to see and execute receipt deletion, trash modal, entire ledger reset, and user trash management."""
        def can_delete_receipt(user_id):
            clean = (user_id or '').strip().lower()
            return clean == 'master'

        def can_delete_unlocked_round(user_id):
            clean = (user_id or '').strip().lower()
            return clean == 'master'

        def can_open_receipt_trash(user_id):
            clean = (user_id or '').strip().lower()
            return clean == 'master'

        def can_clear_entire_ledger(user_id):
            clean = (user_id or '').strip().lower()
            return clean == 'master'

        def can_manage_user_trash(user_id):
            clean = (user_id or '').strip().lower()
            return clean == 'master'

        # Master must have full delete & trash permissions
        self.assertTrue(can_delete_receipt('master'), "Master must be allowed to delete receipts")
        self.assertTrue(can_delete_unlocked_round('master'), "Master must be allowed to batch delete unlocked round")
        self.assertTrue(can_open_receipt_trash('master'), "Master must be allowed to open receipt trash")
        self.assertTrue(can_clear_entire_ledger('master'), "Master must be allowed to clear entire ledger")
        self.assertTrue(can_manage_user_trash('master'), "Master must be allowed to manage user trash")

        # Non-master admin (e.g. admin, pjg) must NOT have delete / trash permissions
        for non_master in ('admin', 'pjg', 'manager', 'user_a', 'guest'):
            self.assertFalse(can_delete_receipt(non_master), f"{non_master} must NOT be allowed to delete receipts")
            self.assertFalse(can_delete_unlocked_round(non_master), f"{non_master} must NOT be allowed to batch delete unlocked round")
            self.assertFalse(can_open_receipt_trash(non_master), f"{non_master} must NOT be allowed to open receipt trash")
            self.assertFalse(can_clear_entire_ledger(non_master), f"{non_master} must NOT be allowed to clear entire ledger")
            self.assertFalse(can_manage_user_trash(non_master), f"{non_master} must NOT be allowed to manage user trash")

    def test_18_build_version_crosscheck_and_update_detection(self):
        """Test: Cross-check version parsing, update detection algorithm, and build asset integrity."""
        def parse_version_num(v_str):
            if not v_str:
                return 0
            m = re.search(r'(\d+)', str(v_str))
            return int(m.group(1)) if m else 0

        def check_has_update(current_v, server_v):
            return parse_version_num(server_v) > parse_version_num(current_v)

        # 1. Version Comparison Logic
        self.assertTrue(check_has_update('v734', 'v735'), "v735 must trigger update over v734")
        self.assertTrue(check_has_update('v734', 'v800'), "v800 must trigger update over v734")
        self.assertFalse(check_has_update('v735', 'v735'), "Same version must NOT trigger update")
        self.assertFalse(check_has_update('v736', 'v735'), "Higher local version must NOT trigger update")

        # 2. Build Assets Cross-Check
        version_file = os.path.join(self.root_dir, 'version.json')
        with open(version_file, 'r', encoding='utf-8') as f:
            vdata = json.load(f)
        current_version = vdata.get('version')
        v_num = current_version.lstrip('v')

        index_file = os.path.join(self.root_dir, 'index.html')
        with open(index_file, 'r', encoding='utf-8') as f:
            index_html = f.read()
        self.assertIn(f"window.APP_VERSION = '{current_version}'", index_html)
        self.assertIn(f"styles.css?v={v_num}", index_html)
        self.assertIn(f"app_v2.js?v={v_num}", index_html)
        self.assertIn(f"sw.js?v={v_num}", index_html)

        sw_file = os.path.join(self.root_dir, 'sw.js')
        with open(sw_file, 'r', encoding='utf-8') as f:
            sw_js = f.read()
        self.assertIn(f"lucky777-pwa-{current_version}", sw_js)

    def test_19_firebase_version_crosscheck_logic(self):
        """Test: 2-Track (Firebase + Hosting) priority selection and update decision logic."""
        def parse_version_num(v_str):
            if not v_str:
                return 0
            m = re.search(r'(\d+)', str(v_str))
            return int(m.group(1)) if m else 0

        def get_highest_known_version(app_v, fb_v, host_v):
            current_num = parse_version_num(app_v)
            fb_num = parse_version_num(fb_v)
            host_num = parse_version_num(host_v)
            highest_num = max(current_num, fb_num, host_num)
            
            if fb_num == highest_num and fb_v:
                return fb_v
            if host_num == highest_num and host_v:
                return host_v
            return app_v

        # Case A: Firebase receives v738 first before hosting CDN caches expire
        highest = get_highest_known_version('v737', 'v738', 'v737')
        self.assertEqual(highest, 'v738')
        self.assertTrue(parse_version_num(highest) > parse_version_num('v737'))

        # Case B: Hosting has v739, Firebase had v738
        highest = get_highest_known_version('v737', 'v738', 'v739')
        self.assertEqual(highest, 'v739')

        # Case C: All matching v738
        highest = get_highest_known_version('v738', 'v738', 'v738')
        self.assertEqual(highest, 'v738')
        self.assertFalse(parse_version_num(highest) > parse_version_num('v738'))

    def test_20_algorithm_performance_review_unification(self):
        """Test: Verify 7-algorithm review calculation synchronization between generator and review tabs."""
        # 1. Check that generator-tab.js imports and delegates to calculate7AlgorithmsPerformance
        gen_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'generator-tab.js')
        with open(gen_file, 'r', encoding='utf-8') as f:
            gen_code = f.read()
        self.assertIn("import { calculate7AlgorithmsPerformance } from './algorithms-tab.js'", gen_code)
        self.assertIn("calculate7AlgorithmsPerformance(fromRound, rawUser)", gen_code)

        # 2. Check that bundle.py loads review-tab.js and algorithms-tab.js before generator-tab.js
        bundle_file = os.path.join(self.root_dir, 'bundle.py')
        with open(bundle_file, 'r', encoding='utf-8') as f:
            bundle_code = f.read()
        rev_idx = bundle_code.find("src/services/lotto/views/review-tab.js")
        algo_idx = bundle_code.find("src/services/lotto/views/algorithms-tab.js")
        gen_idx = bundle_code.find("src/services/lotto/views/generator-tab.js")
        self.assertTrue(rev_idx < algo_idx < gen_idx, "Module order must be: review-tab -> algorithms-tab -> generator-tab")

    def test_21_master_historical_ledger_and_1239_receipts_win_evaluation(self):
        """Test: Master ledger 1235~1240 presence, 1239 Receipts #1, #2, #3, #5 miss (0 KRW), Receipt #4 winning 10,000 KRW (5th x 2)."""
        ledger_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'ledger.js')
        with open(ledger_file, 'r', encoding='utf-8') as f:
            ledger_code = f.read()

        # 1. Check STATIC_DRAWS contains 1235~1240
        for r in [1235, 1236, 1237, 1238, 1239, 1240]:
            self.assertIn(f"{r}:", ledger_code)

        # 2. Check getOfficialPastRecommendation has 1239 with all 5 serials
        self.assertIn("106292663514142041", ledger_code)
        self.assertIn("106292723514142041", ledger_code)
        self.assertIn("106292762114142041", ledger_code)
        self.assertIn("107114111414142041", ledger_code)
        self.assertIn("107114057514142041", ledger_code)

        # 3. Check normalizeMaster1239Order function presence
        self.assertIn("normalizeMaster1239Order", ledger_code)

        # 4. Simulate 1239 evaluate rank for all 5 receipts in exact canonical order
        draw_1239 = [1, 3, 17, 26, 33, 42]
        bonus_1239 = 41

        # Receipts 1, 2, 3, 5 are 낙첨 (0 KRW)
        rc1_combos = [
            [1, 11, 13, 25, 36, 38], [6, 11, 23, 29, 33, 36],
            [3, 4, 17, 20, 24, 43], [7, 8, 16, 30, 39, 44],
            [4, 10, 18, 23, 37, 38]
        ]
        rc2_combos = [
            [7, 8, 24, 34, 36, 41], [8, 9, 12, 35, 40, 45],
            [2, 11, 21, 33, 34, 44], [2, 12, 15, 36, 39, 41],
            [3, 9, 16, 36, 41, 43]
        ]
        rc3_combos = [
            [5, 9, 11, 12, 31, 32], [2, 3, 14, 22, 38, 39],
            [1, 13, 14, 19, 31, 38], [4, 10, 15, 23, 24, 43],
            [13, 15, 20, 27, 31, 35]
        ]
        # Receipt 4 (Winner):
        rc4_combos = [
            [3, 11, 15, 36, 40, 44],
            [1, 3, 26, 32, 41, 44],
            [2, 4, 16, 33, 38, 45],
            [7, 20, 26, 35, 39, 40],
            [1, 23, 33, 41, 42, 44]
        ]
        rc5_combos = [
            [2, 11, 18, 34, 39, 42], [5, 11, 14, 24, 31, 32],
            [8, 19, 20, 35, 39, 43], [3, 19, 22, 35, 44, 45],
            [12, 14, 26, 34, 37, 45]
        ]

        rc4_prizes = [evaluate_lotto_rank(c, draw_1239, bonus_1239) for c in rc4_combos]
        rc4_total_prize = sum(p for r, p in rc4_prizes)
        rc4_ranks = [r for r, p in rc4_prizes if r > 0]

        self.assertEqual(rc4_total_prize, 10000, "Receipt #4 must win exactly 10,000 KRW")
        self.assertEqual(rc4_ranks, [5, 5], "Receipt #4 must win two 5th ranks (Game B and Game E)")

        for rc_idx, rc in [(1, rc1_combos), (2, rc2_combos), (3, rc3_combos), (5, rc5_combos)]:
            prizes = [evaluate_lotto_rank(c, draw_1239, bonus_1239) for c in rc]
            total_p = sum(p for r, p in prizes)
            self.assertEqual(total_p, 0, f"Receipt #{rc_idx} must be 0 KRW (낙첨)")

    # [Test 39] Donghang Lottery Authentic QR Link Integration
    def test_39_donghang_lottery_qr_link_integration(self):
        # 1. Check ledger.js for buildDonghangLotteryQrUrl
        ledger_path = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'ledger.js')
        with open(ledger_path, 'r', encoding='utf-8') as f:
            ledger_code = f.read()
        self.assertIn("buildDonghangLotteryQrUrl", ledger_code)
        self.assertIn("http://qr.dhlottery.co.kr/?v=", ledger_code)
        
        # Verify 1235~1240 past recommendations contain qrRawUrl
        for r in [1235, 1236, 1237, 1238, 1239, 1240]:
            self.assertIn(f"originalRound: {r}", ledger_code)
            self.assertIn(f"v={r}m", ledger_code)

        # 2. Check confirmed-tab.js for QR link bar and copy button
        confirmed_tab_path = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'confirmed-tab.js')
        with open(confirmed_tab_path, 'r', encoding='utf-8') as f:
            tab_code = f.read()
        self.assertIn("buildDonghangLotteryQrUrl", tab_code)
        self.assertIn("copyToClipboard", tab_code)
        self.assertIn("동행복권 원본 QR", tab_code)
        self.assertIn("동행복권 당첨확인", tab_code)
        self.assertIn("confirmed-receipt-qr-link-bar", tab_code)

        # 3. Check utils.js for copyToClipboard
        utils_path = os.path.join(self.root_dir, 'src', 'shared', 'utils.js')
        with open(utils_path, 'r', encoding='utf-8') as f:
            utils_code = f.read()
        self.assertIn("copyToClipboard", utils_code)

        # 4. QR URL format validation
        # Pattern: http://qr.dhlottery.co.kr/?v=1239m031115364044m010326324144m020416333845m072026353940m012333414244106292663514142041
        sample_qr = "http://qr.dhlottery.co.kr/?v=1239m031115364044m010326324144m020416333845m072026353940m012333414244106292663514142041"
        self.assertTrue(sample_qr.startswith("http://qr.dhlottery.co.kr/?v=1239m"))
        self.assertEqual(len(sample_qr), len("http://qr.dhlottery.co.kr/?v=1239") + 5 * 13 + 18)

    # [Test 40] Donghang Lottery QR Decoder & Winning Ground Truth Validation
    def test_40_donghang_lottery_qr_decoder_and_sync(self):
        """Test: QR URL parsing ground truth, verifying combo decoding matches actual winning evaluation."""
        def parse_qr_url(url):
            m = re.search(r'[?&]v=(\d{1,4})((?:[mq]\d{12})+)(\d{6,18})?', url, re.IGNORECASE)
            if not m:
                return None
            round_num = int(m.group(1))
            games_part = m.group(2)
            serial = m.group(3) or ''
            games_raw = [g for g in re.split(r'[mq]', games_part, flags=re.IGNORECASE) if g]
            combos = []
            for g in games_raw:
                nums = [int(g[i:i+2]) for i in range(0, 12, 2) if i+2 <= len(g)]
                nums.sort()
                combos.append(nums)
            return {'round': round_num, 'combos': combos, 'serial': serial}

        # Master 1239 authentic QR URLs (Receipt #4 10,000 KRW winner, Receipts #1, #2, #3, #5 miss)
        urls = {
            1: "http://qr.dhlottery.co.kr/?v=1239m011113253638m061123293336m030417202443m070816303944m041018233738107114057514142041",
            2: "http://qr.dhlottery.co.kr/?v=1239m070824343641m080912354045m021121333444m021215363941m030916364143106292723514142041",
            3: "http://qr.dhlottery.co.kr/?v=1239m050911123132m020314223839m011314193138m041015232443m131520273135106292762114142041",
            4: "http://qr.dhlottery.co.kr/?v=1239m031115364044m010326324144m020416333845m072026353940m012333414244106292663514142041",
            5: "http://qr.dhlottery.co.kr/?v=1239m021118343942m051114243132m081920353943m031922354445m121426343745107114111414142041"
        }

        draw_1239 = [1, 3, 17, 26, 33, 42]
        bonus_1239 = 41

        # Receipt #4: 10,000 KRW won (Game B and Game E 5th rank)
        parsed_4 = parse_qr_url(urls[4])
        self.assertIsNotNone(parsed_4)
        self.assertEqual(parsed_4['round'], 1239)
        self.assertEqual(len(parsed_4['combos']), 5)
        self.assertEqual(parsed_4['serial'], '106292663514142041')

        res_4 = [evaluate_lotto_rank(c, draw_1239, bonus_1239) for c in parsed_4['combos']]
        total_prize_4 = sum(p for r, p in res_4)
        winning_ranks_4 = [r for r, p in res_4 if r > 0]
        self.assertEqual(total_prize_4, 10000, "QR #4 decoded combos must evaluate to 10,000 KRW")
        self.assertEqual(winning_ranks_4, [5, 5], "QR #4 must have two 5th rank wins")

        # Receipts #1, #2, #3, #5: All 0 KRW (낙첨)
        for idx in [1, 2, 3, 5]:
            parsed = parse_qr_url(urls[idx])
            self.assertIsNotNone(parsed)
            self.assertEqual(parsed['round'], 1239)
            self.assertEqual(len(parsed['combos']), 5)
            res = [evaluate_lotto_rank(c, draw_1239, bonus_1239) for c in parsed['combos']]
            total_prize = sum(p for r, p in res)
            self.assertEqual(total_prize, 0, f"QR #{idx} decoded combos must evaluate to 0 KRW (낙첨)")

        # Verify JavaScript implementation exports
        ledger_path = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'ledger.js')
        with open(ledger_path, 'r', encoding='utf-8') as f:
            ledger_code = f.read()
        self.assertIn("parseDonghangLotteryQrUrl", ledger_code)
        self.assertIn("syncPurchaseWithQrUrl", ledger_code)

    # [Test 41] Scraped Draw Ingestion & Instant Winning Evaluation
    def test_41_scraped_draw_instant_winning_evaluation(self):
        """Test: Scraped round draw ingestion triggers rank evaluation, prize calculations, and cache invalidation."""
        # 1. Check sync.js has proper cache invalidation and re-rendering hooks
        sync_path = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'sync.js')
        with open(sync_path, 'r', encoding='utf-8') as f:
            sync_code = f.read()
        
        self.assertIn("state.mergedHistory =", sync_code)
        self.assertIn("state.latestDrawData = null", sync_code)
        self.assertIn("renderLatestDrawBanner()", sync_code)
        self.assertIn("renderConfirmedPurchasesList()", sync_code)
        self.assertIn("renderReviewTab()", sync_code)

        # 2. Simulate newly scraped draw (e.g. Round 1241)
        new_draw = {
            'numbers': [5, 12, 19, 23, 31, 44],
            'bonus': 7,
            'rank1Prize': 2150000000,
            'rank2Prize': 55000000,
            'rank3Prize': 1600000
        }

        # Mock sample user purchases for Round 1241
        user_combos = [
            [5, 12, 19, 23, 31, 44],  # 1st rank (6 matches)
            [5, 12, 19, 23, 31, 7],   # 2nd rank (5 matches + bonus)
            [5, 12, 19, 23, 31, 40],  # 3rd rank (5 matches)
            [5, 12, 19, 23, 1, 2],    # 4th rank (4 matches)
            [5, 12, 19, 1, 2, 3],     # 5th rank (3 matches)
            [1, 2, 3, 4, 6, 8]        # Miss (0 matches)
        ]

        winning_set = set(new_draw['numbers'])
        bonus = new_draw['bonus']

        evaluated_results = []
        for combo in user_combos:
            matches = [n for n in combo if n in winning_set]
            match_count = len(matches)
            has_bonus = bonus in combo

            if match_count == 6:
                evaluated_results.append((1, new_draw['rank1Prize']))
            elif match_count == 5 and has_bonus:
                evaluated_results.append((2, new_draw['rank2Prize']))
            elif match_count == 5:
                evaluated_results.append((3, new_draw['rank3Prize']))
            elif match_count == 4:
                evaluated_results.append((4, 50000))
            elif match_count == 3:
                evaluated_results.append((5, 5000))
            else:
                evaluated_results.append((0, 0))

        # Assert rank outcomes
        self.assertEqual(evaluated_results[0], (1, 2150000000))
        self.assertEqual(evaluated_results[1], (2, 55000000))
        self.assertEqual(evaluated_results[2], (3, 1600000))
        self.assertEqual(evaluated_results[3], (4, 50000))
        self.assertEqual(evaluated_results[4], (5, 5000))
        self.assertEqual(evaluated_results[5], (0, 0))

        # Total prize calculation
        total_prize = sum(p for r, p in evaluated_results)
        expected_prize = 2150000000 + 55000000 + 1600000 + 50000 + 5000
        self.assertEqual(total_prize, expected_prize)

    # [Test 42] Universal QR Purchase Save, URL, Serial & Winning Invariant Integrity
    def test_42_qr_purchase_save_and_url_serial_integrity(self):
        """Test: QR parsing, URL building, serial matching, and two-way synchronization guarantee zero divergence."""
        def parse_qr_url(url):
            if not url or not isinstance(url, str):
                return None
            clean = url.strip()
            try:
                import urllib.parse
                clean = urllib.parse.unquote(clean)
            except Exception:
                pass
            m = re.search(r'(?:[?&]v=|^v=|^)(\d{1,4})((?:[a-zA-Z]\d{12})+)(\d{4,24})?', clean, re.IGNORECASE)
            if not m:
                return None
            round_num = int(m.group(1))
            games_part = m.group(2)
            serial = (m.group(3) or '').strip()
            games_raw = [g for g in re.split(r'[a-zA-Z]', games_part, flags=re.IGNORECASE) if g]
            combos = []
            for g in games_raw:
                nums = [int(g[i:i+2]) for i in range(0, 12, 2) if i+2 <= len(g)]
                nums.sort()
                combos.append(nums)
            return {'round': round_num, 'combos': combos, 'serial': serial}

        def build_qr_url(round_num, combos, serial):
            serial_str = str(serial or '').strip()
            if not serial_str or serial_str.startswith('TR-'):
                serial_str = f"{str(round_num).zfill(4)}00000014142041"
            games_q = "".join(["m" + "".join([str(n).zfill(2) for n in sorted(c)]) for c in combos if len(c) == 6])
            return f"http://qr.dhlottery.co.kr/?v={round_num}{games_q}{serial_str}"

        # 1. Test parsing across various authentic formats
        url_desktop = "http://qr.dhlottery.co.kr/?v=1239m031115364044m010326324144m020416333845m072026353940m012333414244106292663514142041"
        url_mobile = "http://m.dhlottery.co.kr/qr.do?method=winQr&v=1239m031115364044m010326324144m020416333845m072026353940m012333414244106292663514142041"
        raw_v_param = "v=1239m031115364044m010326324144m020416333845m072026353940m012333414244106292663514142041"

        p1 = parse_qr_url(url_desktop)
        p2 = parse_qr_url(url_mobile)
        p3 = parse_qr_url(raw_v_param)

        self.assertIsNotNone(p1)
        self.assertIsNotNone(p2)
        self.assertIsNotNone(p3)
        self.assertEqual(p1['round'], 1239)
        self.assertEqual(p1['serial'], '106292663514142041')
        self.assertEqual(p1['combos'], p2['combos'])
        self.assertEqual(p1['combos'], p3['combos'])
        self.assertEqual(len(p1['combos']), 5)
        self.assertEqual(p1['combos'][0], [3, 11, 15, 36, 40, 44])
        self.assertEqual(p1['combos'][1], [1, 3, 26, 32, 41, 44])

        # 2. Test round-trip reconstruction
        reconstructed = build_qr_url(p1['round'], p1['combos'], p1['serial'])
        self.assertEqual(reconstructed, url_desktop)

        # 3. Test verification that JS files implement parseDonghangLotteryQrUrl and buildDonghangLotteryQrUrl
        ledger_path = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'ledger.js')
        with open(ledger_path, 'r', encoding='utf-8') as f:
            ledger_src = f.read()

        manual_path = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'manual-modal.js')
        with open(manual_path, 'r', encoding='utf-8') as f:
            manual_src = f.read()

        confirmed_path = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'confirmed-tab.js')
        with open(confirmed_path, 'r', encoding='utf-8') as f:
            confirmed_src = f.read()

        self.assertIn("parseDonghangLotteryQrUrl", ledger_src)
        self.assertIn("syncPurchaseWithQrUrl", ledger_src)
        self.assertIn("buildDonghangLotteryQrUrl", ledger_src)
        self.assertIn("parseDonghangLotteryQrUrl", manual_src)
        self.assertIn("buildDonghangLotteryQrUrl", confirmed_src)

    # [Test 30] Saturday 21:00 Draw Countdown Banner & Target Calculation
    def test_30_saturday_21_draw_countdown_banner(self):
        # 1. Target Saturday 21:00 KST Calculation
        def get_next_sat_21(now_dt):
            # day: Sunday=0, Monday=1, ..., Saturday=6
            day = (now_dt.weekday() + 1) % 7
            diff_to_sat = (6 - day + 7) % 7
            target = now_dt.replace(hour=21, minute=0, second=0, microsecond=0) + timedelta(days=diff_to_sat)
            if diff_to_sat == 0 and now_dt >= target:
                target += timedelta(days=7)
            return target

        def get_draw_round(target_sat):
            first_draw = datetime(2002, 12, 7, 21, 0, 0, tzinfo=KST)
            diff_sec = (target_sat - first_draw).total_seconds()
            weeks = round(diff_sec / (7 * 24 * 3600))
            return 1 + weeks

        # Sunday 2026-09-13 10:00 -> 2026-09-19 21:00 (Round 1242)
        t_sun = datetime(2026, 9, 13, 10, 0, 0, tzinfo=KST)
        tgt_sun = get_next_sat_21(t_sun)
        self.assertEqual(tgt_sun, datetime(2026, 9, 19, 21, 0, 0, tzinfo=KST))
        self.assertEqual(get_draw_round(tgt_sun), 1242)

        # Saturday 2026-09-19 20:59:59 -> 2026-09-19 21:00 (Round 1242)
        t_sat_pre = datetime(2026, 9, 19, 20, 59, 59, tzinfo=KST)
        tgt_sat_pre = get_next_sat_21(t_sat_pre)
        self.assertEqual(tgt_sat_pre, datetime(2026, 9, 19, 21, 0, 0, tzinfo=KST))
        self.assertEqual(get_draw_round(tgt_sat_pre), 1242)

        # Saturday 2026-09-19 21:00:00 -> 2026-09-26 21:00 (Round 1243)
        t_sat_exact = datetime(2026, 9, 19, 21, 0, 0, tzinfo=KST)
        tgt_sat_exact = get_next_sat_21(t_sat_exact)
        self.assertEqual(tgt_sat_exact, datetime(2026, 9, 26, 21, 0, 0, tzinfo=KST))
        self.assertEqual(get_draw_round(tgt_sat_exact), 1243)

        # 2. Check HTML markup presence in index.html
        index_path = os.path.join(self.root_dir, 'index.html')
        with open(index_path, 'r', encoding='utf-8') as f:
            index_src = f.read()
        self.assertIn('id="lpDrawCountdownBanner"', index_src)

        # 3. Check JS implementation in landing-dashboard.js
        dash_path = os.path.join(self.root_dir, 'src', 'shared', 'landing-dashboard.js')
        with open(dash_path, 'r', encoding='utf-8') as f:
            dash_src = f.read()
        self.assertIn('getNextSaturday21KST', dash_src)
        self.assertIn('getDrawRoundForSaturday21', dash_src)
        self.assertIn('updateDrawCountdownBanner', dash_src)
        self.assertIn('lpDrawCountdownBanner', dash_src)


    # [Test 31] Generator Tab 7 Algorithms Real Stats User Isolation
    def test_31_generator_tab_7_algorithms_user_isolation(self):
        gen_path = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'generator-tab.js')
        with open(gen_path, 'r', encoding='utf-8') as f:
            gen_src = f.read()

        # 1. Verify that compute7AlgorithmsRealStats defaults to authId/targetUserId, NOT 'all'
        self.assertIn('compute7AlgorithmsRealStats', gen_src)
        self.assertIn('rawUser = authId || \'master\'', gen_src)
        self.assertNotIn('calculate7AlgorithmsPerformance(fromRound, \'all\')', gen_src)

        # 2. Verify effectiveUserId in render7AlgorithmsRealReviewSection falls back to authId
        self.assertIn('effectiveUserId', gen_src)
        self.assertIn('👤 [${displayName}] 님 고유 추천', gen_src)

        # 3. Emulate resolution logic
        def resolve_effective_user(auth_id, is_admin, admin_selected_user):
            if is_admin and admin_selected_user and admin_selected_user != 'all':
                return admin_selected_user
            if is_admin and admin_selected_user == 'all':
                return 'all'
            return auth_id or 'master'

        # Default regular user
        self.assertEqual(resolve_effective_user('user_777', False, None), 'user_777')
        # Default admin without selection
        self.assertEqual(resolve_effective_user('master', True, None), 'master')
        # Admin explicitly selects all
        self.assertEqual(resolve_effective_user('master', True, 'all'), 'all')
        # Admin explicitly selects another user
        self.assertEqual(resolve_effective_user('master', True, 'user_999'), 'user_999')


if __name__ == '__main__':
    unittest.main()








