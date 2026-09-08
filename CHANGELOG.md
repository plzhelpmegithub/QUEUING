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
