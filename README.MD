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
├── seat_editor.html                # 인터랙티브 좌석 위치 에디터 (개발용)
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
| D1~D2 | 가변 | 원본 |
| Floor | 888 | getEvenFloorPoint 역변환 계산 |
| I1 | 183 | 원본 |
| I2 | 198 | 에디터 조정 완료 |
| I3 | 183 | 원본 |

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
- 빌드: `npm run build` → `dist/` 디렉토리를 Nginx에 배포
- 좌석 좌표 변경 시 `olympicHallSeats.js`만 수정하면 됨 (seatMap.js의 변환 로직은 변경 불필요)

## ⚙️ Core Logic & Code Description

### src/pages/mypage.js
- **목적:** 로그인 사용자의 예매·취소/환불·관심 공연·멤버십·회원정보 화면을 제공.
- **주요 기능:** 멤버십 상태를 개요와 상세 화면에서 동일한 이모지 로켓으로 표시한다. 활성화 상태는 컬러 로켓, 비활성화 상태는 회색 발사 대기 로켓으로 표시하며 움직임은 사용하지 않는다. 현재 마이페이지 메뉴에는 캘린더 항목을 두지 않는다.
- **API 명세 / 라우팅 규칙:** 예매 내역과 실제 공연 정보는 `/reservations/user/:userId`, `/events`를 사용한다. 마이페이지의 회원정보 수정은 `updateProfileOnServer()`를 통해 백엔드에 저장하며 이메일은 수정하지 않는다.

### src/pages/payment.js
- **목적:** 결제 전 구매자 정보와 좌석 확정 흐름을 처리.
- **주요 기능:** 사용자가 입력한 전화번호가 저장된 회원 전화번호와 다를 때만 확인창을 표시하고, 확인 시 전화번호만 회원정보에 저장한 뒤 결제를 진행한다. 이메일은 구매 연락처로만 사용한다.
- **API 명세 / 라우팅 규칙:** 회원정보 변경 요청은 `PATCH /auth/profile`에 `userId`와 `phone`만 전달할 수 있다.
