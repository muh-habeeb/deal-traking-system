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
    const source = listing.postedAt || listing.createdAt;
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

let sessionStatusPoller = null;
let sessionViewerUrl = '';
let sessionActionInProgress = false;
let emailSendingEnabled = true;

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
    }, 3000);
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

async function createFilter(event) {
    event.preventDefault();
    const notice = document.getElementById('filterNotice');
    notice.textContent = 'Creating filter...';

    const payload = {
        keyword: document.getElementById('keyword').value.trim(),
        location: document.getElementById('location').value.trim(),
        minPrice: document.getElementById('minPrice').value || null,
        maxPrice: document.getElementById('maxPrice').value || null,
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
    <td><input data-role="minPrice" type="number" min="0" value="${filter.minPrice ?? ''}" /></td>
    <td><input data-role="maxPrice" type="number" min="0" value="${filter.maxPrice ?? ''}" /></td>
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
            minPrice: row.querySelector('input[data-role="minPrice"]').value || null,
            maxPrice: row.querySelector('input[data-role="maxPrice"]').value || null,
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

async function loadListings() {
    const notice = document.getElementById('listingNotice');
    const tbody = document.getElementById('listingBody');
    notice.textContent = 'Loading listings...';

    try {
        const listings = await api('/api/listings?limit=40');
        tbody.innerHTML = '';

        for (const listing of listings) {
            const tr = document.createElement('tr');
            const imageCell = listing.image
                ? `<img src="${escapeHtml(listing.image)}" alt="listing" style="width:72px;height:54px;object-fit:cover;border-radius:4px;" />`
                : 'N/A';
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
        <td>${escapeHtml(formatPosted(listing))}</td>
        <td>${description}</td>
        <td><a href="${escapeHtml(listing.url)}" target="_blank" rel="noopener noreferrer">Open</a></td>
      `;
            tbody.appendChild(tr);
        }

        notice.textContent = `${listings.length} listings loaded.`;
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
                ? `<br/>Login Screen: <a href="${escapeHtml(data.loginViewerUrl)}" target="_blank" rel="noopener noreferrer">Open</a>`
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

    window.open(sessionViewerUrl, '_blank', 'noopener,noreferrer');
}

function wireEvents() {
    document.getElementById('emailForm').addEventListener('submit', saveEmail);
    document.getElementById('sendTestEmailBtn').addEventListener('click', sendTestEmail);
    document.getElementById('toggleEmailSendingBtn').addEventListener('click', toggleEmailSending);
    document.getElementById('filterForm').addEventListener('submit', createFilter);
    document.getElementById('filterBody').addEventListener('click', onFilterTableClick);
    document.getElementById('refreshFiltersBtn').addEventListener('click', loadFilters);
    document.getElementById('refreshListingsBtn').addEventListener('click', loadListings);
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
    await Promise.all([loadEmail(), loadEmailDeliverySettings(), loadSessionStatus(), loadFilters(), loadListings()]);
})();
