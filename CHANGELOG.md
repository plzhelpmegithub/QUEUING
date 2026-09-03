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

## [2026-09-03 12:53] 업데이트 로그

### 🔄 변경 및 수정 사항
- **[src/pages/mypage.js]**: 마이페이지의 캘린더 메뉴·캘린더 화면·개요 캘린더 영역을 제거하고, 멤버십 상태를 개요와 상세 화면의 로켓 UI로 표시하도록 수정.
- **[src/styles/pages.css]**: 멤버십 활성화/비활성화 로켓 스타일을 추가하고, 개요와 상세 화면에서 동일한 이모지 로켓 형태를 사용하도록 정리.
- **[src/pages/payment.js]**: 결제 시 저장된 전화번호가 다를 때만 확인 후 회원정보의 전화번호를 갱신하도록 구성. 이메일은 회원정보 비교·수정 대상에서 제외.
- **[src/state/store.js]**: 회원정보 저장 응답 처리에서 이메일을 갱신하지 않고 이름·전화번호 등 허용된 프로필 값만 반영하도록 수정.
