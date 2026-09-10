# QUEUING - 프론트엔드 (Vite SPA)

Vite 기반 Vanilla JS 싱글 페이지 애플리케이션. 콘서트 예매 티켓팅 시스템의 사용자/관리자 인터페이스.

**빌드 도구**: Vite 6.x  
**런타임**: 브라우저 (ES Modules)  
**배포**: Nginx 정적 파일 서빙 + API 리버스 프록시

---

## 디렉토리 구조

```
nginx/
├── index.html                      # Vite 진입점
├── vite.config.js                  # Vite 설정 (프록시, HMR)
├── cancel-ticketing.html            # 멤버십 전용 취소표 예매 독립 페이지 (시크릿 링크 대상)
├── seat_editor.html                # 인터랙티브 좌석 위치 에디터 (개발용)
├── public/images/queuing-logo-header.png # 가로형 최종 디자인의 헤더용 QUEUING 로고
└── src/
    ├── main.js                     # 앱 진입점 (라우터 초기화)
    ├── router.js                   # SPA 라우터 (hash 기반)
    ├── components/
    │   ├── calendar.js             # 달력 컴포넌트
    │   ├── countdown.js            # 카운트다운 타이머
    │   ├── footer.js               # 공통 푸터
    │   ├── header.js               # 공통 헤더 (네비게이션)
    │   ├── liveChat.js             # 실시간 채팅 위젯
    │   ├── miniChart.js            # 미니 차트 (대시보드용)
    │   ├── modal.js                # 모달 다이얼로그
    │   ├── olympicHallMap.js       # 올림픽홀 SVG 좌석 맵
    │   ├── refundPolicy.js         # 환불 정책 표시
    │   ├── rocketProgress.js       # 로켓 프로그레스 애니메이션
    │   ├── seatMap.js              # 좌석 배치도 렌더링 (Canvas 2D)
    │   ├── soldOutModal.js         # 매진 안내 모달
    │   └── toast.js                # 토스트 알림
    ├── data/
    │   ├── concerts.js             # 콘서트 더미/설정 데이터
    │   ├── olympicHallSeats.js     # 올림픽홀 구역별 좌석 좌표 (CSV 기반)
    │   └── refundPolicy.js         # 환불 정책 데이터
    ├── pages/
    │   ├── admin.js                # 관리자 대시보드
    │   ├── bookingComplete.js      # 예매 완료
    │   ├── bookingDateTime.js      # 날짜/시간 선택
    │   ├── cancelQueue.js          # 취소표 대기열
    │   ├── cancelSeatSelect.js     # 취소표 좌석 선택
    │   ├── concertDetail.js        # 공연 상세
    │   ├── concertsList.js         # 공연 목록
    │   ├── home.js                 # 홈 페이지
    │   ├── login.js                # 로그인
    │   ├── membership.js           # 멤버십
    │   ├── membershipCheckout.js   # 멤버십 결제
    │   ├── monitoring.js           # 모니터링 대시보드
    │   ├── mypage.js               # 마이페이지
    │   ├── olympicHallPreview.js   # 올림픽홀 미리보기
    │   ├── payment.js              # 결제 페이지
    │   ├── privateLink.js          # Secret Link 입장
    │   ├── queue.js                # 대기열 페이지
    │   ├── seatMapper.js           # 좌석 매퍼
    │   ├── seatSelect.js           # 좌석 선택
    │   ├── signup.js               # 회원가입
    │   ├── signupComplete.js       # 회원가입 완료
    │   └── zoneSelect.js           # 구역 선택
    ├── services/
    │   └── realtimeIntegration.js  # WebSocket/SSE 실시간 연동
    ├── state/
    │   ├── seatEngine.js           # 좌석 상태 관리 엔진
    │   └── store.js                # 전역 상태 관리
    ├── styles/
    │   ├── calendarEvents.js       # 달력 이벤트 스타일
    │   ├── components.css          # 컴포넌트 CSS
    │   ├── home.js                 # 홈 스타일
    │   ├── mypage.js               # 마이페이지 스타일
    │   ├── pages.css               # 페이지별 CSS
    │   └── style.css               # 글로벌 CSS
    └── utils/
        ├── backendApi.js           # API 호출 유틸리티
        ├── authToken.js            # Access/Refresh JWT 저장 및 Bearer 헤더 생성
        ├── recaptcha.js            # Google reCAPTCHA v3/v2 토큰 발급 및 자동 폴백
        ├── calendarEvents.js       # 달력 이벤트 유틸리티
        ├── format.js               # 날짜/숫자 포맷
        └── realtimeChat.js         # 실시간 채팅 유틸리티
```

---

## 주요 모듈

### seatMap.js — 좌석 배치도 렌더링 엔진

Canvas 2D 기반 좌석맵 렌더링. 올림픽홀 배경 이미지 위에 좌석을 오버레이.

**좌표 변환 (CSV → Canvas):**
- `x = csvX * 1.27 + 70` (OH_X_SCALE=1.27, OH_X_OFFSET=70)
- `y = 1057 - csvY * 0.9025` (OH_Y_OFFSET=1057, OH_Y_SCALE=0.9025)

**구역 회전:**
- B1/B2: 48° (상단 대각선)
- D1/D2: -48° (하단 대각선)
- 나머지: 0° (수평/수직)

**핵심 함수:**
- `computeOlympicHallLayout()`: API 좌석을 CSV 좌표에 매칭
- `normalizeOlympicZoneCoordinates()`: 대각선 구역 회전 후 스내핑
- `clusterCoordinateLines(tolerance)`: 근접 좌표를 그리드 라인에 정렬
- `getEvenFloorPoint()`: Floor 좌석을 OH_FLOOR_BOX 그리드에 균등 배치

**상수:**
- `OH_FLOOR_BOX = { x: 560, y: 180, width: 289, height: 195, cols: 37, rows: 24 }`
- `OH_FLOOR_SEAT_COUNT = 888`
- 대각선 구역 클러스터링 tolerance: 3.0 (비대각선: 1.5)

### olympicHallSeats.js — 좌석 좌표 데이터

구역별 좌석 CSV 좌표. X: 0~1000 (좌→우), Y: 0~1000 (하→상, 캔버스에서 반전).

| 구역 | 좌석 수 | 데이터 상태 |
|------|---------|------------|
| A1~A3 | 가변 | 원본 |
| B1 | 156 | automeris.io 재추출 |
| B2 | 128 | automeris.io 재추출 |
| C1~C3 | 가변 | 원본 |
| D1 | 156 | 행 우선 정렬 (y−1.5x/x−1.5y 투영, 12행, 왼쪽 순차) |
| D2 | 127 | 행 우선 정렬 (y−1.5x/x−1.5y 투영, 9행, 왼쪽 순차) |
| Floor | 888 | getEvenFloorPoint 역변환 계산 |
| I1 | 184 | 대각선 우선 정렬 (대각선32 + 그리드152, 이웃좌석 기반 분류) |
| I2 | 198 | 행 우선 정렬 완료 |
| I3 | 183 | 대각선 우선 정렬 (대각선31 + 그리드152, 이웃좌석 기반 분류) |

### seat_editor.html — 인터랙티브 좌석 위치 에디터 (개발용)

올림픽홀 좌석 좌표를 시각적으로 조정하는 도구. Vite 개발 서버에서 접근.

**기능:**
- 배경 이미지 오버레이 (구역별 컬러 코딩)
- 줌 (마우스 휠) / 팬 (우클릭 드래그)
- 개별 좌석 드래그 이동
- Ctrl/Shift+클릭 다중 선택, 사각 영역 드래그 선택
- 구역 전체 이동 모드
- 좌석 추가/삭제 (Delete 키, 입력 필드 포커스 시 제외)
- X/Y 좌표 직접 입력 및 일괄 적용
- 시각적 회전 렌더링 (B1/B2: 48°, D1/D2: -48°)
- 회전 각도 조정 (R/E 키, 입력 필드)
- Ctrl+Z 되돌리기
- 화살표 키 미세 조정 (Shift: 5배속)
- 변경사항 내보내기 (diff + 전체 교체 데이터)

## 배포 시 주의

- `vite.config.js`의 프록시 설정이 운영 환경과 일치하는지 확인할 것
- 운영 `nginx.conf`의 API 프록시 location 정규식에 `/cancel-queue`를 포함할 것. 누락되면 취소표 API 요청이 SPA `index.html`로 fall back되어 JSON 조회가 실패한다.
- 빌드: `npm run build` → `dist/` 디렉토리를 Nginx에 배포
- 좌석 좌표 변경 시 `olympicHallSeats.js`만 수정하면 됨 (seatMap.js의 변환 로직은 변경 불필요)
- 개발용 reCAPTCHA v3는 `.env.local`에 `VITE_RECAPTCHA_SITE_KEY`를, v2 폴백은 `VITE_RECAPTCHA_V2_SITE_KEY`를 설정한다. secret key는 프론트엔드에 넣지 않고 API 서버 환경변수로만 관리한다.
- 로그인 성공 시 API가 반환한 Access/Refresh JWT를 브라우저에 저장한다. API 호출에는 Access JWT를 `Authorization: Bearer ...` 헤더로 전송하며, Refresh JWT는 `/auth/refresh`에서 Access JWT가 만료된 경우 갱신하는 용도다.
- `cancel-ticketing.html`은 일반 로그인 토큰이 없는 독립 페이지이므로 이메일 링크의 짧은 만료 `linkToken`을 취소표 API 요청에만 전송한다. 링크 토큰은 사용자·공연·좌석·할당 ID와 묶여 있다.

## ⚙️ Core Logic & Code Description

### src/pages/mypage.js
- **목적:** 로그인 사용자의 예매·취소/환불·관심 공연·멤버십·회원정보 화면을 제공.
- **주요 기능:** 멤버십 상태를 개요와 상세 화면에서 동일한 이모지 로켓으로 표시한다. 활성화 상태는 컬러 로켓, 비활성화 상태는 회색 발사 대기 로켓으로 표시하며 움직임은 사용하지 않는다. 현재 마이페이지 메뉴에는 캘린더 항목을 두지 않는다. 예매내역 조회는 현재 로그인한 `userId`와 일치하는 경우에만 브라우저 상태에 반영한다.
- **API 명세 / 라우팅 규칙:** 예매 내역과 실제 공연 정보는 `/reservations/user/:userId`, `/events`를 사용한다. 마이페이지의 회원정보 수정은 `updateProfileOnServer()`를 통해 백엔드에 저장하며 이메일은 수정하지 않는다.

### src/state/store.js
- **목적:** 로그인 세션과 사용자별 브라우저 상태를 관리.
- **주요 기능:** 로그인 계정이 바뀌거나 로그아웃·세션 만료가 발생하면 이전 사용자의 예매내역, 관심 공연, 대기열·알림 상태를 비운다. 새 예매와 서버에서 복원한 예매에는 소유 계정 식별자를 붙여 다른 계정의 예매가 표시되지 않도록 한다.
- **인증 연동:** 멤버십·위시리스트·회원정보·회원탈퇴 요청에 Access JWT를 포함하고, 사용자 ID는 URL 인코딩한다.

### src/utils/authToken.js
- **목적:** API 로그인 세션의 Access/Refresh JWT를 브라우저 저장소에서 관리하고 Bearer 헤더를 일관되게 생성한다.
- **주요 기능:** `setTokens()`, `getAccessToken()`, `getRefreshToken()`, `clearTokens()`, `authHeaders()`를 제공한다. 비밀번호나 reCAPTCHA Secret Key는 저장하지 않는다.
- **API 명세 / 라우팅 규칙:** `authHeaders()` 결과는 보호 API의 `Authorization` 헤더에 병합한다. Access 토큰이 없으면 빈 헤더를 반환하여 API의 401 응답을 그대로 처리한다.

### src/services/realtimeIntegration.js
- **보안 주의:** 이 모듈의 WebSocket HMAC 토큰은 별도 realtime 서버와의 기존 프로토콜에 묶여 있다. 현재 브라우저에 개발용 `REALTIME_SECRET`과 `ws://`·query token 방식이 남아 있으므로, 운영 전에는 realtime 서버가 발급하는 단기 토큰과 `wss://` 프로토콜로 C팀과 함께 교체해야 한다. 프론트 번들에 realtime 공유 비밀을 넣는 방식은 안전한 Secret 보관으로 볼 수 없다.

### src/pages/admin.js
- **목적:** 관리자 공연 생성·오픈/마감 시간 설정·삭제 화면 및 취소표 시뮬레이션 제어판을 제공.
- **인증 연동:** 모든 관리자 API 호출을 `authFetch()`로 감싸 관리자 Access JWT를 전송한다. API에서 관리자 역할을 다시 검증하므로 프론트 화면 진입만으로는 관리자 기능을 실행할 수 없다.
- **주요 기능:** 선택 체크박스 없이 `5개씩 삭제` 버튼을 누르면 현재 공연 목록의 앞에서부터 최대 5개를 확인 후 삭제한다. 공연이 5개보다 적으면 남은 공연을 모두 삭제한다. 배치 API가 구버전인 운영 서버에서는 기존 단일 삭제 API를 순차 호출하는 대체 경로를 사용한다. 아직 오픈 시간이 없는 공연은 오픈 시간 모달을 열 때 공연 목록 순서별로 서로 다른 기본 시각을 표시하여, 여러 포스터 공연이 같은 `현재 시각 + 5분`으로 저장되지 않도록 한다. "즉시 마감" 버튼으로 `ticketCloseAt`을 현재 시각으로 설정하여 즉시 예매를 마감할 수 있다.
- **취소표 시뮬레이션 패널:** 접기/펼치기 토글로 표시. DB 등록 공연 드롭다운 + 회차 선택, 실제 멤버십 유저 이메일 입력, 더미 유저 수 설정. 공연 선택 후 초기화·매진 연출·조기 마감·취소표 생성·시크릿 링크 발급 버튼을 현재 단계와 관계없이 관리자가 수동 실행할 수 있으며, 처리 중에는 중복 요청만 잠근다. 작업의 선행조건은 API 응답으로 확인하고 상태 패널에 좌석 통계·대기열 수치·실제 유저 상태·취소표 할당 내역을 표시한다.

### src/pages/payment.js
- **목적:** 결제 전 구매자 정보와 좌석 확정 흐름을 처리.
- **주요 기능:** 사용자가 입력한 전화번호가 저장된 회원 전화번호와 다를 때만 확인창을 표시하고, 확인 시 전화번호만 회원정보에 저장한 뒤 결제를 진행한다. 일반 예매와 취소표 모두 `/seats/confirm`으로 좌석을 SOLD 처리하고 MariaDB reservations에 확정 저장한다. 취소표는 서버 Secret Link 만료시각을 결제 마감으로 사용한다.
- **API 명세 / 라우팅 규칙:** 회원정보 변경 요청은 `PATCH /auth/profile`에 `userId`와 `phone`만 전달한다. 결제 확정은 좌석마다 `POST /seats/confirm`, 페이지 이탈·만료 시 `POST /seats/release`, 취소표 할당 만료 시 `POST /cancel-queue/expire`를 사용한다. 브라우저 종료는 `releaseSeatBeacon()`으로 선점 좌석을 해제한다.

### src/pages/seatSelect.js
- **목적:** 좌석 선택 페이지. 실시간 좌석 상태 표시, 좌석 선점(hold), 결제 진행 흐름을 처리.
- **주요 기능:** A파트 실좌석 로딩 시 WebSocket으로 실시간 상태를 반영하고, 미연결 시 mock 시뮬레이터로 폴백한다. 좌석 선점 시 서버 hold API 호출 후 8분 42초 카운트다운. 브라우저 닫기/새로고침 시 인증 헤더를 포함한 `fetch(..., { keepalive: true })`로 선점 해제를 전송하며, 전송 실패 시 서버 타이머가 최종 해제한다.
- **API 명세 / 라우팅 규칙:** `POST /seats/hold` (선점), `POST /seats/release` (해제), `GET /seats` (전체 좌석 조회). 페이지 이탈 시 SPA 라우팅은 `releaseSeatApi()`, 브라우저 종료는 `releaseSeatBeacon()` 사용.

### src/utils/backendApi.js
- **목적:** A파트 REST API 호출 유틸리티. Vite 프록시를 통해 CORS 없이 호출.
- **주요 기능:** 일반 좌석 API와 함께 취소표 대기열 진입·상태 조회, 서버 Pool 조회, Secret Link 좌석 선점, 할당 만료 API를 제공한다.
- **API 명세 / 라우팅 규칙:** `joinCancelQueueApi()`는 `POST /cancel-queue/join`, `fetchCancelQueueStatus()`는 `GET /cancel-queue/status/:eventId/:userId`, `fetchCancelPool()`은 `GET /cancel-queue/pool/:eventId`, `holdCancelSeat()`는 `POST /cancel-queue/hold`, `expireCancelAllocation()`은 `POST /cancel-queue/expire`를 호출한다. 보호 대상 요청에는 Access JWT를 포함하고, reCAPTCHA 보호 대상 POST 요청은 `fetchWithRecaptcha()`를 통해 v3 토큰 발급 → v3 점수 미달 시 v2 체크박스 모달 폴백을 자동 처리한다. 모든 요청에 3초 타임아웃을 적용하며 `releaseSeatBeacon()`은 인증 헤더를 유지하기 위해 `fetch(..., { keepalive: true })`를 사용한다.

### src/utils/recaptcha.js
- **목적:** Google reCAPTCHA v3 스크립트 지연 로드, action별 토큰 발급, v3 점수 미달 시 v2 체크박스 자동 폴백을 제공한다.
- **주요 기능:** `VITE_RECAPTCHA_SITE_KEY`가 없으면 빈 토큰으로 기존 개발 흐름을 유지. `fetchWithRecaptcha(url, body, action)`은 v3 토큰을 추가하여 POST 요청을 보내고, 서버가 `recaptcha_v2_required` 응답을 반환하면 `showV2Challenge()` 모달로 v2 체크박스를 표시한 뒤 v2 토큰으로 자동 재시도한다. `VITE_RECAPTCHA_V2_SITE_KEY`가 없으면 v2 폴백 없이 v3 결과만 반환한다.
- **API 명세 / 라우팅 규칙:** `fetchWithRecaptcha(url, body, action)`이 `recaptchaToken`/`recaptchaAction`(v3) 또는 `recaptchaV2Token`(v2 폴백)을 POST JSON에 추가한다. 실제 허용 여부는 API 서버가 Google에 재검증한 결과로 결정한다.

### src/pages/queue.js
- **인증 연동:** `/queue/enter`와 순번 조회에 로그인 Access JWT를 포함한다. 입장 승인용 `/queue/admit`은 브라우저 사용자 화면에서 호출하지 않고 관리자 API로만 실행한다.

### src/pages/cancelQueue.js
- **목적:** 로그인 사용자의 취소표 대기열과 Secret Link 발급 상태를 표시.
- **주요 기능:** 서버 대기열에 실제 진입한 뒤 대기순번·멤버십·활성 할당을 2초 주기로 조회한다. 취소표 현황은 Redis 좌석 상태를 3초 주기로 조회하며, 임의 대기번호·Pool 시뮬레이션을 사용하지 않는다.
- **API 명세 / 라우팅 규칙:** `POST /queue/enter`, `GET /cancel-queue/status/:eventId/:userId`, `GET /cancel-queue/pool/:eventId` 사용. Secret Link 발급 시 서버 `expiresAt`을 기준으로 5분 카운트다운을 표시한다.

### src/pages/privateLink.js
- **목적:** 서버에서 발급한 취소표 Secret Link의 입장과 만료를 처리.
- **주요 기능:** 사용자·공연별 활성 할당을 서버에서 확인하고, 할당된 좌석과 서버 만료시각만 사용한다. 만료 시 `/cancel-queue/expire`를 호출해 다음 대기자에게 재배정을 요청한다.
- **API 명세 / 라우팅 규칙:** `GET /cancel-queue/status/:eventId/:userId`, `POST /cancel-queue/expire` 사용. 일반 로그인 토큰이 있으면 Bearer JWT를, 독립 링크 흐름이면 서버 발급 `linkToken`을 사용한다. 유효한 할당이 없으면 취소표 대기열로 되돌린다.

### cancel-ticketing.html — 멤버십 전용 취소표 예매 독립 페이지
- **목적:** 시뮬레이션 시크릿 링크 이메일에서 직접 연결되는 독립 HTML 페이지. SPA 라우터를 거치지 않고 단독 동작.
- **주요 기능:** URL 파라미터(`eventId`, `userId`, `allocationId`, `linkToken`)로 할당 상태를 확인하고, 3단계 워크플로(좌석 확인 → 결제수단 선택 → 결제 완료)를 제공. 5분 카운트다운 타이머, 구역별 좌석 현황 지도, 배정 좌석 하이라이트, 넘기기(양보) 기능 포함.
- **API 명세 / 라우팅 규칙:** `linkToken`을 `GET /cancel-queue/status/:eventId/:userId`의 query와 취소표 hold/confirm/expire/respond body에 전달한다. 서버는 토큰의 사용자·공연·좌석·할당 범위를 검증한다. 일반 사용자 Bearer JWT 없이도 시크릿 링크가 유효한 동안만 해당 취소표 흐름이 가능하며, 만료 시 자동으로 expire 호출한다.

### src/pages/cancelSeatSelect.js
- **목적:** Secret Link 보유자에게 서버가 배정한 취소표 좌석을 보여주고 선점.
- **주요 기능:** `/seats`에서 배정 좌석의 실제 상태를 확인하고, 배정된 좌석만 선택 가능하게 한다. 선택 시 서버 선점을 완료한 뒤 결제 주문으로 전달하며, 결제 화면으로 이동하지 않고 이탈하면 좌석을 해제한다.
- **API 명세 / 라우팅 규칙:** `GET /cancel-queue/status/:eventId/:userId`, `GET /seats`, `POST /cancel-queue/hold`, `POST /seats/release` 사용. 회차 정보는 할당에 저장된 `sessionDate`·`sessionTime`을 우선 사용한다.

### src/pages/home.js
- **목적:** 메인 히어로와 공연 탐색 섹션을 제공.
- **주요 기능:** `/events`의 실제 공연 정보를 사용하며, `/wishlist/count/:eventId`의 관심 등록 수를 기준으로 ‘요즘 HOT 공연’ 상위 5개를 정렬한다. 향후 `ticketOpenAt`이 설정된 공연은 ‘오픈 예정’에, HOT·오픈 예정에 포함되지 않은 나머지 공연은 ‘콘서트 둘러보기’ 5열 그리드에 표시한다.

### src/pages/zoneSelect.js
- **목적:** 대기열 통과 후 공연 좌석 지도와 좌석 선택 영역을 제공.
- **주요 기능:** 선택한 공연 회차의 날짜·시간을 `/seats` 조회와 대기열·Admission Token 요청에 함께 전달한다. 회차 탭을 바꾸면 해당 회차의 좌석 inventory를 다시 불러온다. 좌석 지도는 줌 배율이 0.4 미만이면 개별 좌석을 숨기고 배치도만 표시하며, 확대하면 좌석을 표시하고 선택할 수 있다. 좌석 지도 아래 가격 범례는 실제 구역명(A1, B1 등)을 반복하지 않고, VIP·R·S·A 등급별 가격을 한 번씩만 표시한다.

### src/pages/concertDetail.js
- **목적:** 공연 상세 정보, 캘린더 날짜/회차 선택, 예매 진입 화면을 제공.
- **주요 기능:** 이벤트별 `ticketOpenAt`이 있으면 예매 시작까지 카운트다운, `ticketCloseAt`이 지나면 날짜 선택 비활성화 및 "예매가 마감되었습니다" 표시(캘린더 조회는 유지). 공연일마다 1매, 인당 최대 2매 제한. 올림픽홀 공연은 좌석 배치도 미리보기 표시.

### src/pages/queue.js
- **목적:** 선택한 공연 회차의 대기열 진입과 입장 승인을 표시.
- **주요 기능:** `eventId`, `sessionDate`, `sessionTime`을 모든 대기열 순번·입장 승인 요청에 포함해 날짜가 다른 공연 회차가 서로 같은 대기열을 사용하지 않도록 한다. 이벤트별 오픈 시간이 없는 공연은 다른 공연의 전역 오픈 예약을 물려받지 않고 즉시 예매 흐름으로 진입한다.

### src/components/header.js / src/pages/concertsList.js
- **목적:** 공통 헤더 검색과 공연 목록 검색을 처리.
- **주요 기능:** 마이페이지 메뉴 옆 검색창에서 검색어를 입력하면 `concerts?search=...`로 이동하며, 콘서트 목록에서 공연명 또는 공연장에 검색어가 포함된 포스터 공연만 표시한다.

### public/images/queuing-logo-header.png / src/components/header.js
- **목적:** 사용자가 제공한 가로형 최종 로고 디자인을 사이트 헤더에 적용.
- **주요 기능:** 흰색 심볼과 QUEUING 문자가 포함된 가로형 이미지를 일반 화면과 예매 흐름 양쪽에서 사용한다. 헤더 배경은 로고 원본의 배경색 `#B11018`과 일치시켜 이미지 가장자리에 별도 색상 블록이 보이지 않도록 한다.

### src/data/concerts.js
- **목적:** 공연명과 포스터 이미지의 매칭 규칙을 관리.
- **주요 기능:** `TOMORROW X TOGETHER` 전체 이름과 `TXT` 약칭을 모두 `/images/posters/poster-tomorrow.png`에 연결한다. 포스터 파일명이 바뀌어도 공연명 매칭이 해시 fallback으로 넘어가지 않도록 명시적인 별칭을 유지한다.
