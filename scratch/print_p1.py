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
p1 = snap_1242.get("extraPacks", {}).get("1", {}).get("combos", [])
print(f"Pack 1 combos length: {len(p1)}")
for idx, c in enumerate(p1):
    print(f"  Game {idx+21}: {c.get('numbers')} | {c.get('meta', {}).get('tag')}")
