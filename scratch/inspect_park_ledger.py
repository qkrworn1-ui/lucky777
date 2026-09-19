import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open("scratch/all_purchases_dump.json", "r", encoding="utf-8") as f:
    all_data = json.load(f)

park_doc = all_data.get("kakao_5070244665", {})
ledger = park_doc.get("ledger", {})
if isinstance(ledger, str):
    try: ledger = json.loads(ledger)
    except: pass

print("=== PARK JAE-GU LEDGER ROUNDS ===")
print(f"Rounds present in ledger: {list(ledger.keys()) if isinstance(ledger, dict) else type(ledger)}")

if isinstance(ledger, dict):
    for r_num, r_purchases in ledger.items():
        print(f"\n--- Round {r_num} ({len(r_purchases)} receipts) ---")
        for p in r_purchases:
            print(f"  Receipt ID: {p.get('receiptId')}")
            print(f"  QR Raw: {p.get('qrMeta', {}).get('qrRawUrl') if isinstance(p.get('qrMeta'), dict) else p.get('qrRawUrl')}")
            combos = p.get('combos', [])
            print(f"  Combos ({len(combos)} games):")
            for c_idx, c in enumerate(combos):
                nums = c.get('numbers') if isinstance(c, dict) else c
                meta = c.get('meta') if isinstance(c, dict) else {}
                print(f"    {chr(65+c_idx)}: {nums} | {meta}")
