import urllib.request, json, sys
if sys.platform == 'win32': sys.stdout.reconfigure(encoding='utf-8')

# Official Draws
OFFICIAL_DRAWS = {
    1240: {'numbers': [11, 13, 19, 20, 31, 44], 'bonus': 27, 'rank1Prize': 2000000000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000},
    1241: {'numbers': [7, 13, 16, 23, 24, 43], 'bonus': 9, 'rank1Prize': 1628391980, 'rank2Prize': 54279733, 'rank3Prize': 1501284, 'rank4Prize': 50000, 'rank5Prize': 5000},
    1242: {'numbers': [2, 4, 10, 16, 31, 41], 'bonus': 9, 'rank1Prize': 3281029250, 'rank2Prize': 47322538, 'rank3Prize': 1535105, 'rank4Prize': 50000, 'rank5Prize': 5000},
    1243: {'numbers': [9, 18, 24, 38, 43, 44], 'bonus': 35, 'rank1Prize': 2200000000, 'rank2Prize': 50000000, 'rank3Prize': 1500000, 'rank4Prize': 50000, 'rank5Prize': 5000}
}

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

def get_combo_nums(c):
    if isinstance(c, dict):
        return c.get('numbers') or c.get('sorted') or []
    if isinstance(c, list):
        return c
    return []

fields = {k: decode_val(v) for k, v in data.get('fields', {}).items()}
snaps = fields.get('recommendationSnapshots', {})

def score_combos(combos, draw):
    win_set = set(draw['numbers'])
    bonus = draw['bonus']
    hits = {1:0, 2:0, 3:0, 4:0, 5:0}
    prize = 0
    items = []
    for idx, c in enumerate(combos, 1):
        nums = get_combo_nums(c)
        matches = [n for n in nums if n in win_set]
        m_count = len(matches)
        has_bonus = bonus in nums
        rk = 0
        p = 0
        if m_count == 6: rk = 1; p = draw['rank1Prize']
        elif m_count == 5 and has_bonus: rk = 2; p = draw['rank2Prize']
        elif m_count == 5: rk = 3; p = draw['rank3Prize']
        elif m_count == 4: rk = 4; p = draw['rank4Prize']
        elif m_count == 3: rk = 5; p = draw['rank5Prize']
        if rk > 0:
            hits[rk] += 1
            prize += p
            items.append((idx, rk, p, nums, matches))
    return hits, prize, items

grand_algo_prizes = {'v4':0, 'v3':0, 'extra1':0, 'extra2':0, 'extra3':0, 'extra4':0, 'extra5':0}

for r in [1240, 1241, 1242, 1243]:
    s = snaps.get(str(r), {})
    draw = OFFICIAL_DRAWS[r]
    print(f"\n--- Round {r} ---")
    v4 = s.get('v4Combos', [])
    v3 = s.get('v3Combos', [])
    ep = s.get('extraPacks', {})
    
    h_v4, p_v4, it_v4 = score_combos(v4, draw)
    h_v3, p_v3, it_v3 = score_combos(v3, draw)
    grand_algo_prizes['v4'] += p_v4
    grand_algo_prizes['v3'] += p_v3
    if it_v4: print(f"  V4: {p_v4:,}원, hits={h_v4}, items={it_v4}")
    if it_v3: print(f"  V3: {p_v3:,}원, hits={h_v3}, items={it_v3}")
    
    for pId in range(1, 6):
        pack = ep.get(str(pId), {})
        p_combos = pack.get('combos', [])
        h_ep, p_ep, it_ep = score_combos(p_combos, draw)
        grand_algo_prizes[f'extra{pId}'] += p_ep
        if it_ep: print(f"  Extra {pId} ({pack.get('name')}): {p_ep:,}원, hits={h_ep}, items={it_ep}")

print("\n=== Grand Algo Prizes for kakao_5070244665 ===")
for algo_id, p in grand_algo_prizes.items():
    print(f"  {algo_id}: {p:,}원")
print("Total Prize:", sum(grand_algo_prizes.values()))
