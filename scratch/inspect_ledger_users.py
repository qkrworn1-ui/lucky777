import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open("scratch/all_purchases_dump.json", "r", encoding="utf-8") as f:
    all_data = json.load(f)

for doc_id, doc in all_data.items():
    ledger = doc.get("ledger", [])
    if isinstance(ledger, str):
        try: ledger = json.loads(ledger)
        except: pass
    if isinstance(ledger, list) and len(ledger) > 0:
        print(f"User: {doc_id} ({doc.get('realName')}) -> {len(ledger)} purchases")
        for p in ledger:
            print(f"  Round: {p.get('round')}, ReceiptID: {p.get('receiptId')}, Games: {len(p.get('combos', []))}")
