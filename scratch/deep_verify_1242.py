import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open("scratch/all_purchases_dump.json", "r", encoding="utf-8") as f:
    all_data = json.load(f)

park_doc = all_data.get("kakao_5070244665", {})
print("=" * 70)
print("📌 [1] 박재구 회원 (kakao_5070244665) 기본 프로필")
print("=" * 70)
print(f"회원 ID: {park_doc.get('userId')}")
print(f"성명: {park_doc.get('realName')}")

ledger = park_doc.get("ledger", [])
if isinstance(ledger, str):
    try: ledger = json.loads(ledger)
    except: pass

print("\n" + "=" * 70)
print("📌 [2] 등록된 실구매 영수증 내역 (Ledger Purchases)")
print("=" * 70)
r1242_purchases = []
if isinstance(ledger, list):
    for idx, p in enumerate(ledger):
        r = p.get('round')
        rid = p.get('receiptId')
        combos = p.get('combos', [])
        is_locked = p.get('isLocked')
        dt = p.get('createdAt') or p.get('purchaseDate')
        barcode = p.get('qrBarcode') or p.get('qrSerial')
        print(f"\n[영수증 #{idx+1}] 회차: {r}회 | 영수증ID: {rid} | 게임수: {len(combos)}게임 | 확정/잠금: {is_locked} | 등록일시: {dt}")
        if barcode:
            print(f"  바코드/QR: {barcode}")
        if str(r) == '1242':
            r1242_purchases.append(p)
        for c_idx, c in enumerate(combos):
            nums = c.get('numbers') if isinstance(c, dict) else c
            meta = c.get('meta') if isinstance(c, dict) else {}
            tag = meta.get('tag') or meta.get('source') or c.get('algorithm') or c.get('mode') or ''
            print(f"    - {chr(65+c_idx)}게임: {nums} | 알고리즘/태그: {tag}")
else:
    print("  [!] 등록된 구매영수증이 없습니다.")

print("\n" + "=" * 70)
print("📌 [3] 1242회차 개인 추천번호 스냅샷 (70게임)")
print("=" * 70)
rec_snapshots = park_doc.get("recommendationSnapshots", {})
if isinstance(rec_snapshots, str):
    try: rec_snapshots = json.loads(rec_snapshots)
    except: pass

if isinstance(rec_snapshots, dict) and "1242" in rec_snapshots:
    snap_1242 = rec_snapshots["1242"]
    print(f"스냅샷 생성일시: {snap_1242.get('createdAt')}")
    print(f"스냅샷 해시: {snap_1242.get('hashFingerprint')}")
    print(f"회원 유형: {snap_1242.get('userType')}")
    
    combos_70 = snap_1242.get('combos', [])
    print(f"총 추천 조합 수: {len(combos_70)} 게임\n")
    
    # Check recommendation algorithm groups
    algo_groups = {}
    for idx, c in enumerate(combos_70):
        nums = c.get('numbers') if isinstance(c, dict) else c
        meta = c.get('meta') if isinstance(c, dict) else {}
        algo_name = meta.get('source') or meta.get('packName') or meta.get('tag') or f"Group_{idx // 10 + 1}"
        if algo_name not in algo_groups:
            algo_groups[algo_name] = []
        algo_groups[algo_name].append((idx + 1, nums, meta))
        
    for g_name, items in algo_groups.items():
        print(f"▶ [{g_name}] ({len(items)}게임)")
        for num_idx, nums, meta in items:
            print(f"   #{num_idx:02d}: {nums} (합:{meta.get('sum', sum(nums))}, AC:{meta.get('ac', 'N/A')}, 홀짝:{meta.get('oddEven', 'N/A')}) | {meta.get('tag', '')}")
else:
    print("  [!] 1242회차 추천번호 스냅샷이 없습니다.")

print("\n" + "=" * 70)
print("📌 [4] 실구매 영수증 조합 vs 70게임 추천 알고리즘 정합성 교차 검증 (Cross-Matching)")
print("=" * 70)
if r1242_purchases and isinstance(rec_snapshots, dict) and "1242" in rec_snapshots:
    rec_list = snap_1242.get('combos', [])
    rec_tuples = {}
    for idx, c in enumerate(rec_list):
        nums = tuple(sorted(c.get('numbers') if isinstance(c, dict) else c))
        rec_tuples[nums] = (idx + 1, c)
        
    for p_idx, p in enumerate(r1242_purchases):
        print(f"\n[구매 영수증 #{p_idx+1}] {p.get('receiptId')}")
        combos = p.get('combos', [])
        for c_idx, c in enumerate(combos):
            nums = tuple(sorted(c.get('numbers') if isinstance(c, dict) else c))
            if nums in rec_tuples:
                r_idx, r_c = rec_tuples[nums]
                r_meta = r_c.get('meta', {}) if isinstance(r_c, dict) else {}
                source = r_meta.get('source') or r_meta.get('packName') or r_meta.get('tag') or ''
                print(f"  ✓ {chr(65+c_idx)}게임: {list(nums)} => [100% 일치] 추천 #{r_idx:02d}게임 ({source} / {r_meta.get('tag', '')})")
            else:
                # Partial match analysis
                best_match_count = 0
                best_match_rec = None
                for r_num, (r_idx, r_c) in rec_tuples.items():
                    common = len(set(nums).intersection(set(r_num)))
                    if common > best_match_count:
                        best_match_count = common
                        best_match_rec = (r_idx, r_num, r_c)
                print(f"  ⚠️ {chr(65+c_idx)}게임: {list(nums)} => [수동/변형 마킹] 추천 번호와 {best_match_count}개 일치 (가장 유사한 추천: #{best_match_rec[0]} {list(best_match_rec[1])})")
