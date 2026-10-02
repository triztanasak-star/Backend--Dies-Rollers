// NotificationService
// Chịu trách nhiệm gửi thông báo Microsoft Teams (qua Incoming Webhook) và Email (qua SMTP)
// cho các sự kiện trong luồng dự án:
//   - Khi tạo dự án (request)      -> thông báo cho Manager
//   - Khi duyệt dự án (approved)   -> thông báo cho PIC/Support
//
// Toàn bộ thông tin nhạy cảm (webhook URL, SMTP host/user/pass, danh sách email manager)
// được đọc từ biến môi trường (.env) — KHÔNG hard-code giá trị thật trong code.
// Xem các biến cần điền tại backend/.env.example (mục "=== NOTIFICATIONS ===").

const nodemailer = require('nodemailer');

const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || '';

// Link web app — đính kèm vào thông báo Teams/mail để bấm vào xem trực tiếp
const APP_URL = process.env.APP_URL || 'https://digitalcpvn.vercel.app';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number.parseInt(process.env.SMTP_PORT, 10) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

// Danh sách email Manager nhận thông báo khi có dự án mới (phân tách bằng dấu phẩy)
const MANAGER_NOTIFY_EMAILS = (process.env.MANAGER_NOTIFY_EMAILS || '')
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

let cachedTransporter = null;

// Lazy-init transporter: chỉ tạo khi đã có đủ cấu hình SMTP trong .env
function getTransporter() {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return cachedTransporter;
}

// Dựng Adaptive Card + bọc trong "attachments" theo đúng schema mà flow Power Automate của bạn
// mong đợi (action "Post card in a chat or channel" yêu cầu content có "type": "AdaptiveCard").
function buildAdaptiveCardPayload(title, text, url) {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: title,
              weight: 'Bolder',
              size: 'Medium',
              wrap: true,
            },
            {
              type: 'TextBlock',
              text,
              wrap: true,
            },
          ],
          actions: url
            ? [
                {
                  type: 'Action.OpenUrl',
                  title: 'Mở hệ thống Digital Work',
                  url,
                },
              ]
            : [],
        },
      },
    ],
  };
}

// Gửi message sang Microsoft Teams qua Power Automate Workflow webhook
// (webhook dạng "...environment.api.powerplatform.com/..." — KHÔNG phải Incoming Webhook/Connector cũ).
// Flow dùng action "Post card in a chat or channel" -> yêu cầu payload là Adaptive Card bọc trong
// "attachments" (xem buildAdaptiveCardPayload ở trên), KHÔNG dùng format "MessageCard" (connector cũ)
// hay "{ text: ... }" đơn giản — cả hai đều từng thử và bị flow báo lỗi/post rỗng.
async function sendTeamsMessage(title, text, url = APP_URL) {
  if (!TEAMS_WEBHOOK_URL) {
    console.warn('[NotificationService] Thiếu TEAMS_WEBHOOK_URL trong .env — bỏ qua gửi Teams.');
    return;
  }

  try {
    const response = await fetch(TEAMS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildAdaptiveCardPayload(title, text, url)),
    });

    const responseBody = await response.text().catch(() => '');
    if (!response.ok) {
      throw new Error(`Teams webhook phản hồi status ${response.status}: ${responseBody}`);
    }

    console.log(`[NotificationService] Đã gửi Teams (status ${response.status}):`, title);
  } catch (error) {
    console.error('[NotificationService] Gửi Teams thất bại:', error);
  }
}

// Gửi email qua SMTP. `to` có thể là 1 email hoặc danh sách email.
async function sendEmail(to, subject, html) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) {
    console.warn('[NotificationService] Không có người nhận email — bỏ qua gửi mail.', { subject });
    return;
  }

  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[NotificationService] Thiếu cấu hình SMTP trong .env — bỏ qua gửi mail.', { subject });
    return;
  }

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: recipients.join(','),
      subject,
      html,
    });
  } catch (error) {
    console.error('[NotificationService] Gửi email thất bại:', error);
  }
}

// --- Các sự kiện nghiệp vụ ---

// Khi tạo dự án mới (trạng thái "Yêu cầu") -> báo Manager qua Teams + mail
async function notifyWorkCreated(work) {
  try {
    const title = `📋 Yêu cầu dự án mới: ${work.task_name}`;
    const text = [
      `Dự án: ${work.task_name}`,
      `Nhà máy: ${work.factory_name || '—'}`,
      `Người tạo (ID): ${work.created_by ?? '—'}`,
      'Trạng thái: Yêu cầu — đang chờ duyệt.',
    ].join('\n');

    await Promise.all([
      sendTeamsMessage(title, text),
      sendEmail(
        MANAGER_NOTIFY_EMAILS,
        title,
        `<p><b>Dự án:</b> ${work.task_name}</p>
         <p><b>Nhà máy:</b> ${work.factory_name || '—'}</p>
         <p>Dự án vừa được tạo và đang chờ duyệt.</p>
         <p><a href="${APP_URL}" target="_blank" rel="noopener noreferrer">Mở hệ thống Digital Work</a></p>`,
      ),
    ]);
  } catch (error) {
    console.error('[NotificationService] notifyWorkCreated thất bại:', error);
  }
}

// Khi duyệt dự án (trạng thái "Đã duyệt") -> báo PIC/Support qua Teams + mail
async function notifyWorkApproved(work, recipientEmails = []) {
  try {
    const title = `✅ Dự án đã được duyệt: ${work.task_name}`;
    const text = [
      `Dự án: ${work.task_name}`,
      `PIC: ${work.lead_project || '—'}`,
      `Support: ${work.assistant || '—'}`,
      'Trạng thái: Đã duyệt — vui lòng chấp nhận và bắt đầu thực hiện.',
    ].join('\n');

    await Promise.all([
      sendTeamsMessage(title, text),
      sendEmail(
        recipientEmails,
        title,
        `<p><b>Dự án:</b> ${work.task_name}</p>
         <p><b>PIC:</b> ${work.lead_project || '—'} — <b>Support:</b> ${work.assistant || '—'}</p>
         <p>Dự án đã được duyệt, vui lòng vào hệ thống để chấp nhận và cập nhật tiến độ.</p>
         <p><a href="${APP_URL}" target="_blank" rel="noopener noreferrer">Mở hệ thống Digital Work</a></p>`,
      ),
    ]);
  } catch (error) {
    console.error('[NotificationService] notifyWorkApproved thất bại:', error);
  }
}

// Khi PIC bấm "Chấp nhận" (trạng thái "Thực hiện") -> báo nhóm Teams + mail Manager
async function notifyWorkInProgress(work) {
  try {
    const title = `🚀 Dự án bắt đầu thực hiện: ${work.task_name}`;
    const text = [
      `Dự án: ${work.task_name}`,
      `PIC: ${work.lead_project || '—'}`,
      `Support: ${work.assistant || '—'}`,
      'Trạng thái: Thực hiện — PIC đã chấp nhận và đang triển khai.',
    ].join('\n');

    await Promise.all([
      sendTeamsMessage(title, text),
      sendEmail(
        MANAGER_NOTIFY_EMAILS,
        title,
        `<p><b>Dự án:</b> ${work.task_name}</p>
         <p><b>PIC:</b> ${work.lead_project || '—'} — <b>Support:</b> ${work.assistant || '—'}</p>
         <p>PIC đã chấp nhận và bắt đầu thực hiện dự án.</p>
         <p><a href="${APP_URL}" target="_blank" rel="noopener noreferrer">Mở hệ thống Digital Work</a></p>`,
      ),
    ]);
  } catch (error) {
    console.error('[NotificationService] notifyWorkInProgress thất bại:', error);
  }
}

// Khi tiến độ đạt 100% (trạng thái "Hoàn thành") -> báo nhóm Teams + mail Manager
async function notifyWorkCompleted(work) {
  try {
    const title = `🎉 Dự án đã hoàn thành: ${work.task_name}`;
    const text = [
      `Dự án: ${work.task_name}`,
      `PIC: ${work.lead_project || '—'}`,
      `Support: ${work.assistant || '—'}`,
      'Trạng thái: Hoàn thành — tiến độ đã đạt 100%.',
    ].join('\n');

    await Promise.all([
      sendTeamsMessage(title, text),
      sendEmail(
        MANAGER_NOTIFY_EMAILS,
        title,
        `<p><b>Dự án:</b> ${work.task_name}</p>
         <p><b>PIC:</b> ${work.lead_project || '—'} — <b>Support:</b> ${work.assistant || '—'}</p>
         <p>Dự án đã hoàn thành (tiến độ 100%).</p>
         <p><a href="${APP_URL}" target="_blank" rel="noopener noreferrer">Mở hệ thống Digital Work</a></p>`,
      ),
    ]);
  } catch (error) {
    console.error('[NotificationService] notifyWorkCompleted thất bại:', error);
  }
}

module.exports = {
  sendTeamsMessage,
  sendEmail,
  notifyWorkCreated,
  notifyWorkApproved,
  notifyWorkInProgress,
  notifyWorkCompleted,
};
