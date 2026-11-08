# 검증 기록

검증일: 2026-11-08

## 통과

- `node --test community/tests/model.test.cjs`: 26/26 통과
- `node --check community/model.js`, `app.js`, `tests/model.test.cjs`, `tests/browser.cjs`: 문법 검사 통과
- HTML 파싱, 정적 문서 ID 중복 없음
- 사용자 입력은 `textContent`로 렌더링, HTML 삽입 API 없음
- 광고·분석·외부 네트워크 요청 없음, `noindex,nofollow`, `connect-src 'none'`
- 게시글·댓글 검증, 검색·정렬, 중복 신고, 관리자 모드 제한, 숨김·복원·신고 기각 및 처리 기록, 저장 데이터 검증을 단위 테스트
- 변경은 `community/`에 한정. 기존 계산기, 공급량 데이터, 가격 수정 PR #2, 자동 업데이트 workflow를 변경하지 않음

## 브라우저 검증 상태

현재 클라우드 실행 환경의 설치 Chromium은 `socket() Operation not permitted` 오류로 실행되지 않아 브라우저 테스트의 실제 화면 단계는 아직 통과하지 않았습니다. 문법 검사나 모델 테스트 통과를 브라우저 검증 통과로 간주하지 않습니다.

`tests/browser.cjs`는 전체 흐름과 반응형 오버플로, 데모 로그인 중단/재개, 입력의 일반 텍스트 표시, 저장 실패, 초기화, 신고·숨김·복원·기각을 검사하고 데스크톱·모바일·관리 화면을 캡처합니다. 정상적인 로컬 Playwright/Chromium 환경에서 실행해 최종 화면과 동작을 확인해야 합니다. 캡처가 생성되지 않았다면 `preview/`에 파일이 있다고 가정하지 마세요.

## 범위 밖

실제 인증·공유 DB·서버 권한·동시 사용자·운영 보안·광고 승인 여부는 구현·검증하지 않았습니다. 저장소에 기존 PR CI 테스트 workflow가 없어 이 작업이 기존 CI 통과를 의미하지 않습니다. 새 유료 서비스, main 병합 및 운영 배포를 하지 않았습니다.
