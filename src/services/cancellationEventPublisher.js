const {
  SQSClient,
  SendMessageCommand,
} = require('@aws-sdk/client-sqs');

const QUEUE_URL = process.env.CANCELLATION_EVENTS_QUEUE_URL
  || process.env.SQS_CANCELLATION_EVENTS_QUEUE_URL
  || '';

function createClient() {
  const config = {
    region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-northeast-2',
  };

  // LocalStack/온프레미스 테스트 환경에서만 endpoint와 정적 자격 증명을 사용한다.
  if (process.env.AWS_ENDPOINT) config.endpoint = process.env.AWS_ENDPOINT;
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }

  return new SQSClient(config);
}

const sqsClient = createClient();

/**
 * B파트의 취소표 재판매 파이프라인으로 좌석 반환 이벤트를 전달한다.
 *
 * 계약 필드: event_id, seat_id, status, timestamp, user_id
 * 세션 정보와 reason은 재처리·관측을 위한 선택 필드다.
 */
async function publishCancellationEvent({
  eventId,
  seatId,
  userId,
  status = 'CANCELLED',
  sessionDate = '',
  sessionTime = '',
  reason = 'reservation_cancelled',
}) {
  if (!QUEUE_URL) {
    console.warn('[CancellationEvent] CANCELLATION_EVENTS_QUEUE_URL 미설정 — SQS 발행을 건너뜁니다.');
    return { published: false, skipped: true, reason: 'queue_not_configured' };
  }

  const event = {
    event_id: eventId || '',
    seat_id: seatId || '',
    status,
    timestamp: new Date().toISOString(),
    user_id: userId || null,
    session_date: sessionDate || '',
    session_time: sessionTime || '',
    reason,
  };

  const result = await sqsClient.send(new SendMessageCommand({
    QueueUrl: QUEUE_URL,
    MessageBody: JSON.stringify(event),
  }));

  console.log(`[CancellationEvent] SQS 발행 완료: ${event.event_id}/${event.seat_id} (${event.status})`);
  return {
    published: true,
    messageId: result.MessageId || null,
    event,
  };
}

module.exports = { publishCancellationEvent };
