# Swoop Client UI Guide

This document explains how a client or operator should use the Swoop dashboard to run deal tracking day to day.

## 1. What the UI Does

The UI has two pages:

- **Login Page** (`/`): Sign in to access the admin dashboard.
- **Dashboard** (`/dashboard`): Manage email delivery, Facebook session, search filters, and listings.

Main outcome:
- The app continuously scans Facebook Marketplace based on your filters and sends email alerts for new matching listings.

## 2. Access and Login

1. Open the app URL provided by your team (local default: `http://localhost:4000`).
2. Enter the dashboard username and password configured in environment variables:
- `APP_LOGIN_USERNAME`
- `APP_LOGIN_PASSWORD`
3. Click **Login**.

If login succeeds, you are redirected to the dashboard.

## 3. Dashboard Sections

### A. Receiver Email

Purpose:
- Sets the destination email that should receive alerts.

Actions:
1. Enter receiver email in **Alerts Receiver**.
2. Click **Save Email**.
3. Click **Send Test Email** to verify SMTP and delivery.

Expected result:
- You see a success message with a mail message ID.

### B. Facebook Session

Purpose:
- Connects and stores an authenticated Facebook session for scraping Marketplace.

Actions:
1. Click **Start Facebook Login**.
2. A browser window opens. Complete Facebook login there.
3. Return to dashboard and click **Save Session**.
4. Optionally click **Refresh Session Status**.

Status signals:
- **Session Ready**: session file exists and is valid.
- **No Facebook session found**: session not yet created or cleared.

Use **Logout Facebook** to clear the stored session if needed.

### C. Create Filter

Purpose:
- Defines what deals you want to track.

Fields:
- **Keyword** (required): e.g., `honda civic`
- **Location** (required): city/area, e.g., `toronto`
- **Min Price** (optional)
- **Max Price** (optional)

Action:
1. Fill form.
2. Click **Create Filter**.

Expected result:
- The filter is added and appears in **Manage Filters**.

### D. Manage Filters

Purpose:
- Edit or remove existing filters.

Actions:
- **Save**: update filter values in place.
- **Delete**: remove a filter permanently.
- **Refresh Filters**: reload from server.

Best practice:
- Keep filters specific enough to reduce noise and email volume.

### E. Latest Listings

Purpose:
- Shows the newest stored listings.

Actions:
- Click **Refresh Listings** for immediate reload.
- Click **Open** to view listing on Facebook.

Behavior:
- Listings are also auto-refreshed by the page.

## 4. Daily Operating Procedure (Client)

Use this sequence each day:

1. Login to dashboard.
2. Confirm **Receiver Email** is correct.
3. Confirm **Facebook Session** is ready.
4. Verify filters are up to date.
5. Check **Latest Listings** and incoming email alerts.

## 5. First-Time Setup Checklist (UI Side)

- App opens successfully.
- Login works with provided credentials.
- Receiver email saved.
- Test email received.
- Facebook session status shows **Session Ready**.
- At least one filter is created.
- Listings table begins to populate.

## 6. Common Issues and What to Do

- **Login failed**
- Re-check username/password from environment settings.

- **Unable to reach server**
- Confirm backend process is running.

- **No test email received**
- Verify SMTP credentials and receiver email.
- Check spam folder.

- **Session not found / not ready**
- Repeat login flow: Start Facebook Login -> complete sign-in in popup -> Save Session.

- **No listings appearing**
- Ensure at least one filter exists.
- Wait for scheduled scan interval (`SCRAPE_CRON`) or refresh later.

## 7. Security and Access Notes

- Do not share dashboard credentials publicly.
- Use strong values for `APP_AUTH_SECRET` and login password.
- Restrict access to trusted operators only.

## 8. Handover Notes for Client

When handing this to a client, provide:

- Dashboard URL
- Username/password
- Expected scan frequency
- Support contact for SMTP or Facebook session issues
- Any filter naming standards used by your team
