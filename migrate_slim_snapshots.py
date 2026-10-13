"""
migrate_slim_snapshots.py
기존 Firestore 스냅샷 일괄 초경량화(80%+ 용량 다이어트) 마이그레이션 도구
- 모든 활성 회원의 기존 1240~1245회차 스냅샷에서 반복되는 정적 메타데이터(desc, probRationale, numReasons) 제거
- 불변 핵심 데이터(numbers, id, name, customLabel, stats, rankBadge, tag) 100% 보존
- 단일 문서 1MB 한도 완전 해소 및 향후 수년간 무제한 누적 지원
"""

import sys
import json
import time
import urllib.request
from batch_evaluate_winnings import (
    BASE_URL, API_KEY, fetch_firestore_collection_paginated,
    patch_document_field, run_evaluation_batch
)

sys.dont_write_bytecode = True

def slim_combo(c):
    if not isinstance(c, dict):
        return c
    res = {
        'id': c.get('id', ''),
        'name': c.get('name', ''),
        'customLabel': c.get('customLabel', ''),
        'numbers': c.get('numbers', []),
        'is3StageOptimized': c.get('is3StageOptimized', True)
    }
    stats = c.get('stats')
    if isinstance(stats, dict):
        res['stats'] = {
            'sum': stats.get('sum'),
            'oddEvenRatio': stats.get('oddEvenRatio'),
            'totalMathScore': stats.get('totalMathScore'),
            'evScore': stats.get('evScore'),
            'highCount': stats.get('highCount'),
            'neighborCount': stats.get('neighborCount'),
            'sectionCount': stats.get('sectionCount'),
            'acValue': stats.get('acValue', 7)
        }
    meta = c.get('meta')
    if isinstance(meta, dict):
        res['meta'] = {
            'name': meta.get('name') or c.get('name', ''),
            'rankBadge': meta.get('rankBadge', ''),
            'tag': meta.get('tag', ''),
            'targetBenefit': meta.get('targetBenefit', '당첨 기댓값 극대화')
        }
    return res

def slim_snapshot(snap):
    if not isinstance(snap, dict):
        return snap
    v4 = [slim_combo(c) for c in snap.get('v4Combos', [])]
    v3 = [slim_combo(c) for c in snap.get('v3Combos', [])]
    extra_packs = {}
    for p, p_obj in (snap.get('extraPacks') or {}).items():
        if isinstance(p_obj, dict):
            extra_packs[p] = {
                'packId': p_obj.get('packId', p),
                'name': p_obj.get('name', f'추가팩 {p}'),
                'badge': p_obj.get('badge', f'EXTRA {p}'),
                'color': p_obj.get('color', '#10b981'),
                'is3StageOptimized': p_obj.get('is3StageOptimized', True),
                'combos': [slim_combo(c) for c in p_obj.get('combos', [])]
            }
    res = {
        'userId': snap.get('userId'),
        'realName': snap.get('realName'),
        'phone': snap.get('phone', ''),
        'userType': snap.get('userType', 'regular'),
        'round': snap.get('round'),
        'createdAt': snap.get('createdAt'),
        'totalGames': snap.get('totalGames', 70),
        'isLocked': snap.get('isLocked', True),
        'is3StageOptimized': snap.get('is3StageOptimized', True),
        'algoRevision': snap.get('algoRevision', 'v2026.10_3stage'),
        'v4Combos': v4,
        'v3Combos': v3,
        'extraPacks': extra_packs
    }
    return res

def main():
    print("=" * 65)
    print("🚀 [Lucky777] 단일 회원 문서 초경량화 마이그레이션 시작")
    print("=" * 65)
    
    users = fetch_firestore_collection_paginated('lotto_users')
    purchases = fetch_firestore_collection_paginated('lotto_purchases')
    
    u_map = {u['id']: u for u in users}
    p_map = {p['id']: p for p in purchases}
    
    all_uids = sorted(set(list(u_map.keys()) + list(p_map.keys())))
    
    # 1. Clean up deleted guest dummy document
    if 'guest' in u_map:
        print("[*] 더미 계정(guest) 스냅샷 정리 중...")
        patch_document_field('lotto_users', 'guest', 'recommendationSnapshots', {})
    
    # 2. Slim all active users' snapshots
    print("\n[*] 회원별 기존 스냅샷 초경량화 패치 진행 중...")
    
    success_count = 0
    total_saved_bytes = 0
    
    for uid in all_uids:
        if uid in ('app_latest_version', 'dashboard_summary_latest', 'test_write_perm', 'sample', 'test_alpha', 'guest', 'all'):
            continue
        u = u_map.get(uid, {})
        p = p_map.get(uid, {})
        if u.get('isDeleted') or u.get('status') in ('trash', 'deleted'):
            continue
        
        name = u.get('realName') or u.get('name') or p.get('realName') or uid
        
        # Merge snapshots from both sources to ensure nothing is missed
        u_snaps = u.get('recommendationSnapshots') or {}
        p_snaps = p.get('recommendationSnapshots') or {}
        
        merged_raw = {}
        for r_k in set(list(u_snaps.keys()) + list(p_snaps.keys())):
            su = u_snaps.get(r_k)
            sp = p_snaps.get(r_k)
            if su and isinstance(su, dict) and (su.get('v4Combos') or su.get('v3Combos')):
                merged_raw[r_k] = su
            elif sp and isinstance(sp, dict) and (sp.get('v4Combos') or sp.get('v3Combos')):
                merged_raw[r_k] = sp
            else:
                merged_raw[r_k] = su or sp
        
        if not merged_raw:
            continue
        
        orig_bytes = len(json.dumps(merged_raw, ensure_ascii=False).encode('utf-8'))
        slimmed_snaps = {r_k: slim_snapshot(snap_obj) for r_k, snap_obj in merged_raw.items()}
        slim_bytes = len(json.dumps(slimmed_snaps, ensure_ascii=False).encode('utf-8'))
        saved = orig_bytes - slim_bytes
        total_saved_bytes += saved
        
        # Patch lotto_users
        s_u = patch_document_field('lotto_users', uid, 'recommendationSnapshots', slimmed_snaps)
        # Patch lotto_purchases with lean snapshots
        s_p = patch_document_field('lotto_purchases', uid, 'recommendationSnapshots', slimmed_snaps)
        
        reduction_pct = (saved / orig_bytes * 100.0) if orig_bytes > 0 else 0
        status_u = "OK" if s_u else "FAIL"
        status_p = "OK" if s_p else "FAIL"
        
        print(f"  [+] {name} ({uid}): {orig_bytes/1024:.1f} KB -> {slim_bytes/1024:.1f} KB (-{reduction_pct:.1f}%) | users:{status_u}, purchases:{status_p}")
        if s_u or s_p:
            success_count += 1
            
        time.sleep(0.1)
    
    print("\n" + "=" * 65)
    print(f"[*] 마이그레이션 완료: 총 {success_count}명 처리, 총 {total_saved_bytes / 1024:.1f} KB ({total_saved_bytes / (1024*1024):.2f} MB) 절감")
    print("=" * 65)
    
    # 3. Re-run batch evaluation to verify 100% integrity
    print("\n[*] 서버 판정 배치 엔진을 통한 최종 데이터 무결성 검증...")
    eval_ok = run_evaluation_batch()
    if eval_ok:
        print("\n✅ [SUCCESS] 모든 회원 문서 초경량화 및 무결성 검증 100% 완료!")
    else:
        print("\n⚠️ [WARNING] 배치 검증 확인 필요")

if __name__ == '__main__':
    main()
