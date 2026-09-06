import os
import re
import json
import requests
from bs4 import BeautifulSoup
import time

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
        item = data.get('data', {}).get('list', [None])[0] if isinstance(data, dict) else None
        if item and item.get('tm1WnNo'):
            numbers = [
                item['tm1WnNo'], item['tm2WnNo'], item['tm3WnNo'],
                item['tm4WnNo'], item['tm5WnNo'], item['tm6WnNo']
            ]
            bonus = item['bnsWnNo']
            winners = item.get('rnk1WnNope', 0)
            prize = item.get('rnk1WnAmt', 0)
            
            return {
                "numbers": sorted(numbers),
                "bonus": bonus,
                "rank1Winners": winners,
                "rank1Prize": prize
            }
        else:
            print(f"{draw_no}회차 데이터가 아직 없거나 추첨 전입니다.")
            return None
            
    except Exception as e:
        print(f"동행복권 API 통신 오류: {e}")
        return None

def fetch_from_naver(draw_no):
    """네이버 검색을 통해 데이터를 가져옵니다 (예비/Fallback)."""
    url = f"https://search.naver.com/search.naver?query=로또+{draw_no}회+당첨번호"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        print(f"네이버 검색 시도 중... (회차: {draw_no})")
        res = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # 네이버 로또 당첨번호 위젯 파싱
        # 보통 .num_box 엘리먼트 안에 당첨번호 6개와 보너스 번호 1개가 차례대로 존재함
        num_box = soup.select_one('.num_box')
        if not num_box:
            print("네이버 검색결과에서 로또 번호 영역을 찾을 수 없습니다.")
            return None
            
        spans = num_box.select('.num')
        if len(spans) < 7:
            print("당첨번호 또는 보너스 번호 파싱 실패.")
            return None
            
        numbers = [int(span.text) for span in spans[:6]]
        bonus = int(spans[6].text)
        
        # 1등 당첨자수, 당첨금액 파싱 시도 (네이버 위젯 구조에 따라 다름)
        # 네이버 위젯에서 1등 당첨금 정보가 항상 안정적으로 제공되지는 않을 수 있으므로 0으로 초기화
        winners = 0
        prize = 0
        
        try:
            info_table = soup.select('.lotto_info table tbody tr')
            for tr in info_table:
                th = tr.select_one('th')
                if th and '1등' in th.text:
                    tds = tr.select('td')
                    if len(tds) >= 3:
                        prize_text = tds[1].text.replace(',', '').replace('원', '').strip()
                        winners_text = tds[2].text.replace('명', '').strip()
                        prize = int(prize_text) if prize_text.isdigit() else 0
                        winners = int(winners_text) if winners_text.isdigit() else 0
                        break
        except Exception as e:
            print(f"당첨금/당첨자 정보 파싱 중 무시된 오류: {e}")
            
        print(f"네이버 파싱 성공! 번호: {numbers}, 보너스: {bonus}")
        return {
            "numbers": numbers,
            "bonus": bonus,
            "rank1Winners": winners,
            "rank1Prize": prize
        }
    except Exception as e:
        print(f"네이버 파싱 오류: {e}")
        return None

def update_data_js(draw_no, new_data):
    """새로운 회차 데이터를 data.js에 업데이트합니다."""
    try:
        with open(DATA_JS_PATH, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # 포맷팅된 JSON 문자열 생성
        new_entry = f'"{draw_no}":{{"numbers":{new_data["numbers"]},"bonus":{new_data["bonus"]},"rank1Winners":{new_data["rank1Winners"]},"rank1Prize":{new_data["rank1Prize"]}}}'
        
        # 기존 데이터를 찾아서 그 앞에 새 데이터를 끼워넣음
        # "const lottoHistory = {" 다음에 데이터를 삽입
        target_str = "const lottoHistory = {"
        if target_str in content:
            new_content = content.replace(target_str, f"{target_str}\n    {new_entry},")
            with open(DATA_JS_PATH, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"\n성공! data.js 파일이 {draw_no}회차 데이터로 업데이트 되었습니다.")
            print(f"[{draw_no}회] 당첨번호: {new_data['numbers']} + 보너스 {new_data['bonus']}")
            return True
        else:
            print("data.js에서 lottoHistory 변수를 찾을 수 없습니다.")
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

if __name__ == '__main__':
    main()
