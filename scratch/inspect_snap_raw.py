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
print("=== SNAP_1242 KEYS ===")
for k in snap_1242.keys():
    print(f"Key: {k} (type: {type(snap_1242[k])})")

print("\n=== EXTRA PACKS ===")
print(json.dumps(snap_1242.get("extraPacks"), indent=2, ensure_ascii=False))

print("\n=== ALGORITHMS ===")
print(json.dumps(snap_1242.get("algorithms"), indent=2, ensure_ascii=False))
