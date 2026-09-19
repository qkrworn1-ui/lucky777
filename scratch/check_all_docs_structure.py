import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

with open("scratch/all_purchases_dump.json", "r", encoding="utf-8") as f:
    all_data = json.load(f)

for doc_id, doc in all_data.items():
    print("=" * 60)
    print(f"DOCUMENT ID: {doc_id} | Name: {doc.get('realName')}")
    print("=" * 60)
    ledger = doc.get("ledger", [])
    if isinstance(ledger, str):
        try: ledger = json.loads(ledger)
        except: pass
    if isinstance(ledger, list) and len(ledger) > 0:
        print(f"  [Ledger Purchases ({len(ledger)})]:")
        for p in ledger:
            print(f"    - Round {p.get('round')}: ID {p.get('receiptId')}, Combos: {len(p.get('combos', []))}, Locked: {p.get('isLocked')}")
    else:
        print(f"  [Ledger]: Empty or 0 records")
        
    snaps = doc.get("recommendationSnapshots", {})
    if isinstance(snaps, str):
        try: snaps = json.loads(snaps)
        except: pass
    if isinstance(snaps, dict):
        print(f"  [Recommendation Snapshots]: Rounds -> {list(snaps.keys())}")
        for r_key, r_snap in snaps.items():
            if isinstance(r_snap, dict):
                print(f"    Round {r_key}: keys -> {list(r_snap.keys())}")
                if 'combos' in r_snap:
                    print(f"      combos length: {len(r_snap['combos'])}")
                if 'algorithms' in r_snap:
                    algos = r_snap['algorithms']
                    print(f"      algorithms: {len(algos)} items -> {type(algos)}")
                    if isinstance(algos, list):
                        for a in algos:
                            print(f"        algo: {a.get('algoName')} | count: {len(a.get('combos', [])) if 'combos' in a else 'no combos key'}")
                            if 'combos' in a:
                                print(f"           sample combo: {a['combos'][0] if len(a['combos']) > 0 else 'none'}")
