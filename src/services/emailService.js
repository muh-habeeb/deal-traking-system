const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');
const { getReceiverEmail } = require('./settingsService');

let hasVerifiedTransport = false;

function assertEmailConfig() {
  const receiverEmail = getReceiverEmail();

  const required = [
    ['SMTP_HOST', env.smtp.host],
    ['SMTP_PORT', env.smtp.port],
    ['SMTP_USER', env.smtp.user],
    ['SMTP_PASS', env.smtp.pass],
    ['ALERT_FROM', env.alertFrom],
    ['ALERT_TO', receiverEmail],
  ];

  const missing = required
    .filter(([, value]) => value === undefined || value === null || value === '')
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing email environment variables: ${missing.join(', ')}`);
  }
}

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  //   secure: env.smtp.secure,
  auth: {
    user: env.smtp.user,
    pass: env.smtp.pass,
  },
});

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(price) {
  if (price === null || price === undefined) {
    return 'N/A';
  }

  return `CA$${Number(price).toLocaleString('en-CA')}`;
}

function formatPostedDate(postedAt, postedText) {
  if (postedAt) {
    const parsed = new Date(postedAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    }
  }

  return postedText || 'N/A';
}

function formatListingHtml(listing) {
  const vehicleName = listing.vehicleName || listing.title || 'N/A';
  const modelYear =
    listing.modelYear !== null && listing.modelYear !== undefined ? String(listing.modelYear) : 'N/A';
  const posted = formatPostedDate(listing.postedAt, listing.postedText);

  return `
  <div style="font-family: Arial, sans-serif; background: #f4f6f8; padding: 16px;">
    <div style="max-width: 980px; margin: 0 auto; background: #ffffff; border: 1px solid #e6e8ec; border-radius: 8px; overflow: hidden;">
      <div style="padding: 14px 16px; border-bottom: 1px solid #e6e8ec; background: #fafbfc;">
        <h2 style="margin: 0; font-size: 18px; color: #1f2937;">New Marketplace Deal</h2>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #f9fafb; text-align: left;">
            <th style="padding: 10px; border-bottom: 1px solid #e6e8ec;">Image</th>
            <th style="padding: 10px; border-bottom: 1px solid #e6e8ec;">Name</th>
            <th style="padding: 10px; border-bottom: 1px solid #e6e8ec;">Year</th>
            <th style="padding: 10px; border-bottom: 1px solid #e6e8ec;">Price</th>
            <th style="padding: 10px; border-bottom: 1px solid #e6e8ec;">Mileage</th>
            <th style="padding: 10px; border-bottom: 1px solid #e6e8ec;">Location</th>
            <th style="padding: 10px; border-bottom: 1px solid #e6e8ec;">Posted</th>
            <th style="padding: 10px; border-bottom: 1px solid #e6e8ec;">Description</th>
            <th style="padding: 10px; border-bottom: 1px solid #e6e8ec;">Link</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #eef0f3;">
              ${
                listing.image
                  ? `<img src="${escapeHtml(listing.image)}" alt="listing" style="width: 96px; height: 72px; object-fit: cover; border-radius: 4px;" />`
                  : 'N/A'
              }
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #eef0f3;">${escapeHtml(vehicleName)}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eef0f3;">${escapeHtml(modelYear)}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eef0f3;">${escapeHtml(formatPrice(listing.price))}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eef0f3;">${escapeHtml(listing.mileageText || 'N/A')}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eef0f3;">${escapeHtml(listing.location || 'N/A')}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eef0f3;">${escapeHtml(posted)}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eef0f3; max-width: 260px;">${escapeHtml(listing.description || 'N/A')}</td>
            <td style="padding: 10px; border-bottom: 1px solid #eef0f3;">
              <a href="${escapeHtml(listing.url)}" target="_blank" rel="noopener noreferrer">Open</a>
            </td>
          </tr>
        </tbody>
      </table>
      <div style="padding: 10px 16px; font-size: 12px; color: #6b7280;">
        Original title: ${escapeHtml(listing.title || 'N/A')}
      </div>
    </div>
  </div>
`;
}

function formatListingText(listing) {
  const posted = formatPostedDate(listing.postedAt, listing.postedText);
  return [
    'New Deal Found',
    `Name: ${listing.vehicleName || listing.title || 'N/A'}`,
    `Year: ${listing.modelYear !== null && listing.modelYear !== undefined ? listing.modelYear : 'N/A'}`,
    `Price: ${formatPrice(listing.price)}`,
    `Mileage: ${listing.mileageText || 'N/A'}`,
    `Location: ${listing.location || 'Unknown'}`,
    `Posted: ${posted}`,
    `Description: ${listing.description || 'N/A'}`,
    `URL: ${listing.url}`,
  ].join('\n');
}

async function verifyEmailTransport() {
  assertEmailConfig();

  if (hasVerifiedTransport) {
    return true;
  }

  await transporter.verify();
  hasVerifiedTransport = true;
  logger.info('SMTP transporter verified');
  return true;
}

async function sendNewListingAlert(listing) {
  assertEmailConfig();
  const receiverEmail = getReceiverEmail();

  const message = {
    from: env.alertFrom,
    to: receiverEmail,
    subject: `New Marketplace Deal: ${listing.title}`,
    html: formatListingHtml(listing),
    text: formatListingText(listing),
  };

  try {
    const result = await transporter.sendMail(message);
    logger.info('Email alert sent', {
      listingUrl: listing.url,
      accepted: result.accepted,
      rejected: result.rejected,
      messageId: result.messageId,
    });
  } catch (error) {
    logger.error('Failed to send email alert', {
      error: error.message,
      code: error.code,
      response: error.response,
      responseCode: error.responseCode,
      listingUrl: listing.url,
    });
    throw error;
  }
}

async function sendTestEmail() {
  assertEmailConfig();
  await verifyEmailTransport();
  const receiverEmail = getReceiverEmail();

  const message = {
    from: env.alertFrom,
    to: receiverEmail,
    subject: 'Deal Tracker Email Test',
    text: 'This is a test email from your Deal Tracker backend.',
    html: '<p>This is a test email from your Deal Tracker backend.</p>',
  };

  const result = await transporter.sendMail(message);
  logger.info('Test email sent', {
    accepted: result.accepted,
    rejected: result.rejected,
    messageId: result.messageId,
  });

  return {
    accepted: result.accepted,
    rejected: result.rejected,
    messageId: result.messageId,
  };
}

module.exports = {
  verifyEmailTransport,
  sendNewListingAlert,
  sendTestEmail,
};
