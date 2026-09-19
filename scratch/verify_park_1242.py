import json
import urllib.request
import os

API_KEY = "AIzaSyAnkGVAlO39p6rnTEibygeQTBYDbp505dA"
PROJECT_ID = "sonamu-jokgu-club"

# 1. Check data.js for latest round and round 1242
with open("data.js", "r", encoding="utf-8") as f:
    text = f.read()
json_str = text.split("const LOTTO_HISTORY = ")[1].strip().rstrip(";")
history = json.loads(json_str)

max_round = max([int(k) for k in history.keys()])
print(f"[*] data.js max round: {max_round}")
if "1242" in history:
    print(f"[*] 1242 draw in data.js: {history['1242']}")
else:
    print(f"[*] 1242 is not yet drawn in data.js (latest is {max_round})")

# 2. Query Firestore lotto_purchases
print("\n[*] Querying Firestore lotto_purchases...")
url = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents/lotto_purchases?key={API_KEY}&pageSize=300"

req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        docs = data.get('documents', [])
        print(f"[*] Total purchase docs found: {len(docs)}")
        
        park_purchases = []
        r1242_purchases = []
        
        for doc in docs:
            fields = doc.get('fields', {})
            doc_name = doc.get('name', '').split('/')[-1]
            
            # Helper to decode firestore fields
            def decode_val(v):
                if not isinstance(v, dict):
                    return v
                if 'stringValue' in v: return v['stringValue']
                if 'integerValue' in v: return int(v['integerValue'])
                if 'doubleValue' in v: return float(v['doubleValue'])
                if 'booleanValue' in v: return v['booleanValue']
                if 'arrayValue' in v:
                    return [decode_val(x) for x in v['arrayValue'].get('values', [])]
                if 'mapValue' in v:
                    return {k: decode_val(val) for k, val in v['mapValue'].get('fields', {}).items()}
                return v
            
            decoded = {k: decode_val(v) for k, v in fields.items()}
            decoded['docId'] = doc_name
            
            user = decoded.get('user') or decoded.get('userId')
            round_num = decoded.get('round') or decoded.get('drwNo')
            
            if user in ['kakao_5070244665', '박재구', 'master']:
                park_purchases.append(decoded)
            if str(round_num) == '1242':
                r1242_purchases.append(decoded)
                
        print(f"\n[*] Total Park purchases: {len(park_purchases)}")
        for p in park_purchases:
            print(f"  - Doc: {p.get('docId')}, User: {p.get('user')}, Round: {p.get('round')}, Games: {len(p.get('combos', []))}, CreatedAt: {p.get('createdAt')}")
            
        print(f"\n[*] Total 1242 purchases: {len(r1242_purchases)}")
        for p in r1242_purchases:
            print(f"  - Doc: {p.get('docId')}, User: {p.get('user')}, Round: {p.get('round')}, Games: {len(p.get('combos', []))}, CreatedAt: {p.get('createdAt')}")
            
except Exception as e:
    print(f"[!] Error querying purchases: {e}")

# 3. Check for recommendation_snapshots or user_recommendations in Firestore
for coll in ['recommendation_snapshots', 'user_recommendations', 'lotto_recommendations']:
    url_coll = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents/{coll}?key={API_KEY}&pageSize=100"
    try:
        req = urllib.request.Request(url_coll, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            docs = data.get('documents', [])
            print(f"\n[*] Collection '{coll}' docs count: {len(docs)}")
            for d in docs[:5]:
                print(f"  - {d.get('name', '').split('/')[-1]}")
    except Exception as e:
        print(f"\n[*] Collection '{coll}' query skipped/not found: {e}")
