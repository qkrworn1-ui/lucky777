import urllib.request, json, sys
if sys.platform == 'win32': sys.stdout.reconfigure(encoding='utf-8')

url = 'https://firestore.googleapis.com/v1/projects/sonamu-jokgu-club/databases/(default)/documents/lotto_purchases/kakao_5070244665?key=AIzaSyAnkGVAlO39p6rnTEibygeQTBYDbp505dA'
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
snaps = fields.get('recommendationSnapshots', {})
for r, s in snaps.items():
    print(f"Round {r}:")
    print("  keys:", list(s.keys()) if isinstance(s, dict) else type(s))
    if isinstance(s, dict):
        print("  v4Combos len:", len(s.get('v4Combos', [])))
        print("  v3Combos len:", len(s.get('v3Combos', [])))
        ep = s.get('extraPacks')
        print("  extraPacks type:", type(ep), "len:", len(ep) if isinstance(ep, (dict, list)) else ep)
        if isinstance(ep, dict):
            print("  extraPacks keys:", list(ep.keys()))
            for ep_k, ep_v in ep.items():
                print(f"    ep[{ep_k}]:", type(ep_v), ep_v.get('name') if isinstance(ep_v, dict) else '')
