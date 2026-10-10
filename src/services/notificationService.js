// NotificationService
// Chịu trách nhiệm gửi thông báo Microsoft Teams (qua Power Automate Workflow) và Email (qua SMTP)
// cho các sự kiện trong ứng dụng Dies & Rollers Manager:
//   - Khi thêm Die mới / cập nhật Die    -> thông báo Teams + Email
//   - Khi thêm Roller mới / cập nhật Roller -> thông báo Teams + Email
//
// QUAN TRỌNG: Mọi biến môi trường được đọc BÊN TRONG function (lazy read),
// KHÔNG đọc ở top-level, để đảm bảo dotenv đã nạp xong trước khi dùng.
// Xem các biến cần điền tại backend/.env.example (mục "=== NOTIFICATIONS ===").

const nodemailer = require('nodemailer');

// --- Helper đọc env lazy (mỗi lần gọi đều lấy giá trị mới nhất) ---

const getTeamsWebhookUrl = () => process.env.TEAMS_WEBHOOK_URL || '';
const getAppUrl = () => process.env.APP_URL || 'https://digitalcpvn.vercel.app';

const getSmtpConfig = () => ({
  host: process.env.SMTP_HOST || '',
  port: Number.parseInt(process.env.SMTP_PORT, 10) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
});

const getManagerEmails = () =>
  (process.env.MANAGER_NOTIFY_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

let cachedTransporter = null;
let cachedTransporterKey = null;

// Lazy-init transporter: chỉ tạo khi đã có đủ cấu hình SMTP, và cache theo config
function getTransporter() {
  const cfg = getSmtpConfig();
  if (!cfg.host || !cfg.user || !cfg.pass) return null;

  const cacheKey = `${cfg.host}|${cfg.port}|${cfg.user}`;
  if (cachedTransporter && cachedTransporterKey === cacheKey) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  cachedTransporterKey = cacheKey;
  return cachedTransporter;
}

// Bảng tra Status (khớp với STATUS_LABELS ở frontend)
const STATUS_LABELS = {
  0: 'Trong kho',
  1: 'Đang sử dụng',
  2: 'Chờ mài',
  3: 'Chờ sử dụng',
  4: 'Hết tuổi thọ',
  5: 'Hư bể',
  6: 'Đang đặt',
};

function getStatusLabel(status) {
  if (status === null || status === undefined) return '—';
  return STATUS_LABELS[Number(status)] ?? String(status);
}

function fmtNum(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return new Intl.NumberFormat('vi-VN').format(n);
}

// Dựng Adaptive Card + bọc trong "attachments" theo schema Power Automate
// (action "Post card in a chat or channel" yêu cầu content có "type": "AdaptiveCard").
function buildAdaptiveCardPayload(title, facts, url, accentColor = '0076D7') {
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
              color: accentColor === '22c55e' ? 'Good' : accentColor === 'ef4444' ? 'Attention' : 'Default',
            },
            {
              type: 'FactSet',
              facts: facts.map((f) => ({ title: f.name, value: f.value })),
            },
          ],
          actions: url
            ? [
                {
                  type: 'Action.OpenUrl',
                  title: 'Mở hệ thống Dies & Rollers',
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
async function sendTeamsMessage(title, facts, url = null, accentColor = '0076D7') {
  const webhookUrl = getTeamsWebhookUrl();

  if (!webhookUrl) {
    console.warn('[NotificationService] Thiếu TEAMS_WEBHOOK_URL — bỏ qua gửi Teams.');
    return { skipped: true, reason: 'missing-webhook' };
  }

  const appUrl = url || getAppUrl();

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildAdaptiveCardPayload(title, facts, appUrl, accentColor)),
    });

    const responseBody = await response.text().catch(() => '');

    if (!response.ok) {
      console.error(
        `[NotificationService] Teams webhook status ${response.status}:`,
        responseBody.substring(0, 500),
      );
      return { ok: false, status: response.status, body: responseBody };
    }

    console.log(`[NotificationService] Đã gửi Teams (status ${response.status}):`, title);
    return { ok: true, status: response.status };
  } catch (error) {
    console.error('[NotificationService] Gửi Teams thất bại:', error);
    return { ok: false, error: error.message };
  }
}

// Gửi email qua SMTP. `to` có thể là 1 email hoặc danh sách email.
async function sendEmail(to, subject, html) {
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) {
    console.warn('[NotificationService] Không có người nhận email — bỏ qua.', { subject });
    return { skipped: true, reason: 'no-recipients' };
  }

  const transporter = getTransporter();
  if (!transporter) {
    console.warn('[NotificationService] Thiếu cấu hình SMTP — bỏ qua gửi mail.', { subject });
    return { skipped: true, reason: 'missing-smtp' };
  }

  try {
    const info = await transporter.sendMail({
      from: getSmtpConfig().from,
      to: recipients.join(','),
      subject,
      html,
    });
    console.log('[NotificationService] Đã gửi email:', info.messageId || '(no id)');
    return { ok: true, messageId: info.messageId };
  } catch (error) {
    console.error('[NotificationService] Gửi email thất bại:', error);
    return { ok: false, error: error.message };
  }
}

// ============================================================
//  CÁC SỰ KIỆN NGHIỆP VỤ — DIES & ROLLERS
// ============================================================

/**
 * Gửi thông báo khi THÊM MỚI hoặc CẬP NHẬT DIE
 * Nội dung: Model - Dies Hole - Press Length - Status
 * @param {object} die - Dữ liệu die (từ DB)
 * @param {'created'|'updated'} action - Hành động
 */
async function notifyDieChanged(die, action = 'created') {
  const appUrl = getAppUrl();
  const isCreated = action === 'created';
  const title = isCreated
    ? `🆕 Thêm Die mới: ${die.dies_model || '—'}`
    : `✏️ Cập nhật Die: ${die.dies_model || '—'}`;

  const facts = [
    { name: 'Model:', value: die.dies_model || '—' },
    { name: 'Dies Hole (mm):', value: die.dies_hole_mm != null ? String(die.dies_hole_mm) : '—' },
    { name: 'Press Length (mm):', value: die.press_length_mm || '—' },
    { name: 'Dies Code:', value: die.dies_code || '—' },
    { name: 'Trạng thái:', value: getStatusLabel(die.status) },
    { name: 'Số tấn còn lại:', value: fmtNum(die.remaining_tons) },
    { name: 'LINE:', value: die.line_in_use || '—' },
  ];

  const link = `${appUrl}/die/${die.id}`;

  const emailHtml = `
    <h3>${title}</h3>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
      <tr><td style="padding:4px 12px 4px 0;"><b>Model:</b></td><td>${die.dies_model || '—'}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><b>Dies Hole (mm):</b></td><td>${die.dies_hole_mm ?? '—'}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><b>Press Length (mm):</b></td><td>${die.press_length_mm || '—'}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><b>Dies Code:</b></td><td>${die.dies_code || '—'}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><b>Trạng thái:</b></td><td><b>${getStatusLabel(die.status)}</b></td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><b>Số tấn còn lại:</b></td><td>${fmtNum(die.remaining_tons)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><b>LINE:</b></td><td>${die.line_in_use || '—'}</td></tr>
    </table>
    <p><a href="${link}" target="_blank" rel="noopener noreferrer">👉 Xem chi tiết Die trên hệ thống</a></p>
  `;

  await Promise.all([
    sendTeamsMessage(title, facts, link, isCreated ? '22c55e' : '0076D7'),
    sendEmail(getManagerEmails(), title, emailHtml),
  ]);
}

/**
 * Gửi thông báo khi THÊM MỚI hoặc CẬP NHẬT ROLLER
 * Nội dung: Model - Roller Shell Hole - Roller Shell Type - Status
 * @param {object} roller - Dữ liệu roller (từ DB)
 * @param {'created'|'updated'} action - Hành động
 */
async function notifyRollerChanged(roller, action = 'created') {
  const appUrl = getAppUrl();
  const isCreated = action === 'created';
  const title = isCreated
    ? `🆕 Thêm Roller mới: ${roller.roller_model || roller.dies_model || '—'}`
    : `✏️ Cập nhật Roller: ${roller.roller_model || roller.dies_model || '—'}`;

  // Tùy theo schema DB của bạn, tên field có thể khác.
  // Dưới đây là các field phổ biến — chỉnh lại nếu cần.
  const model = roller.roller_model || roller.dies_model || roller.model || '—';
  const shellHole = roller.roller_shell_hole ?? roller.shell_hole ?? roller.dies_hole_mm ?? '—';
  const shellType = roller.roller_shell_type || roller.shell_type || roller.type || '—';
  const rollerCode = roller.roller_code || roller.dies_code || '—';

  const facts = [
    { name: 'Model:', value: String(model) },
    { name: 'Roller Shell Hole:', value: String(shellHole) },
    { name: 'Roller Shell Type:', value: String(shellType) },
    { name: 'Roller Code:', value: String(rollerCode) },
    { name: 'Trạng thái:', value: getStatusLabel(roller.status) },
    { name: 'Số tấn còn lại:', value: fmtNum(roller.remaining_tons) },
    { name: 'LINE:', value: roller.line_in_use || '—' },
  ];

  const link = `${appUrl}/roller/${roller.id}`;

  const emailHtml = `
    <h3>${title}</h3>
    <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
      <tr><td style="padding:4px 12px 4px 0;"><b>Model:</b></td><td>${model}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><b>Roller Shell Hole:</b></td><td>${shellHole}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><b>Roller Shell Type:</b></td><td>${shellType}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><b>Roller Code:</b></td><td>${rollerCode}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><b>Trạng thái:</b></td><td><b>${getStatusLabel(roller.status)}</b></td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><b>Số tấn còn lại:</b></td><td>${fmtNum(roller.remaining_tons)}</td></tr>
      <tr><td style="padding:4px 12px 4px 0;"><b>LINE:</b></td><td>${roller.line_in_use || '—'}</td></tr>
    </table>
    <p><a href="${link}" target="_blank" rel="noopener noreferrer">👉 Xem chi tiết Roller trên hệ thống</a></p>
  `;

  await Promise.all([
    sendTeamsMessage(title, facts, link, isCreated ? '22c55e' : '0076D7'),
    sendEmail(getManagerEmails(), title, emailHtml),
  ]);
}

// Test gửi email (dùng cho route /api/test-email)
async function sendTestEmail() {
  const to = getManagerEmails();
  if (to.length === 0) {
    return { skipped: true, reason: 'no-manager-emails' };
  }
  return sendEmail(
    to,
    '[Dies & Rollers Manager] Test email',
    '<p>Đây là email test từ NotificationService.</p>',
  );
}

module.exports = {
  sendTeamsMessage,
  sendEmail,
  sendTestEmail,
  notifyDieChanged,
  notifyRollerChanged,
};