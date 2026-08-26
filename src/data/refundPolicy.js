// Cancellation / refund policy content shown across the concert detail page,
// payment page, and mypage refund flow. Kept as data so the copy lives in one
// place and every screen that references it stays consistent.

export const REFUND_SUMMARY = '공연 7일 전까지 취소 가능 · 취소 시점에 따라 수수료가 발생할 수 있습니다.';

export const CANCEL_DEADLINE_NOTICE =
  '관람일 전일 오후 5시(토요일은 오전 11시) 이후 또는 관람일 당일 예매 건은 예매 후 취소·변경·환불이 불가합니다. 토요일이 공휴일인 경우 토요일 오전 11시 기준이 적용됩니다.';

export const FEE_TABLE = [
  { period: '예매 후 7일 이내 (공연일 10일 전까지)', fee: '없음' },
  { period: '예매 후 8일 ~ 관람일 10일 전', fee: '공연권 4,000원 · 입장권 2,000원 (티켓금액 10% 이내)' },
  { period: '관람일 9일 전 ~ 7일 전', fee: '티켓 금액의 10%' },
  { period: '관람일 6일 전 ~ 3일 전', fee: '티켓 금액의 20%' },
  { period: '관람일 2일 전 ~ 1일 전', fee: '티켓 금액의 30%' },
  { period: '관람일 당일', fee: '취소 및 환불 불가' },
];

export const FEE_NOTE =
  '※ 취소 수수료 및 환불 기준은 공연별 판매 정책에 따라 달라질 수 있습니다. 정확한 환불 조건은 해당 공연의 상세 페이지에서 확인해주세요.';

export const REFUND_METHODS = [
  { method: '신용카드', desc: '취소 처리 완료 후 4~5일 뒤 카드사 취소가 확인됩니다. 취소 시점과 카드사에 따라 환급 방법·기간이 다를 수 있습니다.' },
  { method: '무통장 입금', desc: '접수 완료 후 5~7일 이내 처리됩니다. 반드시 예매자 본인 명의 계좌로만 환불 가능합니다.' },
  { method: '휴대폰 결제', desc: '당월 예매건만 사이트에서 취소 가능하며, 그 외 기간은 고객센터 문의가 필요합니다.' },
  { method: '예매권', desc: '공연예매권은 취소가 불가하며, 문화예매권은 사용한 금액만큼 즉시 복원됩니다.' },
];

export const SHOW_CANCEL_NOTICE = '공연이 주최 측의 사정으로 취소되는 경우 해당 공연의 정책에 따라 티켓 금액을 환불합니다.';
export const SCHEDULE_CHANGE_NOTICE =
  '공연 일정 또는 장소가 변경되는 경우, 변경된 공연을 관람할 수 없는 사용자를 대상으로 별도의 취소 및 환불 절차가 제공될 수 있습니다.';

export const HOLD_VS_REFUND_NOTICE =
  '결제 제한시간 내에 결제를 완료하지 않으면 좌석은 자동으로 해제되어 다른 사용자가 다시 선택할 수 있게 됩니다. 이는 "환불"이 아니라 "좌석 예약 시간 만료"로 처리되며, 결제 전이므로 수수료도 발생하지 않습니다.';

export const CANCEL_TICKET_RULES = [
  '취소표는 1인 1매만 구매할 수 있습니다.',
  'Private Link를 통해서만 취소표를 예매할 수 있습니다.',
  'Private Link는 발급 후 5분 동안만 유효합니다.',
  'Private Link가 만료되면 해당 링크로는 예매할 수 없습니다.',
  'Private Link로 티켓을 확보하면 해당 링크는 즉시 사용이 종료됩니다.',
  '이미 사용된 Private Link는 다시 사용할 수 없습니다.',
];

export const PRIVATE_LINK_NOTICE =
  'Private Link의 5분 제한과, 결제 완료 후 티켓의 환불 가능 기간은 서로 다른 개념입니다. Private Link가 만료되어도 이미 결제한 티켓에는 공연별 환불 정책이 정상적으로 적용됩니다.';

export const REFUND_TO_CANCEL_POOL_NOTICE =
  '예매를 취소하면 환불 처리와 함께 해당 좌석이 취소표 Pool로 등록되어, 취소표 대기열의 다음 순번 사용자에게 예매 기회가 돌아갑니다.';

// Simplified fee-rate calculator for the mypage refund estimate — mirrors the
// table above without the flat-fee tier's mixed won/percent logic.
export function calcCancelFeeRate(daysUntilShow) {
  if (daysUntilShow >= 10) return 0;
  if (daysUntilShow >= 7) return 0.1;
  if (daysUntilShow >= 3) return 0.2;
  if (daysUntilShow >= 1) return 0.3;
  return 1; // show day — no refund
}
