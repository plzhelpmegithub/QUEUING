const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
const nodemailer = require('nodemailer');

function buildAwsConfig() {
  const config = {
    region: process.env.AWS_REGION || 'ap-northeast-2',
  };
  if (process.env.AWS_ENDPOINT) {
    config.endpoint = process.env.AWS_ENDPOINT;
  }
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }
  return config;
}

const sesClient = new SESClient(buildAwsConfig());
const snsClient = new SNSClient(buildAwsConfig());

const FROM_EMAIL = process.env.FROM_EMAIL || process.env.SMTP_USER || 'noreply@queuing.com';
const USE_SMTP = !!(process.env.SMTP_USER && process.env.SMTP_PASS);

function isSmtpConfigured() {
  return USE_SMTP && !!smtpTransport;
}

let smtpTransport = null;
if (USE_SMTP) {
  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  console.log(`[Email] SMTP 모드 활성화 (${process.env.SMTP_HOST || 'smtp.gmail.com'}, ${process.env.SMTP_USER})`);
} else {
  console.log('[Email] AWS SES 모드 활성화');
}

async function sendEmail(to, subject, body) {
  try {
    if (USE_SMTP && smtpTransport) {
      await smtpTransport.sendMail({
        from: `"QUEUING" <${FROM_EMAIL}>`,
        to,
        subject,
        html: body,
      });
    } else {
      await sesClient.send(new SendEmailCommand({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject },
          Body: { Html: { Data: body } },
        },
      }));
    }
    console.log(`[Email] 발송 성공: ${to} — ${subject}`);
    return { success: true, to, type: 'email' };
  } catch (err) {
    console.error(`[Email] 발송 실패: ${to} — ${err.message}`);
    return { success: false, to, type: 'email', error: err.message };
  }
}

async function sendSMS(phoneNumber, message) {
  try {
    await snsClient.send(new PublishCommand({
      PhoneNumber: phoneNumber,
      Message: message,
    }));
    console.log(`[SMS] 발송 성공: ${phoneNumber}`);
    return { success: true, phoneNumber, type: 'sms' };
  } catch (err) {
    console.error(`[SMS] 발송 실패: ${phoneNumber} — ${err.message}`);
    return { success: false, phoneNumber, type: 'sms', error: err.message };
  }
}

async function notifyEventCancellation(eventInfo, reason, users) {
  const results = { email: [], sms: [], total: users.length };

  for (const user of users) {
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

    if (user.phone) {
      const message = `[QUEUING] "${eventInfo.eventName}" 공연이 취소되었습니다. 사유: ${reason}. 결제 금액은 3~5일 내 환불됩니다.`;
      const smsResult = await sendSMS(user.phone, message);
      results.sms.push(smsResult);
    }
  }

  console.log(`[Notification] 공연 취소 알림 완료 — 총 ${users.length}명`);
  return results;
}

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

module.exports = { sendEmail, sendSMS, notifyEventCancellation, notifyEventUpdate, isSmtpConfigured };
