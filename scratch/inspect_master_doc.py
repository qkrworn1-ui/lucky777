import urllib.request, json, sys
if sys.platform == 'win32': sys.stdout.reconfigure(encoding='utf-8')

url = 'https://firestore.googleapis.com/v1/projects/sonamu-jokgu-club/databases/(default)/documents/lotto_purchases/master?key=AIzaSyAnkGVAlO39p6rnTEibygeQTBYDbp505dA'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
resp = urllib.request.urlopen(req)
data = json.loads(resp.read().decode('utf-8'))

def decode_val(v):
    if not isinstance(v, dict): return v
    if 'stringValue' in v: return v['stringValue']
    if 'integerValue' in v: return int(v['integerValue'])
    if 'doubleValue' in v: return float(v['doubleValue'])
    if 'booleanValue' in v: return v['booleanValue']
    if 'nullValue' in v: return None
    if 'arrayValue' in v: return [decode_val(x) for x in v['arrayValue'].get('values', [])]
    if 'mapValue' in v:
        return {k: decode_val(sub_v) for k, sub_v in v['mapValue'].get('fields', {}).items()}
    return v

fields = {k: decode_val(v) for k, v in data.get('fields', {}).items()}
print("Fields in lotto_purchases/master:")
for k, v in fields.items():
    if k not in ['ledger', 'recommendationSnapshots', 'snapshots']:
        print(f"  {k}: {v}")
    elif k in ['recommendationSnapshots', 'snapshots']:
        print(f"  {k}: {list(v.keys()) if isinstance(v, dict) else type(v)}")
    elif k == 'ledger':
        print(f"  ledger: rounds {list(v.keys()) if isinstance(v, dict) else type(v)}")
