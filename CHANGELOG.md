## [2026-09-17 10:39] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/payment.js]**: 취소표 결제에서는 회원정보 전화번호 저장 API를 호출하지 않고 전화번호 형식 검증 후 결제를 진행하도록 수정
- **[src/pages/cancelSeatSelect.js]**: 취소표 결제 주문에 좌석 번호를 함께 저장해 결제 확인 화면의 좌석 번호가 `undefined`로 표시되지 않도록 보완

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 취소표 결제에서 전화번호가 회원정보와 다르면 `전화번호 저장에 실패했습니다` 및 `취소표 링크 세션으로는 해당 기능에 접근할 수 없습니다`가 표시되며 결제가 막힘
- **원인(Cause):** 취소표 전용 scoped JWT는 회원정보 수정 권한이 없는데 결제 페이지가 일반 예매와 동일하게 `updateProfileOnServer()`를 호출함
- **해결(Solution):** 취소표 플로우는 전화번호 필수·형식 검증만 수행한 뒤 회원정보 저장 절차를 건너뛰고 기존 `/seats/confirm` 결제로 바로 진행하도록 분기

## [2026-09-17 10:29] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/components/seatMap.js]**: 전체 좌석을 배치도에 표시하면서도 `selectable: false` 좌석은 회색으로 렌더링하고 클릭을 차단하도록 선택 가능 상태를 분리
- **[src/components/seatMap.js]**: 취소표 전용 `selectionOnly` 범례를 추가해 서버 배정 좌석만 선택 가능하다는 정책을 화면에 표시
- **[src/pages/cancelSeatSelect.js]**: 기존 단일 좌석 버튼을 본티켓팅과 동일한 Canvas 좌석맵으로 교체하고, 회차의 전체 좌석 상태를 표시
- **[src/pages/cancelSeatSelect.js]**: Secret Link의 `allocation.seatId`와 일치하는 좌석만 선택·선점할 수 있도록 연결하고, 선점 성공 후 기존 결제 주문으로 전달

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 취소표 링크 진입 시 전체 좌석 배치도 대신 서버 배정 좌석 하나만 별도 버튼으로 표시되어 본티켓팅과 화면 경험이 달랐음
- **원인(Cause):** `cancelSeatSelect.js`가 Canvas 좌석맵을 사용하지 않고 배정 좌석만 수동 HTML 버튼으로 렌더링함
- **해결(Solution):** `/seats`의 해당 이벤트·회차 좌석을 `mountSeatMap()`에 전달하고, 배정 좌석 외에는 `selectable: false`를 부여해 표시만 하도록 수정. 최종 선점은 기존 `POST /cancel-queue/hold`의 서버 검증을 그대로 사용함

## [2026-09-17 01:13] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: 기존 B파트 취소표 시뮬레이션과 별도로 `취소표 시뮬레이션 (Local)` 패널과 사이드바 메뉴를 추가
- **[src/pages/admin.js]**: Local 패널은 동일한 초기화·매진·조기 마감·취소표 생성 단계를 사용하고, 단계4에서 `/admin/local-simulation/issue-links`를 호출해 Gmail SMTP 발급 결과를 표시
- **[README.md]**: B파트 모드와 Local SMTP 모드의 관리자 시뮬레이션 차이 및 사용 흐름 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 기존 시뮬레이션 패널의 API 경로가 코드에 고정되어 같은 UI 로직을 Local API에 재사용할 수 없었음
- **원인(Cause):** 패널 초기화 함수가 전역 컨테이너에서 하나의 `/admin/simulation` 경로만 사용함
- **해결(Solution):** 패널 DOM 범위와 API base path를 옵션으로 주입하도록 변경하여 기존 B 패널과 Local 패널이 서로 다른 API를 호출하도록 분리

## [2026-09-17 09:42] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[vite.config.js]**: Secret Link 검증 요청인 `/verify-link`를 A파트 API 서버로 전달하는 개발 프록시 추가
- **[src/pages/admin.js]**: Local SMTP 단계4 결과 로그에 실제 발송 인원과 실패 인원 표시
- **[README.md]**: Secret Link 프록시 및 Local SMTP 다중 발급 흐름 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 이메일 링크를 열면 링크 확인 오류 화면이 표시됨
- **원인(Cause):** `verifyLink.js`가 호출하는 `POST /verify-link` 경로가 Vite 프록시 설정에 없어 API 서버에 도달하지 않음
- **해결(Solution):** `vite.config.js`에 `/verify-link` 프록시를 추가하고, 운영 Nginx에도 해당 API location이 필요함을 문서화

## [2026-09-17 00:13] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/mypage.js]**: 멤버십 상태가 비동기로 갱신되어도 취소표 메뉴가 다시 렌더링되도록 보완
- **[src/pages/mypage.js]**: 취소표 목록에 공연 포스터를 연결하고 `전체 멤버십 대기자` 및 Secret Link 안내만 표시
- **[src/pages/cancelQueue.js]**: 상세 화면에서 예상 대기시간 수치를 제거하고 5분 제한 Secret Link 발급 안내로 변경

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 멤버십 가입 여부가 늦게 로드되면 초기 취소표 목록이 잘못 보일 수 있고, 대기시간 계산 문구가 서비스 정책과 달랐음
- **원인(Cause):** 최초 렌더링 시점의 브라우저 멤버십 상태만 사용했고, 목록·상세 화면에 예상 시간 계산 표시가 남아 있었음
- **해결(Solution):** 멤버십 상태 변경 시 취소표 화면을 재렌더링하고, API의 활성 멤버십 대기자 수를 사용한다. 예상 시간 대신 5분 Secret Link 발급 정책을 공통 표시

## [2026-09-17 00:12] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/mypage.js]**: 취소표 목록의 상태 문구를 활성 멤버십 대기자 기준으로 정리하고 할당 상태 표시를 보완
- **[src/pages/cancelQueue.js]**: 상세 화면의 전체 대기자 라벨을 `전체 멤버십 대기자`로 변경
- **[README.md]**: 멤버십 전용 진입·집계 정책을 현재 화면 동작에 맞게 보완

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 취소표 대기열이 멤버십 전용으로 바뀐 뒤에도 일부 화면에서 일반 대기자 기준 표현이 남을 수 있었음
- **원인(Cause):** 목록과 상세 화면의 상태 문구가 서로 다른 기준으로 작성되어 있었음
- **해결(Solution):** 목록·상세 화면 모두 멤버십 대기자 기준으로 표시하고, Secret Link 발급 상태를 활성 할당 데이터로 판별하도록 통일

## [2026-09-17 00:07] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/mypage.js]**: 취소표 대기열을 활성 멤버십 회원에게만 표시하고, 공연명 옆에 공연 포스터를 표시
- **[src/pages/mypage.js]**: 예상 대기시간을 제거하고 멤버십 대기자 수와 5분 제한 Secret Link 발급 안내를 표시
- **[src/pages/cancelQueue.js]**: 상세 대기 현황에서도 예상 대기시간 대신 Secret Link 발급 안내를 표시
- **[README.md]**: 멤버십 전용 화면, 포스터, Secret Link 안내 동작을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 비멤버십 사용자에게 취소표 대기열이 표시될 수 있고, 전체 대기자 수에 비회원이 포함될 수 있었음. 목록에 예상 대기시간이 표시되어 실제 제공 정책과 혼동될 수 있었음
- **원인(Cause):** 화면이 브라우저 상태와 Redis 전체 standby 수치를 그대로 표시했으며, 멤버십 상태에 따른 렌더링 분기와 실제 공연 포스터 표시가 부족했음
- **해결(Solution):** API의 멤버십 전용 응답과 프론트 멤버십 상태를 함께 적용하고, 공연 메타데이터의 이미지 URL을 목록 행에 연결. 예상 시간 문구를 제거하고 “취소표 발생 시 5분 제한 Secret Link 발급” 안내로 대체

## [2026-09-16 23:44] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/utils/backendApi.js]**: JSON 오류 응답의 `message`, `code`, HTTP 상태를 Error 객체에 보존하도록 수정
- **[src/pages/mypage.js]**: `/cancel-queue/mine` 조회 실패 시 ‘참여 중인 공연 없음’ 대신 서버 오류 안내를 표시하도록 수정

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** `waiting_queue`에 `standby`·`WAITING` 행이 있는데도 취소표 대기열 화면이 빈 상태로 표시됨
- **원인(Cause):** `/cancel-queue/mine`가 HTTP 500을 반환하면 프론트의 동기화 오류가 조용히 무시되어 초기 빈 상태가 그대로 보였음
- **해결(Solution):** API 오류 메시지를 전달하고, 마이페이지에서 오류 카드로 구분해 표시하도록 변경. 정상 응답 시 기존 대기열 목록을 렌더링

## [2026-09-16 23:34] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/queue.js]**: 조기마감 화면 진입 시 standby 사용자의 `/queue/leave` 호출을 차단
- **[src/pages/queue.js]**: 대기열 응답을 받기 전에도 이탈 요청을 보내지 않도록 보호하고, `eligible` 사용자에게만 브라우저 이탈 처리를 적용

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 조기마감 시뮬레이션 후 실제 사용자의 `waiting_queue.status`가 `LEFT`로 변경되어 마이페이지 취소표 대기열이 사라짐
- **원인(Cause):** `showClosedUI()`가 마감 안내를 표시하기 전에 `notifyQueueLeave()`를 호출했고, 이 요청이 Redis standby와 MariaDB 대기 행을 이탈 처리함
- **해결(Solution):** standby 사용자와 대기 유형 미확정 상태에서는 `/queue/leave`를 호출하지 않도록 변경. 조기마감 후에도 standby 대기 자격과 마이페이지 복원 대상이 유지됨

## [2026-09-16 23:21] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/mypage.js]**: `nestedSectionCleanup`을 최초 렌더링 전에 초기화해 취소표 대기열 진입 시 발생하던 JavaScript 초기화 오류를 수정

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 취소표 대기열 메뉴 선택 시 `Cannot access 'nestedSectionCleanup' before initialization` 오류가 발생하고 우측 콘텐츠가 렌더링되지 않음
- **원인(Cause):** `renderCurrentSection()`이 `nestedSectionCleanup` 선언보다 먼저 실행되어 Temporal Dead Zone 오류가 발생함
- **해결(Solution):** 정리 핸들러 선언을 `renderCurrentSection()` 호출보다 위로 이동해 초기 렌더링 전에 초기화

## [2026-09-16 23:18] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/mypage.js]**: 취소표 대기열 화면을 `/events` 응답 이후에만 그리지 않고, 서버에서 복원된 `cancelQueues`를 즉시 렌더링하도록 수정
- **[src/pages/mypage.js]**: 공연 목록 요청을 공유 Promise로 처리해 중복 요청을 줄이고, 공연 API 지연 중에도 대기열 행을 유지하도록 보완

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 취소표 대기열 DB 행이 있어도 마이페이지 우측 콘텐츠가 완전히 빈 화면으로 표시됨
- **원인(Cause):** `renderCancelQueue()`가 `/events` 응답을 받을 때까지 제목·빈 상태·대기열 목록을 포함한 콘텐츠 전체를 렌더링하지 않았음
- **해결(Solution):** 먼저 `/cancel-queue/mine`에서 복원된 대기열을 공연 정보 없이 즉시 표시하고, `/events`가 도착하면 공연명·이미지 정보를 보완해 재렌더링

## [2026-09-16 22:52] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/mypage.js]**: 서버의 `waiting_queue` 행을 받은 뒤 `/events` 목록이 지연되거나 일시적으로 비어도 API가 반환한 공연명·회차 정보로 취소표 대기열을 표시하도록 fallback 추가

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 실제 대기열 행이 있어도 공연 목록 API가 늦으면 마이페이지 취소표 대기열이 빈 화면처럼 보일 수 있었음
- **원인(Cause):** 기존 렌더링이 `/events`에서 공연을 찾지 못하면 대기열 행을 무조건 제외했음
- **해결(Solution):** `/cancel-queue/mine` 응답의 공연명·회차 정보를 이용해 공연 목록 지연 중에도 서버 대기열 행을 표시

## [2026-09-11 17:54] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/payment.js]**: `/seats/confirm` 호출에 결제 수단을 전달하고 무통장 입금 화면에 24시간 입금 기한 및 좌석 최종 확정 조건을 명시
- **[src/pages/bookingComplete.js]**: 무통장 입금 완료 화면에 24시간 입금 기한과 좌석 확정 조건을 표시
- **[src/state/store.js]**: 입금 대기 알림에 24시간 입금 기한을 추가
- **[src/pages/mypage.js]**: 취소된 입금 전 예매를 예매내역에서 제외하고 취소/환불내역에 표시. 취소 상태는 환불 처리 중과 구분하고 수수료·환불금액을 0원으로 표시
- **[README.md]**: 결제 수단 전달, 무통장 입금 안내, 취소 예매 이동 규칙 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 마이페이지에서 입금 전 예매를 취소해도 예매내역에 남고, 취소/환불내역에서는 조회되지 않았음
- **원인(Cause):** `cancelUnpaidBooking()`이 `cancelled` 상태만 설정했지만 예매 목록 필터가 해당 상태를 제외하지 않았고, 환불 목록도 `refund_pending`·`refunded`만 조회함
- **해결(Solution):** 예매 목록에서 `cancelled`를 제외하고 취소/환불 목록에 포함했으며, 취소 상태용 표시와 0원 정산을 추가

## [2026-09-11 17:11] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/monitoring.js]**: 모니터링 대시보드 페이지 삭제
- **[src/components/miniChart.js]**: 모니터링 대시보드 전용 차트 컴포넌트 삭제
- **[src/main.js]**: 모니터링 페이지 import·라우트·모니터링 전용 테마 처리 제거
- **[src/components/header.js]**: 모니터링 역할 표시와 대시보드 메뉴 제거
- **[src/pages/login.js]**, **[src/state/store.js]**: 모니터링 역할 로그인 상태와 이동 처리 제거
- **[vite.config.js]**: 삭제된 대시보드 전용 모니터링 프록시 제거
- **[README.md]**: 삭제된 페이지 구조를 문서에서 제거

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 삭제 대상인 모니터링 계정과 대시보드 페이지가 프론트엔드 메뉴·라우터·로그인 상태에 남아 있었음
- **원인(Cause):** 계정 역할과 모니터링 화면이 별도 모듈로 연결된 상태였음
- **해결(Solution):** 모니터링 페이지 파일과 전용 차트 컴포넌트를 삭제하고 관련 import·라우트·메뉴·역할 상태·프록시를 제거함

## [2026-09-11 16:44] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: 취소표 시뮬레이션의 단계4 수동 Secret Link 발급 버튼과 호출 로직을 제거하고, B파트 Step Functions 위임 상태로 표시
- **[src/pages/admin.js]**: 단계3 이후에는 A파트가 SQS 취소 이벤트만 발행하고 B파트가 순차 배정한다는 안내 문구 추가

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 관리자 시뮬레이션에서 A파트가 직접 Secret Link를 발급하면 B파트와 동일 좌석을 중복 처리할 수 있음
- **원인(Cause):** 프론트엔드에 A파트 직접 발급용 단계4 버튼과 API 호출이 남아 있었음
- **해결(Solution):** 단계4 버튼을 비활성화하고 취소표 배정·링크 발급을 B파트 파이프라인의 책임으로 명시

## [2026-09-11 14:53] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/queue.js]**: `admitted` 상태에서 중복적인 Admission Token 요청을 방지하고, `admitting` 상태를 대기열 재진입 없이 다음 폴링에서 처리하도록 수정
- **[src/pages/queue.js]**: `/queue/position`·`/queue/enter`의 비정상 HTTP 응답과 순번 누락을 별도 오류·처리중 상태로 표시하도록 수정
- **[src/pages/queue.js]**: 유효하지 않은 순번을 `formatNumber()`에 전달하지 않아 대기번호가 `NaN`으로 표시되지 않도록 방어 로직 추가
- **[README.md]**: 대기열 승인·오류·순번 표시 동작을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 승인 직후 대기 화면이 유지되거나 API 오류 응답에서 대기번호가 `NaN`으로 표시됨
- **원인(Cause):** 승인 상태와 토큰 발급 사이의 짧은 경쟁 상태, 그리고 프론트가 HTTP 오류 응답에 `position`이 없어도 숫자로 변환하던 처리
- **해결(Solution):** 승인 요청을 단일 실행으로 제한하고 `admitting`·비정상 응답·순번 누락을 별도로 처리하며, 유효하지 않은 값은 `-`로 표시

## [2026-09-11 11:30] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: 관리자 화면을 운영 콘솔 구조로 재배치하고 사이드바, 요약 카드, 명령 팔레트, 공연 표의 키보드 행 이동을 추가. 기존 관리자 API와 데이터 속성은 유지.
- **[src/styles/components.css]**: 관리자 화면에만 적용되는 다크 Linear 스타일 토큰, 조밀한 표·폼·버튼 상태, 포커스 링, 명령 팔레트 및 반응형 규칙을 추가.
- **[README.md]**: 관리자 콘솔의 화면 구조와 키보드 조작 방법을 문서화.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 기존 관리자 화면은 기능이 한 열로 길게 이어지고, 주요 운영 도구와 표를 키보드로 빠르게 탐색하기 어려웠음.
- **원인(Cause):** 관리자 화면에 전용 레이아웃·명령 탐색·행 포커스 모델이 없었음.
- **해결(Solution):** 기존 `data-*` API 제어 셀렉터를 보존한 채 사이드바, `Ctrl/Cmd + K` 명령 팔레트, 방향키 표 탐색을 추가하고 관리자 영역에만 전용 CSS 변수를 적용함.

## [2026-09-11 11:04] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[public/favicon.svg]**: favicon을 빨간색 둥근 정사각형 배경과 흰색 대문자 `Q`만 표시하는 형태로 변경
- **[README.md]**: 변경된 favicon 디자인을 문서에 반영

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 흰색 심볼만 표시하는 투명 favicon이 요청한 탭 아이콘 형태와 달랐음
- **원인(Cause):** 기존 favicon이 QUEUING 전체 심볼을 사용하는 구조였음
- **해결(Solution):** 64×64 SVG에 헤더와 동일한 빨간색(`#B11018`) 둥근 정사각형과 흰색 `Q`를 배치함

## [2026-09-11 10:59] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[public/favicon.svg]**: favicon의 빨간색 배경과 유색 심볼을 제거하고 투명 배경의 흰색 QUEUING 심볼로 변경
- **[index.html]**: favicon을 투명 배경 SVG 심볼로 연결
- **[README.md]**: 헤더용 PNG와 탭용 SVG favicon의 역할을 구분해 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 헤더 로고와 탭 아이콘에 빨간색 배경이 함께 표시되어 탭에서 로고가 다르게 보임
- **원인(Cause):** 헤더용 빨간색 배경 PNG를 favicon으로 직접 사용하고 있었음
- **해결(Solution):** 기존 QUEUING 심볼을 흰색으로 통일한 투명 배경 SVG를 favicon으로 사용하도록 변경

## [2026-09-11 10:56] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[index.html]**: 브라우저 탭 favicon을 기존 `favicon.svg`에서 사이트 헤더 좌측 로고와 동일한 `/images/queuing-logo-header.png`로 변경
- **[README.md]**: 헤더와 favicon이 동일한 로고 원본을 사용한다는 구조 및 운영 설명 추가

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 브라우저 탭에는 헤더 좌측 로고와 다른 아이콘이 표시됨
- **원인(Cause):** 헤더는 `queuing-logo-header.png`를 사용하지만 `index.html`은 별도의 `favicon.svg`를 참조하고 있었음
- **해결(Solution):** favicon 참조를 헤더 로고 PNG로 통일하여 동일한 로고 원본을 사용하도록 수정

## [2026-09-11 10:32] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/mypage.js]**: 취소표 대기열을 마이페이지 메뉴로 통합하고, `eventId`가 포함된 경우 기존 실시간 취소표 상세 화면을 마이페이지 콘텐츠 영역에 표시하도록 변경
- **[src/main.js]**: 기존 `#/cancel-queue/:eventId` 주소를 마이페이지 취소표 대기열로 보내는 호환 리다이렉트 추가
- **[src/components/soldOutModal.js / src/pages/cancelSeatSelect.js / src/pages/privateLink.js / src/pages/payment.js]**: 취소표 관련 이동 경로를 마이페이지 취소표 대기열로 통일
- **[cancel-ticketing.html]**: 별도 독립 취소표 페이지 제거. 로그인한 사용자의 마이페이지에서 서버 상태를 확인하는 흐름으로 통합
- **[README.md]**: 취소표 화면 구조와 Secret Link 접근 경로를 통합 화면 기준으로 갱신

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 취소표 기능이 일반 마이페이지와 분리된 독립 페이지로 표시되고, 이메일 링크에 사용자 식별 정보와 `linkToken`이 포함됨
- **원인(Cause):** 기존 `cancel-ticketing.html`이 SPA 마이페이지 밖에서 URL 파라미터를 직접 처리하는 구조였음
- **해결(Solution):** 독립 페이지를 제거하고 `#/mypage/cancel-queue?eventId=...`를 공식 경로로 사용하도록 통합했다. 사용자는 로그인 후 Access JWT로 자신의 대기열·Secret Link 상태를 서버에서 조회하며, 기존 `#/cancel-queue/:eventId` 링크는 새 경로로 호환 이동한다.

## [2026-09-10 08:35] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/utils/recaptcha.js]**: 재사용 가능한 reCAPTCHA v2 챌린지 모달(`showV2Challenge()`)과 v3→v2 자동 폴백 래퍼(`fetchWithRecaptcha()`) 추가. v3 점수가 임계값 미만일 때 체크박스 모달을 자동으로 표시하고 v2 토큰으로 재시도하는 공통 흐름을 제공
- **[src/pages/signup.js]**: 회원가입 요청을 `fetchWithRecaptcha()`로 교체하여 v2 폴백 자동 지원
- **[src/pages/queue.js]**: 대기열 진입(`requestQueueEnter`)을 `fetchWithRecaptcha()`로 교체하여 v2 폴백 자동 지원
- **[src/pages/zoneSelect.js]**: 구역 선택 페이지의 `ensureAdmissionToken()`과 `attemptHold()`를 `fetchWithRecaptcha()`로 교체하여 v2 폴백 자동 지원
- **[src/pages/payment.js]**: 결제 확정(`/seats/confirm`) 요청을 `fetchWithRecaptcha()`로 교체하여 v2 폴백 자동 지원
- **[src/utils/backendApi.js]**: `postJson()`, `holdSeatApi()`, `confirmSeatApi()`를 `fetchWithRecaptcha()` 기반으로 전환하여 취소표 대기열, 좌석 선점/확정 API 전체에 v2 폴백 적용

---

## [2026-09-09 22:45] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: 관리자 콘솔에 "더미 유저 · HOT 공연 관리" 패널 추가
  - 더미 유저 수 입력 + 생성 버튼 → `POST /admin/dummy/create-users` 호출
  - 분배 공연 수 입력 + "관심 공연 분배" 버튼 → `POST /admin/dummy/distribute-interests` 호출, 결과를 순위/비율 테이블로 표시
  - "더미 데이터 삭제" 버튼 → `POST /admin/dummy/cleanup` 호출 (confirm 다이얼로그 포함)
  - 취소표 시뮬레이션 패널 상단에 접기/펼치기 토글로 배치

---

## [2026-09-09 21:50] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/state/store.js]**: `deleteAccountOnServer(password)` 함수 추가 — `DELETE /auth/account` 호출 후 성공 시 자동 로그아웃
- **[src/pages/mypage.js]**: 회원정보 수정 섹션 하단에 회원탈퇴 버튼 및 비밀번호 확인 모달 추가. 탈퇴 완료 시 홈으로 이동
- **[src/utils/recaptcha.js]**: reCAPTCHA 스크립트 preload 및 `grecaptcha.ready()` 타이밍 수정

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 로그인 버튼 첫 클릭 시 로그인 실패, 두 번째 클릭에 성공
- **원인(Cause):** reCAPTCHA 스크립트가 첫 로그인 시도 시점에 비동기로 로딩되면서, `script.onload` 시점에 `grecaptcha.ready()`가 아직 준비되지 않아 토큰 발급이 실패. 두 번째 시도에서는 스크립트가 이미 로드되어 정상 동작
- **해결(Solution):** `loadScript()`에서 `onload` 후 `grecaptcha.ready()` 콜백 안에서 resolve하도록 변경하고, 모듈 로드 시 `if (SITE_KEY) loadScript()`로 preload하여 로그인 시점에는 이미 준비된 상태가 되도록 수정

---

## [2026-09-08 10:27] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/utils/recaptcha.js]**: Google reCAPTCHA v3 스크립트 지연 로딩과 action별 토큰 발급을 추가. 개발 site key가 없으면 기존 프론트엔드 흐름을 유지.
- **[src/utils/backendApi.js / src/pages/login.js / src/pages/signup.js / src/pages/queue.js / src/pages/zoneSelect.js / src/pages/payment.js / cancel-ticketing.html]**: 로그인·회원가입·대기열 진입·좌석 선점·결제 확정 요청에 action별 reCAPTCHA 토큰을 포함하도록 연결.
- **[.env.example]**: 개발용 `VITE_RECAPTCHA_SITE_KEY` 설정 예시 추가.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 프론트엔드에서 보안 인증을 적용해도 API를 직접 호출하면 화면을 우회할 수 있음.
- **원인(Cause):** 브라우저가 발급한 토큰을 API 서버가 재검증하지 않으면 클라이언트 검증만으로는 요청의 신뢰성을 보장할 수 없음.
- **해결(Solution):** 보호되는 POST 요청 직전에 `withRecaptcha(payload, action)`으로 토큰을 추가하고, API 서버의 Google 검증 결과를 기준으로 요청을 허용하도록 양쪽을 연결.

## [2026-09-08 10:14] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/styles/components.css]**: 사이트 헤더 배경을 헤더 로고 원본 배경색 `#B11018`에 맞춰 로고 주변의 색상 차이와 사각 경계를 제거.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 메인 페이지 좌측 상단 로고의 배경색이 헤더 배경과 달라 별도의 색상 블록처럼 보였음.
- **원인(Cause):** 헤더는 `--color-primary-dark`의 `#B5121B`, 로고 이미지는 `#B11018`을 사용해 배경색이 일치하지 않았음.
- **해결(Solution):** 헤더 컴포넌트에만 로고 이미지의 실제 배경색 `#B11018`을 적용하고, 전역 브랜드 색상 토큰은 유지.

## [2026-09-08 09:56] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/queue.js]**: `pollPosition()`에서 `admitted` 상태 감지 시 `/queue/enter` 호출로 기존 토큰 획득 후 좌석 선택 페이지로 자동 이동.
  - 기존: `admitted` 감지 시 "입장 허용됨" 텍스트만 표시, 토큰 획득 불가 (admitBatch가 이미 admitted된 유저의 토큰을 반환하지 않으므로).
  - 변경: `/queue/enter` API가 이미 admitted된 유저에게 기존 토큰을 반환하는 점을 활용하여, `handleEnterResult`로 토큰 수신 → `enterConfirmed()` → zones 페이지 이동.

## [2026-09-07 17:50] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/home.js]**: 어드민 즉시 마감 후 메인 페이지 뱃지(LP 히어로, HOT 카드, 포스터 카드)가 "예매중"으로 남는 문제 수정.
  - `effectiveStatus(event)` 함수 추가: `event.status === 'closed'`뿐 아니라 `event.ticketCloseAt ≤ 현재시간`인 경우도 `'closed'`로 판정.
  - LP 히어로·HOT 카드·포스터 카드 세 곳의 `statusBadge(e.status)` 호출을 `statusBadge(effectiveStatus(e))`로 변경.
  - 폴링 변경 감지 조건에 `ticketCloseAt` 변경도 포함(`prev.ticketCloseAt !== e.ticketCloseAt`).

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 어드민 즉시 마감 후 공연 상세에서는 "예매 마감" 표시되나 메인 페이지 LP 히어로·카드 뱃지는 "예매중" 유지.
- **원인(Cause):** `statusBadge()`가 `event.status` 필드만 확인해 `ticketCloseAt`이 과거여도 `status`가 아직 `'open'`이면 "예매중"으로 표시. 폴링 감지도 `status` 변경만 체크해 `ticketCloseAt` 변경을 놓침.
- **해결(Solution):** `effectiveStatus()` 도입으로 `ticketCloseAt <= now`이면 항상 `'closed'` 반환. 뱃지 렌더링과 폴링 감지 모두 이 함수 기준으로 통일.

## [2026-09-07 17:35] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/home.js]**: 공연 상태 변경(마감 등)이 메인 페이지에 실시간 반영되지 않던 문제 수정.
  - 기존 `/events` 단일 fetch를 `loadEvents()` 함수로 분리.
  - `setInterval(loadEvents, 10000)`으로 10초마다 이벤트 상태를 재조회.
  - 폴링 시 이전 상태 대비 `status` 변경이 있을 경우에만 히어로(`paintNow()`), 카드 섹션(`renderEventSections()`), 캘린더를 업데이트 — LP 슬라이드 위치(`idx`)는 유지.
  - 페이지 cleanup 시 `eventPollTimer` clearInterval 처리.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 시뮬레이션에서 조기 마감 후 메인 페이지의 "예매중" 뱃지와 하단 카드가 "마감"으로 바뀌지 않음.
- **원인(Cause):** `/events` API를 최초 1회만 호출하고 이후 갱신 로직이 없어 서버 상태 변경이 브라우저에 미반영.
- **해결(Solution):** 10초 폴링 추가. 상태 변경 감지 시에만 UI를 업데이트해 불필요한 DOM 재렌더링 최소화.

## [2026-09-07 17:20] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/queue.js]**: 마감 안내를 인라인 박스 방식에서 전체 화면 오버레이 모달 방식으로 변경.
  - 기존 `enterBox.innerHTML` 렌더링 방식 제거.
  - `document.body`에 `position:fixed;inset:0` 딤드 레이어(`rgba(0,0,0,0.65)` + `backdrop-filter:blur(3px)`) 추가 → 배경 클릭 불가.
  - 중앙에 '🔒 마감되었습니다' 제목의 흰색 모달 박스 표시. 멤버십 여부에 따라 안내 문구·버튼 조건부 렌더링은 동일하게 유지.
  - 카운트다운 시간 300초(5분) → 30초로 변경.

## [2026-09-07 16:17] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/queue.js]**: standby 대기 중 조기 마감 시 안내 박스가 표시되지 않던 문제 수정.
  - 마감 UI 로직을 `showClosedUI()` 독립 함수로 분리.
  - `pollPosition()` 내 standby 응답 시 10초마다(`standbyPollTick % 10 === 0`) `POST /queue/enter`를 호출하여 마감 여부 확인. 서버가 `closed`를 반환하면 `showClosedUI()` 호출.
  - `handleEnterResult()`의 `closed` 처리도 `showClosedUI()` 위임으로 통일.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 시뮬레이션 조기 마감 후 취소표 대기열 1번째 화면에서 마감 안내 박스가 미표시.
- **원인(Cause):** 이미 standby 대기번호를 받은 사용자는 `pollPosition()` 루프만 돌고 `enterQueue()`를 재호출하지 않아 `closed` 응답을 받을 경로가 없었음.
- **해결(Solution):** standby 상태에서 10초마다 `POST /queue/enter`를 호출. 서버 `enter()` 함수는 ticketingStatus가 `closed`이면 standby 여부 확인 전에 `{ status: 'closed' }`를 반환하므로, 응답 수신 즉시 `showClosedUI()` 트리거.

## [2026-09-07 15:55] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/queue.js]**: 티켓팅 마감(`status: 'closed'`) 시 멤버십 여부에 따라 다른 안내 박스를 표시하도록 `handleEnterResult` 수정.
  - **비멤버십**: "멤버십을 가입하시면 취소표가 나오면 시크릿 링크로 안내해드립니다. 멤버십을 가입하시겠습니까?" 문구와 [멤버십 가입하기] / [메인 페이지로 돌아가기] 버튼 표시.
  - **멤버십 가입자**: "취소표 발생 시 시크릿 링크로 안내해드리겠습니다." 문구와 [메인 페이지로 돌아가기] 버튼 표시.
  - 두 경우 모두 5분(300초) 카운트다운 후 메인 페이지로 자동 리다이렉션. 버튼 클릭 시 즉시 이동.
  - `hasMembership` 함수 import 추가.

## [2026-09-07 10:07] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[cancel-ticketing.html]**: 좌석 확인 페이지(page 2)의 구역 그리드(zonemap)와 좌석 그리드(seatgrid)를 제거하고, 메인 페이지와 동일한 Canvas 기반 `mountSeatMap` 인터랙티브 좌석 지도로 교체.
  - `state.seats`에서 섹션 메타데이터(`smSections`)와 좌석 데이터(`smSeats`)를 변환하여 `mountSeatMap` 호출
  - 배정된 좌석(`a2.seatId`)은 `status: 'mine'`으로 설정하여 좌석 지도에서 빨간색으로 강조 표시
  - `readOnly: true` 설정으로 선택 불가(보기 전용)
  - 마운트 후 `seatMapApi.scrollToZone(state.allocatedSection)`으로 배정 구역으로 자동 스크롤

## [2026-09-07 09:20] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[cancel-ticketing.html]**: `/cancel-queue/status` 호출 시 userId를 URL path 대신 query string(`?userId=encodeURIComponent(USER_ID)`)으로 전달하도록 변경. 이메일 주소가 포함된 userId가 Fastify 라우터에서 잘리는 문제 대응.

## [2026-09-07 08:00] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[cancel-ticketing.html]**: URL 파라미터 `apiBase`를 읽어 모든 API 호출(`api()`, `fetch()`)의 base URL로 사용하도록 수정. `apiBase`가 없으면 기존 상대 경로 동작 유지. 이메일 링크에 `apiBase=http://VM_IP:3000`이 포함되면 로컬에서 파일을 열어도 VM의 백엔드 API를 호출할 수 있음.

## [2026-09-07 03:25] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[nginx.conf]**: API 프록시 규칙에 `cancel-queue` 경로 추가. cancel-ticketing.html 페이지에서 호출하는 `/cancel-queue/*` API 엔드포인트(join, status, hold, expire, respond)가 백엔드로 올바르게 프록시되도록 수정.

## [2026-09-06 23:28] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: 취소표 시뮬레이션의 단계별 자동 버튼 잠금을 제거하고, 공연 선택 후 관리자가 각 단계 작업을 직접 실행할 수 있는 수동 실행 모드로 변경. 요청 처리 중에는 중복 실행을 방지하기 위해 작업 버튼을 일시적으로 잠그고, 완료 또는 실패 후 다시 활성화하도록 처리.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 현재 시뮬레이션 단계가 특정 상태가 아니면 매진·마감·취소표 생성·링크 발급 버튼을 직접 누를 수 없었음.
- **원인(Cause):** 프론트엔드가 서버의 시뮬레이션 단계에 따라 다음 버튼의 활성화 여부를 강제로 결정했음.
- **해결(Solution):** 공연 선택 여부와 요청 진행 여부만으로 버튼 상태를 제어하고, 단계별 선행조건 검증은 각 시뮬레이션 API가 담당하도록 변경.

## [2026-09-06 21:33] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: 어드민 페이지에 "취소표 시뮬레이션" 패널 추가.
  - 접기/펼치기 토글로 패널 표시 제어.
  - DB 등록 공연 드롭다운 + 회차 선택 (공연 선택 시 자동 로드).
  - 실제 멤버십 유저 이메일 입력 + 더미 유저 수 설정 (기본 10,000명).
  - 4단계 진행 버튼: 시뮬레이션 초기화 → 매진 연출 → 조기 마감 → 취소표 생성 → 시크릿 링크 발급.
  - 단계별 버튼 활성화/비활성화 자동 제어 (이전 단계 미완료 시 비활성).
  - 실시간 상태 패널: 좌석 통계 (판매/남은/선점), 대기열 수치, 실제 유저 상태 (standby 위치·입장 허용·시크릿 링크), 취소표 할당 내역 테이블.
  - 하단 로그 영역에 각 작업 시각별 메시지 기록.
  - "데이터 삭제" 및 "상태 새로고침" 유틸리티 버튼.

## [2026-09-06 20:40] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: "지금 바로 오픈" 및 "오픈 제한 해제" 시 `ticketCloseAt`도 함께 해제하여, 마감된 공연을 다시 오픈할 수 있도록 수정.
- **[src/pages/concertsList.js]**: 메인 공연 목록에서 `ticketCloseAt`이 지난 공연은 `status`와 무관하게 "마감" 뱃지 표시.

## [2026-09-06 20:34] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: 공연 목록에 "즉시 마감" 버튼 추가. 클릭 시 확인 후 `ticketCloseAt`을 현재 시각으로 설정하여 즉시 예매 마감.
- **[src/pages/concertDetail.js]**: 예매 마감 시간(`ticketCloseAt`)이 지난 공연은 캘린더 날짜 선택 및 회차 선택을 비활성화하고, 예매 버튼을 "예매가 마감되었습니다"로 표시. 캘린더 UI 자체는 조회용으로 유지. 마감 시간 도래 시 1초마다 체크하여 실시간 전환.
- **[src/styles/pages.css]**: `.btn--closed`(마감 상태 버튼), `.btn-danger-outline`(즉시 마감 버튼) 스타일 추가.

## [2026-09-06 10:55] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/payment.js]**: 결제 페이지에서 결제하지 않고 이탈할 때 붙잡고 있던 좌석 선점을 해제하도록 추가. SPA 라우팅 이탈은 `releaseSeatApi()`, 브라우저 닫기/새로고침은 `releaseSeatBeacon()`으로 처리하며, 결제 확정 또는 제한시간 만료(백엔드 TTL 자동 해제) 시에는 중복 해제 요청을 보내지 않도록 `settled` 플래그로 구분.
- **[README.md]**: payment.js의 좌석 해제 동작과 관련 API 문서화.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 좌석 선택 페이지에서 나가면 선점이 정상적으로 풀리지만, 결제 페이지에서 결제하지 않고 나가면 좌석이 계속 "선택중(HELD)" 상태로 남아있음.
- **원인(Cause):** `seatSelect.js`는 페이지 이탈 시 `releaseSeatApi()`/`releaseSeatBeacon()`을 호출하는 cleanup 로직이 있었지만, `payment.js`에는 카운트다운 정리(`stopCd`)만 있을 뿐 좌석 해제 로직이 전혀 없었음. 제한시간 만료 시에만 로컬 주문 상태를 지웠고, 사용자가 그 전에 임의로 페이지를 벗어나는 경우는 처리하지 않았음.
- **해결(Solution):** `payment.js`에 `seatSelect.js`와 동일한 패턴을 적용. 결제 대상 실좌석(`realSeats`) 목록을 계산해두고, `pagehide`/`beforeunload`에는 `releaseSeatBeacon()`을, 페이지 unmount(라우터 cleanup)에는 `releaseSeatApi()`를 호출하도록 추가. 결제 성공 또는 타임아웃 시 `settled = true`로 표시해 이미 확정/만료된 좌석에 불필요한 해제 요청을 보내지 않도록 함.

## [2026-09-04 17:30] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/components/seatMap.js]**: 올림픽홀 좌석 지도도 축소 상태에서 개별 좌석을 숨기도록 LOD 기준을 0.4로 통일. 배치도는 유지하고 기준 배율 이상 확대했을 때만 좌석을 표시·선택하도록 복구.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 좌석 배치 재구성 후 좌석 선점 페이지를 열자 줌 아웃 상태에서도 올림픽홀 개별 좌석이 바로 표시됨.
- **원인(Cause):** 올림픽홀에만 LOD 임계값 0.12를 적용해 초기 화면의 일반적인 줌 배율이 임계값을 항상 넘었음.
- **해결(Solution):** 모든 공연장에 `SEAT_LOD_ZOOM_THRESHOLD = 0.4`를 적용해 줌 아웃 시 좌석을 숨기고 확대 시 좌석을 표시하도록 수정.

## [2026-09-04 17:10] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/concertDetail.js]**: 공연 상세 페이지의 예매 오픈 카운트다운을 현재 공연의 `ticketOpenAt`만 사용하도록 수정. 오픈 시간이 없는 공연이 다른 공연의 전역 스케줄을 따라가지 않도록 변경.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 윤하 공연의 오픈 시간을 설정하면 같은 목록에 있던 악뮤 공연도 사용자 화면에서 오픈 예정으로 표시됨.
- **원인(Cause):** 개별 오픈 시간이 없는 공연 상세 페이지가 전역 예약 스케줄을 fallback으로 읽고 있었음.
- **해결(Solution):** 공연별 오픈 시간이 저장된 경우에만 해당 공연의 카운트다운을 표시하고, 값이 없으면 즉시 예매 상태를 유지하도록 수정.

## [2026-09-04 16:58] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: 포스터 공연의 오픈 시간 모달에서 아직 값이 없는 이벤트에 공연별 기본 오픈 시간을 표시하도록 수정. 현재 공연 목록 순서를 기준으로 1분씩 간격을 두어 여러 이벤트가 같은 기본 오픈 시간으로 저장되지 않게 함.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 포스터 공연을 여러 개 생성한 뒤 오픈 시간을 설정하면 각 이벤트의 오픈 시간이 동일하게 저장됨.
- **원인(Cause):** `ticketOpenAt`이 없는 모든 이벤트의 입력 기본값이 모달을 연 시각 기준 `현재 시각 + 5분`으로 고정되어 있었음.
- **해결(Solution):** 이벤트 목록의 위치를 이용해 첫 이벤트부터 5분 후, 6분 후, 7분 후처럼 이벤트별 기본값을 다르게 생성. 이미 저장된 오픈 시간은 그대로 유지하고, 빠른 설정 버튼을 사용한 명시적 값은 사용자의 선택을 따름.

## [2026-09-04 05:10] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/data/olympicHallSeats.js]**: H 구역 x=821.3 열(#28~#40) 좌석 순번 수정. y=827.2 좌석이 열 첫 번째(#28)에 잘못 배치되어 있었음. y 내림차순으로 재정렬하여 #28→(950.7), #29→(941.2), …, #37→(866.5), #38→(827.2), #39→(818.2), #40→(809.1) 순서로 수정.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** H 구역 좌측 1번 기준 아래로 순차 증가하는 정렬에서, 29번 위치에 있어야 할 좌석이 28번으로 표시되고 실제 28번 좌석(y=827.2)은 39번(y=818.2) 바로 위에 위치.
- **원인(Cause):** x=821.3 열의 좌석 중 y=827.2 좌석이 y 내림차순 정렬이 아닌 열 맨 앞(#28)에 배치되어 나머지 좌석 번호가 1씩 밀림.
- **해결(Solution):** y=827.2 좌석을 올바른 위치(y=866.5와 y=818.2 사이, #38)로 이동하고 #28~#37 좌석을 1씩 앞당겨 재번호.

## [2026-09-04 04:30] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/utils/backendApi.js]**: `releaseSeatBeacon()` 함수 추가. `navigator.sendBeacon()`을 사용하여 페이지 종료(닫기/새로고침) 시에도 좌석 해제 요청이 브라우저에 의해 전송 보장됨.
- **[src/pages/seatSelect.js]**: `pagehide`·`beforeunload` 이벤트 핸들러 등록. 선점 중인 좌석이 있을 때 브라우저 닫기/새로고침 시 `releaseSeatBeacon()`으로 서버에 즉시 해제 요청. SPA 내부 라우팅 시에는 기존 `releaseSeatApi()` 경로 유지. cleanup 함수에서 이벤트 리스너 제거.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 사용자가 좌석 선택 중 브라우저를 닫거나 새로고침하면 좌석이 서버 타이머 만료(기본 600초)까지 HELD 상태로 잠겨 다른 사용자가 선택 불가.
- **원인(Cause):** SPA 라우터의 cleanup 함수는 해시 변경(내부 네비게이션) 시에만 호출됨. 브라우저 종료/새로고침 시에는 `hashchange` 이벤트가 발생하지 않아 cleanup이 실행되지 않음. 기존 `fetch` 기반 `releaseSeatApi()`는 페이지 언로드 시 브라우저가 요청을 취소할 수 있어 신뢰성 없음.
- **해결(Solution):** `navigator.sendBeacon()`은 페이지 종료 과정에서도 브라우저가 전송을 보장하는 API. `Blob`으로 `application/json` Content-Type을 지정하여 기존 `/seats/release` 엔드포인트와 호환. `pagehide`(모바일/Safari 호환)와 `beforeunload`(데스크톱 백업) 두 이벤트에 동일 핸들러를 등록하여 크로스 브라우저 커버리지 확보.

## [2026-09-04 03:30] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/data/olympicHallSeats.js]**: D1 구역(156석) 좌석 번호를 -48° 투영 기반 행 우선(row-first) 정렬로 재정렬. rowKey=y−1.5x 내림차순 그룹(threshold 5) → colKey=x−1.5y 오름차순. 12행 구조(8,9,10,10,12,14,16,15,16,16,15,15). (기존 #156→1번, #155→2번, #15→48번)
- **[src/data/olympicHallSeats.js]**: D2 구역(127석) 좌석 번호를 D1과 동일한 투영 기반 행 우선 정렬로 재정렬. 9행 구조(15,16,16,15,16,15,13,11,10). (기존 #95→1번, #89→2번, #103→16번)

## [2026-09-04 02:30] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/data/olympicHallSeats.js]**: I3 구역(183석) 좌석 번호를 대각선 우선(diagonal-first) 정렬로 재정렬. 대각선 좌석 31개(new#1~31) → 그리드 좌석 152개(new#32~183) 순서. 대각선은 y내림·x오름(threshold 3), 그리드는 y내림·x내림(threshold 5)으로 정렬. (기존 #170→1번, #9→2번, #52→16번, #58→17번, #178→20번, #107→31번, #8→32번, #7→33번, #19→40번, #71→80번)

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** I3 구역 대각선 좌석(오른쪽 대각선)과 그리드 좌석이 혼재 정렬되어, 사용자 기준 순번 불일치. I1과 대칭 구조(좌↔우 반전)인데 정렬 방식이 다름.
- **원인(Cause):** I3 대각선은 I1과 달리 오른쪽에 위치하여 x방향이 반전됨. 기존 그리드앵커 방식은 대각선/그리드를 분리하지 않음. #108(719.1, 158.0)은 이웃 좌석 기반 분류에서 대각선으로 판정되지만, 사용자 기준 #107→31번(대각선 마지막)이므로 그리드로 재분류 필요. 그리드 threshold 2에서 #108이 단독 1석 행을 형성하여 후속 행 번호가 1씩 밀림.
- **해결(Solution):** I1과 동일한 이웃 좌석 기반 분류법 적용(|dy|≤1, |dx|≤8). #108을 그리드로 재분류하여 31개 대각선 + 152개 그리드. 대각선은 threshold 3 + x오름차순(I1의 x내림과 반대, 오른쪽 대각선 구조 반영). 그리드는 threshold 5 + x내림차순(왼쪽 순차 = 오른쪽에서 시작)으로 정렬하여 #108을 인접 그리드 행에 병합.

## [2026-09-04 01:00] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/data/olympicHallSeats.js]**: I1 구역(184석) 좌석 번호를 대각선 우선(diagonal-first) 정렬로 재정렬. 대각선 좌석 32개(new#1~32) → 그리드 좌석 152개(new#33~184) 순서. 대각선은 y내림·x내림(threshold 3), 그리드는 y내림·x오름(threshold 2)으로 정렬. (기존 #11→3번, #52→15번, #67→20번, #123→32번, #3→33번, #54→70번, #72→81번)

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** I1 구역 대각선 좌석과 그리드 좌석이 혼재 정렬되어, 사용자 기준 순번 불일치.
- **원인(Cause):** 기존 단순 y내림차순 정렬은 대각선/그리드를 구분하지 않아 대각선 좌석이 그리드 행 사이에 삽입됨. Math.round(y) 기반 yCounts 분류는 #89(x=271.4, 그리드에서 55단위 떨어진 대각선)를 그리드로, #90~#92(실제 그리드)를 대각선으로 오분류.
- **해결(Solution):** 이웃 좌석 기반 분류법 도입 — |dy|≤1, |dx|≤8 범위 내 이웃이 1개 이상이면 그리드, 없으면 대각선으로 분류. 이를 통해 정확히 32개 대각선, 152개 그리드 좌석을 식별. 대각선은 threshold 3 + x내림차순, 그리드는 threshold 2 + x오름차순으로 행 그룹 내 정렬.

## [2026-09-03 23:00] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/data/olympicHallSeats.js]**: I1 구역(184석) 좌석 번호를 행 우선(row-first) 정렬로 재정렬. 대각선→그리드 순서로 위→아래, 좌→우 순번 부여. (기존 #65→1번, #76→2번, #54→11번)
- **[src/data/olympicHallSeats.js]**: I2 구역(198석) 좌석 번호를 행 우선(row-first) 정렬로 재정렬. 18열×11행 구조. (기존 #3→1번, #16→2번, #4→19번)
- **[src/data/olympicHallSeats.js]**: I3 구역(183석) 좌석 번호를 행 우선(row-first) 정렬로 재정렬. 그리드→대각선 순서로 위→아래, 좌→우 순번 부여. (기존 #1→1번, #13→2번, #2→11번)

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** I1/I2/I3 구역에서 좌석 번호가 CSV 추출 순서대로 부여되어 물리적 위치와 불일치.
- **원인(Cause):** I1/I3는 대각선 좌석과 수평 그리드 좌석이 혼재되어 있고, CSV 행 순서가 화면 배치 순서와 무관. I2는 열(column) 우선으로 번호가 매겨져 있었음.
- **해결(Solution):** I1은 단순 y내림차순·x오름차순(threshold 2)로 정렬. I2도 동일. I3는 그리드 행을 기준으로 인접 대각선 좌석을 병합(maxDist 5)한 뒤 행 우선 정렬, 미할당 대각선 좌석은 끝에 배치.

## [2026-09-03 22:30] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/data/olympicHallSeats.js]**: F1 구역(66석) 좌석 번호를 행 우선(row-first) 정렬로 재정렬. 위→아래, 좌→우 순서로 순번 부여. (기존 #12→2번, #2→7번)
- **[src/data/olympicHallSeats.js]**: F2 구역(209석) 좌석 번호를 행 우선(row-first) 정렬로 재정렬. 19열×11행 구조. (기존 #12→2번, #2→20번)
- **[src/data/olympicHallSeats.js]**: F3 구역(66석) 좌석 번호를 행 우선(row-first) 정렬로 재정렬. F1과 동일 패턴 적용. (기존 #12→2번, #2→7번)

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** F1/F2/F3 구역에서 좌석 번호가 열(column) 우선으로 위에서 아래로 매겨져, 가로(행) 방향 번호 순서가 불연속적.
- **원인(Cause):** CSV 좌표 추출 시 좌석이 열 단위로 순서가 부여되어, 같은 행의 다음 좌석이 +11(또는 +19) 간격으로 건너뜀.
- **해결(Solution):** y좌표 내림차순(위 행 우선) → x좌표 오름차순(좌→우) 정렬 적용. 같은 행의 좌석이 연속 번호를 갖도록 재정렬.

## [2026-09-03 22:00] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/data/olympicHallSeats.js]**: B1 구역 정렬 방식을 열 우선(column-first)에서 행 우선(row-first)으로 변경. B2와 동일한 정렬 규칙 적용. 기존 B1-8이 2번, B1-93이 48번이 되도록 행(row) 우선·왼→오른 순번으로 재정렬.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** B1 구역 좌석이 위에서 아래로(열 우선) 순번이 매겨져 B2 구역(왼→오른, 행 우선)과 정렬 방식이 불일치.
- **원인(Cause):** 초기 재정렬 시 B1은 column-first(cx+cy 그룹 → cy−0.9cx 오름차순), B2는 row-first(cy−0.9cx 그룹 → cx+cy 오름차순)로 서로 다른 정렬 방식을 적용.
- **해결(Solution):** B1도 row-first로 통일. 48° 투영 기준 `rowKey=cy−0.9cx` 그룹 → `colKey=cx+cy` 오름차순으로 정렬하여 좌→우 방향 순번 부여.

## [2026-09-03 21:30] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/data/olympicHallSeats.js]**: B1 구역(156석) 좌석 번호를 물리적 배치 순서로 재정렬. 기존 B1-81이 1번, B1-64가 2번, B1-93이 8번이 되도록 열(column) 우선·위→아래 순번 적용.
- **[src/data/olympicHallSeats.js]**: B2 구역(127석) 좌석 번호를 물리적 배치 순서로 재정렬. 기존 B2-6이 1번, B2-1이 16번이 되도록 행(row) 우선·왼→오른 순번 적용.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** B1/B2 구역에서 인터랙티브 좌석 번호가 물리적 위치 순서와 불일치(예: 최상단 좌석이 81번으로 표시).
- **원인(Cause):** CSV 좌표 추출 시 좌석 번호가 물리적 배치가 아닌 추출 순서(automeris.io)로 부여됨.
- **해결(Solution):** 캔버스 좌표 변환(x×1.27+70, 1057−y×0.9025) 후 48° 회전축 기준으로 투영하여 B1은 열 우선(cx+cy 그룹 → cy−0.9cx 오름차순), B2는 행 우선(cy−0.9cx 그룹 → cx+cy 오름차순)으로 정렬 후 순번 재부여.

## [2026-09-03 18:30] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/components/seatMap.js]**: Floor 구역 좌석의 `_displayNum`을 배열 인덱스(`i + 1`) 대신 좌석 ID에서 추출한 실제 번호로 변경. API 좌석을 번호순 정렬 후 그리드에 배치하도록 수정.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** Floor 구역에서 888번 좌석을 선택·결제했지만, DB에는 `Floor-868`로 저장됨. 프론트 예매내역에서는 888번으로 표시되어 불일치 발생.
- **원인(Cause):** `seatMap.js`의 Floor 좌석 렌더링이 `_displayNum = i + 1`(배열 인덱스 기반)을 사용. Redis SCAN이 반환하는 좌석 순서가 ID 번호순이 아니므로, 화면상 888번째 위치의 좌석이 실제로는 `Floor-868` ID를 가진 좌석이었음. 비-Floor 구역은 `seatId.match(/-(\d+)$/)`로 ID에서 번호를 추출하므로 이 문제가 없었음.
- **해결(Solution):** Floor 좌석을 ID 번호순으로 정렬 후 그리드에 배치하고, `_displayNum`도 ID에서 추출한 실제 번호를 사용하도록 수정. 이로써 화면 표시 번호 = 좌석 ID 번호 = DB 저장 ID가 일치.

## [2026-09-03 16:00] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/zoneSelect.js]**: 대기열 이후 좌석 선택 지도 아래 가격 범례를 구역별 표시에서 VIP·R·S·A 등급별 표시로 변경하고, 동일 등급은 한 항목으로 통합.
- **[README.MD]**: 좌석 선택 화면의 등급별 가격 범례 동작을 문서화.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 좌석 선택 지도 아래에 A1, B1 등 모든 구역의 가격 정보가 반복 표시됨.
- **원인(Cause):** 가격 범례가 `zoneMeta`의 모든 구역을 그대로 순회해 구역명과 가격을 출력하고 있었음.
- **해결(Solution):** 실제 표시 좌석이 있는 구역을 등급으로 집계하고, VIP·R·S·A 순서로 중복 없이 가격을 렌더링하도록 수정.

## [2026-09-03 15:53] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/data/concerts.js]**: `TOMORROW X TOGETHER` 전체 공연명이 `TXT` 약칭과 별도로 매칭되도록 추가하고, 두 이름 모두 `poster-tomorrow.png`를 사용하도록 수정.
- **[src/data/concerts.js]**: 포스터 목록의 기존 `poster-txt.png` 경로도 실제 파일명인 `poster-tomorrow.png`로 교체해 fallback 이미지 누락을 방지.
- **[README.MD]**: 공연명·포스터 매칭 규칙을 문서화.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** `TOMORROW X TOGETHER` 공연을 생성하면 헤이즈 포스터가 표시됨.
- **원인(Cause):** 포스터 매칭표에는 `TXT`만 등록되어 있고 실제 공연명에는 `TXT` 문자열이 없어 명시적 매칭에 실패한 뒤 해시 fallback이 실행됨.
- **해결(Solution):** 전체 이름과 약칭을 모두 `poster-tomorrow.png`에 명시적으로 연결하고, 포스터 배열의 경로도 실제 파일명으로 통일.

## [2026-09-03 15:34] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: 선택 체크박스 기반 삭제를 제거하고, `5개씩 삭제` 버튼 클릭 시 현재 목록의 앞에서부터 최대 5개 공연을 자동 선택해 삭제하도록 변경.
- **[src/pages/admin.js]**: 삭제 후 목록의 열 수와 단일 공연 삭제 이름 표시 위치를 새 테이블 구조에 맞게 보정.
- **[README.MD]**: 관리자 공연 5개 단위 삭제 동작을 문서화.

## [2026-09-03 15:48] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[public/images/queuing-logo-header.png]**: 사용자가 제공한 가로형 `그림1.png` 최종 로고로 헤더 이미지를 교체.
- **[README.MD]**: 가로형 최종 로고 적용 상태를 문서화.

## [2026-09-03 15:44] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: `5개씩 삭제` 요청이 운영 백엔드의 배치 라우트 미반영으로 404가 발생해도 기존 단일 삭제 API를 5건 순차 호출하도록 대체 경로를 추가.
- **[src/pages/admin.js]**: 부분 삭제 실패 후 목록을 다시 조회해 실제 삭제 상태와 버튼 상태가 일치하도록 보완.
- **[README.MD]**: 일괄 삭제의 구버전 API 대체 처리 방식을 문서화.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 관리자 화면에서 `5개씩 삭제` 버튼을 눌러도 일괄 삭제가 진행되지 않음.
- **원인(Cause):** 프론트엔드는 `POST /events/batch-delete`에 의존하지만 운영 API가 이전 버전이면 해당 라우트가 없어 404가 반환될 수 있음.
- **해결(Solution):** 404 응답 시 기존 `DELETE /events/:eventId`를 최대 5건 순차 호출하도록 변경해 배치 라우트 배포 여부와 관계없이 동작하도록 처리.

## [2026-09-03 15:27] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[public/images/queuing-logo-header.png]**: 사용자가 제공한 최종 로고 디자인(흰색 심볼·문자·장식별)을 헤더 표시 영역에 맞게 적용하고 배경을 헤더 색상 `#B5121B`로 통일.
- **[src/components/header.js]**: 기존 헤더 전용 로고 경로를 유지해 일반 화면과 예매 진행 화면 모두 최종 디자인을 사용하도록 반영.
- **[README.MD]**: 최종 로고 적용 내용을 문서화.

## [2026-09-03 15:19] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[public/images/queuing-logo-header.png]**: 로고 심볼과 문자는 유지하고 배경만 사이트 헤더 색상 `#B5121B`로 맞춘 헤더 전용 이미지를 추가.
- **[src/components/header.js]**: 일반 헤더와 예매 진행 헤더가 색상 통일 로고를 사용하도록 변경.
- **[README.MD]**: 헤더 전용 로고의 사용 목적과 적용 범위를 문서화.

## [이전 정리 기준 · 시각 미기재] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/data/olympicHallSeats.js]**: I2 구역 좌석 좌표 교체 (198석, 에디터 조정값 반영).
- **[seat_editor.html]**: Backspace 입력 필드 충돌 수정 — 입력 필드 포커스 시 좌석 삭제 방지.
- **[src/data/olympicHallSeats.js]**: B1 구역 좌석 좌표 교체 (154→156석, automeris.io 재추출).
- **[src/data/olympicHallSeats.js]**: B2 구역 좌석 좌표 교체 (127→128석, automeris.io 재추출).
- **[src/data/olympicHallSeats.js]**: Floor 구역 좌석 좌표 교체 (887→888석, `getEvenFloorPoint` 역변환 계산).
- **[src/components/seatMap.js]**: 대각선 구역(B1/B2/D1/D2)의 클러스터링 tolerance를 1.5에서 3.0으로 조정.
- **[seat_editor.html]**: 인터랙티브 좌석 위치 에디터 신규 생성.
- **[seat_editor.html]**: 구역 전체 이동, X/Y 좌표 일괄 적용, 사각 영역 선택, 시각적 회전 분리, 좌석 추가/삭제, 회전 각도 Enter 입력 기능 추가.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** B1/B2 구역 좌석이 배경 이미지의 실제 좌석 위치와 맞지 않고, 좌석 간격이 불규칙하거나 일부 좌석이 겹침.
- **원인(Cause):** automeris.io CSV 좌표 추출 과정의 1~3px 노이즈가 sin(48°) 회전 변환 후 증폭되어 기존 `clusterCoordinateLines()` tolerance 1.5를 초과.
- **해결(Solution):** 대각선 구역(angle ≠ 0)의 클러스터링 tolerance를 3.0으로 증가하고 비대각선 구역은 1.5를 유지.

- **증상(Issue):** 에디터에서 좌석 회전 시 시각적으로 기울어지는 대신 구역 중심 기준으로 좌석 위치 자체가 이동.
- **원인(Cause):** `rotateSelected()`가 centroid 기준 위치 회전과 시각적 각도 변경을 동시에 처리.
- **해결(Solution):** `rotateSelected()`는 per-seat `angle`과 `ctx.rotate()`를 이용한 시각적 회전만 담당하고, `rotatePositions()`가 centroid 기준 위치 회전을 담당하도록 분리.

- **증상(Issue):** 에디터 입력 필드에서 Backspace/Delete로 값을 수정할 때 좌석 삭제 확인창이 표시됨.
- **원인(Cause):** 전역 `keydown` 핸들러가 입력 필드 포커스 여부와 관계없이 삭제 키를 처리.
- **해결(Solution):** 삭제 키 처리 전에 활성 요소가 `INPUT`, `TEXTAREA`, `SELECT`인지 확인하여 입력 필드에서는 좌석 삭제 로직을 실행하지 않도록 수정.

## [2026-09-03 15:08] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: 관리자 공연 목록에 선택 체크박스와 최대 5개 일괄 삭제 버튼을 추가하고, 선택된 공연의 삭제 결과를 표시하도록 수정.
- **[src/routes/eventRoutes.js]**: 최대 5개 이벤트를 순차적으로 삭제하는 `POST /events/batch-delete` API를 추가하고, 기존 단일 삭제도 공통 삭제 로직을 사용하도록 정리.
- **[README.MD]**: 관리자 일괄 삭제 동작과 API 설명을 반영.

## [2026-09-03 14:40] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/state/store.js]**: 계정 전환·로그아웃·세션 만료 시 계정 전용 예매내역과 관심/대기열 상태를 초기화해 관리자 예매가 일반 사용자 화면에 남지 않도록 수정.
- **[src/state/store.js]**: 새로 저장하거나 서버에서 복원하는 예매내역에 소유 계정 식별자를 기록하도록 수정.
- **[src/pages/mypage.js]**: 계정 전환 중 늦게 도착한 이전 계정의 예매 조회 응답을 무시하도록 방어 로직 추가.

## [2026-09-03 13:57] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/home.js]**: 메인 HOT 공연 문구를 ‘요즘 HOT 공연’으로 변경하고, 기존 이벤트 목록을 관심 등록 수 기준으로 정렬해 상위 5개만 표시하도록 수정.
- **[src/pages/home.js]**: `ticketOpenAt`이 현재 시각 이후인 포스터 공연을 ‘오픈 예정’ 섹션에 표시하고, HOT/오픈 예정에 포함되지 않은 나머지 공연을 ‘콘서트 둘러보기’ 5열 그리드로 표시하도록 추가.
- **[src/components/header.js]**: 마이페이지 메뉴 옆에 공연 검색창을 추가하고 검색 결과 화면으로 이동하도록 연결.
- **[src/pages/concertsList.js]**: 헤더 검색어를 받아 공연명·공연장 기준으로 검색 결과를 표시하도록 수정.
- **[src/styles/components.css]**: 새 홈 섹션 카드, 헤더 검색창, 5열 그리드 및 화면 크기별 반응형 스타일 추가.

## [2026-09-03 12:53] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/mypage.js]**: 마이페이지의 캘린더 메뉴·캘린더 화면·개요 캘린더 영역을 제거하고, 멤버십 상태를 개요와 상세 화면의 로켓 UI로 표시하도록 수정.
- **[src/styles/pages.css]**: 멤버십 활성화/비활성화 로켓 스타일을 추가하고, 개요와 상세 화면에서 동일한 이모지 로켓 형태를 사용하도록 정리.
- **[src/pages/payment.js]**: 결제 시 저장된 전화번호가 다를 때만 확인 후 회원정보의 전화번호를 갱신하도록 구성. 이메일은 회원정보 비교·수정 대상에서 제외.
- **[src/state/store.js]**: 회원정보 저장 응답 처리에서 이메일을 갱신하지 않고 이름·전화번호 등 허용된 프로필 값만 반영하도록 수정.
## [2026-09-03 16:49] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/zoneSelect.js]**: 선택한 공연 회차의 좌석만 조회하고, 회차 변경 시 좌석 지도를 다시 렌더링하도록 변경.
- **[src/pages/queue.js / src/state/store.js]**: 대기열 요청과 Admission Token을 공연 날짜·시간별로 분리.
- **[src/pages/payment.js / src/utils/backendApi.js]**: 회차 정보를 좌석 확정·좌석 API 요청에 함께 전달.
- **[README.MD]**: 회차별 좌석 inventory와 대기열 연동 동작을 문서화.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 여러 공연일이 있는 공연에서 한 회차의 좌석 상태가 다른 회차 화면에 영향을 줄 수 있음.
- **원인(Cause):** 프론트엔드가 `/seats`를 공연 ID만으로 조회하고 회차 선택값은 화면 표시용으로만 사용함.
- **해결(Solution):** `/seats`, `/queue/enter`, `/queue/admit` 등에 선택 회차를 전달하고 회차 탭 변경 시 해당 회차 inventory를 재조회하도록 수정.
## [2026-09-06 14:13] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/cancelQueue.js]**: 임의 대기번호·랜덤 취소표 Pool 시뮬레이션을 제거하고 실제 대기열·멤버십·Secret Link·Redis 좌석 현황을 조회하도록 변경.
- **[src/pages/privateLink.js]**: 서버가 발급한 할당 좌석과 `expiresAt`을 사용하고, 링크 만료 시 다음 대기자 재배정 API를 호출하도록 변경.
- **[src/pages/cancelSeatSelect.js]**: 전체 가상 좌석 선택 대신 서버가 배정한 좌석만 `/cancel-queue/hold`로 선점하도록 변경. 결제 화면 이탈 시 `/seats/release` 호출.
- **[src/pages/payment.js]**: 취소표도 `/seats/confirm`을 호출해 실제 Redis 좌석과 MariaDB reservations에 확정 저장하도록 변경. Secret Link 만료 시 선점 해제·할당 만료를 처리.
- **[src/utils/backendApi.js]**: 취소표 대기열·Pool·선점·만료 API 호출 유틸리티 추가.
- **[src/state/store.js]**: 서버에서 확인한 취소표 대기 상태를 화면용 캐시로 저장하는 함수 추가.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** `cancel-ticketing.html`에 해당하는 화면은 있었지만 대기번호·좌석·Pool·결제 결과가 브라우저 로컬 상태에만 남음.
- **원인(Cause):** 취소표 전용 페이지들이 `joinCancelQueue()`, `ensureCancelPool()` 등 데모용 상태를 사용하고 취소표 결제에서는 좌석 확정을 건너뜀.
- **해결(Solution):** `POST /queue/enter` → `GET /cancel-queue/status` → `POST /cancel-queue/hold` → `POST /seats/confirm` 순서의 실제 API 흐름으로 교체하고, 서버 할당 만료 시 다음 사용자에게 좌석을 재배정하도록 연결.
## [2026-09-06 14:18] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/components/soldOutModal.js]**: 매진 안내 시 로컬 대기번호 대신 `POST /cancel-queue/join` 결과로 실제 standby 번호를 표시.
- **[src/pages/cancelQueue.js]**: 취소표 대기열 진입을 일반 `/queue/enter`가 아닌 취소표 전용 API로 변경.
- **[src/utils/backendApi.js]**: 취소표 standby 등록 API 호출 함수 `joinCancelQueueApi()` 추가.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 이미 일반 예매 대기열에 있거나 입장 허용된 사용자는 취소표 대기 등록이 누락될 수 있었음.
- **원인(Cause):** 매진 안내에서 로컬 상태만 갱신하고 실제 standby 이동 API를 호출하지 않았음.
- **해결(Solution):** 매진 안내와 취소표 대기열 화면 모두 전용 standby 등록 API를 호출해 서버 순번을 기준으로 표시.
## [2026-09-10 11:08] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/utils/authToken.js / src/state/store.js]**: 로그인 Access/Refresh JWT 저장·삭제·Bearer 헤더 생성을 공통화하고, 회원정보·회원탈퇴·멤버십·위시리스트·사용자별 예매 조회 요청에 Access JWT를 포함
- **[src/pages/admin.js]**: 관리자 API 호출을 `authFetch()`로 통합하여 관리자 Bearer JWT를 전송
- **[src/pages/queue.js / src/pages/zoneSelect.js]**: 사용자 대기열 조회·진입 요청에 인증 헤더를 포함하고 브라우저에서 관리자 전용 `/queue/admit` 호출을 제거
- **[src/utils/backendApi.js]**: 페이지 종료 좌석 해제 요청을 인증 헤더를 포함할 수 있는 `fetch(..., { keepalive: true })`로 변경
- **[cancel-ticketing.html]**: 독립 취소표 페이지가 이메일의 만료형 `linkToken`을 status/hold/confirm/expire/respond 요청에 전달하도록 연결
- **[README.md]**: 프론트 JWT 전송 규칙, 관리자 API 보호, 독립 취소표 링크와 keepalive 해제 동작을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 관리자 화면과 사용자별 API 요청에 인증 헤더가 누락될 수 있었고, `navigator.sendBeacon()`은 Bearer 헤더를 붙일 수 없어 좌석 해제 요청이 서버에서 거부될 수 있었음. 독립 취소표 링크에는 로그인 세션이 없음.
- **원인(Cause):** 화면별 raw fetch가 공통 인증 유틸리티를 사용하지 않았고, sendBeacon은 커스텀 Authorization 헤더를 지원하지 않음.
- **해결(Solution):** 공통 `authHeaders()`와 관리자용 `authFetch()`를 적용하고, 페이지 종료 해제는 `keepalive` fetch로 전환했다. 독립 링크는 linkToken을 서버 검증용으로만 전달한다.

---
## [2026-09-11 09:01] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/utils/websocketUrl.js]**: 현재 페이지의 HTTP/HTTPS 프로토콜을 기준으로 `ws://` 또는 `wss://` WebSocket URL을 생성하는 공통 유틸리티를 추가하고 query parameter를 안전하게 인코딩하도록 구성.
- **[src/services/realtimeIntegration.js]**: 실시간 채팅·좌석 상태 연결이 공통 URL 생성기를 사용하도록 변경하여 HTTPS 운영 사이트에서 `wss://`로 연결하도록 수정.
- **[src/utils/realtimeChat.js]**: 자동 재연결 좌석 WebSocket도 현재 페이지 프로토콜에 따라 `ws://`/`wss://`를 사용하도록 수정.
- **[README.md]**: 실시간 WebSocket의 프로토콜 선택 규칙과 운영 인프라의 `/ws` 전달 조건을 문서화.

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** HTTPS로 제공되는 프론트엔드가 `ws://`로 실시간 서버에 연결하려 하여 브라우저의 Mixed Content 정책에 의해 채팅·좌석 실시간 연결이 차단될 수 있음.
- **원인(Cause):** 채팅과 좌석 WebSocket URL이 `ws://`로 고정되어 있었음.
- **해결(Solution):** 페이지 프로토콜이 `https:`이면 `wss:`, 그 외에는 `ws:`를 선택하는 `createRealtimeWebSocketUrl()`을 추가하고 모든 프론트 WebSocket 연결에 적용.
## [2026-09-11 16:27] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: 취소표 시뮬레이션 상태 패널에서 실제 유저가 아직 대기열에 직접 진입하지 않은 상태를 명확히 표시
- **[README.md]**: 매진 연출 후 실제 유저가 프론트엔드 대기열에 직접 진입하는 테스트 흐름을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 매진 연출 직후 실제 유저의 취소표 대기 등록 여부가 실제 사용자 동작과 구분되지 않음
- **원인(Cause):** 시뮬레이션 API가 실제 유저를 매진 단계에서 사전 등록하는 구조였음
- **해결(Solution):** 관리 화면에서 사전 등록 상태 대신 `아직 대기열에 진입하지 않음`을 표시하고, 실제 `/queue/enter` 요청 이후 서버 상태를 확인하도록 흐름을 정리
## [2026-09-15 14:04] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/zoneSelect.js]**: 공연 삭제로 좌석 데이터가 0개가 된 경우 이를 매진으로 오인해 취소표 안내 모달을 띄우던 분기를 수정
- **[src/pages/zoneSelect.js]**: 좌석이 사라진 상황에서 최신 `/events` 목록을 확인하고, 삭제된 공연은 공연 종료 안내와 공연 목록 이동 버튼을 표시하도록 추가
- **[README.md]**: 공연 삭제·좌석 데이터 없음·실제 매진 상태의 구분과 fallback 동작을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 관리자 페이지에서 공연을 삭제한 뒤 사용자 좌석 선택 페이지에 해당 공연이 계속 매진된 것으로 표시되고, 일반 사용자용 취소표 안내 모달이 노출됨
- **원인(Cause):** 좌석 삭제 후 `/seats` 응답이 0개가 되면 공연 존재 여부를 확인하지 않고 잔여 좌석 0석을 실제 매진으로 판단하여 `showSoldOutModal()`을 호출함
- **해결(Solution):** 초기 렌더링에서는 실제 이벤트 좌석이 존재하는 경우에만 매진 처리하고, 폴링 중 좌석이 0개가 되면 최신 `/events`를 확인한다. 이벤트가 없으면 폴링·WebSocket을 정리하고 공연 종료 안내 화면을 표시하며, 일시적인 API 오류는 삭제로 간주하지 않도록 방어함
## [2026-09-16 14:33] 업데이트 로그 — 대기열 페이지 이탈 감지

### 🔄 변경 및 수정 사항
- **[src/utils/backendApi.js]**: 인증 헤더를 포함한 `leaveQueueBeacon()`을 추가해 페이지 종료 시 `/queue/leave`를 keepalive 방식으로 호출
- **[src/pages/queue.js]**: `pagehide`·`beforeunload` 이벤트에서 대기 중인 사용자만 서버에 이탈을 통지하고, 정상 입장 후 좌석 페이지로 이동할 때는 `settled` 상태로 중복 호출을 방지
- **[README.md]**: 대기열 이탈 통지와 정상 입장 예외 규칙을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 사용자가 대기열 페이지를 닫거나 새로고침해도 Redis 대기열에서 계속 대기자로 남아 후속 입장 슬롯 관리가 부정확했음
- **원인(Cause):** 브라우저 종료 시 인증 Bearer 헤더를 포함한 대기열 이탈 요청이 없었음
- **해결(Solution):** `pagehide`·`beforeunload`에서 `fetch(..., { keepalive: true })`를 사용하고, 정상 입장 전환은 `settled` 플래그로 보호했다.

---
## [2026-09-16 15:38] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: 취소표 시뮬레이션 단계4 버튼을 활성화. 버튼 클릭 시 관리자 인증을 포함해 `/admin/simulation/issue-links`를 호출하고 B파트 SQS 전송 결과를 토스트·로그·상태 패널에 표시
- **[src/pages/admin.js]**: `cancel_allocations.seat_id`가 아직 `NULL`인 B파트 할당도 상태 테이블에서 오류 없이 `좌석 선택 전`으로 표시
- **[README.md]**: 단계3·4의 A→B 취소표 시뮬레이션 연동 흐름 문서화

## [2026-09-16 16:00] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/state/store.js]**: 로그인 사용자의 서버 취소표 대기열 목록을 `waiting_queue` 기준으로 복원하는 `loadCancelQueuesFromServer()` 추가
- **[src/pages/mypage.js]**: 개요·취소표 대기열 목록 진입 시 서버 목록을 조회하고 5초마다 갱신. 시뮬레이션 마감 후 공연명·회차·대기순번을 마이페이지에 표시
- **[src/pages/mypage.js]**: 대기열 목록에서 상세 화면으로 이동할 때 `sessionDate`·`sessionTime`을 함께 전달해 선택한 회차의 대기 상태를 조회
- **[src/pages/cancelQueue.js]**: 전달받은 회차 컨텍스트를 우선 사용해 여러 회차 공연의 대기열이 다른 회차로 바뀌지 않도록 수정
- **[src/utils/backendApi.js]**: 서버 취소표 대기열 목록 조회 함수 `fetchMyCancelQueues()` 추가
- **[README.md]**: 마이페이지의 서버 대기열 복원 및 동기화 규칙 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 새로고침하거나 시뮬레이션 마감 후 마이페이지에 취소표 대기 공연이 나타나지 않음
- **원인(Cause):** `cancelQueues`가 화면에서 취소표 상세를 열었을 때만 생성되는 브라우저 임시 상태였음
- **해결(Solution):** 인증된 사용자의 `GET /cancel-queue/mine` 응답을 전역 상태로 복원하고, 개요·목록 화면에서 5초 주기로 재조회하도록 수정

---
## [2026-09-16 16:57] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/zoneSelect.js]**: 입장 승인 후 좌석 선택 화면 이탈·브라우저 종료 시 미결제 좌석 해제와 `POST /queue/leave` 호출을 연결해 `admitted` 슬롯을 즉시 반납
- **[src/pages/payment.js]**: 결제 실패·네트워크 오류·제한시간 초과 시 좌석 해제 후 일반 대기열의 `admitted` 슬롯을 반납하고 다음 대기자를 보충하도록 보완
- **[README.md]**: 100명 admission pool의 이탈·실패·완료 처리 기준 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 입장 승인된 사용자가 결제 전 이탈하거나 결제에 실패해도 `admitted`에 최대 7분 동안 남을 수 있음
- **원인(Cause):** 좌석 `release` 요청은 있었지만 대기열 `admitted` 제거와 `backfillOne()`을 수행하는 `/queue/leave` 호출이 좌석·결제 화면에 연결되지 않음
- **해결(Solution):** 좌석 이탈 시 keepalive 좌석 해제와 `queue/leave`를 함께 호출하고, 결제 실패·타임아웃 시 서버 좌석 해제 후 `queue/leave`를 호출하도록 보완. 결제 성공은 `settled`로 보호해 `SOLD` 좌석을 반납하지 않음

---
## [2026-09-16 17:52] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/mypage.js]**: 환불 대상 서버 예약 정보가 늦게 도착하거나 브라우저 상태에서 좌석 ID가 누락된 경우에도 `GET /reservations/user/:userId`를 재조회하여 좌석을 복원하도록 보강
- **[src/pages/mypage.js]**: `/reservations/user/:userId`와 `/seats/cancel` 요청에 8초 타임아웃과 1회 자동 재시도를 추가. 서버 환불 API가 성공하기 전에는 로컬 예매 상태만 환불 완료로 변경하지 않도록 처리

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 네트워크 지연으로 예약 자료를 가져오지 못하면 환불 버튼이 응답 없이 멈추거나, 로컬 상태만 변경되어 MariaDB 예약이 그대로 남을 수 있었음
- **원인(Cause):** 환불 화면의 브라우저 상태와 서버 `reservations` 데이터가 일시적으로 불일치하고, 요청에 무제한 대기 시간이 있었음
- **해결(Solution):** 실제 이벤트 예약은 서버 예약 조회 실패·모호한 좌석 매칭·환불 API 실패 시 로컬 완료 처리를 차단한다. 네트워크 타임아웃 또는 일시적인 연결 실패에는 멱등 환불 API를 1회 재시도하고, 최종 실패 시 버튼을 복구하여 사용자가 다시 요청할 수 있게 수정

## [2026-09-16 17:44] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/mypage.js]**: 실제 이벤트 예약은 좌석 ID에 `:`가 없는 구버전 데이터라도 환불 API 호출을 시도하도록 판별 조건을 보완
- **[src/pages/mypage.js]**: 환불 요청에 공연·회차 정보를 함께 전달하고, JSON이 아닌 서버 오류 응답도 HTTP 상태·메시지로 표시하도록 오류 처리를 강화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 마이페이지의 환불 버튼을 눌러도 일부 예매에서 백엔드 환불 요청이 호출되지 않거나 실패 원인이 화면에 표시되지 않음
- **원인(Cause):** 좌석 ID에 `:`가 없으면 프론트가 목업 예매로 판단해 API 호출을 생략했고, 서버가 JSON 이외 응답을 반환하면 원인 메시지를 잃었음
- **해결(Solution):** `evt-` 실제 이벤트 ID 또는 좌석 ID를 기준으로 서버 예매를 판별하고, 응답 본문을 안전하게 파싱해 실패 상세를 토스트와 콘솔에 남김

---
## [2026-09-17 00:31] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: 취소표 시뮬레이션에서 실제 멤버십 유저 이메일 입력 칸 제거
- **[src/pages/admin.js]**: 단계1 이후 실제 멤버십 계정으로 사이트에서 취소표 대기열에 직접 진입해야 한다는 안내와 현재 대상 사용자 표시 추가
- **[README.md]**: 관리자 시뮬레이션의 실제 사용자 수동 진입 및 단계4 B파트 전송 흐름 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 관리자 화면에서 지정 이메일을 입력하지 않으면 시뮬레이션의 실제 사용자 흐름을 시작할 수 없었음
- **원인(Cause):** 프론트엔드가 초기화 API에 이메일을 필수로 보내고, 단계4도 지정 사용자 등록을 전제로 동작함
- **해결(Solution):** 이메일 입력을 제거하고 초기화 → 매진 → 실제 멤버십 계정의 취소표 대기열 직접 진입 → 조기 마감 → 취소표 생성 → B파트 링크 발급 순서로 안내하도록 변경
## [2026-09-17 00:50] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/mypage.js]**: 취소표 대기열 공연 카드의 링크 발급 전 상태 문구를 `멤버십 대기 중`에서 `취소표 대기 중`으로 변경
- **[src/pages/queue.js]**: 공연 조기 마감 안내창의 멤버십 사용자 영역에 `마이페이지 취소표 대기열 확인` 버튼과 현재 순번 확인 안내 문구를 추가
- **[src/pages/queue.js]**: 새 버튼 선택 시 30초 자동 이동을 중지하고 `mypage/cancel-queue`로 즉시 이동하도록 연결
- **[README.md]**: 마이페이지 상태 문구와 조기 마감 후 취소표 대기열 이동 동작을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 공연 조기 마감 후 멤버십 사용자가 취소표 대기열을 확인하려면 자동 이동을 기다리거나 메인 페이지에서 다시 찾아야 했고, 마이페이지 카드의 `멤버십 대기 중` 문구가 실제 서비스 의미와 달랐음
- **원인(Cause):** 조기 마감 오버레이에 메인 페이지 이동 버튼만 있었으며, 대기열 상태가 멤버십 가입 상태처럼 표시됨
- **해결(Solution):** 취소표 대기 상태를 `취소표 대기 중`으로 통일하고, 안내창에 현재 순번을 확인할 수 있는 마이페이지 바로가기 버튼을 추가
## [2026-09-17 01:13] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: 기존 B파트 취소표 시뮬레이션과 별도로 `취소표 시뮬레이션 (Local)` 패널과 사이드바 메뉴를 추가
- **[src/pages/admin.js]**: Local 패널은 동일한 초기화·매진·조기 마감·취소표 생성 단계를 사용하고, 단계4에서 `/admin/local-simulation/issue-links`를 호출해 Gmail SMTP 발급 결과를 표시
- **[README.md]**: B파트 모드와 Local SMTP 모드의 관리자 시뮬레이션 차이 및 사용 흐름 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 기존 시뮬레이션 패널의 API 경로가 코드에 고정되어 같은 UI 로직을 Local API에 재사용할 수 없었음
- **원인(Cause):** 패널 초기화 함수가 전역 컨테이너에서 하나의 `/admin/simulation` 경로만 사용함
- **해결(Solution):** 패널 DOM 범위와 API base path를 옵션으로 주입하도록 변경하여 기존 B 패널과 Local 패널이 서로 다른 API를 호출하도록 분리
## [2026-09-17 09:55] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/verifyLink.js]**: 이미 로그인된 브라우저에서도 검증 성공 시 취소표 전용 Access JWT로 세션을 갱신하도록 수정
- **[src/pages/cancelSeatSelect.js / README.md]**: 취소표 전용 세션으로 배정 좌석 선점 흐름을 명확히 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** Secret Link를 검증했는데 기존 로그인 세션의 일반 토큰이 남아 취소표 좌석 선점 요청이 실패할 수 있었음
- **원인(Cause):** 링크 검증 성공 후 비로그인 상태에서만 `login()`을 호출하여, 기존 사용자·관리자 세션은 링크 전용 토큰으로 교체되지 않음
- **해결(Solution):** 링크 검증 성공 시 항상 응답의 `accessToken`을 저장하고 해당 링크의 사용자 세션으로 전환하도록 수정
## [2026-09-17 10:06] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/mypage.js]**: 마이페이지 취소표 대기열을 순번·상태·공연 정보만 확인하는 읽기 전용 목록으로 변경하고, 공연 행 클릭에 의한 상세·예매 진입을 제거
- **[src/pages/privateLink.js / src/pages/cancelSeatSelect.js]**: Secret Link 만료·오류 또는 접근 실패 시 마이페이지 취소표 대기열로 보내지 않고 개인 링크 흐름 안에서 안내한 뒤 홈으로 이동
- **[src/main.js / README.md]**: 구형 취소표 상세 URL도 읽기 전용 마이페이지 목록으로 정규화하고 Secret Link 전용 진입 정책을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 마이페이지 취소표 대기열의 공연 항목을 누르면 취소표 상세·Secret Link 입장 화면으로 이동할 수 있었고, 링크 오류 화면의 버튼이 다시 마이페이지 대기열로 이동했음
- **원인(Cause):** 마이페이지가 `eventId` 쿼리를 받아 `cancelQueuePage`를 내부 마운트했고, 목록 행에도 상세 이동 이벤트가 연결되어 있었음
- **해결(Solution):** 마이페이지에서 상세 컴포넌트 마운트를 제거하고 목록 행을 비활성 정보 카드로 변경했다. 개인 예매 화면은 이메일 Secret Link의 `verify-link → private-link → cancel-seats` 흐름에서만 접근하도록 정리했다.
## [2026-09-17 10:47] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/admin.js]**: 취소표 시뮬레이션 버튼을 현재 단계에 맞게 제한하여 단계2 조기 마감 전 단계3 취소표 생성을 실행하지 못하도록 수정
- **[README.md]**: 로컬 시뮬레이션의 단계 순서와 단계3 이후 Secret Link를 통해 좌석 선택 페이지에 진입하는 흐름 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** 단계2 조기 마감 전에 단계3을 실행할 수 있어 시뮬레이션 상태가 어긋났고, 대기 중인 사용자가 좌석 선택 페이지로 이동하지 못하는 상황이 발생함
- **원인(Cause):** 프론트엔드가 공연만 선택되면 모든 시뮬레이션 단계 버튼을 활성화하여 선행 단계가 완료되지 않아도 요청할 수 있었음
- **해결(Solution):** 초기화 → 매진 → 조기 마감 → 취소표 생성 → 링크 발급 순서에 맞춰 버튼을 활성화한다. 단계3은 단계2 이후에만 가능하고, 실제 좌석 선택은 단계4에서 발급된 개인 Secret Link를 클릭할 때만 진행된다.

---
## [2026-09-17 12:32] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/cancelSeatSelect.js]**: A파트 취소표 화면을 보존하고, `allocation.seatId`가 있으면 배정 좌석만, NULL이면 해당 회차의 AVAILABLE 좌석만 선택하도록 지원
- **[src/pages/privateLink.js / src/pages/verifyLink.js]**: B파트 별도 사이트와 분리된 A파트 local SMTP/fallback Secret Link 진입 화면임을 코드 주석과 문서에 명시
- **[README.md]**: 전체 인터랙티브 좌석맵 표시, 서버 배정 모드와 사용자 직접 선택 모드, A파트 화면 보존 정책을 문서화

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** B파트가 좌석을 사전에 배정하지 않고 `seat_id = NULL`인 Secret Link를 발급하면 기존 취소표 좌석 화면에서 선택할 수 있는 좌석이 없었음
- **원인(Cause):** 기존 UI가 allocation에 기록된 단일 좌석을 전제로 하여 좌석 선택 가능 여부를 계산했음
- **해결(Solution):** 회차 좌석 전체를 조회해 실제 상태를 표시하고, NULL 모드에서 AVAILABLE 좌석만 클릭 가능하도록 변경했다. 선택 시 A파트 API가 allocation에 선택 좌석을 저장하고 서버 좌석 홀드를 완료한 뒤 결제로 전달한다. B파트가 별도 사이트를 운영해도 이 A파트 흐름은 삭제하거나 일반 예매 흐름으로 통합하지 않는다.

## [2026-09-17 12:34] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/cancelSeatSelect.js]**: 기존 A파트 취소표 화면을 보존하고 서버 배정 좌석 모드와 NULL allocation의 사용자 직접 선택 모드를 함께 유지

### 🛠 트러블슈팅 (Troubleshooting)
- **증상(Issue):** B파트 별도 취소표 사이트 추가 후 A파트 local SMTP/fallback 화면이 정리 대상 코드로 오인될 수 있었음
- **원인(Cause):** A파트와 B파트의 취소표 UI가 별도 운영된다는 보존 정책이 코드와 문서에 충분히 표시되지 않았음
- **해결(Solution):** Secret Link 검증·개인 입장·좌석 선택 파일에 보존 주석을 추가하고, `allocation.seatId` 유무에 따른 두 가지 선택 정책과 API 흐름을 README에 명시
