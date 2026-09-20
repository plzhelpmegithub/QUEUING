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

function wrapEmailHtml({ title, subtitle, contentHtml, footerHtml }) {
  const footer = footerHtml || '본 메일은 발신 전용입니다. QUEUING에서 자동 발송되었습니다.';
  return `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"></head>
<body style="margin:0; padding:0; background-color:#f4f4f5; font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5; padding:32px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0"
               style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background-color:#E11D2E; padding:28px 32px;">
              <span style="color:#ffffff; font-size:20px; font-weight:700; letter-spacing:0.5px;">QUEUING</span>
              <div style="color:#ffffff; font-size:14px; opacity:0.9; margin-top:4px;">${subtitle || title}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${contentHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px; background-color:#fafafa; border-top:1px solid #f0f0f0;">
              <span style="font-size:12px; color:#a1a1aa;">${footer}</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
      const body = wrapEmailHtml({
        title: '공연 취소 안내',
        contentHtml: `
          <p style="margin:0 0 16px; font-size:16px; color:#18181b; line-height:1.6;">
            안녕하세요, <strong>${user.userId}</strong>님.<br>
            아래 공연이 취소되었음을 안내드립니다.
          </p>
          <div style="background-color:#f9fafb; border-radius:8px; padding:16px; margin:20px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; font-size:14px; color:#374151;">
              <tr><td style="padding:4px 0;"><strong>공연명</strong></td><td style="padding:4px 0;">${eventInfo.eventName}</td></tr>
              <tr><td style="padding:4px 0;"><strong>일시</strong></td><td style="padding:4px 0;">${eventInfo.eventDate || '미정'}</td></tr>
              <tr><td style="padding:4px 0;"><strong>장소</strong></td><td style="padding:4px 0;">${eventInfo.venue || '미정'}</td></tr>
              <tr><td style="padding:4px 0;"><strong>좌석</strong></td><td style="padding:4px 0;">${user.seatId}</td></tr>
              <tr><td style="padding:4px 0;"><strong>취소 사유</strong></td><td style="padding:4px 0;">${reason}</td></tr>
            </table>
          </div>
          <div style="background-color:#FEF2F2; border:1px solid #FCA5A5; border-radius:8px; padding:14px 16px; margin:20px 0;">
            <span style="color:#B91C1C; font-size:14px; font-weight:600;">결제하신 금액은 영업일 기준 3~5일 내 환불 처리됩니다.</span>
          </div>
          <p style="margin:0; font-size:13px; color:#71717a; line-height:1.6;">이용에 불편을 드려 죄송합니다.</p>`,
      });
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
      const body = wrapEmailHtml({
        title: '공연 정보 변경 안내',
        contentHtml: `
          <p style="margin:0 0 16px; font-size:16px; color:#18181b; line-height:1.6;">
            안녕하세요, <strong>${user.userId}</strong>님.<br>
            예매하신 공연의 정보가 변경되었습니다.
          </p>
          <div style="background-color:#f9fafb; border-radius:8px; padding:16px; margin:20px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%; font-size:14px; color:#374151;">
              <tr><td style="padding:4px 0;"><strong>공연명</strong></td><td style="padding:4px 0;">${eventInfo.eventName}</td></tr>
              <tr><td style="padding:4px 0;"><strong>변경 내용</strong></td><td style="padding:4px 0;">${changeDetail}</td></tr>
            </table>
          </div>
          <p style="margin:0; font-size:13px; color:#71717a; line-height:1.6;">자세한 내용은 QUEUING 사이트에서 확인해주세요.</p>`,
      });
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

module.exports = { sendEmail, sendSMS, wrapEmailHtml, notifyEventCancellation, notifyEventUpdate, isSmtpConfigured };
