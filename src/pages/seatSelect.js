// 예전엔 별도의 "구역 선택 → 좌석 선택" 2단계 페이지였는데, 이제 zoneSelect.js
// 하나가 전체 구역+좌석을 한 화면에서 다 처리함. 이 파일은 seats/:id/:zoneId로
// 들어오는 기존 링크와의 호환을 위해 같은 화면을 렌더링하고 해당 구역으로
// 스크롤만 이동시켜줌.
import { renderZoneSeatPage } from './zoneSelect.js';

export const seatSelectPage = {
  render(container, params) {
    return renderZoneSeatPage(container, params.id, params.zoneId);
  },
};
