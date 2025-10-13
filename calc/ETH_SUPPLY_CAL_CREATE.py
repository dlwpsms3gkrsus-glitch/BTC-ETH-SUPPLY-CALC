import pandas as pd
import requests
import json
import sys
import os

def get_full_supply_data():
    """CoinMetrics에서 전체 이더리움 총공급량 데이터를 가져옵니다."""
    print("▶ 1단계: 전체 이더리움 공급량 데이터를 다운로드합니다...")
    try:
        start_date = "2015-07-30"
        url = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics"
        params = {
            "assets": "eth",
            "metrics": "SplyCur",
            "start_time": f"{start_date}T00:00:00Z",
            "frequency": "1d",
            "page_size": 10000
        }
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json().get('data', [])
        if not data:
            raise ValueError("데이터를 가져오지 못했습니다.")

        # 'asset' 키 추가
        for item in data:
            item['asset'] = 'eth'
        
        df = pd.DataFrame(data)
        df.rename(columns={'time': 'Date', 'SplyCur': 'Supply'}, inplace=True)
        df['Date'] = pd.to_datetime(df['Date']).dt.strftime('%Y-%m-%d')
        df['Supply'] = pd.to_numeric(df['Supply'])
        
        print("✔️ 전체 공급량 데이터 다운로드 완료.")
        return df
    except Exception as e:
        print(f"❌ 총공급량 데이터 다운로드 중 오류 발생: {e}")
        return None

# --- 메인 코드 실행 ---
if __name__ == "__main__":
    supply_df = get_full_supply_data()

    if supply_df is None:
        sys.exit("\n프로그램을 종료합니다.")

    # DataFrame을 JavaScript가 사용할 JSON 데이터로 변환
    data_json = supply_df.to_json(orient='records')
    
    # 1. JavaScript 파일 내용 생성
    # 변수명을 ethSupplyData로 지정합니다.
    js_content = f"const ethSupplyData = {data_json};"

    # 2. JS 파일로 저장
    file_name = "eth_supply_data.js"
    with open(file_name, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"\n✅ 성공! 공급량 데이터가 '{file_name}' 파일로 저장되었습니다.")
