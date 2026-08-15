const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

// ===== AWS 클라이언트 설정 (LocalStack 호환) =====
const sesClient = new SESClient({
  endpoint: process.env.AWS_ENDPOINT || 'http://192.168.0.191:4566',
  region: process.env.AWS_REGION || 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'fakekey',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'fakesecret',
  },
});

const snsClient = new SNSClient({
  endpoint: process.env.AWS_ENDPOINT || 'http://192.168.0.191:4566',
  region: process.env.AWS_REGION || 'ap-northeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'fakekey',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'fakesecret',
  },
});

// 발신자 이메일 (SES에 인증된 이메일이어야 함)
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@queuing.com';

/**
 * 이메일 발송 (SES)
 * - 예매 확인, 공연 취소 안내 등에 사용
 *
 * @param {string} to - 수신자 이메일
 * @param {string} subject - 제목
 * @param {string} body - 본문 (HTML)
 */
async function sendEmail(to, subject, body) {
  try {
    await sesClient.send(new SendEmailCommand({
      Source: FROM_EMAIL,                          // 보내는 사람
      Destination: { ToAddresses: [to] },          // 받는 사람
      Message: {
        Subject: { Data: subject },                // 제목
        Body: { Html: { Data: body } },            // HTML 본문
      },
    }));
    console.log(`[Email] 발송 성공: ${to} — ${subject}`);
    return { success: true, to, type: 'email' };
  } catch (err) {
    console.error(`[Email] 발송 실패: ${to} — ${err.message}`);
    return { success: false, to, type: 'email', error: err.message };
  }
}

/**
 * 문자 발송 (SNS)
 * - 긴급 알림, 공연 취소 안내 등에 사용
 *
 * @param {string} phoneNumber - 수신자 전화번호 (예: "+821012345678")
 * @param {string} message - 문자 내용
 */
async function sendSMS(phoneNumber, message) {
  try {
    await snsClient.send(new PublishCommand({
      PhoneNumber: phoneNumber,                    // 받는 사람 전화번호
      Message: message,                            // 문자 내용
    }));
    console.log(`[SMS] 발송 성공: ${phoneNumber}`);
    return { success: true, phoneNumber, type: 'sms' };
  } catch (err) {
    console.error(`[SMS] 발송 실패: ${phoneNumber} — ${err.message}`);
    return { success: false, phoneNumber, type: 'sms', error: err.message };
  }
}

/**
 * 공연 취소 알림 발송 (이메일 + 문자 동시)
 * - 공연이 취소되면 예매한 전체 사용자에게 알림
 *
 * @param {object} eventInfo - { eventName, eventDate, venue }
 * @param {string} reason - 취소 사유
 * @param {object[]} users - [{ userId, email, phone, seatId }]
 */
async function notifyEventCancellation(eventInfo, reason, users) {
  const results = { email: [], sms: [], total: users.length };

  for (const user of users) {
    // 이메일 발송
    if (user.email) {
      const subject = `[QUEUING] "${eventInfo.eventName}" 공연 취소 안내`;
      const body = `
        <h2>공연 취소 안내</h2>
        <p>안녕하세요, ${user.userId}님.</p>
        <p>아래 공연이 취소되었음을 안내드립니다.</p>
        <hr>
        <p><strong>공연명:</strong> ${eventInfo.eventName}</p>
        <p><strong>일시:</strong> ${eventInfo.eventDate || '미정'}</p>
        <p><strong>장소:</strong> ${eventInfo.venue || '미정'}</p>
        <p><strong>좌석:</strong> ${user.seatId}</p>
        <p><strong>취소 사유:</strong> ${reason}</p>
        <hr>
        <p>결제하신 금액은 영업일 기준 3~5일 내 환불 처리됩니다.</p>
        <p>이용에 불편을 드려 죄송합니다.</p>
        <p>— QUEUING 팀</p>
      `;
      const emailResult = await sendEmail(user.email, subject, body);
      results.email.push(emailResult);
    }

    // 문자 발송
    if (user.phone) {
      const message = `[QUEUING] "${eventInfo.eventName}" 공연이 취소되었습니다. 사유: ${reason}. 결제 금액은 3~5일 내 환불됩니다.`;
      const smsResult = await sendSMS(user.phone, message);
      results.sms.push(smsResult);
    }
  }

  console.log(`[Notification] 공연 취소 알림 완료 — 총 ${users.length}명`);
  return results;
}

/**
 * 공연 변경 알림 발송 (이메일 + 문자)
 * - 날짜, 장소 등이 변경되면 예매자에게 알림
 *
 * @param {object} eventInfo - { eventName }
 * @param {string} changeDetail - 변경 내용 설명
 * @param {object[]} users - [{ userId, email, phone }]
 */
async function notifyEventUpdate(eventInfo, changeDetail, users) {
  const results = { email: [], sms: [], total: users.length };

  for (const user of users) {
    if (user.email) {
      const subject = `[QUEUING] "${eventInfo.eventName}" 공연 정보 변경 안내`;
      const body = `
        <h2>공연 정보 변경 안내</h2>
        <p>안녕하세요, ${user.userId}님.</p>
        <p>예매하신 공연의 정보가 변경되었습니다.</p>
        <hr>
        <p><strong>공연명:</strong> ${eventInfo.eventName}</p>
        <p><strong>변경 내용:</strong> ${changeDetail}</p>
        <hr>
        <p>자세한 내용은 QUEUING 사이트에서 확인해주세요.</p>
        <p>— QUEUING 팀</p>
      `;
      const emailResult = await sendEmail(user.email, subject, body);
      results.email.push(emailResult);
    }

    if (user.phone) {
      const message = `[QUEUING] "${eventInfo.eventName}" 공연 정보 변경: ${changeDetail}. 자세한 내용은 사이트를 확인해주세요.`;
      const smsResult = await sendSMS(user.phone, message);
      results.sms.push(smsResult);
    }
  }

  return results;
}

module.exports = { sendEmail, sendSMS, notifyEventCancellation, notifyEventUpdate };
