function getToken() {
    return localStorage.getItem('swoop_token');
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatPrice(value) {
    if (value === null || value === undefined) {
        return 'N/A';
    }

    return `CA$${Number(value).toLocaleString('en-CA')}`;
}

function formatPosted(listing) {
    const source = listing.postedAt;
    if (source) {
        const parsed = new Date(source);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short"
            });
        }
    }

    return listing.postedText || 'N/A';
}

function getPostedSourceBadge(listing) {
    const hasParsedPostedAt = Boolean(listing && listing.postedAt && !Number.isNaN(new Date(listing.postedAt).getTime()));

    if (hasParsedPostedAt) {
        return '<span class="badge" style="display:inline-block;margin-top:4px;">parsed time</span>';
    }

    if (listing && listing.postedText) {
        return '<span class="badge warn" style="display:inline-block;margin-top:4px;">raw facebook text</span>';
    }

    return '<span class="badge warn" style="display:inline-block;margin-top:4px;">missing</span>';
}

function toImageProxyUrl(rawUrl) {
    const value = String(rawUrl || '').trim();
    if (!value) {
        return '';
    }

    try {
        const parsed = new URL(value);
        return `/api/listings/image?url=${encodeURIComponent(parsed.toString())}`;
    } catch (_error) {
        return '';
    }
}

let sessionStatusPoller = null;
let sessionViewerUrl = '';
let sessionActionInProgress = false;
let emailSendingEnabled = true;
let telegramSendingEnabled = false;
let telegramUsername = '';
const SESSION_STATUS_POLL_MS = 5000;
const HARD_MAX_LISTING_HOURS = 12;

function normalizeTelegramUsername(value) {
    const raw = String(value || '').trim();
    if (!raw) {
        return '';
    }

    return raw.replace(/^@/, '').replace(/\s+/g, '');
}

function displayTelegramUsername(value) {
    const normalized = normalizeTelegramUsername(value);
    return normalized ? `@${normalized}` : '';
}

function isValidTelegramUsername(value) {
    return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(String(value || '').trim());
}

function getPostedTextAgeHours(postedText) {
    const text = String(postedText || '').trim().toLowerCase();
    if (!text) {
        return null;
    }

    if (/\byesterday\b/.test(text)) {
        return 24;
    }

    const hourMatch = text.match(/\b(\d+)\s*(hour|hours|hr|hrs|h)\b/i);
    if (hourMatch) {
        const value = Number(hourMatch[1]);
        return Number.isFinite(value) ? value : null;
    }

    const minuteMatch = text.match(/\b(\d+)\s*(minute|minutes|min|mins|m)\b/i);
    if (minuteMatch) {
        const value = Number(minuteMatch[1]);
        return Number.isFinite(value) ? value / 60 : null;
    }

    if (/\b(day|days|week|weeks|month|months|year|years)\b/.test(text)) {
        return 24;
    }

    return null;
}

function getListingAgeHours(listing) {
    if (listing && listing.postedAt) {
        const postedAtMs = new Date(listing.postedAt).getTime();
        if (!Number.isNaN(postedAtMs)) {
            return (Date.now() - postedAtMs) / (60 * 60 * 1000);
        }
    }

    return getPostedTextAgeHours(listing && listing.postedText);
}

function isWithinListingWindow(listing, maxHours = HARD_MAX_LISTING_HOURS) {
    const ageHours = getListingAgeHours(listing);
    if (!Number.isFinite(ageHours)) {
        return true;
    }

    return ageHours <= maxHours;
}

function getSessionButtons() {
    return {
        start: document.getElementById('startSessionBtn'),
        viewer: document.getElementById('openSessionViewerBtn'),
        logoutFacebook: document.getElementById('logoutFacebookSessionBtn'),
        refresh: document.getElementById('refreshSessionBtn'),
    };
}

function setSessionButtonsDisabled(disabled) {
    const buttons = getSessionButtons();
    Object.values(buttons).forEach((button) => {
        if (button) {
            button.disabled = disabled;
        }
    });
}

function setSessionButtonsVisibility(status) {
    const buttons = getSessionButtons();
    const hasSession = Boolean(status && status.exists);
    const loginInProgress = Boolean(status && status.loginInProgress);
    const hasViewerUrl = Boolean(status && status.loginViewerUrl);

    if (hasSession) {
        buttons.start.hidden = true;
        buttons.viewer.hidden = true;
        buttons.logoutFacebook.hidden = false;
        buttons.refresh.hidden = false;
        return;
    }

    buttons.start.hidden = false;
    buttons.viewer.hidden = !(loginInProgress && hasViewerUrl);
    buttons.logoutFacebook.hidden = true;
    buttons.refresh.hidden = false;
}

function renderSessionAuthIssue(status) {
    const holder = document.getElementById('sessionAuthIssue');
    if (!holder) {
        return;
    }

    const issue = status?.sessionAuthIssue;
    if (!issue || !issue.message) {
        holder.style.display = 'none';
        holder.innerHTML = '';
        return;
    }

    const detectedAt = issue.detectedAt
        ? new Date(issue.detectedAt).toLocaleString()
        : 'recently';
    const filterKeyword = issue.filter?.keyword || 'unknown';
    const filterLocation = issue.filter?.location || 'unknown';

    holder.style.display = 'block';
    holder.innerHTML = `
      <span class="badge warn">Facebook Session Error</span><br/>
      ${escapeHtml(issue.message)}<br/>
      Detected: ${escapeHtml(detectedAt)}<br/>
      Filter: ${escapeHtml(`${filterKeyword} @ ${filterLocation}`)}<br/>
      Action: Click <b>Login with Facebook</b> to reconnect your session.
    `;
}

function stopSessionStatusPolling() {
    if (sessionStatusPoller) {
        clearInterval(sessionStatusPoller);
        sessionStatusPoller = null;
    }
}

function ensureSessionStatusPolling() {
    if (sessionStatusPoller) {
        return;
    }

    sessionStatusPoller = setInterval(() => {
        loadSessionStatus();
    }, SESSION_STATUS_POLL_MS);
}

async function runSessionAction(action) {
    sessionActionInProgress = true;
    setSessionButtonsDisabled(true);
    try {
        await action();
    } finally {
        sessionActionInProgress = false;
        setSessionButtonsDisabled(false);
    }
}

function setSessionLoading(visible, message = 'Working...') {
    const loading = document.getElementById('sessionLoading');
    const loadingText = document.getElementById('sessionLoadingText');
    if (!loading || !loadingText) {
        return;
    }

    loading.style.display = visible ? 'block' : 'none';
    loadingText.textContent = message;
}

function updateSessionViewer(status) {
    const viewerWrap = document.getElementById('sessionViewerWrap');
    const viewerFrame = document.getElementById('sessionViewerFrame');
    const openViewerBtn = document.getElementById('openSessionViewerBtn');
    sessionViewerUrl = String(status?.loginViewerUrl || '').trim();

    if (!sessionViewerUrl || !status?.loginInProgress) {
        viewerWrap.style.display = 'none';
        viewerFrame.removeAttribute('src');
        openViewerBtn.hidden = true;
        return;
    }

    openViewerBtn.hidden = false;
    viewerWrap.style.display = 'block';

    if (viewerFrame.getAttribute('src') !== sessionViewerUrl) {
        viewerFrame.setAttribute('src', sessionViewerUrl);
    }
}

function authHeaders() {
    const token = getToken();
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };
}

function renderEmailDeliveryControls() {
    const toggleBtn = document.getElementById('toggleEmailSendingBtn');
    const status = document.getElementById('emailDeliveryStatus');

    if (!toggleBtn || !status) {
        return;
    }

    toggleBtn.classList.remove('danger', 'success');

    if (emailSendingEnabled) {
        toggleBtn.textContent = 'Pause Sending Emails';
        toggleBtn.classList.add('danger');
        status.innerHTML = '<span class="badge">Email Sending Active</span>';
        return;
    }

    toggleBtn.textContent = 'Resume Sending Emails';
    toggleBtn.classList.add('success');
    status.innerHTML = '<span class="badge warn">Email Sending Paused</span>';
}

function renderTelegramDeliveryControls() {
    const toggleBtn = document.getElementById('toggleTelegramSendingBtn');
    const status = document.getElementById('telegramDeliveryStatus');
    const notice = document.getElementById('telegramNotice');
    const hasUsername = Boolean(normalizeTelegramUsername(telegramUsername));

    if (!toggleBtn || !status) {
        return;
    }

    toggleBtn.classList.remove('danger', 'success');

    if (telegramSendingEnabled) {
        toggleBtn.textContent = 'Pause Telegram Alerts';
        toggleBtn.classList.add('danger');
        status.innerHTML = hasUsername
            ? `<span class="badge">Telegram Alerts Active</span> <span class="badge">${escapeHtml(displayTelegramUsername(telegramUsername))}</span>`
            : '<span class="badge">Telegram Alerts Active</span> <span class="badge warn">Fallback: chat id</span>';
        if (notice) {
            notice.textContent = hasUsername
                ? `Telegram recipient saved: ${displayTelegramUsername(telegramUsername)}`
                : 'No Telegram username saved. Using current bot chat-id fallback.';
        }
        return;
    }

    toggleBtn.textContent = 'Resume Telegram Alerts';
    toggleBtn.classList.add('success');
    status.innerHTML = hasUsername
        ? `<span class="badge warn">Telegram Alerts Paused</span> <span class="badge">${escapeHtml(displayTelegramUsername(telegramUsername))}</span>`
        : '<span class="badge warn">Telegram Alerts Paused</span> <span class="badge warn">Fallback: chat id</span>';
    if (notice) {
        notice.textContent = hasUsername
            ? `Telegram recipient saved: ${displayTelegramUsername(telegramUsername)}`
            : 'Set Telegram username to route by username. Until then, bot uses configured chat id.';
    }
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        ...options,
        headers: {
            ...(options.headers || {}),
            ...authHeaders(),
        },
    });

    if (response.status === 401) {
        localStorage.removeItem('swoop_token');
        location.href = '/';
        return null;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || 'Request failed');
    }

    return data;
}

async function ensureLogin() {
    const token = getToken();
    if (!token) {
        location.href = '/';
        return;
    }

    try {
        await api('/api/auth/me', { method: 'GET' });
    } catch (_error) {
        localStorage.removeItem('swoop_token');
        location.href = '/';
    }
}

async function loadEmail() {
    const data = await api('/api/settings/email');
    document.getElementById('receiverEmail').value = data.receiverEmail || '';
}

async function loadEmailDeliverySettings() {
    const data = await api('/api/settings/email-delivery');
    emailSendingEnabled = Boolean(data.emailSendingEnabled);
    renderEmailDeliveryControls();
}

async function loadTelegramRecipientSettings() {
    const data = await api('/api/settings/telegram-recipient');
    const input = document.getElementById('telegramUsername');

    telegramUsername = normalizeTelegramUsername(data.telegramUsername);

    if (input) {
        input.value = displayTelegramUsername(telegramUsername);
    }

    renderTelegramDeliveryControls();
}

async function loadTelegramDeliverySettings() {
    const data = await api('/api/settings/telegram-delivery');
    telegramSendingEnabled = Boolean(data.telegramSendingEnabled);

    if (typeof data.telegramUsername === 'string') {
        telegramUsername = normalizeTelegramUsername(data.telegramUsername);
        const input = document.getElementById('telegramUsername');
        if (input) {
            input.value = displayTelegramUsername(telegramUsername);
        }
    }

    renderTelegramDeliveryControls();
}

async function saveEmail(event) {
    event.preventDefault();
    const notice = document.getElementById('emailNotice');
    const receiverEmail = document.getElementById('receiverEmail').value.trim();
    notice.textContent = 'Saving...';

    try {
        await api('/api/settings/email', {
            method: 'PUT',
            body: JSON.stringify({ receiverEmail }),
        });
        notice.textContent = 'Receiver email saved.';
    } catch (error) {
        notice.textContent = error.message;
    }
}

async function sendTestEmail() {
    const notice = document.getElementById('emailNotice');
    notice.textContent = 'Sending test email...';

    try {
        const result = await api('/api/notifications/test', { method: 'POST' });
        notice.textContent = `Test email sent. Message ID: ${result.result?.messageId || 'N/A'}`;
    } catch (error) {
        notice.textContent = error.message;
    }
}

async function toggleEmailSending() {
    const notice = document.getElementById('emailNotice');
    const toggleBtn = document.getElementById('toggleEmailSendingBtn');
    const nextEnabled = !emailSendingEnabled;
    const nextActionLabel = nextEnabled ? 'Resuming' : 'Pausing';

    toggleBtn.disabled = true;
    notice.textContent = `${nextActionLabel} email alerts...`;

    try {
        const data = await api('/api/settings/email-delivery', {
            method: 'PUT',
            body: JSON.stringify({ emailSendingEnabled: nextEnabled }),
        });

        emailSendingEnabled = Boolean(data.emailSendingEnabled);
        renderEmailDeliveryControls();
        notice.textContent = emailSendingEnabled
            ? 'Email alerts resumed. Only newly scraped listings will be emailed.'
            : 'Email alerts paused. Scraping will continue without sending emails.';
    } catch (error) {
        notice.textContent = error.message;
    } finally {
        toggleBtn.disabled = false;
    }
}

async function sendTestTelegram() {
    const notice = document.getElementById('telegramNotice');
    notice.textContent = 'Sending test Telegram message...';

    try {
        const result = await api('/api/notifications/test-telegram', { method: 'POST' });
        notice.textContent = result.message || 'Telegram test request completed.';
    } catch (error) {
        notice.textContent = error.message;
    }
}

async function saveTelegramRecipient(event) {
    event.preventDefault();
    const notice = document.getElementById('telegramNotice');
    const input = document.getElementById('telegramUsername');
    const normalized = normalizeTelegramUsername(input.value);

    if (normalized && !isValidTelegramUsername(normalized)) {
        notice.textContent = 'Invalid Telegram username. Use letters/numbers/underscore, 5-32 chars.';
        return;
    }

    notice.textContent = normalized
        ? 'Saving Telegram username...'
        : 'Clearing Telegram username and switching to default chat-id...';

    try {
        const result = await api('/api/settings/telegram-recipient', {
            method: 'PUT',
            body: JSON.stringify({ telegramUsername: normalized }),
        });

        telegramUsername = normalizeTelegramUsername(result.telegramUsername);
        input.value = displayTelegramUsername(telegramUsername);
        renderTelegramDeliveryControls();
        notice.textContent = telegramUsername
            ? `Telegram username saved: ${displayTelegramUsername(telegramUsername)}`
            : 'Telegram username cleared. Default chat-id recipient is active.';
    } catch (error) {
        notice.textContent = error.message;
    }
}

async function toggleTelegramSending() {
    const notice = document.getElementById('telegramNotice');
    const toggleBtn = document.getElementById('toggleTelegramSendingBtn');
    const nextEnabled = !telegramSendingEnabled;
    const nextActionLabel = nextEnabled ? 'Resuming' : 'Pausing';

    toggleBtn.disabled = true;
    notice.textContent = `${nextActionLabel} Telegram alerts...`;

    try {
        const data = await api('/api/settings/telegram-delivery', {
            method: 'PUT',
            body: JSON.stringify({ telegramSendingEnabled: nextEnabled }),
        });

        telegramSendingEnabled = Boolean(data.telegramSendingEnabled);
        renderTelegramDeliveryControls();
        notice.textContent = telegramSendingEnabled
            ? 'Telegram alerts resumed.'
            : 'Telegram alerts paused.';
    } catch (error) {
        notice.textContent = error.message;
    } finally {
        toggleBtn.disabled = false;
    }
}

async function createFilter(event) {
    event.preventDefault();
    const notice = document.getElementById('filterNotice');
    notice.textContent = 'Creating filter...';

    const payload = {
        keyword: document.getElementById('keyword').value.trim(),
        location: document.getElementById('location').value.trim(),
        cities: document.getElementById('cities').value.trim() || undefined,
        kmRadius: document.getElementById('kmRadius').value ? parseInt(document.getElementById('kmRadius').value) : undefined,
        minPrice: document.getElementById('minPrice').value || null,
        maxPrice: document.getElementById('maxPrice').value || null,
        yearFrom: document.getElementById('yearFrom').value ? parseInt(document.getElementById('yearFrom').value) : undefined,
        yearTo: document.getElementById('yearTo').value ? parseInt(document.getElementById('yearTo').value) : undefined,
        kmDrivenMin: document.getElementById('kmDrivenMin').value ? parseInt(document.getElementById('kmDrivenMin').value) : undefined,
        kmDrivenMax: document.getElementById('kmDrivenMax').value ? parseInt(document.getElementById('kmDrivenMax').value) : undefined,
        priority: document.getElementById('priority').value || 'medium',
    };

    try {
        await api('/api/filters', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        notice.textContent = 'Filter created.';
        event.target.reset();
        await loadFilters();
    } catch (error) {
        notice.textContent = error.message;
    }
}

function renderFilterRow(filter) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
    <td><input data-role="keyword" value="${filter.keyword || ''}" /></td>
    <td><input data-role="location" value="${filter.location || ''}" /></td>
    <td><input data-role="cities" value="${filter.cities || ''}" placeholder="City1, City2" /></td>
    <td><input data-role="kmRadius" type="number" min="0" value="${filter.kmRadius ?? ''}" placeholder="km" /></td>
    <td><input data-role="minPrice" type="number" min="0" value="${filter.minPrice ?? ''}" /></td>
    <td><input data-role="maxPrice" type="number" min="0" value="${filter.maxPrice ?? ''}" /></td>
    <td><input data-role="yearFrom" type="number" min="1900" max="2100" value="${filter.yearFrom ?? ''}" placeholder="From" /></td>
    <td><input data-role="yearTo" type="number" min="1900" max="2100" value="${filter.yearTo ?? ''}" placeholder="To" /></td>
    <td><input data-role="kmDrivenMin" type="number" min="0" value="${filter.kmDrivenMin ?? ''}" placeholder="Min km" /></td>
    <td><input data-role="kmDrivenMax" type="number" min="0" value="${filter.kmDrivenMax ?? ''}" placeholder="Max km" /></td>
        <td>
            <select data-role="priority">
                <option value="high" ${filter.priority === 'high' ? 'selected' : ''}>High</option>
                <option value="medium" ${!filter.priority || filter.priority === 'medium' ? 'selected' : ''}>Medium</option>
                <option value="low" ${filter.priority === 'low' ? 'selected' : ''}>Low</option>
            </select>
        </td>
    <td>
      <div class="row">
        <button data-role="save" data-id="${filter.id}" style="max-width: 120px;">Save</button>
        <button data-role="delete" data-id="${filter.id}" class="secondary" style="max-width: 120px;">Delete</button>
      </div>
    </td>
  `;
    return tr;
}

async function loadFilters() {
    const notice = document.getElementById('filterManageNotice');
    const tbody = document.getElementById('filterBody');
    notice.textContent = 'Loading filters...';

    try {
        const filters = await api('/api/filters');
        tbody.innerHTML = '';

        for (const filter of filters) {
            tbody.appendChild(renderFilterRow(filter));
        }

        if (filters.length === 0) {
            notice.textContent = 'No filters found.';
            return;
        }

        notice.textContent = `${filters.length} filters loaded.`;
    } catch (error) {
        notice.textContent = error.message;
    }
}

async function onFilterTableClick(event) {
    const button = event.target.closest('button[data-role]');
    if (!button) {
        return;
    }

    const role = button.dataset.role;
    const id = button.dataset.id;
    const row = button.closest('tr');
    const notice = document.getElementById('filterManageNotice');

    if (!id || !row) {
        return;
    }

    if (role === 'delete') {
        if (!window.confirm('Delete this filter?')) {
            return;
        }

        notice.textContent = 'Deleting filter...';
        try {
            await api(`/api/filters/${id}`, { method: 'DELETE' });
            notice.textContent = 'Filter deleted.';
            await loadFilters();
        } catch (error) {
            notice.textContent = error.message;
        }
        return;
    }

    if (role === 'save') {
        const payload = {
            keyword: row.querySelector('input[data-role="keyword"]').value.trim(),
            location: row.querySelector('input[data-role="location"]').value.trim(),
            cities: row.querySelector('input[data-role="cities"]').value.trim() || undefined,
            kmRadius: row.querySelector('input[data-role="kmRadius"]').value ? parseInt(row.querySelector('input[data-role="kmRadius"]').value) : undefined,
            minPrice: row.querySelector('input[data-role="minPrice"]').value || null,
            maxPrice: row.querySelector('input[data-role="maxPrice"]').value || null,
            yearFrom: row.querySelector('input[data-role="yearFrom"]').value ? parseInt(row.querySelector('input[data-role="yearFrom"]').value) : undefined,
            yearTo: row.querySelector('input[data-role="yearTo"]').value ? parseInt(row.querySelector('input[data-role="yearTo"]').value) : undefined,
            kmDrivenMin: row.querySelector('input[data-role="kmDrivenMin"]').value ? parseInt(row.querySelector('input[data-role="kmDrivenMin"]').value) : undefined,
            kmDrivenMax: row.querySelector('input[data-role="kmDrivenMax"]').value ? parseInt(row.querySelector('input[data-role="kmDrivenMax"]').value) : undefined,
            priority: row.querySelector('select[data-role="priority"]').value || 'medium',
        };

        notice.textContent = 'Saving filter...';
        try {
            await api(`/api/filters/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload),
            });
            notice.textContent = 'Filter updated.';
            await loadFilters();
        } catch (error) {
            notice.textContent = error.message;
        }
    }
}

async function loadListings(options = {}) {
    const { refresh = false } = options;
    const notice = document.getElementById('listingNotice');
    const tbody = document.getElementById('listingBody');
    notice.textContent = refresh ? 'Fetching latest listings from Facebook...' : 'Loading listings...';

    try {
        const endpoint = refresh ? '/api/listings?limit=40&refresh=true' : '/api/listings?limit=40';
        const listings = await api(endpoint);
        const visibleListings = listings.filter((listing) => isWithinListingWindow(listing));
        const staleFilteredCount = listings.length - visibleListings.length;
        tbody.innerHTML = '';

        if (refresh && visibleListings.length === 0) {
            notice.textContent = 'No fresh listings found in the configured freshness window. Reconnect Facebook session and refresh again.';
            return;
        }

        for (const listing of visibleListings) {
            const tr = document.createElement('tr');
            const imageSrc = toImageProxyUrl(listing.image);
            const imageCell = imageSrc
                ? `<img src="${escapeHtml(imageSrc)}" alt="listing" loading="lazy" style="width:72px;height:54px;object-fit:cover;border-radius:4px;" />`
                : 'N/A';
            const postedDisplay = escapeHtml(formatPosted(listing));
            const postedSourceBadge = getPostedSourceBadge(listing);
            const description = listing.description
                ? `${escapeHtml(listing.description).slice(0, 120)}${listing.description.length > 120 ? '...' : ''}`
                : 'N/A';

            tr.innerHTML = `
        <td>${imageCell}</td>
        <td>${escapeHtml(listing.vehicleName || listing.title || 'N/A')}</td>
        <td>${listing.modelYear || 'N/A'}</td>
        <td>${formatPrice(listing.price)}</td>
        <td>${escapeHtml(listing.mileageText || 'N/A')}</td>
        <td>${escapeHtml(listing.location || 'N/A')}</td>
                <td>${postedDisplay}<br/>${postedSourceBadge}</td>
        <td>${description}</td>
        <td><a href="${escapeHtml(listing.url)}" target="_blank" rel="noopener noreferrer">Open</a></td>
      `;
            tbody.appendChild(tr);
        }

        notice.textContent = staleFilteredCount > 0
            ? `${visibleListings.length} listings loaded (${staleFilteredCount} older than ${HARD_MAX_LISTING_HOURS}h hidden).`
            : `${visibleListings.length} listings loaded.`;
    } catch (error) {
        notice.textContent = error.message;
    }
}

async function loadSessionStatus() {
    const holder = document.getElementById('sessionStatus');

    try {
        if (!sessionActionInProgress) {
            setSessionLoading(true, 'Refreshing Facebook session status...');
        }

        const data = await api('/api/facebook-session/status');
        updateSessionViewer(data);
        renderSessionAuthIssue(data);

        if (data.loginInProgress) {
            ensureSessionStatusPolling();
        } else {
            stopSessionStatusPolling();
        }

        if (!data.exists) {
            const autoSaveText = data.loginInProgress
                ? '<br/>Auto-save is watching for successful login and will store session automatically.'
                : '';
            const viewerLink = data.loginInProgress && data.loginViewerUrl
                ? '<br/>Login Screen is available below.'
                : '';
            holder.innerHTML = `<span class="badge warn">No Facebook session found</span><br/>${data.hint || ''}<br/>Login in progress: ${data.loginInProgress ? 'Yes' : 'No'}${autoSaveText}${viewerLink}`;
            setSessionButtonsVisibility(data);
            return;
        }

        const autoSaved = data.lastAutoSavedAt ? `<br/>Auto-saved: ${new Date(data.lastAutoSavedAt).toLocaleString()}` : '';
        holder.innerHTML = `<span class="badge">Session Ready</span><br/>Updated: ${new Date(data.updatedAt).toLocaleString()}<br/>Cookies: ${data.cookieCount || 0}<br/>File size: ${data.size || 0} bytes${autoSaved}`;
        setSessionButtonsVisibility(data);
    } catch (error) {
        stopSessionStatusPolling();
        renderSessionAuthIssue(null);
        holder.textContent = error.message;
    } finally {
        if (!sessionActionInProgress) {
            setSessionLoading(false);
        }
    }
}

async function startFacebookLogin() {
    await runSessionAction(async () => {
        const holder = document.getElementById('sessionStatus');
        setSessionLoading(true, 'Starting Facebook login...');
        holder.textContent = 'Starting Facebook login window (auto-save enabled)...';

        try {
            const data = await api('/api/facebook-session/start', { method: 'POST' });
            updateSessionViewer(data);
            holder.innerHTML = `${data.message}<br/>Login in progress: ${data.loginInProgress ? 'Yes' : 'No'}<br/>Open Login Screen, complete sign-in, and session will auto-save automatically.`;
            setSessionButtonsVisibility(data);
            if (data.loginInProgress) {
                ensureSessionStatusPolling();
            }
        } catch (error) {
            holder.textContent = error.message;
        } finally {
            setSessionLoading(false);
        }
    });
}

async function logoutFacebookSession() {
    await runSessionAction(async () => {
        const holder = document.getElementById('sessionStatus');
        setSessionLoading(true, 'Clearing Facebook session...');
        holder.textContent = 'Removing saved Facebook session...';

        try {
            const data = await api('/api/facebook-session/logout', { method: 'POST' });
            updateSessionViewer(data);
            setSessionButtonsVisibility(data);
            holder.innerHTML = `<span class="badge warn">Facebook session cleared</span><br/>Login in progress: ${data.loginInProgress ? 'Yes' : 'No'}`;
            stopSessionStatusPolling();
        } catch (error) {
            holder.textContent = error.message;
        } finally {
            setSessionLoading(false);
        }
    });
}

function openSessionViewer() {
    if (!sessionViewerUrl) {
        const holder = document.getElementById('sessionStatus');
        holder.textContent = 'Login screen URL is not available yet. Click Login with Facebook first.';
        return;
    }

    const viewerWrap = document.getElementById('sessionViewerWrap');
    const viewerFrame = document.getElementById('sessionViewerFrame');

    viewerWrap.style.display = 'block';
    if (viewerFrame.getAttribute('src') !== sessionViewerUrl) {
        viewerFrame.setAttribute('src', sessionViewerUrl);
    }

    // For cross-origin noVNC links, open a new tab too because some CSP/proxy policies block iframe embedding.
    try {
        const target = new URL(sessionViewerUrl, window.location.href);
        if (target.origin !== window.location.origin) {
            window.open(target.toString(), '_blank', 'noopener,noreferrer');
            const holder = document.getElementById('sessionStatus');
            holder.innerHTML = `${holder.innerHTML}<br/>Opened Login Screen in a new tab (cross-origin fallback).`;
        }
    } catch (_error) {
        // Ignore URL parsing issues and rely on iframe attempt.
    }

    viewerWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function wireEvents() {
    document.getElementById('emailForm').addEventListener('submit', saveEmail);
    document.getElementById('telegramRecipientForm').addEventListener('submit', saveTelegramRecipient);
    document.getElementById('sendTestEmailBtn').addEventListener('click', sendTestEmail);
    document.getElementById('sendTestTelegramBtn').addEventListener('click', sendTestTelegram);
    document.getElementById('toggleEmailSendingBtn').addEventListener('click', toggleEmailSending);
    document.getElementById('toggleTelegramSendingBtn').addEventListener('click', toggleTelegramSending);
    document.getElementById('filterForm').addEventListener('submit', createFilter);
    document.getElementById('filterBody').addEventListener('click', onFilterTableClick);
    document.getElementById('refreshFiltersBtn').addEventListener('click', loadFilters);
    document.getElementById('refreshListingsBtn').addEventListener('click', () => loadListings({ refresh: true }));
    document.getElementById('refreshSessionBtn').addEventListener('click', loadSessionStatus);
    document.getElementById('startSessionBtn').addEventListener('click', startFacebookLogin);
    document.getElementById('openSessionViewerBtn').addEventListener('click', openSessionViewer);
    document.getElementById('logoutFacebookSessionBtn').addEventListener('click', logoutFacebookSession);
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('swoop_token');
        location.href = '/';
    });
}
document.addEventListener('DOMContentLoaded', () => {
    setInterval(() => {
        loadListings();
    }, 120000)
}
);

window.addEventListener('beforeunload', () => {
    stopSessionStatusPolling();
});

(async function init() {
    await ensureLogin();
    wireEvents();
    setSessionButtonsDisabled(false);
    await Promise.all([
        loadEmail(),
        loadEmailDeliverySettings(),
        loadTelegramRecipientSettings(),
        loadTelegramDeliverySettings(),
        loadSessionStatus(),
        loadFilters(),
        loadListings(),
    ]);
})();
