# QUEUING - 프론트엔드 (Vite SPA)

## 회차별 좌석 WebSocket 채널

좌석 실시간 연결은 공연 ID만 사용하지 않고 선택된 회차를 포함한 다음 식별자를 사용한다.

```text
공연ID:YYYY-MM-DD_HH-MM
예시: evt-221:2026-12-05_18-00
```

`zoneSelect.js`와 `seatSelect.js`가 현재 선택된 회차를 조합하여 WebSocket 래퍼에 전달하며, `realtimeChat.js`와 서버 연결 형식은 변경하지 않는다.

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
├── seat_editor.html                # 인터랙티브 좌석 위치 에디터 (개발용)
├── public/favicon.svg                 # 빨간색 둥근 정사각형 안의 흰색 Q favicon
├── public/images/queuing-logo-header.png # 사이트 헤더 좌측에 사용하는 QUEUING 로고
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
    │   ├── mypage.js               # 마이페이지
    │   ├── olympicHallPreview.js   # 올림픽홀 미리보기
    │   ├── payment.js              # 결제 페이지
    │   ├── privateLink.js          # Secret Link 입장
    │   ├── lastCancelTicketing.js  # Final 공용 취소표 풀 mock 예매 화면
    │   ├── verifyLink.js           # 이메일 Secret Link 토큰 검증 랜딩
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
        ├── cancelSeatMap.js        # Local/Final 취소표 공통 좌석맵 변환
        ├── recaptcha.js            # Google reCAPTCHA v3/v2 토큰 발급 및 자동 폴백
        ├── calendarEvents.js       # 달력 이벤트 유틸리티
        ├── format.js               # 날짜/숫자 포맷
        ├── realtimeChat.js         # 실시간 채팅 유틸리티
        └── websocketUrl.js         # 페이지 프로토콜에 따른 ws/wss URL 생성
```

---

## 주요 모듈

### seatMap.js — 좌석 배치도 렌더링 엔진

Canvas 2D 기반 좌석맵 렌더링. 올림픽홀 배경 이미지 또는 일반 그리드 배치 위에
실제 좌석 상태를 오버레이하며, 취소표 화면에서는 전체 배치도를 보여주되 서버가
배정한 좌석만 선택 가능하도록 제한한다.

**좌표 변환 (CSV → Canvas):**
- `x = csvX * 1.27 + 70` (OH_X_SCALE=1.27, OH_X_OFFSET=70)
- `y = 1057 - csvY * 0.9025` (OH_Y_OFFSET=1057, OH_Y_SCALE=0.9025)

**구역 회전:**
- B1/B2: 48° (상단 대각선)
- D1/D2: -48° (하단 대각선)
- 나머지: 0° (수평/수직)

**핵심 함수:**
- `computeOlympicHallLayout()`: API 좌석을 CSV 좌표에 매칭
- `mountSeatMap()`: 확대·축소·드래그·핀치와 좌석 상태별 렌더링을 제공. `selectionOnly`가 켜진 경우 `selectable: false` 좌석은 회색으로 표시하고 클릭을 차단
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

- `vite.config.js`의 프록시 설정이 운영 환경과 일치하는지 확인할 것. 개발 환경에서 Final 관리자 단계4와 Last 화면은 `/admin/last-simulation/*`, `/last-simulation/*`이 A파트 API(`http://192.168.0.190:3000`)로 전달되어야 한다.
- 운영 `nginx.conf`의 API 프록시 location 정규식에 `/cancel-queue`, `/verify-link`, `/last-simulation`을 포함할 것. 누락되면 취소표 API 또는 Secret Link 검증 요청이 SPA `index.html`로 fall back되어 JSON 조회가 실패한다.
- 빌드: `npm run build` → `dist/` 디렉토리를 Nginx에 배포
- 좌석 좌표 변경 시 `olympicHallSeats.js`만 수정하면 됨 (seatMap.js의 변환 로직은 변경 불필요)
- 개발용 reCAPTCHA v3는 `.env.local`에 `VITE_RECAPTCHA_SITE_KEY`를, v2 폴백은 `VITE_RECAPTCHA_V2_SITE_KEY`를 설정한다. secret key는 프론트엔드에 넣지 않고 API 서버 환경변수로만 관리한다.
- 로그인 성공 시 API가 반환한 Access/Refresh JWT를 브라우저에 저장한다. API 호출에는 Access JWT를 `Authorization: Bearer ...` 헤더로 전송하며, Refresh JWT는 `/auth/refresh`에서 Access JWT가 만료된 경우 갱신하는 용도다.
- 취소표 대기열과 Secret Link 상세 화면은 로그인 후 `#/mypage/cancel-queue?eventId=...`에서 제공한다. 이메일에는 토큰을 넣지 않고 공연 ID만 전달하며, 실제 대기순번·멤버십·할당 상태는 로그인한 사용자의 Access JWT로 서버에서 조회한다.
- `index.html`의 favicon은 `/favicon.svg`를 사용한다. 헤더 색상(`#B11018`)의 빨간색 둥근 정사각형 안에 흰색 대문자 `Q`만 표시한다.
- 실시간 채팅·좌석 WebSocket은 현재 페이지가 HTTP이면 `ws://`, HTTPS이면 `wss://`를 자동으로 사용한다. 운영 프론트가 HTTPS로 제공될 때는 CloudFront/ALB 또는 Ingress에서 `/ws`와 `/ws/*`를 실시간 서버로 전달하고 WebSocket 업그레이드 헤더를 통과시켜야 한다.

## ⚙️ Core Logic & Code Description

### src/pages/mypage.js
- **목적:** 로그인 사용자의 예매·취소/환불·관심 공연·멤버십·회원정보 화면을 제공.
- **주요 기능:** 멤버십 상태를 개요와 상세 화면에서 동일한 이모지 로켓으로 표시한다. 활성화 상태는 컬러 로켓, 비활성화 상태는 회색 발사 대기 로켓으로 표시하며 움직임은 사용하지 않는다. 현재 마이페이지 메뉴에는 캘린더 항목을 두지 않는다. 예매내역 조회는 현재 로그인한 `userId`와 일치하는 경우에만 브라우저 상태에 반영한다. 취소한 예매는 예매내역에서 제외하고 `취소/환불내역`에 취소 또는 환불 상태로 표시한다. 실제 이벤트 예매는 좌석 ID 형식이 구버전이어도 서버 환불 요청 대상으로 판별하고, 좌석 ID가 브라우저 상태에 없으면 서버 예약 내역을 재조회해 모호하지 않은 경우에만 복원한다. 조회·환불 요청은 8초 타임아웃과 1회 재시도를 적용하며, 서버 환불 성공 전에는 로컬 상태만 성공 처리하지 않는다. 실패 시 HTTP 상태와 서버 메시지를 사용자에게 표시한다. `취소표 대기열` 메뉴는 활성 멤버십 회원에게만 표시하며 서버 `waiting_queue`에서 복원한 대기열 요약을 읽기 전용으로 표시하고, `/events` 공연 정보가 도착하면 공연명·알맞은 포스터를 보완한다. 전체 대기자는 활성 멤버십 대기자만 표시하고 예상 대기시간 대신 취소표 발생 시 5분 제한 Secret Link가 발급된다는 안내를 표시한다. 대기열 카드에는 좌석 선점·결제·Secret Link 입장 동작을 제공하지 않으며, Secret Link는 이메일 링크에서만 개인 페이지로 진입할 수 있다. 목록 화면과 개요의 취소표 대기 건수는 5초마다 서버와 동기화된다. `/cancel-queue/mine`이 실패하면 참여 중인 공연 없음으로 오인하지 않도록 서버 오류 메시지를 별도 오류 카드로 표시한다.
- **API 명세 / 라우팅 규칙:** 예매 내역과 실제 공연 정보는 `/reservations/user/:userId`, `/events`를 사용한다. 환불 확정 시 `POST /seats/cancel`에 `userId`, `seatId`, 공연·회차 정보를 보내며 서버가 MariaDB 예약을 취소한 뒤 좌석을 재판매 상태로 복구한다. 취소표 목록은 `GET /cancel-queue/mine`으로 조회하며 API가 비멤버십 사용자에게 빈 목록을 반환한다. 마이페이지의 취소표 행 클릭은 별도 상세 화면으로 이동하지 않으며, `eventId`가 포함된 구형 URL도 전체 읽기 전용 목록으로 정규화한다. 마이페이지의 회원정보 수정은 `updateProfileOnServer()`를 통해 백엔드에 저장하며 이메일은 수정하지 않는다.

### src/state/store.js
- **목적:** 로그인 세션과 사용자별 브라우저 상태를 관리.
- **주요 기능:** 로그인 계정이 바뀌거나 로그아웃·세션 만료가 발생하면 이전 사용자의 예매내역, 관심 공연, 대기열·알림 상태를 비운다. 새 예매와 서버에서 복원한 예매에는 소유 계정 식별자를 붙여 다른 계정의 예매가 표시되지 않도록 한다. 무통장 입금 예매 알림에는 24시간 입금 기한을 포함하고, 입금 전 예매 취소 시 `cancelled` 상태로 전환한다.
- **인증 연동:** 멤버십·위시리스트·회원정보·회원탈퇴 요청에 Access JWT를 포함하고, 사용자 ID는 URL 인코딩한다.
- **멤버십 메일 안내:** 멤버십 가입/해지 API가 반환하는 `emailSent`를 사용해 가입 완료 또는 해지 완료 안내 메일 발송 결과를 토스트에 표시한다. 메일 발송 실패가 DB 가입/해지 결과를 되돌리지는 않는다.

### src/utils/authToken.js
- **목적:** API 로그인 세션의 Access/Refresh JWT를 브라우저 저장소에서 관리하고 Bearer 헤더를 일관되게 생성한다.
- **주요 기능:** `setTokens()`, `getAccessToken()`, `getRefreshToken()`, `clearTokens()`, `authHeaders()`를 제공한다. 비밀번호나 reCAPTCHA Secret Key는 저장하지 않는다.
- **API 명세 / 라우팅 규칙:** `authHeaders()` 결과는 보호 API의 `Authorization` 헤더에 병합한다. Access 토큰이 없으면 빈 헤더를 반환하여 API의 401 응답을 그대로 처리한다.

### src/services/realtimeIntegration.js
- **주요 기능:** 채팅과 좌석 상태 WebSocket을 `/ws/chat/:eventId`, `/ws/seats/:eventId`로 연결하고, 기존 realtime 서버 프로토콜에 필요한 HMAC JWT를 query token으로 전달한다. WebSocket 주소는 `websocketUrl.js`를 통해 현재 페이지가 HTTP이면 `ws://`, HTTPS이면 `wss://`로 생성한다.
- **보안 주의:** 현재 HMAC 토큰 서명에 사용하는 `REALTIME_SECRET`은 프론트 번들에 포함되는 개발용 값이다. WSS는 전송 구간만 암호화하므로, 운영에서는 realtime 서버가 발급하는 짧은 수명의 토큰 방식으로 교체해야 한다.

### src/utils/websocketUrl.js
- **목적:** 페이지 접속 프로토콜에 맞춰 WebSocket 연결 주소를 일관되게 생성한다.
- **주요 기능:** HTTP 페이지에서는 `ws://현재호스트`, HTTPS 페이지에서는 `wss://현재호스트`를 사용하고, query parameter를 URL 인코딩해 추가한다. 채팅·좌석 연결에서 공통으로 사용한다.

### src/pages/admin.js
- **공연 목록 동기화:** 일반 공연 관리 목록과 취소표 시뮬레이션 AWS의 드롭다운은 공연 생성·삭제 후 갱신 이벤트를 통해 업데이트되며, 시뮬레이션 패널을 다시 펼칠 때도 최신 목록을 재조회한다. Final 패널은 통합 공연 카탈로그를 사용하고, Last 전용 목록 API가 일시적으로 실패하면 일반 `/events` 목록을 보조 표시한다.
- **목적:** 관리자 공연 생성·오픈/마감 시간 설정·삭제 화면, 취소표 시뮬레이션 AWS 및 Final 로컬 검증 제어판을 제공.
- **인증 연동:** 모든 관리자 API 호출을 `authFetch()`로 감싸 관리자 Access JWT를 전송한다. API에서 관리자 역할을 다시 검증하므로 프론트 화면 진입만으로는 관리자 기능을 실행할 수 없다.
- **주요 기능:** 선택 체크박스 없이 `5개씩 삭제` 버튼을 누르면 현재 공연 목록의 앞에서부터 최대 5개를 확인 후 삭제한다. 공연이 5개보다 적으면 남은 공연을 모두 삭제한다. 배치 API가 구버전인 운영 서버에서는 기존 단일 삭제 API를 순차 호출하는 대체 경로를 사용한다. 아직 오픈 시간이 없는 공연은 오픈 시간 모달을 열 때 공연 목록 순서별로 서로 다른 기본 시각을 표시하여, 여러 포스터 공연이 같은 `현재 시각 + 5분`으로 저장되지 않도록 한다. "즉시 마감" 버튼으로 `ticketCloseAt`을 현재 시각으로 설정하여 즉시 예매를 마감할 수 있다.
- **취소표 시뮬레이션 Final 패널:** 기존 Local의 단계별 초기화·매진 연출·조기 마감·취소표 생성을 유지하면서 Last의 회차별 공용 풀·후보 순번·Gmail 일괄 링크 발급을 하나의 화면으로 통합한다. 단계4에서 `/admin/last-simulation/init` → `close` → `open-pool` → `issue-links`를 순서대로 호출하고, 본 대기열 참여·`membership_at_join=1`·활성 멤버십 조건을 만족하는 실제 사용자만 후보가 된다. Local 단계의 취소 좌석을 Last 풀에 복사하므로 링크 수신자는 Last mock 화면으로 진입하며, 기존 Local과 Last 전용 화면은 HTML 안에 보존하되 별도 사이드바에는 노출하지 않는다. 상태 패널은 더미 사용자·전체 standby·실제 멤버십 후보·공용 풀·링크 발급 상태를 구분해 표시한다.
- **Final 시뮬레이션 데이터 삭제:** `데이터 삭제`는 먼저 `/admin/local-simulation/cleanup`으로 Local 더미 유저·좌석·대기열·상태를 정리한 뒤 `/admin/last-simulation/cleanup-event`를 `eventId` 기준으로 호출한다. 따라서 페이지를 새로고침해 Last `campaignId`가 없어도 해당 공연의 Last 캠페인·후보·풀·미처리 allocation이 함께 삭제된다. 결제 확정된 실제 예약 데이터는 화면 정리 대상에서 보호한다.
- **Last 링크 오류 처리:** 공용 풀 조회가 403/410을 반환하면 polling을 중단하고 링크 권한·만료 원인을 안내한다. 정상적으로 현재 순번이 되면 AVAILABLE 풀 좌석 클릭 → Last 좌석 hold → 기존 `payment/cancel` 결제 화면 이동 흐름을 유지한다.
- **운영 콘솔 UI:** `admin-app` 내부를 사이드바 + 작업 영역으로 구성하고, 공연 수·상태 갱신 주기·시뮬레이션 실행 모드를 요약 카드로 표시한다. 사이드바의 `취소표 시뮬레이션 Final` 한 화면에서 Local 단계와 Last 공용 풀 단계를 이어서 실행한다.
- **키보드 조작:** `Ctrl/Cmd + K` 또는 상단 명령 검색 버튼으로 명령 팔레트를 열고, 입력 검색·상하 방향키·Enter·Escape로 명령을 실행한다. 공연 표의 행은 포커스할 수 있으며 상하 방향키와 Home/End로 행을 이동하고 Enter로 첫 번째 행 액션에 포커스를 옮긴다.

### src/pages/payment.js
- **목적:** 결제 전 구매자 정보와 좌석 확정 흐름을 처리.
- **주요 기능:** 일반 예매에서만 입력 전화번호와 회원정보를 비교해 변경 확인 후 회원정보를 저장한다. 취소표 Secret Link 결제는 scoped JWT의 회원정보 수정 제한과 충돌하지 않도록 전화번호 필수·형식 검증만 수행하고 저장 없이 결제를 진행한다. 일반 취소표는 `/seats/confirm`, Final Last 전용 주문은 `/last-simulation/confirm`으로 분기해 좌석을 SOLD 처리하고 MariaDB reservations에 저장한다. Last 전용 주문은 결제 이탈·실패·만료 시 `/last-simulation/expire`로 allocation과 좌석을 정리한다. 결제 수단을 함께 전달하며, 무통장 입금 선택 시 화면 상태를 `unpaid`로 유지하고 24시간 입금 기한을 표시한다. 취소표는 서버 Secret Link 만료시각을 결제 마감으로 사용한다. 일반 예매의 결제 실패·네트워크 오류·제한시간 초과 시 좌석을 해제하고 `POST /queue/leave`로 입장 슬롯을 즉시 반납한다. 결제 성공 시에는 `settled` 상태로 보호해 SOLD 좌석을 해제하지 않는다.
- **API 명세 / 라우팅 규칙:** 회원정보 변경 요청은 `PATCH /auth/profile`에 `userId`와 `phone`만 전달한다. 일반 결제 확정은 좌석마다 `POST /seats/confirm`에 `paymentMethod`를 함께 전달하고, Final Last 주문은 scoped token으로 `POST /last-simulation/confirm`을 호출한다. 결제 실패·이탈·만료 시 일반 주문은 `POST /seats/release`, 취소표 allocation은 `POST /cancel-queue/expire` 또는 Last 전용 `POST /last-simulation/expire`를 사용한다. 브라우저 종료는 keepalive 방식으로 처리한다.

### src/pages/bookingComplete.js
- **목적:** 예매 완료 또는 무통장 입금 대기 상태를 표시.
- **주요 기능:** 무통장 입금 예매는 `unpaid` 상태와 함께 24시간 이내 입금해야 좌석이 최종 확정된다는 안내와 가상계좌 정보를 표시한다.

### src/pages/seatSelect.js
- **목적:** 좌석 선택 페이지. 실시간 좌석 상태 표시, 좌석 선점(hold), 결제 진행 흐름을 처리.
- **주요 기능:** A파트 실좌석 로딩 시 WebSocket으로 실시간 상태를 반영하고, 미연결 시 mock 시뮬레이터로 폴백한다. 좌석 선점 시 서버 hold API 호출 후 8분 42초 카운트다운. 브라우저 닫기/새로고침 시 인증 헤더를 포함한 `fetch(..., { keepalive: true })`로 선점 해제를 전송하며, 전송 실패 시 서버 타이머가 최종 해제한다.
- **API 명세 / 라우팅 규칙:** `POST /seats/hold` (선점), `POST /seats/release` (해제), `GET /seats` (전체 좌석 조회). 페이지 이탈 시 SPA 라우팅은 `releaseSeatApi()`, 브라우저 종료는 `releaseSeatBeacon()` 사용.

### src/utils/backendApi.js
- **목적:** A파트 REST API 호출 유틸리티. Vite 프록시를 통해 CORS 없이 호출.
- **주요 기능:** 일반 좌석 API와 함께 취소표 대기열 진입·상태 조회, 로그인 사용자 대기열 목록 조회, 서버 Pool 조회, Secret Link 좌석 선점, 할당 만료 API를 제공한다. `holdCancelSeat()`는 서버 배정 좌석과 `allocation.seat_id = NULL`인 회차별 AVAILABLE 좌석 직접 선택을 같은 A파트 API로 전달한다. `getJson()`은 비정상 HTTP 응답의 `message`·`code`를 Error 객체에 보존하여 마이페이지가 500/503을 빈 목록으로 표시하지 않게 한다. `leaveQueueBeacon()`은 대기열 페이지 이탈 시 인증 헤더가 포함된 keepalive 요청으로 `/queue/leave`를 호출한다.
- **API 명세 / 라우팅 규칙:** `joinCancelQueueApi()`는 `POST /cancel-queue/join`, `fetchCancelQueueStatus()`는 `GET /cancel-queue/status/:eventId/:userId`, `fetchMyCancelQueues()`는 `GET /cancel-queue/mine`, `fetchCancelPool()`은 `GET /cancel-queue/pool/:eventId`, `holdCancelSeat()`는 `POST /cancel-queue/hold`, `expireCancelAllocation()`은 `POST /cancel-queue/expire`를 호출한다. 보호 대상 요청에는 Access JWT를 포함하고, reCAPTCHA 보호 대상 POST 요청은 `fetchWithRecaptcha()`를 통해 v3 토큰 발급 → v3 점수 미달 시 v2 체크박스 모달 폴백을 자동 처리한다. 모든 요청에 3초 타임아웃을 적용하며 `releaseSeatBeacon()`은 인증 헤더를 유지하기 위해 `fetch(..., { keepalive: true })`를 사용한다.

### src/utils/recaptcha.js
- **목적:** Google reCAPTCHA v3 스크립트 지연 로드, action별 토큰 발급, v3 점수 미달 시 v2 체크박스 자동 폴백을 제공한다.
- **주요 기능:** `VITE_RECAPTCHA_SITE_KEY`가 없으면 빈 토큰으로 기존 개발 흐름을 유지. `fetchWithRecaptcha(url, body, action)`은 v3 토큰을 추가하여 POST 요청을 보내고, 서버가 `recaptcha_v2_required` 응답을 반환하면 `showV2Challenge()` 모달로 v2 체크박스를 표시한 뒤 v2 토큰으로 자동 재시도한다. `VITE_RECAPTCHA_V2_SITE_KEY`가 없으면 v2 폴백 없이 v3 결과만 반환한다.
- **API 명세 / 라우팅 규칙:** `fetchWithRecaptcha(url, body, action)`이 `recaptchaToken`/`recaptchaAction`(v3) 또는 `recaptchaV2Token`(v2 폴백)을 POST JSON에 추가한다. 실제 허용 여부는 API 서버가 Google에 재검증한 결과로 결정한다.

### src/pages/queue.js
- **인증 연동:** `/queue/enter`와 순번 조회에 로그인 Access JWT를 포함한다. 입장 승인용 `/queue/admit`은 브라우저 사용자 화면에서 호출하지 않고 관리자 API로만 실행한다.
- **승인 처리:** 순번 API가 `admitted`를 반환하면 `/queue/enter`에서 회차별 Admission Token을 받아 저장한 뒤 좌석 구역으로 이동한다. 토큰 준비 중인 `admitting` 상태는 대기열 재진입 없이 다음 폴링에서 재확인한다.
- **오류·순번 표시:** 순번 API의 비정상 HTTP 응답과 position 누락을 대기 상태로 안전하게 표시하며, 숫자 변환이 불가능한 값을 `NaN`으로 렌더링하지 않는다.
- **이탈 처리:** `eligible` 대기 중인 사용자만 `pagehide` 또는 `beforeunload`에서 `/queue/leave`를 keepalive로 호출한다. `standby` 취소표 대기 사용자와 대기 유형을 아직 받지 못한 사용자는 브라우저 이탈이나 조기마감 화면 진입만으로 제거하지 않는다. 정상적으로 Admission Token을 받고 좌석 화면으로 이동하는 경우에는 `settled` 플래그로 이탈 처리하지 않는다.
- **조기 마감 안내:** 멤버십 사용자는 공연 마감 시 취소표 발생 및 이메일 Secret Link 발급 안내를 확인할 수 있다. 안내창에는 30초 후 메인 페이지로 자동 이동하는 카운트다운과 함께 `마이페이지 취소표 대기열 확인` 버튼을 제공하며, 버튼 선택 시 읽기 전용 `mypage/cancel-queue` 목록으로 이동한다. 개인 취소표 예매 화면은 마이페이지가 아니라 이메일 Secret Link를 눌렀을 때만 열린다.

### src/pages/cancelQueue.js
- **목적:** 마이페이지 안에서 로그인 사용자의 취소표 대기열과 Secret Link 발급 상태를 표시.
- **주요 기능:** 활성 멤버십 회원만 서버 대기열에 진입할 수 있다. 이 모듈은 레거시 상세 컴포넌트이며 현재 마이페이지에서는 마운트하지 않는다. 마이페이지의 취소표 대기열은 순번·상태·포스터 확인만 제공하고, 개인 예매 진입은 이메일 Secret Link에서만 허용한다. 서버 대기열에 실제 진입한 뒤 멤버십 대기자 기준 대기순번·전체 인원·활성 할당을 2초 주기로 조회한다. 취소표 현황은 Redis 좌석 상태를 3초 주기로 조회하며, 예상 대기시간 대신 취소표 발생 시 5분 제한 Secret Link가 발급된다는 안내를 제공한다.
- **API 명세 / 라우팅 규칙:** `POST /queue/enter`, `GET /cancel-queue/status/:eventId/:userId`, `GET /cancel-queue/pool/:eventId` 사용. Secret Link 발급 시 서버 `expiresAt`을 기준으로 5분 카운트다운을 표시한다.

### src/pages/verifyLink.js
- **목적:** B파트가 이메일로 발송한 Secret Link의 랜딩 페이지. 토큰 검증과 자동 로그인을 처리.
- **보존 정책:** B파트 별도 사이트가 추가되어도 A파트 local SMTP/fallback Secret Link 검증 진입점으로 유지한다.
- **주요 기능:** URL 쿼리의 `linkToken` 또는 `token` 파라미터를 추출하여 `POST /verify-link`로 검증한다. 성공 시 현재 브라우저의 로그인 여부와 관계없이 응답으로 받은 allocation 범위의 취소표 전용 Access JWT를 저장하고, 할당된 userId로 세션을 전환한 뒤 `sessionDate`·`sessionTime`을 포함한 `private-link/{eventId}` 페이지로 이동한다. 별도 일반 로그인은 필요하지 않으며, 토큰 자체가 인증 수단이다.
- **API 명세 / 라우팅 규칙:** `POST /verify-link` 사용. 개발 환경에서는 `vite.config.js`가 `/verify-link`를 A파트 API 서버로 프록시하고, 운영 환경에서는 Nginx의 동일 location이 API 서버로 전달해야 한다. 프론트엔드 라우트는 `verify-link`이며 `main.js`에서 `private-link` 라우트보다 먼저 등록된다.

### src/pages/privateLink.js
- **목적:** 서버에서 발급한 취소표 Secret Link의 입장과 만료를 처리.
- **보존 정책:** B파트 별도 취소표 사이트와 별개로 A파트 local SMTP/fallback 링크의 개인 전용 화면을 유지한다.
- **주요 기능:** 이메일 Secret Link로 진입한 개인 전용 화면에서 사용자·공연·회차별 활성 할당을 서버에서 확인하고, 할당된 좌석과 서버 만료시각만 사용한다. `sessionDate`·`sessionTime`을 상태 조회에 포함해 본 티켓팅 참여 이력을 정확히 확인하며, 좌석 선택 화면으로 이동할 때도 회차 정보를 유지한다. B파트 `NULL seat_id` 할당 시 "취소 좌석 중 선택 가능"을 표시하며, 타이머 바는 서버의 `remainingSeconds`를 사용하여 남은 시간을 정확히 반영한다. 만료·오류 시 마이페이지 대기열로 이동시키지 않고 개인 링크 화면에서 안내한 뒤 홈으로 이동한다.
- **API 명세 / 라우팅 규칙:** `GET /cancel-queue/status/:eventId/:userId`, `POST /cancel-queue/expire` 사용. `verifyLink.js`가 저장한 취소표 전용 Access JWT로 본인 상태를 조회하며, 유효한 할당이 없으면 개인 링크 만료 안내를 표시한다.

### src/pages/cancelSeatSelect.js
- **목적:** A파트 Secret Link 보유자에게 회차별 취소표 좌석 상태를 보여주고 1매를 선점.
- **보존 정책:** B파트가 별도 취소표 사이트를 제공하더라도 A파트의 local SMTP/fallback 화면과 `verify-link → private-link → cancel-seats` 흐름은 보존한다.
- **주요 기능:** `private-link`에서 전달받은 `sessionDate`·`sessionTime`을 포함해 취소표 상태를 확인한 뒤, `/seats`에서 해당 이벤트·회차의 전체 좌석과 실제 상태를 조회해 본티켓팅과 같은 Canvas 인터랙티브 배치도로 표시한다. `allocation.seatId`가 있으면 서버가 배정한 좌석만 선택 가능하고, `allocation.seatId`가 `NULL`이면 해당 회차의 `AVAILABLE` 좌석만 선택 가능하게 한다. 좌석 선택 시 취소표 전용 Access JWT로 `POST /cancel-queue/hold`를 호출하며, 서버는 allocation에 좌석을 원자적으로 기록한 뒤 Redis/MariaDB 좌석을 홀드한다. 결제 화면으로 이동하지 않고 이탈하면 좌석을 해제한다.
- **API 명세 / 라우팅 규칙:** `GET /cancel-queue/status/:eventId/:userId`, `GET /seats`, `POST /cancel-queue/hold`, `POST /seats/release` 사용. 회차 정보는 할당에 저장된 `sessionDate`·`sessionTime`을 우선 사용한다.

### src/pages/lastCancelTicketing.js
- **목적:** 첨부된 `cancel-ticketing (3).html` mock을 SPA 페이지로 옮긴 Last 로컬 검증 화면.
- **주요 기능:** 첨부 mock의 화면 구조를 유지하면서 링크의 A파트 토큰과 5분 카운트다운을 표시한다. 본티켓팅과 같은 전체 인터랙티브 좌석맵을 렌더링하되, Last 링크는 현재 순번의 공용 풀 좌석만, 기존 Local 링크는 서버가 배정한 좌석만 선택 가능하다. 공용 풀에 포함된 AVAILABLE 좌석은 현재 순번이 아니어도 보라색으로 보여 실제 매진 좌석과 구분하고, `selectable` 검증으로 클릭만 차단한다. 좌석 선점에 성공하면 `payment/cancel`로 이동해 구매자 정보·결제 수단을 입력하고 기존 결제 UI를 사용한다. 결제 확정·만료 이후 다음 순번이 진행되도록 2초 주기로 상태를 갱신하며 Local 링크도 이 화면에서 호환 처리한다. 인증은 verify-link에서 받은 scoped cancel token(Bearer)을 우선 사용하고, 토큰이 없으면(`JWT_AUTH_SECRET` 미설정 등) 모든 후속 요청에 `linkToken`(원본 cancel link JWT)을 함께 전달하여 cancel link token 인증으로 폴백한다.
- **API 명세 / 라우팅 규칙:** `POST /last-simulation/verify-link`, `GET /last-simulation/pool`, `POST /last-simulation/hold`, `POST /last-simulation/confirm`, `POST /last-simulation/expire` 사용. Final/Local Gmail 링크는 `#/last-cancel-ticketing?token=...`으로 진입한다.

### src/utils/cancelSeatMap.js
- **목적:** Local SMTP 취소표 화면과 Final Last 화면이 같은 전체 회차 좌석맵을 사용하도록 좌석 원장 응답을 Canvas 모델로 변환한다.
- **주요 기능:** 이벤트·회차 좌석만 필터링하고 실제 `AVAILABLE`·`HELD`·`SOLD` 상태를 프론트 상태로 통일한다. 서버 배정 좌석 모드에서는 해당 좌석 하나만, `seat_id=NULL` 공용 풀 모드에서는 서버가 반환한 풀 좌석만 선택 가능하도록 `selectable`을 분리한다. 올림픽홀의 구역·등급 메타데이터도 보완한다.
- **API 명세 / 라우팅 규칙:** 별도 HTTP API가 없는 프론트 공통 유틸리티이며 `cancelSeatSelect.js`와 `lastCancelTicketing.js`가 공유한다.

### src/pages/home.js
- **목적:** 메인 히어로와 공연 탐색 섹션을 제공.
- **주요 기능:** `/events`의 실제 공연 정보를 사용하며, `/wishlist/count/:eventId`의 관심 등록 수를 기준으로 ‘요즘 HOT 공연’ 상위 5개를 정렬한다. 향후 `ticketOpenAt`이 설정된 공연은 ‘오픈 예정’에, HOT·오픈 예정에 포함되지 않은 나머지 공연은 ‘콘서트 둘러보기’ 5열 그리드에 표시한다.

### src/pages/zoneSelect.js
- **목적:** 대기열 통과 후 공연 좌석 지도와 좌석 선택 영역을 제공.
- **주요 기능:** 선택한 공연 회차의 날짜·시간을 `/seats` 조회와 대기열·Admission Token 요청에 함께 전달한다. 회차 탭을 바꾸면 해당 회차의 좌석 inventory를 다시 불러온다. 좌석 지도는 줌 배율이 0.4 미만이면 개별 좌석을 숨기고 배치도만 표시하며, 확대하면 좌석을 표시하고 선택할 수 있다. 좌석 지도 아래 가격 범례는 실제 구역명(A1, B1 등)을 반복하지 않고, VIP·R·S·A 등급별 가격을 한 번씩만 표시한다. 관리자 삭제로 공연이 사라지거나 좌석 데이터가 제거된 경우에는 잔여 좌석 0석을 매진으로 처리하지 않고, 최신 `/events` 확인 후 공연 종료 안내와 공연 목록 이동 버튼을 표시한다. WebSocket이 연결되지 않으면 기존 HTTP 폴링 fallback을 유지한다. 좌석 선택 화면에서 브라우저 종료·새로고침·이탈 시 미결제 좌석을 해제하고 `POST /queue/leave`를 keepalive로 호출해 `admitted` 슬롯을 즉시 반납한다. 결제 화면으로 정상 이동하는 경우에는 이 정리를 건너뛴다.

### src/pages/concertDetail.js
- **목적:** 공연 상세 정보, 캘린더 날짜/회차 선택, 예매 진입 화면을 제공.
- **주요 기능:** 이벤트별 `ticketOpenAt`이 있으면 예매 시작까지 카운트다운, `ticketCloseAt`이 지나면 날짜 선택 비활성화 및 "예매가 마감되었습니다" 표시(캘린더 조회는 유지). 공연일마다 1매, 인당 최대 2매 제한. 올림픽홀 공연은 좌석 배치도 미리보기 표시.

### src/pages/queue.js
- **목적:** 선택한 공연 회차의 대기열 진입과 입장 승인을 표시.
- **주요 기능:** `eventId`, `sessionDate`, `sessionTime`을 모든 대기열 순번·입장 승인 요청에 포함해 날짜가 다른 공연 회차가 서로 같은 대기열을 사용하지 않도록 한다. `admitted` 응답 후 Admission Token을 확인하고, `admitting`·일시적 API 오류·순번 누락은 재진입이나 `NaN` 표시 없이 다음 조회로 처리한다. `eligible` 대기 중인 사용자만 화면 이탈 시 `/queue/leave`로 서버 대기열 이탈을 알리며, `standby` 취소표 대기 사용자는 조기마감 후에도 대기열을 유지한다. 좌석 선택 페이지는 단계3이 아니라 이메일 Secret Link를 검증한 뒤에만 열린다. 이벤트별 오픈 시간이 없는 공연은 다른 공연의 전역 오픈 예약을 물려받지 않고 즉시 예매 흐름으로 진입한다.

### src/components/header.js / src/pages/concertsList.js
- **목적:** 공통 헤더 검색과 공연 목록 검색을 처리.
- **주요 기능:** 마이페이지 메뉴 옆 검색창에서 검색어를 입력하면 `concerts?search=...`로 이동하며, 콘서트 목록에서 공연명 또는 공연장에 검색어가 포함된 포스터 공연만 표시한다.

### public/images/queuing-logo-header.png / src/components/header.js
- **목적:** 사용자가 제공한 가로형 최종 로고 디자인을 사이트 헤더에 적용.
- **주요 기능:** 흰색 심볼과 QUEUING 문자가 포함된 가로형 이미지를 일반 화면과 예매 흐름 양쪽에서 사용한다. 헤더 배경은 로고 원본의 배경색 `#B11018`과 일치시켜 이미지 가장자리에 별도 색상 블록이 보이지 않도록 한다.

### src/data/concerts.js
- **목적:** 공연명과 포스터 이미지의 매칭 규칙을 관리.
- **주요 기능:** `TOMORROW X TOGETHER` 전체 이름과 `TXT` 약칭을 모두 `/images/posters/poster-tomorrow.png`에 연결한다. 포스터 파일명이 바뀌어도 공연명 매칭이 해시 fallback으로 넘어가지 않도록 명시적인 별칭을 유지한다.

### src/pages/lastCancelTicketing.js

- **목적:** Final Local Secret Link의 공용 취소표 풀 좌석 선택과 취소표 전용 결제 화면을 제공한다.
- **주요 기능:** 좌석을 서버에 선점한 뒤 일반 `payment/cancel` 경로로 이동하지 않고, 같은 화면에서 예매자 정보·결제수단·약관 동의를 확인한 뒤 `/last-simulation/confirm`을 호출한다. 성공 시 완료 메일 발송 여부를 안내하고, 서버 대기열을 즉시 동기화한 뒤 예매내역 또는 메인으로 이동한다.
- **API 명세 / 라우팅 규칙:** 좌석 선택 단계의 `원하는 좌석이 없어요 · 다음 순번에게 넘기기`는 `/last-simulation/pass`를 호출한다. 성공하면 현재 Secret Link의 타이머·폴링을 중지하고 메인으로 이동하며, 이후 해당 공연은 취소표 대기열에서 보이지 않는다.

### src/pages/mypage.js

- **목적:** 서버 예약과 취소표 대기·양도 상태를 마이페이지에 일관되게 표시한다.
- **주요 기능:** `/reservations/user/:userId`에서 복원한 예약에 회차 날짜·시간을 유지해 취소표 전용 결제가 예매내역에 표시되도록 한다. `/last-simulation/history/mine`의 순번 양도 기록은 취소/환불내역에서 실제 환불과 구분되는 `결제 없음 · 순번 종료` 안내 행으로 표시한다.

## ⚙️ Core Logic & Code Description — Last 좌석 선택·결제 단계

### src/pages/lastCancelTicketing.js

- **목적:** Last 취소표 링크에서 좌석을 비교 선택한 뒤 사용자가 명시적으로 확정하고, 취소표 전용 결제 화면에서 결제를 완료하도록 한다.
- **주요 기능:** 좌석 클릭은 브라우저 선택 상태만 갱신한다. 선택 카드의 `선택 해제`로 원래 상태로 되돌리거나 다른 좌석을 다시 고를 수 있으며, `좌석 확정 후 결제`에서만 서버의 `/last-simulation/hold`를 호출한다. 결제 단계에서는 동의 누락·실패 사유를 즉시 표시한다.
- **API 명세 / 라우팅 규칙:** 우측 단계 레일의 `좌석 선택으로 돌아가기`는 `/last-simulation/release`를 호출해 서버 선점을 해제하고 같은 Secret Link의 좌석 선택 단계로 돌아간다. 페이지 이탈 시에도 실제로 선점된 좌석만 keepalive 해제하며, 링크·순번은 만료시키지 않는다. 제한시간은 우측 sticky 레일에서 두 단계 모두 계속 표시된다.
- **UI 규칙:** 예매 완료 화면의 `예매내역 확인`과 `메인으로`는 같은 폭과 높이로 렌더링한다. 순번 양도는 확인 대화상자를 거친 직사각형 보조 버튼으로 표시하여, 좌석 확정·결제 버튼과 구분하면서도 쉽게 찾을 수 있게 한다.

### src/pages/admin.js

- **목적:** Final Last 시뮬레이션의 단계별 진행 상태와 링크 발급 정책을 관리자에게 안내한다.
- **주요 기능:** 단계4 Gmail SMTP Last 링크 발급은 현재 1번 `WAITING` 후보 한 명만 대상으로 하며, 그 사용자가 결제·양도·만료로 순번을 종료하면 API가 다음 후보에게 새 링크를 자동 발급한다고 표시한다.
- **API 명세 / 라우팅 규칙:** 관리자 버튼은 `/admin/last-simulation/issue-links`를 한 번 호출해 최초 후보를 발급한다. 다음 후보에게 수동으로 반복 발급하지 않는다.
