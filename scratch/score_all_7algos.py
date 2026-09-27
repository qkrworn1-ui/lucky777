import urllib.request, json, sys
if sys.platform == 'win32': sys.stdout.reconfigure(encoding='utf-8')

OFFICIAL_DRAWS = {
    1235: {'numbers': [6, 14, 22, 29, 36, 41], 'bonus': 17, 'rank1Prize': 1985670000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.08.01'},
    1236: {'numbers': [3, 11, 18, 25, 33, 42], 'bonus': 8, 'rank1Prize': 2450320000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.08.08'},
    1237: {'numbers': [2, 9, 16, 27, 34, 45], 'bonus': 21, 'rank1Prize': 2180450000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.08.15'},
    1238: {'numbers': [2, 13, 18, 32, 38, 42], 'bonus': 22, 'rank1Prize': 1197250000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.08.22'},
    1239: {'numbers': [1, 3, 17, 26, 33, 42], 'bonus': 41, 'rank1Prize': 1980500000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.08.29'},
    1240: {'numbers': [11, 13, 19, 20, 31, 44], 'bonus': 27, 'rank1Prize': 2000000000, 'rank2Prize': 52000000, 'rank3Prize': 1450000, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.09.05'},
    1241: {'numbers': [7, 13, 16, 23, 24, 43], 'bonus': 9, 'rank1Prize': 1628391980, 'rank2Prize': 54279733, 'rank3Prize': 1501284, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.09.12'},
    1242: {'numbers': [2, 4, 10, 16, 31, 41], 'bonus': 9, 'rank1Prize': 3281029250, 'rank2Prize': 47322538, 'rank3Prize': 1535105, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.09.19'},
    1243: {'numbers': [9, 18, 24, 38, 43, 44], 'bonus': 35, 'rank1Prize': 2200000000, 'rank2Prize': 50000000, 'rank3Prize': 1500000, 'rank4Prize': 50000, 'rank5Prize': 5000, 'date': '2026.09.26'}
}

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
    if isinstance(c, dict): return c.get('numbers') or c.get('sorted') or []
    if isinstance(c, list): return c
    return []

def fetch_doc(col, doc):
    url = f"https://firestore.googleapis.com/v1/projects/sonamu-jokgu-club/databases/(default)/documents/{col}/{doc}?key=AIzaSyAnkGVAlO39p6rnTEibygeQTBYDbp505dA"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read().decode('utf-8'))
    return {k: decode_val(v) for k, v in data.get('fields', {}).items()}

guest_doc = fetch_doc('lotto_purchases', 'guest')
kakao_doc = fetch_doc('lotto_purchases', 'kakao_5070244665')

guest_snaps = guest_doc.get('recommendationSnapshots', {})
kakao_snaps = kakao_doc.get('recommendationSnapshots', {})

# Map full unified official snapshots: 1235~1239 from guest, 1240~1243 from kakao
unified_snaps = {}
for r in [1235, 1236, 1237, 1238, 1239]:
    unified_snaps[r] = guest_snaps.get(str(r))
for r in [1240, 1241, 1242, 1243]:
    unified_snaps[r] = kakao_snaps.get(str(r))

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

SEVEN_ALGOS = ['v4', 'v3', 'extra1', 'extra2', 'extra3', 'extra4', 'extra5']
algo_names = {
    'v4': 'V4.0 행동경제학 포트폴리오 (10게임)',
    'v3': 'V3.0 하이브리드 정통 수학 (10게임)',
    'extra1': '추가 1: 30게임 완성형 100% 전수 커버리지팩 (10게임)',
    'extra2': '추가 2: 초고배당 EV 독점 수령팩 (10게임)',
    'extra3': '추가 3: 기하학적 휠링 하모닉팩 (10게임)',
    'extra4': '추가 4: 마르코프 2차 전이 & 페어 부스터팩 (10게임)',
    'extra5': '추가 5: 골든 클러스터 올인팩 (10게임)'
}

algo_results = {a: {'prize': 0, 'hits': {1:0, 2:0, 3:0, 4:0, 5:0}, 'rounds': []} for a in SEVEN_ALGOS}

for r in range(1235, 1244):
    s = unified_snaps.get(r)
    if not s:
        print(f"Missing snap for {r}")
        continue
    draw = OFFICIAL_DRAWS[r]
    v4 = s.get('v4Combos', [])
    v3 = s.get('v3Combos', [])
    ep = s.get('extraPacks', {})
    
    # v4
    h_v4, p_v4, it_v4 = score_combos(v4, draw)
    algo_results['v4']['prize'] += p_v4
    for rk in range(1, 6): algo_results['v4']['hits'][rk] += h_v4[rk]
    if it_v4: algo_results['v4']['rounds'].append((r, p_v4, it_v4))
    
    # v3
    h_v3, p_v3, it_v3 = score_combos(v3, draw)
    algo_results['v3']['prize'] += p_v3
    for rk in range(1, 6): algo_results['v3']['hits'][rk] += h_v3[rk]
    if it_v3: algo_results['v3']['rounds'].append((r, p_v3, it_v3))
    
    # extra 1..5
    for pId in range(1, 6):
        a_id = f'extra{pId}'
        pack = ep.get(str(pId), {})
        p_combos = pack.get('combos', [])
        h_ep, p_ep, it_ep = score_combos(p_combos, draw)
        algo_results[a_id]['prize'] += p_ep
        for rk in range(1, 6): algo_results[a_id]['hits'][rk] += h_ep[rk]
        if it_ep: algo_results[a_id]['rounds'].append((r, p_ep, it_ep))

print("=== 7대 알고리즘 실데이터 스냅샷 기준 전수 집계 (1235~1243회) ===")
total_all_prizes = 0
total_all_hits = {1:0, 2:0, 3:0, 4:0, 5:0}
for a in SEVEN_ALGOS:
    res = algo_results[a]
    total_all_prizes += res['prize']
    for rk in range(1, 6): total_all_hits[rk] += res['hits'][rk]
    w_count = sum(res['hits'].values())
    print(f"\n[{a}] {algo_names[a]}")
    print(f"   누적 당첨금: {res['prize']:,}원 | 총 적중: {w_count}회 (4등: {res['hits'][4]}, 5등: {res['hits'][5]})")
    for r_num, prz, items in res['rounds']:
        desc = ", ".join([f"#{it[0]} {it[1]}등({it[2]:,}원)" for it in items])
        print(f"      제 {r_num}회: +{prz:,}원 ({desc})")

print("\n" + "=" * 60)
print(f"👑 7대 알고리즘 총 누적 당첨금: {total_all_prizes:,}원")
print(f"🎯 총 적중 건수: {sum(total_all_hits.values())}회 (4등: {total_all_hits[4]}개, 5등: {total_all_hits[5]}개)")
print("=" * 60)
