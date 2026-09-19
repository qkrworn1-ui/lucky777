import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open("scratch/all_purchases_dump.json", "r", encoding="utf-8") as f:
    all_data = json.load(f)

# 1. Look for all purchase records across all documents for 1242
print("=" * 70)
print("📌 [1] 전체 Firestore 문서 중 1242회차 실구매 영수증 검색")
print("=" * 70)
found_1242_purchases = []
for doc_id, doc in all_data.items():
    ledger = doc.get("ledger", [])
    if isinstance(ledger, str):
        try: ledger = json.loads(ledger)
        except: pass
    if isinstance(ledger, list):
        for p in ledger:
            if str(p.get('round')) == '1242':
                found_1242_purchases.append((doc_id, doc.get('realName'), p))
                
print(f"발견된 1242회차 실구매 영수증 수: {len(found_1242_purchases)}건")
for doc_id, r_name, p in found_1242_purchases:
    print(f"\n[문서: {doc_id} ({r_name})] 영수증 ID: {p.get('receiptId')}")
    print(f"  등록일시: {p.get('createdAt') or p.get('purchaseDate')}")
    print(f"  바코드/QR: {p.get('qrBarcode') or p.get('qrSerial')}")
    print(f"  게임 수: {len(p.get('combos', []))}")
    for idx, c in enumerate(p.get('combos', [])):
        nums = c.get('numbers') if isinstance(c, dict) else c
        meta = c.get('meta') if isinstance(c, dict) else {}
        print(f"    - {chr(65+idx)}: {nums} | {meta}")

# 2. Extract Park Jae-gu's 1242 Recommendation Snapshot (all 70 games)
park_doc = all_data.get("kakao_5070244665", {})
snaps = park_doc.get("recommendationSnapshots", {})
if isinstance(snaps, str):
    try: snaps = json.loads(snaps)
    except: pass

snap_1242 = snaps.get("1242", {})
print("\n" + "=" * 70)
print("📌 [2] 박재구 회원 1242회차 개인화 추천 70게임 스냅샷 상세 분석")
print("=" * 70)
print(f"생성일시: {snap_1242.get('createdAt')}")
print(f"스냅샷 해시: {snap_1242.get('hashFingerprint')}")
print(f"총 게임 수: {snap_1242.get('totalGames')} 게임")

v4_combos = snap_1242.get("v4Combos", [])
v3_combos = snap_1242.get("v3Combos", [])
extra_packs = snap_1242.get("extraPacks", {})

print(f"\n1. V4.0 행동경제학 포트폴리오 ({len(v4_combos)}게임):")
for i, c in enumerate(v4_combos):
    nums = c.get('numbers') if isinstance(c, dict) else c
    meta = c.get('meta') if isinstance(c, dict) else {}
    print(f"   [{i+1:02d}] {nums} | 합:{meta.get('sum', sum(nums))}, AC:{meta.get('ac', 'N/A')}, 홀짝:{meta.get('oddEven', 'N/A')} | {meta.get('tag', '')}")

print(f"\n2. V3.0 하이브리드 정통 수학 알고리즘 ({len(v3_combos)}게임):")
for i, c in enumerate(v3_combos):
    nums = c.get('numbers') if isinstance(c, dict) else c
    meta = c.get('meta') if isinstance(c, dict) else {}
    print(f"   [{i+11:02d}] {nums} | 합:{meta.get('sum', sum(nums))}, AC:{meta.get('ac', 'N/A')}, 홀짝:{meta.get('oddEven', 'N/A')} | {meta.get('tag', '')}")

extra_pack_names = {
    "extra_1": "추가 1: 30게임 완성형 100% 전수 커버리지팩",
    "extra_2": "추가 2: 초고배당 EV 독점 수령팩",
    "extra_3": "추가 3: 기하학적 휠링 하모닉팩",
    "extra_4": "추가 4: 마르코프 2차 전이 & 페어 부스터팩",
    "extra_5": "추가 5: 골든 클러스터 올인팩"
}

start_idx = 21
if isinstance(extra_packs, dict):
    for p_id, p_name in extra_pack_names.items():
        p_data = extra_packs.get(p_id, {})
        p_combos = p_data.get('combos', []) if isinstance(p_data, dict) else (p_data if isinstance(p_data, list) else [])
        print(f"\n3.{p_id}. {p_name} ({len(p_combos)}게임):")
        for i, c in enumerate(p_combos):
            nums = c.get('numbers') if isinstance(c, dict) else c
            meta = c.get('meta') if isinstance(c, dict) else {}
            print(f"   [{start_idx:02d}] {nums} | 합:{meta.get('sum', sum(nums))}, AC:{meta.get('ac', 'N/A')}, 홀짝:{meta.get('oddEven', 'N/A')} | {meta.get('tag', '')}")
            start_idx += 1
