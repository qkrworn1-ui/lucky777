import urllib.request
import json
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# 1. Official Draws from snapshot-audit-modal.js
OFFICIAL_DRAWS = {
    1235: {'numbers': [6, 14, 22, 29, 36, 41], 'bonus': 17, 'rank1Prize': 1985670000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000},
    1236: {'numbers': [3, 11, 18, 25, 33, 42], 'bonus': 8, 'rank1Prize': 2450320000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000},
    1237: {'numbers': [2, 9, 16, 27, 34, 45], 'bonus': 21, 'rank1Prize': 2180450000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000},
    1238: {'numbers': [2, 13, 18, 32, 38, 42], 'bonus': 22, 'rank1Prize:': 1197250000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000},
    1239: {'numbers': [1, 3, 17, 26, 33, 42], 'bonus': 41, 'rank1Prize': 1980500000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000},
    1240: {'numbers': [11, 13, 19, 20, 31, 44], 'bonus': 27, 'rank1Prize': 2000000000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000},
    1241: {'numbers': [7, 13, 16, 23, 24, 43], 'bonus': 9, 'rank1Prize': 1628391980, 'rank2Prize': 54279733, 'rank3Prize': 1501284, 'rank4Prize': 50000, 'rank5Prize': 5000},
    1242: {'numbers': [2, 4, 10, 16, 31, 41], 'bonus': 9, 'rank1Prize': 3281029250, 'rank2Prize': 47322538, 'rank3Prize': 1535105, 'rank4Prize': 50000, 'rank5Prize': 5000},
    1243: {'numbers': [9, 18, 24, 38, 43, 44], 'bonus': 35, 'rank1Prize': 2200000000, 'rank2Prize': 50000000, 'rank3Prize': 1500000, 'rank4Prize': 50000, 'rank5Prize': 5000}
}

# 2. Draws from STATIC_DRAWS in ledger.js
STATIC_DRAWS = {
    1235: {'numbers': [6, 14, 22, 29, 36, 41], 'bonus': 17, 'rank1Prize': 1985670000}, # missing rank2Prize, rank3Prize
    1236: {'numbers': [3, 11, 18, 25, 33, 42], 'bonus': 8, 'rank1Prize': 2450320000},  # missing rank2Prize, rank3Prize
    1237: {'numbers': [2, 9, 16, 27, 34, 45], 'bonus': 21, 'rank1Prize': 2180450000}, # missing rank2Prize, rank3Prize
    1238: {'numbers': [2, 13, 18, 32, 38, 42], 'bonus': 22, 'rank1Prize': 1197250000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000},
    1239: {'numbers': [1, 3, 17, 26, 33, 42], 'bonus': 41, 'rank1Prize': 1980500000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000},
    1240: {'numbers': [11, 13, 19, 20, 31, 44], 'bonus': 27, 'rank1Prize': 2000000000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000},
    1241: {'numbers': [7, 13, 16, 23, 24, 43], 'bonus': 9, 'rank1Prize': 1628391980, 'rank2Prize': 54279733, 'rank3Prize': 1501284, 'rank4Prize': 50000, 'rank5Prize': 5000},
    1242: {'numbers': [2, 4, 10, 16, 31, 41], 'bonus': 9, 'rank1Prize': 3281029250, 'rank2Prize': 47322538, 'rank3Prize': 1535105, 'rank4Prize': 50000, 'rank5Prize': 5000},
    1243: {'numbers': [9, 18, 24, 38, 43, 44], 'bonus': 35, 'rank1Prize': 2200000000, 'rank2Prize': 50000000, 'rank3Prize': 1500000, 'rank4Prize': 50000, 'rank5Prize': 5000}
}

def decode_val(v):
    if not isinstance(v, dict): return v
    if 'stringValue' in v: return v['stringValue']
    if 'integerValue' in v: return int(v['integerValue'])
    if 'doubleValue' in v: return float(v['doubleValue'])
    if 'booleanValue' in v: return v['booleanValue']
    if 'nullValue' in v: return None
    if 'arrayValue' in v: return [decode_val(x) for x in v['arrayValue'].get('values', [])]
    if 'mapValue' in v:
        return {k: decode_val(sub_v) for k, sub_v in v['mapValue'].get('fields', {}).items()}
    return v

def get_combo_nums(c):
    if isinstance(c, dict):
        return c.get('numbers') or c.get('sorted') or []
    if isinstance(c, list):
        return c
    return []

# Fetch guest and kakao_5070244665 from Firestore
all_snaps = {}
for user_id in ['guest', 'kakao_5070244665']:
    url = f'https://firestore.googleapis.com/v1/projects/sonamu-jokgu-club/databases/(default)/documents/lotto_purchases/{user_id}?key=AIzaSyAnkGVAlO39p6rnTEibygeQTBYDbp505dA'
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        resp = urllib.request.urlopen(req)
        data = json.loads(resp.read().decode('utf-8'))
        fields = {k: decode_val(v) for k, v in data.get('fields', {}).items()}
        all_snaps[user_id] = fields.get('recommendationSnapshots', {})
    except Exception as e:
        print(f"Error fetching {user_id}: {e}")

# Compare scoring for each user & round
for user_id, user_snaps in all_snaps.items():
    print(f"\n==========================================")
    print(f"User: {user_id}")
    print(f"==========================================")
    for r_str, snap in sorted(user_snaps.items(), key=lambda x: int(x[0])):
        r = int(r_str)
        if r not in OFFICIAL_DRAWS: continue
        
        # Collect combos: v4, v3, extra
        v4 = snap.get('v4Combos', [])
        v3 = snap.get('v3Combos', [])
        extra = []
        ep = snap.get('extraPacks', {})
        if isinstance(ep, dict):
            for k, p in sorted(ep.items()):
                extra.extend(p.get('combos', []))
        elif isinstance(ep, list):
            for p in ep:
                extra.extend(p.get('combos', []) if isinstance(p, dict) else p)
                
        all_70 = v4 + v3 + extra
        
        # Scoring with OFFICIAL_DRAWS (snapshot-audit-modal)
        d_audit = OFFICIAL_DRAWS[r]
        win_set = set(d_audit['numbers'])
        bonus = d_audit['bonus']
        
        audit_prize = 0
        audit_ranks = {1:0, 2:0, 3:0, 4:0, 5:0}
        for c in all_70:
            nums = get_combo_nums(c)
            match = len(win_set.intersection(nums))
            has_b = bonus in nums
            if match == 6:
                audit_ranks[1] += 1
                audit_prize += d_audit.get('rank1Prize', 2000000000)
            elif match == 5 and has_b:
                audit_ranks[2] += 1
                audit_prize += d_audit.get('rank2Prize', 50000000)
            elif match == 5:
                audit_ranks[3] += 1
                audit_prize += d_audit.get('rank3Prize', 1500000)
            elif match == 4:
                audit_ranks[4] += 1
                audit_prize += d_audit.get('rank4Prize', 50000)
            elif match == 3:
                audit_ranks[5] += 1
                audit_prize += d_audit.get('rank5Prize', 5000)
                
        # Scoring with STATIC_DRAWS & evaluateRecommendationSet logic (review-tab)
        d_static = STATIC_DRAWS.get(r, {})
        win_set_s = set(d_static.get('numbers', []))
        bonus_s = d_static.get('bonus')
        
        ledger_prize = 0
        ledger_ranks = {1:0, 2:0, 3:0, 4:0, 5:0}
        for c in all_70:
            nums = get_combo_nums(c)
            match = len(win_set_s.intersection(nums))
            has_b = bonus_s in nums
            if match == 6:
                ledger_ranks[1] += 1
                ledger_prize += d_static.get('rank1Prize', 2000000000)
            elif match == 5 and has_b:
                ledger_ranks[2] += 1
                ledger_prize += d_static.get('rank2Prize', 50000000)
            elif match == 5:
                ledger_ranks[3] += 1
                ledger_prize += d_static.get('rank3Prize', 1500000)
            elif match == 4:
                ledger_ranks[4] += 1
                ledger_prize += 50000
            elif match == 3:
                ledger_ranks[5] += 1
                ledger_prize += 5000
                
        diff = audit_prize - ledger_prize
        print(f"Round {r}: total combos={len(all_70)}")
        print(f"  Audit (OFFICIAL):  prize={audit_prize:,}원, ranks={audit_ranks}")
        print(f"  Ledger (STATIC):   prize={ledger_prize:,}원, ranks={ledger_ranks}")
        if diff != 0:
            print(f"  *** MISMATCH *** diff = {diff:,}원")
        else:
            print(f"  MATCH: both = {audit_prize:,}원")
