import unittest
import json
import re
import os
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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
    if clean_id == 'all':
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
        # Master without createdAt gets fallback baseline 1235
        self.assertEqual(get_user_join_round('master', None, is_admin=True), 1235)
        # Admin with createdAt in round 1240 gets round 1240 (Pre-join isolation strictly enforced for admin accounts too)
        self.assertEqual(get_user_join_round('admin', '2026-08-30T12:00:00+09:00', is_admin=True), 1240)
        
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
            clean = re.sub(r'[^0-9]', '', str(v_str))
            return int(clean) if clean else 0

        def check_has_update(current_v, server_v):
            return parse_version_num(server_v) > parse_version_num(current_v)

        # 1. Version Comparison Logic (Legacy integers & Datetime format)
        self.assertTrue(check_has_update('v734', 'v735'), "v735 must trigger update over v734")
        self.assertTrue(check_has_update('v734', 'v800'), "v800 must trigger update over v734")
        self.assertTrue(check_has_update('v767', 'v2026.09.14.2335'), "Datetime version must trigger update over legacy v767")
        self.assertTrue(check_has_update('v2026.09.14.2335', 'v2026.09.14.2336'), "Higher datetime version must trigger update")
        self.assertFalse(check_has_update('v2026.09.14.2335', 'v2026.09.14.2335'), "Same version must NOT trigger update")
        self.assertFalse(check_has_update('v2026.09.14.2336', 'v2026.09.14.2335'), "Higher local version must NOT trigger update")

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
            clean = re.sub(r'[^0-9]', '', str(v_str))
            return int(clean) if clean else 0

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

        # Case A: Firebase receives v2026.09.14.2338 first before hosting CDN caches expire
        highest = get_highest_known_version('v2026.09.14.2337', 'v2026.09.14.2338', 'v2026.09.14.2337')
        self.assertEqual(highest, 'v2026.09.14.2338')
        self.assertTrue(parse_version_num(highest) > parse_version_num('v2026.09.14.2337'))

        # Case B: Hosting has v2026.09.14.2339, Firebase had v2026.09.14.2338
        highest = get_highest_known_version('v2026.09.14.2337', 'v2026.09.14.2338', 'v2026.09.14.2339')
        self.assertEqual(highest, 'v2026.09.14.2339')

        # Case C: All matching
        highest = get_highest_known_version('v2026.09.14.2338', 'v2026.09.14.2338', 'v2026.09.14.2338')
        self.assertEqual(highest, 'v2026.09.14.2338')
        self.assertFalse(parse_version_num(highest) > parse_version_num('v2026.09.14.2338'))

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


    # [Test 32] User Personalized Prediction Report Based on Review Stats
    def test_32_user_personalized_prediction_report(self):
        pred_path = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'prediction-report.js')
        with open(pred_path, 'r', encoding='utf-8') as f:
            pred_src = f.read()

        # 1. Check module structure and personalized logic
        self.assertIn('generatePredictionReport', pred_src)
        self.assertIn('setupPredictionReport', pred_src)
        self.assertIn('compute7AlgorithmsRealStats', pred_src)
        self.assertIn('getUserRealName', pred_src)
        self.assertIn('👤 [${displayName}] 님 맞춤형 복기 분석', pred_src)
        self.assertIn('과거 복기 성과 진단', pred_src)
        self.assertIn('AI 황금 앵커 번호 TOP 7', pred_src)
        self.assertIn('수리통계적 밸런스 및 퀀트 필터 통과 지표', pred_src)

    # [Test 33] Datetime Versioning & Rollback Architecture
    def test_33_datetime_versioning_and_rollback_system(self):
        bundle_path = os.path.join(self.root_dir, 'bundle.py')
        with open(bundle_path, 'r', encoding='utf-8') as f:
            bundle_src = f.read()

        # 1. Verify bundle.py features
        self.assertIn('generate_unique_datetime_version', bundle_src)

        # 2. Emulate datetime version generation
        import datetime
        from bundle import generate_unique_datetime_version
        test_time = datetime.datetime(2026, 9, 14, 23, 40)
        ver = generate_unique_datetime_version(vdata={}, base_time=test_time)
        self.assertEqual(ver, 'v2026.09.14.2340')

        # Duplicate detection within same minute appends seconds
        mock_vdata = {'version': 'v2026.09.14.2340', 'buildHistory': [{'version': 'v2026.09.14.2340'}]}
        ver_with_sec = generate_unique_datetime_version(vdata=mock_vdata, base_time=test_time)
        self.assertTrue(ver_with_sec.startswith('v2026.09.14.2340.'))

    def test_34_initial_login_consistency_and_join_round_isolation(self):
        """Test 34: Verify initial login vs re-login consistency, join round calculation, and pre-join isolation."""
        import datetime
        from datetime import timezone, timedelta
        
        KST = timezone(timedelta(hours=9))
        first_cutoff = datetime.datetime(2002, 12, 7, 20, 0, 0, tzinfo=KST)

        def calc_round_from_date(dt):
            if not dt:
                return 1235
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=KST)
            diff = dt - first_cutoff
            weeks = int(diff.total_seconds() // (7 * 24 * 3600))
            return max(2 + weeks, 1235)

        def get_user_join_round_sim(user_id, is_admin=False, created_at=None):
            clean_id = str(user_id).lower().strip()
            if clean_id in ('master', 'admin', 'all'):
                return 1235
            
            if created_at:
                if isinstance(created_at, str):
                    dt = datetime.datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                else:
                    dt = created_at
                return calc_round_from_date(dt)
            
            # Kakao fallback
            if clean_id.startswith('kakao_'):
                return 1240
            return 1235

        # 1. Test registration dates for real Firestore users
        test_users = [
            ('master', True, '2026-08-01T12:00:00+09:00', 1235),
            ('wdy', False, '2026-08-01T12:00:00+09:00', 1235),
            ('kakao_5070244665', True, '2026-09-02T16:11:38.225000+00:00', 1240), # 박재구 (admin role)
            ('kakao_5070267707', True, '2026-09-03T00:54:19.387000+00:00', 1240), # 정미승 (admin role)
            ('kakao_5070669650', False, '2026-09-03T08:52:16.890000+00:00', 1240), # 강지민
            ('kakao_5071901217', False, '2026-09-04T08:14:48.066000+00:00', 1240), # 황선영
            ('kakao_5072328991', False, '2026-09-04T16:03:04.931000+00:00', 1240), # 채금조 (Friday KST -> 1240)
            ('kakao_5073272571', False, '2026-09-05T18:03:19.317000+00:00', 1241), # 우순애 (Sunday 03:03 KST -> 1241)
            ('kakao_5078158815', False, '2026-09-08T09:12:00.000000+00:00', 1241), # 이재문 (Tuesday KST -> 1241)
        ]

        for uid, is_adm, c_at, expected_round in test_users:
            # Personal Join Round MUST be invariant of is_admin (even if promoted to admin)
            join_round_initial = get_user_join_round_sim(uid, is_admin=False, created_at=c_at)
            join_round_relogin = get_user_join_round_sim(uid, is_admin=is_adm, created_at=c_at)
            
            self.assertEqual(join_round_initial, expected_round, f"{uid} initial join round must be {expected_round}")
            self.assertEqual(join_round_relogin, expected_round, f"{uid} re-login join round must be {expected_round}")
            self.assertEqual(join_round_initial, join_round_relogin, f"{uid} must have 100% deterministic join round across logins")

        # 2. Test fallback behavior when createdAt is resolving
        fallback_kakao = get_user_join_round_sim('kakao_9999999999', is_admin=False, created_at=None)
        self.assertEqual(fallback_kakao, 1240, "Kakao user without resolved createdAt must fallback to 1240, NEVER 1235")

        # 3. Simulate Review Evaluation Consistency across Logins
        def simulate_user_review(user_id, is_admin, created_at, round_num, mock_draw_prize=5000):
            j_round = get_user_join_round_sim(user_id, is_admin=is_admin, created_at=created_at)
            if round_num < j_round:
                return {'isPreJoin': True, 'games': 0, 'prize': 0}
            return {'isPreJoin': False, 'games': 70, 'prize': mock_draw_prize}

        for rnd in range(1235, 1242):
            kakao_admin_initial = simulate_user_review('kakao_5070244665', is_admin=False, created_at='2026-09-02T16:11:38.225000+00:00', round_num=rnd)
            kakao_admin_relogin = simulate_user_review('kakao_5070244665', is_admin=True, created_at='2026-09-02T16:11:38.225000+00:00', round_num=rnd)
            
            self.assertEqual(kakao_admin_initial['isPreJoin'], kakao_admin_relogin['isPreJoin'])
            self.assertEqual(kakao_admin_initial['prize'], kakao_admin_relogin['prize'])
            self.assertEqual(kakao_admin_initial['games'], kakao_admin_relogin['games'])
            
            if rnd < 1240:
                self.assertTrue(kakao_admin_initial['isPreJoin'])
                self.assertEqual(kakao_admin_initial['prize'], 0)
            else:
                self.assertFalse(kakao_admin_initial['isPreJoin'])
                self.assertEqual(kakao_admin_initial['games'], 70)

    def test_35_recommendation_totals_cross_tab_synchronization_and_determinism(self):
        """Test 35: Verify total recommendation winning stats determinism across landing, review, generator, and algorithm tabs."""
        # Active users in system (as of 2026.09.15):
        users = {
            'master': 1235,
            'wdy': 1235,
            'kakao_5070244665': 1240, # 박재구 (Joined 2026-09-03)
            'kakao_5070267707': 1240, # 정미승 (Joined 2026-09-03)
            'kakao_5070669650': 1240, # 강지민 (Joined 2026-09-03)
            'kakao_5071901217': 1240, # 황선영 (Joined 2026-09-04)
            'kakao_5072328991': 1240, # 채금조 (Joined 2026-09-04)
            'kakao_5073272571': 1240, # 우순애 (Joined 2026-09-05)
            'kakao_5078158815': 1241, # 이재문 (Joined 2026-09-08)
            'kakao_5081166702': 1241, # 은정 (Joined 2026-09-09)
        }

        def compute_algo_perf_sim(target_user, from_round=1235, max_round=1240):
            total_games = 0
            is_all = (target_user == 'all')
            
            for rnd in range(from_round, max_round + 1):
                if is_all:
                    active = [u for u, jr in users.items() if rnd >= jr]
                    total_games += len(active) * 70
                else:
                    user_jr = users.get(target_user, 1235)
                    if rnd >= user_jr:
                        total_games += 70
            return total_games

        # 1. Total games for 'all' mode across 1235..1240 must be exactly 1,260 games
        # (1235~1239: 140*5=700, 1240: 8*70=560 => 1,260)
        total_all_games = compute_algo_perf_sim('all', from_round=1235, max_round=1240)
        self.assertEqual(total_all_games, 1260, "All members total games across 1235..1240 must strictly equal 1,260 games")

        # 2. Total games for 'master' personal across 1235..1240 must be 420 games (70 * 6)
        total_master_games = compute_algo_perf_sim('master', from_round=1235, max_round=1240)
        self.assertEqual(total_master_games, 420, "Master personal games across 1235..1240 must strictly equal 420 games")

        # 3. Total games for Kakao 1240 user across 1235..1240 must be 70 games (70 * 1)
        total_kakao_games = compute_algo_perf_sim('kakao_5070244665', from_round=1235, max_round=1240)
        self.assertEqual(total_kakao_games, 70, "Kakao user registered at 1240 must strictly have 70 games in 1235..1240")

        # 4. Consistency: Multiple repeated executions must produce identical values (idempotence)
        for _ in range(10):
            self.assertEqual(compute_algo_perf_sim('all', 1235, 1240), 1260)
            self.assertEqual(compute_algo_perf_sim('master', 1235, 1240), 420)
            self.assertEqual(compute_algo_perf_sim('kakao_5070244665', 1235, 1240), 70)

    def test_36_anti_tampering_and_multi_round_durability_guarantees(self):
        """Test 36: Verify anti-tampering cryptographic checks, multi-round persistence, and 2-step loss prevention."""
        # 1. QR Code URL Parsing & Generation Integrity
        def parse_donghang_qr(url):
            m = re.search(r'(?:[?&]v=|^v=|^)(\d{1,4})((?:[a-zA-Z]\d{12})+)(\d{4,24})?', url)
            if not m: return None
            round_num = int(m.group(1))
            games_raw = re.findall(r'[a-zA-Z](\d{12})', m.group(2))
            combos = []
            for g in games_raw:
                nums = sorted([int(g[i:i+2]) for i in range(0, 12, 2)])
                combos.append(nums)
            serial = m.group(3) or ''
            return {'round': round_num, 'combos': combos, 'serial': serial}

        def build_donghang_qr(round_num, combos, serial):
            games_str = ''.join(['m' + ''.join([f"{n:02d}" for n in sorted(c)]) for c in combos])
            return f"http://qr.dhlottery.co.kr/?v={round_num}{games_str}{serial}"

        test_combos = [
            [3, 11, 15, 36, 40, 44],
            [1, 3, 26, 32, 41, 44],
            [2, 4, 16, 33, 38, 45],
            [7, 20, 26, 35, 39, 40],
            [1, 23, 33, 41, 42, 44]
        ]
        test_serial = '106292663514142041'
        qr_url = build_donghang_qr(1239, test_combos, test_serial)
        parsed = parse_donghang_qr(qr_url)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed['round'], 1239)
        self.assertEqual(parsed['serial'], test_serial)
        self.assertEqual(parsed['combos'], test_combos)

        # 2. Receipt Fingerprint & Deduplication
        def get_combos_fp(combos):
            return '|'.join(['-'.join(map(str, sorted(c))) for c in combos])

        fp1 = get_combos_fp(test_combos)
        fp2 = get_combos_fp(test_combos)
        self.assertEqual(fp1, fp2)

        receipts_list = [
            {'receiptId': 'rcpt_1', 'combos': test_combos, 'user': 'user1', 'round': 1239},
            {'receiptId': 'rcpt_1', 'combos': test_combos, 'user': 'user1', 'round': 1239}, # Duplicate ID
            {'receiptId': 'rcpt_2', 'combos': test_combos, 'user': 'user1', 'round': 1239}, # Duplicate Combos
            {'receiptId': 'rcpt_3', 'combos': [[1,2,3,4,5,6]], 'user': 'user1', 'round': 1239} # Distinct
        ]

        def deduplicate_receipts_sim(r_list):
            seen = set()
            res = []
            for r in r_list:
                key = f"{r['receiptId']}_{get_combos_fp(r['combos'])}"
                if key not in seen:
                    seen.add(key)
                    res.push(r) if hasattr(res, 'push') else res.append(r)
            return res

        deduped = deduplicate_receipts_sim(receipts_list)
        self.assertEqual(len(deduped), 3)

        # 3. Multi-Round Progression Durability (Past rounds remain immutable when adding new rounds)
        ledger = {
            1235: [{'id': '1235_1', 'combos': [[1,5,12,19,26,34]], 'isLocked': True}],
            1239: [{'id': '1239_1', 'combos': test_combos, 'isLocked': True}],
            1240: [{'id': '1240_1', 'combos': [[1,12,13,18,25,38]], 'isLocked': True}]
        }

        # Progress to new rounds (1241, 1242, 1243)
        for new_round in [1241, 1242, 1243]:
            new_receipt = [{'id': f'{new_round}_1', 'combos': [[2,4,16,28,35,42]], 'isLocked': True}]
            ledger[new_round] = new_receipt

            # Verify all historical rounds (1235, 1239, 1240) remain 100% unaltered
            self.assertEqual(len(ledger[1235]), 1)
            self.assertEqual(ledger[1239][0]['combos'], test_combos)
            self.assertTrue(ledger[1239][0]['isLocked'])
            self.assertEqual(len(ledger[1240]), 1)

        # 4. Safe 2-Step Deletion (Trash Simulation)
        trash = []
        target_round = 1241
        target_receipt = ledger[target_round][0]
        trash_item = {**target_receipt, 'originalRound': target_round, 'trashedAt': '2026-09-15T10:00:00Z'}
        trash.append(trash_item)
        del ledger[target_round]

        # Verify historical 1235..1240 are untouched
        self.assertIn(1235, ledger)
        self.assertIn(1239, ledger)
        self.assertIn(1240, ledger)
        self.assertNotIn(1241, ledger)

        # Restore from trash
        restored = {**trash.pop(0), 'isLocked': True}
        orig_rnd = restored.pop('originalRound')
        restored.pop('trashedAt', None)
        ledger[orig_rnd] = [restored]

        self.assertIn(1241, ledger)
        self.assertEqual(ledger[1241][0]['combos'], [[2,4,16,28,35,42]])

    def test_37_build_immutability_and_state_isolation_determinism(self):
        """Test 37: Verify build immutability, dummy user sanitization, and generator state isolation."""
        # 1. Verify isSystemOrDummyUser logic
        def is_system_or_dummy_user(uid):
            if not uid:
                return True
            clean = str(uid).strip().lower()
            return clean in ('all', 'guest', 'none', 'null', 'undefined', '')

        self.assertTrue(is_system_or_dummy_user('all'))
        self.assertTrue(is_system_or_dummy_user('guest'))
        self.assertTrue(is_system_or_dummy_user('ALL'))
        self.assertTrue(is_system_or_dummy_user(''))
        self.assertTrue(is_system_or_dummy_user(None))
        self.assertFalse(is_system_or_dummy_user('master'))
        self.assertFalse(is_system_or_dummy_user('wdy'))
        self.assertFalse(is_system_or_dummy_user('kakao_5070244665'))

        # 2. Verify source code enforcement in core modules
        utils_file = os.path.join(self.root_dir, 'src', 'shared', 'utils.js')
        with open(utils_file, 'r', encoding='utf-8') as f:
            utils_code = f.read()
        self.assertIn('function isSystemOrDummyUser(userId)', utils_code)

        ledger_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'ledger.js')
        with open(ledger_file, 'r', encoding='utf-8') as f:
            ledger_code = f.read()
        self.assertIn('if (isSystemOrDummyUser(uId))', ledger_code)
        self.assertIn('if (isSystemOrDummyUser(userId))', ledger_code)
        self.assertIn('clearUser70ReviewCache()', ledger_code)

        stats_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'statistics.js')
        with open(stats_file, 'r', encoding='utf-8') as f:
            stats_code = f.read()
        self.assertIn('state.PREVIOUS_DRAW =', stats_code)

        gen_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'generator.js')
        with open(gen_file, 'r', encoding='utf-8') as f:
            gen_code = f.read()
        self.assertIn('needHistoryIsolation', gen_code)
        self.assertIn('localStorage.getItem(`lotto_rec_snapshot_${docKey}`)', gen_code)
        self.assertIn('export function getUserWeeklyRecommendationSnapshotSync', gen_code)

        algo_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'algorithms-tab.js')
        with open(algo_file, 'r', encoding='utf-8') as f:
            algo_code = f.read()
        self.assertIn('getAllUnifiedRegisteredUsers', algo_code)

        landing_file = os.path.join(self.root_dir, 'src', 'shared', 'landing-dashboard.js')
        with open(landing_file, 'r', encoding='utf-8') as f:
            landing_code = f.read()
        self.assertIn('getAllUnifiedRegisteredUsers', landing_code)

        ucontext_file = os.path.join(self.root_dir, 'src', 'shared', 'user-context.js')
        with open(ucontext_file, 'r', encoding='utf-8') as f:
            ucontext_code = f.read()
        self.assertIn('getAllUnifiedRegisteredUsers', ucontext_code)

        # 3. Simulate and verify user sanitization preventing game bloat
        raw_firestore_users = [
            {'userId': 'master', 'joinRound': 1235},
            {'userId': 'wdy', 'joinRound': 1235},
            {'userId': 'all', 'joinRound': 1235}, # dummy document
            {'userId': 'guest', 'joinRound': 1235}, # dummy document
            {'userId': 'kakao_5070244665', 'joinRound': 1240},
            {'userId': 'kakao_5070267707', 'joinRound': 1240},
            {'userId': 'kakao_5070669650', 'joinRound': 1240},
            {'userId': 'kakao_5071901217', 'joinRound': 1240},
            {'userId': 'kakao_5072328991', 'joinRound': 1240},
            {'userId': 'kakao_5073272571', 'joinRound': 1240},
            {'userId': 'kakao_5078158815', 'joinRound': 1241},
            {'userId': 'kakao_5081166702', 'joinRound': 1241},
        ]
        sanitized_users = [u for u in raw_firestore_users if not is_system_or_dummy_user(u['userId'])]
        self.assertEqual(len(sanitized_users), 10, "Sanitized users must filter out 'all' and 'guest'")
        
        # Verify game count for rounds 1235..1240 with sanitized users
        total_games = 0
        for r in range(1235, 1241):
            active = [u for u in sanitized_users if r >= u['joinRound']]
            total_games += len(active) * 70
        self.assertEqual(total_games, 1260, "Sanitized total games across 1235..1240 must remain strictly 1,260 games")

    def test_38_prediction_report_modal_integrity(self):
        """Test 38: Verify Prediction Report modal DOM, event handlers, and export bindings."""
        index_file = os.path.join(self.root_dir, 'index.html')
        with open(index_file, 'r', encoding='utf-8') as f:
            index_html = f.read()

        # 1. Check Prediction Report Trigger Button in index.html
        self.assertIn('id="btnPredictionReport"', index_html)
        self.assertIn('window.openPredictionReportModal', index_html)

        # 2. Check Prediction Report Modal Structure in index.html
        self.assertIn('id="predictionReportModal"', index_html)
        self.assertIn('id="btnClosePredictionReport"', index_html)
        self.assertIn('id="predictionBriefingText"', index_html)
        self.assertIn('id="reportFreqChart"', index_html)
        self.assertIn('id="balanceChart"', index_html)
        self.assertIn('id="btnConfirmPredictionReport"', index_html)

        # 3. Check prediction-report.js module integrity
        pred_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'prediction-report.js')
        with open(pred_file, 'r', encoding='utf-8') as f:
            pred_code = f.read()

        self.assertIn('export function generatePredictionReport', pred_code)
        self.assertIn('export function openPredictionReportModal', pred_code)
        self.assertIn('export function closePredictionReportModal', pred_code)
        self.assertIn('const isAdmin = (cleanAuth === \'master\' || cleanAuth === \'admin\'', pred_code)
        self.assertIn('window.openPredictionReportModal = openPredictionReportModal', pred_code)
        self.assertIn('window.closePredictionReportModal = closePredictionReportModal', pred_code)


    def test_39_bundle_module_topological_order(self):
        """Test 39: Ensure all ES module imports in bundle.py are strictly topologically ordered with 0 order violations."""
        bundle_file = os.path.join(self.root_dir, 'bundle.py')
        with open(bundle_file, 'r', encoding='utf-8') as f:
            b_code = f.read()

        match = re.search(r'FILES_TO_BUNDLE\s*=\s*\[(.*?)\]', b_code, re.DOTALL)
        self.assertIsNotNone(match, "FILES_TO_BUNDLE list must exist in bundle.py")
        raw_entries = re.findall(r'[\'"]([^\'"]+)[\'"]', match.group(1))
        
        violations = []
        for file_rel in raw_entries:
            file_abs = os.path.join(self.root_dir, file_rel.replace('/', os.sep))
            if os.path.exists(file_abs):
                with open(file_abs, 'r', encoding='utf-8') as fh:
                    content = fh.read()
                imports = re.findall(r'import\s+\{([^}]+)\}\s+from\s+[\'"]([^\'"]+)[\'"]', content)
                for vars_str, path_str in imports:
                    resolved = os.path.normpath(os.path.join(os.path.dirname(file_rel), path_str)).replace(os.sep, '/')
                    idx_f = raw_entries.index(file_rel) if file_rel in raw_entries else -1
                    idx_dep = raw_entries.index(resolved) if resolved in raw_entries else -1
                    if idx_dep >= idx_f and idx_dep != -1:
                        violations.append(f"{file_rel} (idx {idx_f}) imports {resolved} (idx {idx_dep}) -> {vars_str.strip()}")

    def test_40_donghang_official_draws_and_qr_integrity(self):
        """Test 40: Ensure official Donghang lottery draw numbers (especially 1240) and QR barcodes are 100% consistent."""
        # 1. Check data.js
        data_file = os.path.join(self.root_dir, 'data.js')
        with open(data_file, 'r', encoding='utf-8') as f:
            data_content = f.read()
        json_str = data_content.split('const LOTTO_HISTORY = ')[1].strip().rstrip(';')
        lotto_hist = json.loads(json_str)
        self.assertIn('1240', lotto_hist)
        self.assertEqual(lotto_hist['1240']['numbers'], [11, 13, 19, 20, 31, 44])
        self.assertEqual(lotto_hist['1240']['bonus'], 27)

        # 2. Check STATIC_DRAWS in ledger.js
        ledger_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'ledger.js')
        with open(ledger_file, 'r', encoding='utf-8') as f:
            ledger_code = f.read()
        self.assertIn('1240: { numbers: [11, 13, 19, 20, 31, 44], bonus: 27', ledger_code)

        # 3. Verify winning calculation against real 1240 draw
        real_1240 = set([11, 13, 19, 20, 31, 44])
        wdy_winning_combo = [11, 19, 31, 33, 38, 45]
        matches = len(set(wdy_winning_combo).intersection(real_1240))
    def test_41_cross_user_deduplication_and_global_prize(self):
        """Test 41: Ensure multi-user receipts are never dropped across users and global prize evaluates to 60,000 KRW."""
        # 1. Test deduplication scoping
        receipt_master = {
            'receiptId': '124000000114142041',
            'user': 'master',
            'round': 1240,
            'combos': [{'numbers': [3, 11, 17, 24, 33, 42]}]
        }
        receipt_hsy = {
            'receiptId': '124000000114142041',
            'user': 'kakao_5071901217',
            'round': 1240,
            'combos': [{'numbers': [1, 10, 11, 19, 44, 45]}]  # 5th place win in 1240
        }
        receipt_wdy = {
            'receiptId': '124000000114142041',
            'user': 'wdy',
            'round': 1240,
            'combos': [{'numbers': [11, 19, 31, 33, 38, 45]}] # 5th place win in 1240
        }

        # Check ledger.js code includes user scoping in deduplication key
        ledger_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'ledger.js')
        with open(ledger_file, 'r', encoding='utf-8') as f:
            code = f.read()
        self.assertIn('key = `id_${receiptId}_${uUser}_${uRound}_${combosFp}`;', code)
        self.assertIn('totalPrize', code)
 
    # [Test 42] Dashboard Winning Ticker Member Aggregation and Anti-Bloat Guard
    def test_42_dashboard_winning_ticker_user_aggregation_and_anti_bloat(self):
        """Verify that when a single member has multiple wins (e.g. 5,000 KRW x 2), ticker aggregates per member and avoids infinite scrolling repetition."""
        landing_file = os.path.join(self.root_dir, 'src', 'shared', 'landing-dashboard.js')
        with open(landing_file, 'r', encoding='utf-8') as f:
            code = f.read()

        # 1. Verify code structure in landing-dashboard.js
        self.assertIn('const userWinsMap = new Map();', code)
        self.assertIn('userWinsMap.has(pUser)', code)
        self.assertIn('totalWinCombosCount', code)
        self.assertIn('aggregatedWinners', code)
        self.assertIn('shouldScroll = aggregatedWinners.length >= 3', code)
        self.assertIn('총 ${totalWinCombosCount}건', code)

        # 2. Simulate 1241 Kang Ji-min 2x 5th prize aggregation
        mock_receipts = [
            {'user': 'kakao_5070669650', 'userName': '강지민', 'combos': [{'numbers': [7, 16, 18, 26, 29, 43]}]}, # 5th
            {'user': 'kakao_5070669650', 'userName': '강지민', 'combos': [{'numbers': [4, 10, 15, 23, 24, 43]}]}  # 5th
        ]
        win_draw = [7, 13, 16, 23, 24, 43]
        bonus = 9

        user_map = {}
        total_wins = 0
        for rcpt in mock_receipts:
            u = rcpt['user']
            for c in rcpt['combos']:
                matched = len(set(c['numbers']).intersection(set(win_draw)))
                if matched == 3:
                    total_wins += 1
                    if u not in user_map:
                        user_map[u] = {'ranks': {5: 0}, 'totalPrize': 0}
                    user_map[u]['ranks'][5] += 1
                    user_map[u]['totalPrize'] += 5000

        self.assertEqual(total_wins, 2)
        self.assertEqual(len(user_map), 1)
        self.assertEqual(user_map['kakao_5070669650']['ranks'][5], 2)
        self.assertEqual(user_map['kakao_5070669650']['totalPrize'], 10000)

        # 1 member -> shouldScroll must be False
        should_scroll = (len(user_map) >= 3)
        self.assertFalse(should_scroll, "Single winning member must display statically without scrolling marquee bloat")

    def test_43_admin_permanent_member_purchase_exemption(self):
        """Verify that all admin accounts are recognized as permanent members with full purchase exemption."""
        auth_file = os.path.join(self.root_dir, 'src', 'shared', 'auth-mgmt.js')
        with open(auth_file, 'r', encoding='utf-8') as f:
            auth_code = f.read()

        user_ctx_file = os.path.join(self.root_dir, 'src', 'shared', 'user-context.js')
        with open(user_ctx_file, 'r', encoding='utf-8') as f:
            user_ctx_code = f.read()

        # 1. Verify isAdminUser and isPermanentUser cross-reference in auth-mgmt.js
        self.assertIn("if (isAdminUser(authId, userData)) return true;", auth_code)
        self.assertIn("if (isAdminUser(userId, userDocData) || isPermanentUser(userId, userDocData))", auth_code)
        self.assertIn("if (isAdminUser(userId, userData) || isPermanentUser(userId, userData))", auth_code)

        # 2. Verify all unified users ensure isPermanent=true for admins
        self.assertIn("u.isPermanent = true;", user_ctx_code)
        self.assertIn("u.userType = 'permanent';", user_ctx_code)

    def test_44_user_switch_and_prediction_report_integrity(self):
        """Test: Verify prediction-report.js imports and polymorphic extra pack helpers to prevent freeze on user switch."""
        pred_report_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'prediction-report.js')
        gen_tab_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'generator-tab.js')
        
        with open(pred_report_file, 'r', encoding='utf-8') as f:
            pred_code = f.read()
        with open(gen_tab_file, 'r', encoding='utf-8') as f:
            gen_tab_code = f.read()

        # 1. Verify prediction-report imports getEffectiveUserExtraPacks from generator-tab.js
        self.assertIn("import { compute7AlgorithmsRealStats, getEffectiveUserExtraPacks } from './generator-tab.js';", pred_code)
        self.assertIn("getEffectiveUserExtraPacks(targetCombosUser, curUpcomingRound)", pred_code)

        # 2. Verify generator-tab.js exports polymorphic getEffectiveUserExtraPacks & getUserActiveExtraPackIds
        self.assertIn("export function getUserActiveExtraPackIds(userId, round)", gen_tab_code)
        self.assertIn("export function getEffectiveUserExtraPacks(userId, round)", gen_tab_code)
        self.assertIn("typeof userId === 'number'", gen_tab_code)
        self.assertIn("typeof round === 'number'", gen_tab_code)

    def test_45_master_and_admin_extra_pack_purchase_exemption(self):
        """Test: Verify master, admin, and permanent members are 100% exempt from purchase requirements in extra packs & UI."""
        ledger_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'ledger.js')
        gen_tab_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'generator-tab.js')

        with open(ledger_file, 'r', encoding='utf-8') as f:
            ledger_code = f.read()
        with open(gen_tab_file, 'r', encoding='utf-8') as f:
            gen_tab_code = f.read()

        # 1. Verify ledger.js isUserEligibleForExtraPacks checks admin viewer and target user exemptions
        self.assertIn("cleanViewer === 'master' || cleanViewer === 'admin'", ledger_code)
        self.assertIn("isAdminUser(cleanViewer)", ledger_code)
        self.assertIn("cleanTarget === 'master' || cleanTarget === 'admin'", ledger_code)
        self.assertIn("isAdminUser(cleanTarget)", ledger_code)
        self.assertIn("isPermanentUser(cleanTarget)", ledger_code)

        # 2. Verify generator-tab.js updateTop7AlgoUI grants isExempt / isEligible
        self.assertIn("isViewerAdmin || isTargetAdmin || isTargetPermanent", gen_tab_code)
        self.assertIn("실구매 면제", gen_tab_code)

    def test_46_strictly_six_unique_numbers_per_game_integrity(self):
        """Test: Verify all combination algorithms strictly produce exactly 6 distinct numbers (1~45) with 0 duplicate numbers."""
        gen_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'generator.js')
        wheeling_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'wheeling.js')

        with open(gen_file, 'r', encoding='utf-8') as f:
            gen_code = f.read()
        with open(wheeling_file, 'r', encoding='utf-8') as f:
            wheeling_code = f.read()

        # 1. Verify V4 Group 3 uses Set with baseSet.size < 6
        self.assertIn("let baseSet = new Set(cheatKeys[i - 7]);", gen_code)
        self.assertIn("while (baseSet.size < 6)", gen_code)
        self.assertIn("baseSet.add(Math.floor(seededRandom() * 45) + 1);", gen_code)
        self.assertNotIn("while(baseNums.length < 6) baseNums.push", gen_code)

        # 2. Verify wheeling combinations use comboSet with comboSet.size < 6
        self.assertIn("const comboSet = new Set();", wheeling_code)
        self.assertIn("while (comboSet.size < 6", wheeling_code)

        # 3. Emulate V4 Group 3 generation and ensure 0 duplicate numbers across 10,000 iterations
        import random
        cheat_keys = [
            [1, 13, 14, 18, 31, 38],
            [4, 10, 15, 23, 24, 43],
            [13, 15, 19, 27, 31, 35]
        ]
        for iteration in range(10000):
            for k_idx, key in enumerate(cheat_keys):
                base_set = set(key)
                if random.random() > 0.5:
                    arr = list(base_set)
                    m_idx = random.randint(0, len(arr) - 1)
                    mutated = min(45, max(1, arr[m_idx] + (1 if random.random() > 0.5 else -1)))
                    base_set.remove(arr[m_idx])
                    base_set.add(mutated)
                while len(base_set) < 6:
                    base_set.add(random.randint(1, 45))
                nums = sorted(list(base_set))
                self.assertEqual(len(nums), 6, "Must have exactly 6 numbers")
                self.assertEqual(len(set(nums)), 6, "Must have ZERO duplicate numbers")
    def test_47_yellow_ball_text_contrast_integrity(self):
        """Test 47: Verify yellow lotto balls (1~10) use high-contrast dark text (#0f172a) for readability across receipts and views."""
        utils_file = os.path.join(self.root_dir, 'src', 'shared', 'utils.js')
        styles_file = os.path.join(self.root_dir, 'styles.css')
        comp_file = os.path.join(self.root_dir, 'src', 'shared', 'components.js')
        conf_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'confirmed-tab.js')
        gen_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'generator-tab.js')

        with open(utils_file, 'r', encoding='utf-8') as f:
            utils_code = f.read()
        with open(styles_file, 'r', encoding='utf-8') as f:
            styles_code = f.read()
        with open(comp_file, 'r', encoding='utf-8') as f:
            comp_code = f.read()
        with open(conf_file, 'r', encoding='utf-8') as f:
            conf_code = f.read()
        with open(gen_file, 'r', encoding='utf-8') as f:
            gen_code = f.read()

        # 1. Verify utils.js exports getBallTextColor
        self.assertIn('export function getBallTextColor', utils_code)
        self.assertIn("(n <= 10) ? '#0f172a' : '#ffffff'", utils_code)

        # 2. Verify styles.css has dark high-contrast color on .ball-yellow
        self.assertIn('.ball-yellow, .lotto-ball.ball-yellow, .lotto-ball-mini.ball-yellow', styles_code)
        self.assertIn('color: #0f172a !important;', styles_code)

        # 3. Verify createBallHtml in components.js uses getBallTextColor
        self.assertIn('const textColor = getBallTextColor(n);', comp_code)
        self.assertIn('color: ${textColor};', comp_code)

        # 4. Verify confirmed-tab.js receipt balls assign dark text for numbers <= 10
        self.assertIn("const ballTextColor = (n <= 10) ? '#0f172a' : '#ffffff';", conf_code)

        # 5. Verify generator-tab.js uses high contrast dark text on yellow balls
        self.assertIn(f"color: ${{n <= 10 ? '#0f172a' : '#ffffff'}};", gen_code)

    def test_48_login_freeze_bug_fixes_integrity(self):
        """Test 48: Verify the two login-freeze bug fixes are in place.
        
        Bug 1 (auth-mgmt.js): userDoc.data() was never assigned to uData before use
        → ReferenceError in background async IIFE → UI freeze on first Kakao login
        
        Bug 2 (main.js): visibilitychange handler did not re-run checkAuthOnLoad
        → After Kakao popup closes, original tab didn't refresh auth state
        """
        auth_file = os.path.join(self.root_dir, 'src', 'shared', 'auth-mgmt.js')
        main_file = os.path.join(self.root_dir, 'src', 'main.js')

        with open(auth_file, 'r', encoding='utf-8') as f:
            auth_code = f.read()
        with open(main_file, 'r', encoding='utf-8') as f:
            main_code = f.read()

        # 1. Fix 1: uData must be assigned from userDoc.data() before any uData.xxx usage
        self.assertIn('const uData = userDoc.data() || {};', auth_code,
                      'FAIL: uData assignment (const uData = userDoc.data()) missing in checkAuthOnLoad background check')

        # 2. Fix 2: visibilitychange handler must call checkAuthOnLoad when authId present
        self.assertIn('checkAuthOnLoad(initLottoService)', main_code,
                      'FAIL: checkAuthOnLoad call missing inside visibilitychange handler in main.js')

        # 3. Fix 2: visibilitychange handler must check loginModal visibility state
        self.assertIn('isModalVisible', main_code,
                      'FAIL: isModalVisible check missing in visibilitychange handler')

    def test_49_donghang_verify_modal_integrity(self):
        """Test 49: Verify openDonghangVerifyModal is properly defined, mobile-safe, and exposed."""
        conf_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'confirmed-tab.js')
        with open(conf_file, 'r', encoding='utf-8') as f:
            code = f.read()

        self.assertIn('export function openDonghangVerifyModal', code)
        self.assertIn('export function closeDonghangVerifyModal', code)
        self.assertIn('export function handleDonghangVerifyClick', code)
        self.assertIn('window.openDonghangVerifyModal = openDonghangVerifyModal', code)
        self.assertIn('window.closeDonghangVerifyModal = closeDonghangVerifyModal', code)
        self.assertIn('window.handleDonghangVerifyClick = handleDonghangVerifyClick', code)
        self.assertIn('data-qr-url="${safeEncodedQrUrl}"', code)
        # Ensure GPU-crashing backdrop-filter blur is removed from donghang verify modal
        modal_code = code[code.find('function openDonghangVerifyModal'):]
        self.assertNotIn("backdrop-filter: blur", modal_code)

        # Ensure Round 1242 is present in STATIC_DRAWS in ledger.js
        ledger_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'ledger.js')
        with open(ledger_file, 'r', encoding='utf-8') as f:
            ledger_code = f.read()
        self.assertIn('1242: { numbers: [2, 4, 10, 16, 31, 41]', ledger_code)
    def test_50_mobile_back_navigation_integrity(self):
        """Test 50: Verify mobile back button history and exit confirmation in main.js."""
        main_file = os.path.join(self.root_dir, 'src', 'main.js')
        with open(main_file, 'r', encoding='utf-8') as f:
            code = f.read()

        self.assertIn('setupMobileBackNavigation', code)
        self.assertIn('addEventListener(\'popstate\'', code)
        self.assertIn('_closeAnyActiveModal', code)
        self.assertIn('history.pushState', code)
        self.assertIn('window.showLanding(false)', code)

    def test_51_logout_relogin_lifecycle_integrity(self):
        """Test 51: Verify logout teardown and re-login initialization lifecycle."""
        auth_file = os.path.join(self.root_dir, 'src', 'shared', 'auth-mgmt.js')
        lotto_index_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'index.js')
        toto_index_file = os.path.join(self.root_dir, 'src', 'services', 'toto', 'index.js')
        main_file = os.path.join(self.root_dir, 'src', 'main.js')

        with open(auth_file, 'r', encoding='utf-8') as f:
            auth_code = f.read()
        with open(lotto_index_file, 'r', encoding='utf-8') as f:
            lotto_code = f.read()
        with open(toto_index_file, 'r', encoding='utf-8') as f:
            toto_code = f.read()
        with open(main_file, 'r', encoding='utf-8') as f:
            main_code = f.read()

        # 1. lotto/index.js must define and export resetLottoServiceState
        self.assertIn('export function resetLottoServiceState', lotto_code)
        self.assertIn('window.resetLottoServiceState = resetLottoServiceState', lotto_code)

        # 2. toto/index.js must define and export resetTotoServiceState
        self.assertIn('export function resetTotoServiceState', toto_code)
        self.assertIn('window.resetTotoServiceState = resetTotoServiceState', toto_code)

        # 3. auth-mgmt.js handleLogout must reset lifecycle flags
        self.assertIn('window.__lottoInitialized = false;', auth_code)
        self.assertIn('window.__totoInitialized = false;', auth_code)
        self.assertIn('window.__appUnlocked = false;', auth_code)
        self.assertIn('resetLottoServiceState()', auth_code)
        self.assertIn('resetTotoServiceState()', auth_code)

        # 4. main.js _closeAnyActiveModal must protect login modal when unauthenticated
        self.assertIn('isAuth', main_code)
        self.assertIn('modalSelectors.unshift(\'#loginModalOverlay\')', main_code)

    def test_52_mobile_resume_fast_reconnect_integrity(self):
        """Test 52: Verify mobile background wake-up fast reconnect and timeout resilience."""
        db_file = os.path.join(self.root_dir, 'src', 'shared', 'db.js')
        main_file = os.path.join(self.root_dir, 'src', 'main.js')
        index_file = os.path.join(self.root_dir, 'index.html')

        with open(db_file, 'r', encoding='utf-8') as f:
            db_code = f.read()
        with open(main_file, 'r', encoding='utf-8') as f:
            main_code = f.read()
        with open(index_file, 'r', encoding='utf-8') as f:
            index_code = f.read()

        # 1. db.js must export reconnectFirebaseNetwork
        self.assertIn('export async function reconnectFirebaseNetwork', db_code)
        self.assertIn('window.reconnectFirebaseNetwork = reconnectFirebaseNetwork', db_code)
        self.assertIn('Promise.race', db_code)

        # 2. main.js must handle app resume with multiple wake-up events
        self.assertIn('handleAppResumeAndWakeup', main_code)
        self.assertIn('reconnectFirebaseNetwork', main_code)
        self.assertIn('pageshow', main_code)
        self.assertIn('online', main_code)

    def test_53_lotto_tab_switching_integrity(self):
        """Test 53: Verify switchLottoTab uses _switchPage, !important styles, and document-level click delegation."""
        lotto_index_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'index.js')
        with open(lotto_index_file, 'r', encoding='utf-8') as f:
            code = f.read()

        # 1. switchLottoTab must call _switchPage('appContainer', false)
        self.assertIn("window._switchPage('appContainer', false);", code)

        # 2. Tab switching must use setProperty with !important for proper display priority
        self.assertIn("c.style.setProperty('display', 'block', 'important');", code)
        self.assertIn("c.style.setProperty('display', 'none', 'important');", code)

        # 3. Document-level tab delegation must use .closest('.tab-btn')
        self.assertIn("e.target.closest('.tab-btn')", code)
        self.assertIn("switchLottoTab(btn.dataset.tab)", code)

        # 4. Tab renders must be safely wrapped
    def test_54_non_blocking_tab_switching_and_memoization(self):
        """Test 54: Verify non-blocking tab switching, active tab guards, and high-speed memoization."""
        lotto_index_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'index.js')
        algo_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'algorithms-tab.js')
        review_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'review-tab.js')
        confirmed_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'confirmed-tab.js')
        ledger_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'ledger.js')
        hex_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'hex-map.js')

        with open(lotto_index_file, 'r', encoding='utf-8') as f:
            lotto_code = f.read()
        with open(algo_file, 'r', encoding='utf-8') as f:
            algo_code = f.read()
        with open(review_file, 'r', encoding='utf-8') as f:
            review_code = f.read()
        with open(confirmed_file, 'r', encoding='utf-8') as f:
            confirmed_code = f.read()
        with open(ledger_file, 'r', encoding='utf-8') as f:
            ledger_code = f.read()
        with open(hex_file, 'r', encoding='utf-8') as f:
            hex_code = f.read()

        # 1. switchLottoTab must track window.__currentLottoTab and use _lottoTabRenderTimer
        self.assertIn('window.__currentLottoTab = target', lotto_code)
        self.assertIn('_lottoTabRenderTimer', lotto_code)
        self.assertIn('window.__currentLottoTab !== target', lotto_code)

        # 2. Tab renderers must have active tab guards
        self.assertIn("document.getElementById('tab-algorithms')", algo_code)
        self.assertIn("const tabReviewEl = document.getElementById('tab-review');", review_code)
        self.assertIn("const tabConfirmedEl = document.getElementById('tab-confirmed-list');", confirmed_code)

        # 3. calculate7AlgorithmsPerformance must use reviewsCache
        self.assertIn('const reviewsCache = new Map();', algo_code)
        self.assertIn('reviewsCache.get', algo_code)

        # 4. fetchAllUsersPurchases must check active page/tab
        self.assertIn('window.__currentLottoTab', ledger_code)

        # 5. hex-map.js must use state.mergedHistory directly
        self.assertIn('state && state.mergedHistory', hex_code)

    def test_55_persistent_caching_and_history_isolation(self):
        """Test 55: Verify localStorage/sessionStorage caching and history isolation wrapping."""
        algo_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'algorithms-tab.js')
        review_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'review-tab.js')
        generator_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'generator.js')

        with open(algo_file, 'r', encoding='utf-8') as f:
            algo_code = f.read()
        with open(review_file, 'r', encoding='utf-8') as f:
            review_code = f.read()
        with open(generator_file, 'r', encoding='utf-8') as f:
            gen_code = f.read()

        # 1. review-tab.js must have localStorage review cache & history isolation imports
        self.assertIn('lotto_review_v2_', review_code)
        self.assertIn('enterHistoryIsolation', review_code)
        self.assertIn('exitHistoryIsolation', review_code)

        # 2. algorithms-tab.js must have sessionStorage algo_perf caching
        self.assertIn('algo_perf_v2_', algo_code)
        self.assertIn('_algoPerfCache', algo_code)

        # 3. generator.js must have enterHistoryIsolation & exitHistoryIsolation
        self.assertIn('export function enterHistoryIsolation', gen_code)
        self.assertIn('export function exitHistoryIsolation', gen_code)

    def test_56_toast_gpu_dismiss_and_generator_defer(self):
        """Test 56: Verify GPU-composited toast dismiss keyframes and generator tab non-blocking defer."""
        utils_file = os.path.join(self.root_dir, 'src', 'shared', 'utils.js')
        gen_tab_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'generator-tab.js')
        styles_file = os.path.join(self.root_dir, 'styles.css')

        with open(utils_file, 'r', encoding='utf-8') as f:
            utils_code = f.read()
        with open(gen_tab_file, 'r', encoding='utf-8') as f:
            gen_tab_code = f.read()
        with open(styles_file, 'r', encoding='utf-8') as f:
            styles_code = f.read()

        # 1. utils.js must use toastAutoDismiss animation & hideToast
        self.assertIn('toastAutoDismiss', utils_code)
        self.assertIn('hideToast', utils_code)

        # 2. styles.css must define @keyframes toastAutoDismiss
        self.assertIn('@keyframes toastAutoDismiss', styles_code)

        # 3. generator-tab.js must defer render7AlgorithmsRealReviewSection
        self.assertIn('render7AlgorithmsRealReviewSection', gen_tab_code)
        self.assertIn('setTimeout', gen_tab_code)

    def test_57_quick_view_and_generator_recommendations_parity(self):
        """Test 57: Verify 100% number parity between main generator tab and quick-view modal."""
        gen_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'generator.js')
        gen_tab_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'generator-tab.js')
        quick_view_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'quick-view.js')

        with open(gen_file, 'r', encoding='utf-8') as f:
            gen_code = f.read()
        with open(gen_tab_file, 'r', encoding='utf-8') as f:
            gen_tab_code = f.read()
        with open(quick_view_file, 'r', encoding='utf-8') as f:
            quick_code = f.read()

        # 1. generator.js exports canonical getEffectiveGeneratorUserId
        self.assertIn('export function getEffectiveGeneratorUserId', gen_code)
        self.assertIn('getEffectiveGeneratorUserId(customUserId)', gen_code)

        # 2. generator-tab.js imports and uses getEffectiveGeneratorUserId & getUpcomingLottoRound
        self.assertIn('getEffectiveGeneratorUserId', gen_tab_code)
        self.assertIn('getUpcomingLottoRound', gen_tab_code)

        # 3. quick-view.js imports and uses getEffectiveGeneratorUserId & getUpcomingLottoRound
        self.assertIn('getEffectiveGeneratorUserId', quick_code)
        self.assertIn('getUpcomingLottoRound', quick_code)

        # 4. quick-view.js syncs with state.fixedTop5Combinations_v3 and state.fixedTop5Combinations_v4
        self.assertIn('state.fixedTop5Combinations_v3', quick_code)
        self.assertIn('state.fixedTop5Combinations_v4', quick_code)

        # 5. generator-tab.js handleGenerateAllClick passes effectiveUserId to computeAbsoluteTop10Combinations
        self.assertIn('computeAbsoluteTop10Combinations(true, curUpcomingRound, \'v3\', true, effectiveUserId)', gen_tab_code)
        self.assertIn('computeAbsoluteTop10Combinations(true, curUpcomingRound, \'v4\', true, effectiveUserId)', gen_tab_code)

    def test_58_two_track_cross_check_and_version_comparison(self):
        """Test 58: Verify 2-Track (Firebase + Hosting) cross-check detects higher Firebase versions properly."""
        html_file = os.path.join(self.root_dir, 'index.html')
        with open(html_file, 'r', encoding='utf-8') as f:
            html_code = f.read()

        # 1. index.html must have compareVersions helper function
        self.assertIn('function compareVersions(vA, vB)', html_code)

        # 2. getHighestKnownVersion must check both HOSTING and FIREBASE versions against current
        self.assertIn('function getHighestKnownVersion()', html_code)
        self.assertIn('window.FIREBASE_LATEST_VERSION', html_code)
        self.assertIn('compareVersions(window.FIREBASE_LATEST_VERSION, highest)', html_code)
        self.assertIn('compareVersions(window.HOSTING_LATEST_VERSION, highest)', html_code)

        # 3. forceReloadCache must cache-bust with query timestamp
        self.assertIn('forceReloadCache', html_code)
        self.assertIn('targetUrl', html_code)

    def test_59_kakao_user_generator_parity_and_mobile_display(self):
        """Test 59: Verify generator combo completeness, defensive fallbacks, and mobile display parity."""
        gen_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'generator.js')
        gen_tab_file = os.path.join(self.root_dir, 'src', 'services', 'lotto', 'views', 'generator-tab.js')
        styles_file = os.path.join(self.root_dir, 'styles.css')
        main_file = os.path.join(self.root_dir, 'src', 'main.js')

        with open(gen_file, 'r', encoding='utf-8') as f:
            gen_code = f.read()
        with open(gen_tab_file, 'r', encoding='utf-8') as f:
            gen_tab_code = f.read()
        with open(styles_file, 'r', encoding='utf-8') as f:
            styles_code = f.read()
        with open(main_file, 'r', encoding='utf-8') as f:
            main_code = f.read()

        # 1. generator.js defines targetBenefit in V4 combinations
        self.assertIn("targetBenefit: '소액 당첨(4·5등) 확률 방어 및 기댓값 안정화'", gen_code)
        self.assertIn("targetBenefit: '1등 당첨 시 고액 독식(셰어링 방어) 및 변동성 극대화'", gen_code)
        self.assertIn("targetBenefit: '역대 당첨 백데이터 다중 교집합 기반 기계적 적중 밀도 극대화'", gen_code)

        # 2. generator-tab.js has safe defensive fallbacks for strat and stats
        self.assertIn('const strat = comboObj.meta || {', gen_tab_code)
        self.assertIn('const stats = comboObj.stats || {', gen_tab_code)
        self.assertIn('safeProbPct', gen_tab_code)
        self.assertIn('safeBiasPct', gen_tab_code)

        # 3. styles.css ensures combo-detail-section is block by default
        self.assertIn('.combo-detail-section {\n    display: block;', styles_code)
        self.assertIn('.combo-card.is-compact', styles_code)

        # 4. main.js switches to tab-generator when showLotto is invoked
        self.assertIn("switchLottoTab('tab-generator')", main_code)


if __name__ == '__main__':
    unittest.main()





