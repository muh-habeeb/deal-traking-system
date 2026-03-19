const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../utils/logger');

let hasVerifiedTransport = false;

function assertEmailConfig() {
  const required = [
    ['SMTP_HOST', env.smtp.host],
    ['SMTP_PORT', env.smtp.port],
    ['SMTP_USER', env.smtp.user],
    ['SMTP_PASS', env.smtp.pass],
    ['ALERT_FROM', env.alertFrom],
    ['ALERT_TO', env.alertTo],
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
  secure: env.smtp.secure,
  auth: {
    user: env.smtp.user,
    pass: env.smtp.pass,
  },
});

function formatListingHtml(listing) {
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.4;">
      <h2>New Deal Found</h2>
      <p><strong>Title:</strong> ${listing.title}</p>
      <p><strong>Price:</strong> ${listing.price ? `$${listing.price}` : 'N/A'}</p>
      <p><strong>Location:</strong> ${listing.location || 'Unknown'}</p>
      <p><a href="${listing.url}" target="_blank" rel="noopener noreferrer">View Listing</a></p>
      ${listing.image ? `<img src="${listing.image}" alt="listing" style="max-width: 320px;" />` : ''}
    </div>
  `;
}

function formatListingText(listing) {
  return [
    'New Deal Found',
    `Title: ${listing.title}`,
    `Price: ${listing.price !== null && listing.price !== undefined ? `CA$${listing.price}` : 'N/A'}`,
    `Location: ${listing.location || 'Unknown'}`,
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

  const message = {
    from: env.alertFrom,
    to: env.alertTo,
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

  const message = {
    from: env.alertFrom,
    to: env.alertTo,
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
