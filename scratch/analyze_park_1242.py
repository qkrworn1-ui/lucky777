import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open("scratch/all_purchases_dump.json", "r", encoding="utf-8") as f:
    all_data = json.load(f)

park_doc = all_data.get("kakao_5070244665", {})
print("=== PARK JAE-GU (kakao_5070244665) FIRESTORE DATA ===")
print(f"User ID: {park_doc.get('userId')}")
print(f"Real Name: {park_doc.get('realName')}")

# Ledger purchases
ledger = park_doc.get("ledger", [])
if isinstance(ledger, str):
    try:
        ledger = json.loads(ledger)
    except:
        pass

print(f"\n[1] Total Ledger Purchase Records: {len(ledger) if isinstance(ledger, list) else type(ledger)}")
if isinstance(ledger, list):
    for idx, p in enumerate(ledger):
        r = p.get('round')
        rid = p.get('receiptId')
        combos = p.get('combos', [])
        is_locked = p.get('isLocked')
        created_at = p.get('createdAt') or p.get('purchaseDate')
        print(f"  [{idx+1}] Round: {r}, ReceiptID: {rid}, Games: {len(combos)}, Locked: {is_locked}, Date: {created_at}")
        if str(r) == '1242' or idx < 3:
            for c_idx, c in enumerate(combos):
                nums = c.get('numbers') if isinstance(c, dict) else c
                meta = c.get('meta') if isinstance(c, dict) else {}
                algo = c.get('algorithm') or c.get('mode') or meta.get('tag') or meta.get('source') or '알고리즘 미지정'
                print(f"      Game {chr(65+c_idx)}: {nums} | Meta: {algo}")

# Recommendation Snapshots
rec_snapshots = park_doc.get("recommendationSnapshots", {})
if isinstance(rec_snapshots, str):
    try:
        rec_snapshots = json.loads(rec_snapshots)
    except:
        pass

print(f"\n[2] Recommendation Snapshots Available for Rounds: {list(rec_snapshots.keys()) if isinstance(rec_snapshots, dict) else type(rec_snapshots)}")
if isinstance(rec_snapshots, dict) and "1242" in rec_snapshots:
    snap_1242 = rec_snapshots["1242"]
    print(f"\n--- Round 1242 Recommendation Snapshot ---")
    print(f"Snapshot type/keys: {list(snap_1242.keys()) if isinstance(snap_1242, dict) else len(snap_1242)}")
    if isinstance(snap_1242, dict):
        for k, v in snap_1242.items():
            if isinstance(v, list):
                print(f"  Key '{k}': {len(v)} games")
                for item in v[:5]:
                    print(f"    {item}")
            else:
                print(f"  Key '{k}': {v}")
    elif isinstance(snap_1242, list):
        print(f"  Total games: {len(snap_1242)}")
        for g in snap_1242[:10]:
            print(f"    {g}")
