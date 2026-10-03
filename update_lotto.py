import os
import sys
import re
import json
import requests
from bs4 import BeautifulSoup
import time

sys.dont_write_bytecode = True

DATA_JS_PATH = 'data.js'

def get_latest_round_from_data():
    """data.js 파일에서 가장 최신 회차 번호를 찾습니다."""
    try:
        with open(DATA_JS_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # 정규표현식으로 키(회차)들을 추출합니다.
        # 예: "1132": { ... }
        matches = re.findall(r'"(\d+)":\s*\{', content)
        if not matches:
            print("데이터 파일에서 회차 정보를 찾을 수 없습니다.")
            return None
            
        rounds = [int(m) for m in matches]
        return max(rounds)
    except Exception as e:
        print(f"data.js 읽기 오류: {e}")
        return None

def fetch_from_dhlottery(draw_no):
    """동행복권 공식 신규 API(2026)에서 데이터를 가져옵니다."""
    url = f"https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchLtEpsd={draw_no}&_={int(time.time()*1000)}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'https://www.dhlottery.co.kr/lt645/resultPstLt645.do',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest'
    }
    
    try:
        print(f"동행복권 API 요청 중... (회차: {draw_no})")
        res = requests.get(url, headers=headers, timeout=10)
        
        data = res.json()
        item_list = data.get('data', {}).get('list', []) if isinstance(data, dict) else []
        item = item_list[0] if (isinstance(item_list, list) and len(item_list) > 0) else None
        if item and item.get('tm1WnNo'):
            numbers = [
                item['tm1WnNo'], item['tm2WnNo'], item['tm3WnNo'],
                item['tm4WnNo'], item['tm5WnNo'], item['tm6WnNo']
            ]
            bonus = item['bnsWnNo']
            winners = item.get('rnk1WnNope', 0)
            prize = item.get('rnk1WnAmt', 0)
            rank2_prize = item.get('rnk2WnAmt', 50000000)
            rank3_prize = item.get('rnk3WnAmt', 1500000)
            raw_date = str(item.get('ltRflYmd', ''))
            date_str = f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:]}" if len(raw_date) == 8 else raw_date
            
            return {
                "numbers": sorted(numbers),
                "bonus": bonus,
                "rank1Winners": winners,
                "rank1Prize": prize,
                "rank2Prize": rank2_prize,
                "rank3Prize": rank3_prize,
                "date": date_str
            }
        else:
            print(f"{draw_no}회차 데이터가 아직 없거나 추첨 전입니다.")
            return None
            
    except Exception as e:
        print(f"동행복권 API 통신 오류: {e}")
        return None

def fetch_from_naver(draw_no):
    """네이버 검색을 통해 데이터를 가져옵니다 (예비/Fallback)."""
    import urllib.parse
    q = urllib.parse.quote(f"로또 {draw_no}회 당첨번호")
    url = f"https://search.naver.com/search.naver?query={q}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
    
    try:
        print(f"네이버 검색 시도 중... (회차: {draw_no})")
        res = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(res.text, 'html.parser')
        
        lotto_box = soup.select_one('.cs_lotto') or soup.select_one('._lotto') or soup.select_one('.num_box')
        if not lotto_box:
            print("네이버 검색결과에서 로또 번호 영역을 찾을 수 없습니다.")
            return None
            
        # 회차 일치 여부 정밀 검증 (네이버는 아직 추첨 전인 회차 검색 시 직전 회차 결과를 노출함)
        m = re.search(r'(\d+)\s*회', lotto_box.get_text())
        if m:
            found_round = int(m.group(1))
            if found_round != draw_no:
                print(f"네이버 검색결과가 요청 회차({draw_no}회)가 아닌 {found_round}회차 정보입니다. (아직 추첨 전)")
                return None
            
        ball_elements = lotto_box.select('.ball')
        numbers = []
        bonus = 0

        if len(ball_elements) >= 7:
            numbers = [int(b.text.strip()) for b in ball_elements[:6]]
            bonus = int(ball_elements[6].text.strip())
        elif len(ball_elements) == 6:
            numbers = [int(b.text.strip()) for b in ball_elements[:6]]
            bonus_el = lotto_box.select_one('.bonus_number') or lotto_box.select_one('.bonus')
            bonus = int(bonus_el.text.strip()) if bonus_el else 0
        else:
            num_elements = lotto_box.select('.num')
            if len(num_elements) >= 7:
                numbers = [int(b.text.strip()) for b in num_elements[:6]]
                bonus = int(num_elements[6].text.strip())

        if len(numbers) != 6 or not bonus:
            print("당첨번호 또는 보너스 번호 파싱 실패.")
            return None
            
        winners = 0
        prize = 0
        rank2_prize = 50000000
        rank3_prize = 1500000
        
        try:
            rows = lotto_box.select('tr')
            for tr in rows:
                texts = [td.text.replace(',', '').strip() for td in tr.find_all(['td', 'th'])]
                row_str = ' '.join(texts)
                if '1등 당첨금' in row_str:
                    digits = [int(t.replace('원', '')) for t in texts if t.replace('원', '').isdigit()]
                    if digits: prize = digits[0]
                elif '당첨자 수' in row_str and winners == 0:
                    digits = [int(t.replace('명', '')) for t in texts if t.replace('명', '').isdigit()]
                    if digits: winners = digits[0]
                elif '2등' in row_str and '당첨금' in row_str:
                    digits = [int(t.replace('원', '')) for t in texts if t.replace('원', '').isdigit()]
                    if digits: rank2_prize = digits[0]
                elif '3등' in row_str and '당첨금' in row_str:
                    digits = [int(t.replace('원', '')) for t in texts if t.replace('원', '').isdigit()]
                    if digits: rank3_prize = digits[0]
        except Exception as e:
            print(f"당첨금/당첨자 정보 파싱 중 무시된 오류: {e}")
            
        print(f"네이버 파싱 성공! 번호: {numbers}, 보너스: {bonus} (1등: {prize:,}원, {winners}명)")
        return {
            "numbers": sorted(numbers),
            "bonus": bonus,
            "rank1Winners": winners,
            "rank1Prize": prize,
            "rank2Prize": rank2_prize,
            "rank3Prize": rank3_prize,
            "date": ""
        }
    except Exception as e:
        print(f"네이버 파싱 오류: {e}")
        return None

def update_data_js(draw_no, new_data):
    """새로운 회차 데이터를 data.js에 업데이트합니다."""
    try:
        with open(DATA_JS_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
            
        idx = content.rfind('};')
        if idx == -1:
            idx = content.rfind('}')
            
        if idx != -1:
            date_field = f',"date":"{new_data["date"]}"' if new_data.get("date") else ''
            entry = f',"{draw_no}":{{"numbers":{new_data["numbers"]},"bonus":{new_data["bonus"]},"rank1Winners":{new_data["rank1Winners"]},"rank1Prize":{new_data["rank1Prize"]},"rank2Prize":{new_data.get("rank2Prize", 50000000)},"rank3Prize":{new_data.get("rank3Prize", 1500000)},"rank4Prize":50000,"rank5Prize":5000{date_field}}}'
            new_content = content[:idx] + entry + content[idx:]
            with open(DATA_JS_PATH, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"\n성공! data.js 파일이 {draw_no}회차 데이터로 업데이트 되었습니다.")
            print(f"[{draw_no}회] 당첨번호: {new_data['numbers']} + 보너스 {new_data['bonus']} (1등: {new_data['rank1Prize']:,}원, {new_data['rank1Winners']}명)")
            return True
        else:
            print("data.js 파일 끝 형식을 찾을 수 없습니다.")
            return False
            
    except Exception as e:
        print(f"data.js 파일 업데이트 오류: {e}")
        return False

def main():
    print("=== 로또 당첨번호 자동 스크래퍼 ===")
    latest_round = get_latest_round_from_data()
    if not latest_round:
        return
        
    print(f"현재 data.js의 최신 회차는 {latest_round}회 입니다.")
    
    next_round = latest_round + 1
    updated_any = False
    
    while True:
        print(f"\n--- 업데이트 대상 회차: {next_round}회 ---")
        
        # 1순위: 동행복권 API
        new_data = fetch_from_dhlottery(next_round)
        
        # 2순위: 네이버 검색
        if not new_data:
            print("네이버 검색 예비책(Fallback) 가동...")
            new_data = fetch_from_naver(next_round)
            
        if new_data:
            success = update_data_js(next_round, new_data)
            if success:
                updated_any = True
                next_round += 1
                time.sleep(1) # 연속 요청 시 차단 방지 대기
            else:
                break
        else:
            print(f"\n[종료] {next_round}회차 데이터를 찾을 수 없습니다.")
            print("모든 최신 회차 업데이트가 완료되었거나, 아직 최신 추첨 전입니다.")
            break

    if updated_any:
        print(f"\n완료! {next_round - 1}회까지 업데이트되었습니다.")
        try:
            print("\n[*] 최신 추첨 회차 반영에 따른 서버 사전 판별 및 대시보드 요약 갱신 실행 중...")
            import batch_evaluate_winnings
            batch_evaluate_winnings.run_evaluation_batch()
        except Exception as e:
            print(f"[!] 서버 사전 판별 배치 실행 중 오류 (무시됨): {e}")

if __name__ == '__main__':
    main()
