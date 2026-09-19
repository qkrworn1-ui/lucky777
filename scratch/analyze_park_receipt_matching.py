import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open("scratch/all_purchases_dump.json", "r", encoding="utf-8") as f:
    all_data = json.load(f)

park_doc = all_data.get("kakao_5070244665", {})
snaps = park_doc.get("recommendationSnapshots", {})
if isinstance(snaps, str):
    try: snaps = json.loads(snaps)
    except: pass

snap_1242 = snaps.get("1242", {})

# Collect all 70 recommendation combos with exact labels and pack info
rec_map = {}
all_rec_combos = []

# 1. V4 (1~10)
for idx, c in enumerate(snap_1242.get("v4Combos", [])):
    nums = sorted(c.get('numbers') if isinstance(c, dict) else c)
    info = {
        'gameNum': idx + 1,
        'packId': 'v4',
        'packName': 'V4.0 행동경제학 포트폴리오',
        'badge': 'BEHAVIORAL QUANT',
        'color': '#8b5cf6',
        'numbers': nums,
        'tag': c.get('meta', {}).get('tag', '')
    }
    rec_map[tuple(nums)] = info
    all_rec_combos.append(info)

# 2. V3 (11~20)
for idx, c in enumerate(snap_1242.get("v3Combos", [])):
    nums = sorted(c.get('numbers') if isinstance(c, dict) else c)
    info = {
        'gameNum': idx + 11,
        'packId': 'v3',
        'packName': 'V3.0 하이브리드 정통 수학 알고리즘',
        'badge': 'HYBRID MATH',
        'color': '#3b82f6',
        'numbers': nums,
        'tag': c.get('meta', {}).get('tag', '')
    }
    rec_map[tuple(nums)] = info
    all_rec_combos.append(info)

# 3. Extra packs (21~70)
extra_packs = snap_1242.get("extraPacks", {})
pack_keys = ['1', '2', '3', '4', '5']
pack_meta_info = {
    '1': ('추가 1: 30게임 완성형 100% 전수 커버리지팩', '30-GAME KEYSTONE 100%', '#10b981'),
    '2': ('추가 2: 초고배당 EV 독점 수령팩', 'HIGH EV MONOPOLY', '#f59e0b'),
    '3': ('추가 3: 기하학적 휠링 하모닉팩', 'HARMONIC WHEELING', '#8b5cf6'),
    '4': ('추가 4: 마르코프 2차 전이 & 페어 부스터팩', 'MARKOV 2ND & PAIR', '#06b6d4'),
    '5': ('추가 5: 골든 클러스터 올인팩', 'GOLDEN CLIQUE ALL-IN', '#ec4899')
}

g_idx = 21
for p_key in pack_keys:
    p_data = extra_packs.get(p_key, {})
    p_combos = p_data.get('combos', []) if isinstance(p_data, dict) else []
    p_name, p_badge, p_color = pack_meta_info.get(p_key, (f"추가 {p_key}", "", "#ffffff"))
    for idx, c in enumerate(p_combos):
        nums = sorted(c.get('numbers') if isinstance(c, dict) else c)
        info = {
            'gameNum': g_idx,
            'packId': f'extra_{p_key}',
            'packName': p_name,
            'badge': p_badge,
            'color': p_color,
            'numbers': nums,
            'tag': c.get('meta', {}).get('tag', '')
        }
        rec_map[tuple(nums)] = info
        all_rec_combos.append(info)
        g_idx += 1

print(f"[*] Total parsed recommendation games: {len(all_rec_combos)}")

# 4. Analyze each of the 4 receipts in ledger
ledger = park_doc.get("ledger", {})
if isinstance(ledger, str):
    try: ledger = json.loads(ledger)
    except: pass

r1242_receipts = ledger.get("1242", [])
print(f"[*] Total 1242 purchase receipts: {len(r1242_receipts)} ({len(r1242_receipts)*5} games)\n")

for r_idx, rec in enumerate(r1242_receipts):
    rid = rec.get('receiptId')
    qr = rec.get('qrMeta', {}).get('qrRawUrl') or rec.get('qrRawUrl')
    combos = rec.get('combos', [])
    print("=" * 80)
    print(f"🧾 [영수증 #{r_idx+1}] 일련번호: {rid}")
    print(f"   QR URL: {qr}")
    print("=" * 80)
    
    for c_idx, c in enumerate(combos):
        letter = chr(65 + c_idx)
        p_nums = sorted(c.get('numbers') if isinstance(c, dict) else c)
        p_tuple = tuple(p_nums)
        meta = c.get('meta', {}) if isinstance(c, dict) else {}
        
        # Exact match?
        if p_tuple in rec_map:
            match_info = rec_map[p_tuple]
            print(f"  [{letter} 게임] {str(p_nums):<24} -> 🟢 [100% 정규 추천 일치]")
            print(f"     └ 배정 알고리즘: #{match_info['gameNum']:02d}게임 [{match_info['packName']}]")
            print(f"     └ 필터 태그: {match_info['tag']}")
        else:
            # Find closest recommendation combo (mutation analysis)
            best_common = 0
            best_rec = None
            for r_info in all_rec_combos:
                r_set = set(r_info['numbers'])
                common = len(r_set.intersection(set(p_nums)))
                if common > best_common:
                    best_common = common
                    best_rec = r_info
                    
            diff_in_p = sorted(list(set(p_nums) - set(best_rec['numbers'])))
            diff_in_r = sorted(list(set(best_rec['numbers']) - set(p_nums)))
            
            print(f"  [{letter} 게임] {str(p_nums):<24} -> 🟡 [수동 변형 / 마킹 수정 / 커스텀 번호]")
            print(f"     └ 가장 근접한 추천: #{best_rec['gameNum']:02d}게임 [{best_rec['packName']}] ({best_common}개 일치)")
            print(f"     └ 원본 추천번호: {best_rec['numbers']}")
            print(f"     └ 변경 사항: 원본 [{diff_in_r}] -> 실제 구매 마킹 [{diff_in_p}]")
            print(f"     └ 시스템 태그: {meta.get('matchedAlgoVersion', '수동/직접입력')} ({meta.get('matchedAlgoLabel', '수동입력')})")
    print()
