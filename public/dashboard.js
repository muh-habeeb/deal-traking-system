function getToken() {
    return localStorage.getItem('swoop_token');
}

function getSessionButtons() {
    return {
        start: document.getElementById('startSessionBtn'),
        save: document.getElementById('saveSessionBtn'),
        refresh: document.getElementById('refreshSessionBtn'),
        logout: document.getElementById('logoutSessionBtn'),
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

    if (hasSession) {
        buttons.start.hidden = true;
        buttons.save.hidden = true;
        buttons.refresh.hidden = false;
        buttons.logout.hidden = false;
        return;
    }

    buttons.start.hidden = false;
    buttons.save.hidden = false;
    buttons.refresh.hidden = true;
    buttons.logout.hidden = true;
}

async function runSessionAction(action) {
    setSessionButtonsDisabled(true);
    try {
        await action();
    } finally {
        setSessionButtonsDisabled(false);
    }
}

function authHeaders() {
    const token = getToken();
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };
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
            tr.innerHTML = `
        <td>${listing.title || 'N/A'}</td>
        <td>${listing.price !== null && listing.price !== undefined ? `CA$${listing.price}` : 'N/A'}</td>
        <td>${listing.location || 'N/A'}</td>
        <td><a href="${listing.url}" target="_blank" rel="noopener noreferrer">Open</a></td>
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
        const data = await api('/api/facebook-session/status');
        if (!data.exists) {
            holder.innerHTML = `<span class="badge warn">No Facebook session found</span><br/>${data.hint || ''}<br/>Login in progress: ${data.loginInProgress ? 'Yes' : 'No'}`;
            setSessionButtonsVisibility(data);
            return;
        }

        holder.innerHTML = `<span class="badge">Session Ready</span><br/>Updated: ${new Date(data.updatedAt).toLocaleString()}<br/>Cookies: ${data.cookieCount || 0}<br/>File size: ${data.size || 0} bytes`;
        setSessionButtonsVisibility(data);
    } catch (error) {
        holder.textContent = error.message;
    }
}

async function startFacebookLogin() {
    await runSessionAction(async () => {
        const holder = document.getElementById('sessionStatus');
        holder.textContent = 'Starting Facebook login window...';

        try {
            const data = await api('/api/facebook-session/start', { method: 'POST' });
            holder.innerHTML = `${data.message}<br/>Login in progress: ${data.loginInProgress ? 'Yes' : 'No'}`;
            setSessionButtonsVisibility(data);
        } catch (error) {
            holder.textContent = error.message;
        }
    });
}

async function saveFacebookSession() {
    await runSessionAction(async () => {
        const holder = document.getElementById('sessionStatus');
        holder.textContent = 'Saving session...';

        try {
            const data = await api('/api/facebook-session/save', { method: 'POST' });
            holder.innerHTML = `${data.message}<br/>Updated: ${new Date(data.updatedAt).toLocaleString()}<br/>Cookies: ${data.cookieCount || 0}`;
            setSessionButtonsVisibility(data);
            window.alert('Facebook session saved successfully. Please refresh session status to confirm.');
        } catch (error) {
            holder.textContent = error.message;

        }
    });
}

async function logoutFacebookSession() {
    await runSessionAction(async () => {
        const holder = document.getElementById('sessionStatus');
        holder.textContent = 'Logging out Facebook session...';

        try {
            const data = await api('/api/facebook-session/logout', { method: 'POST' });
            holder.innerHTML = `${data.message}<br/>Session file exists: ${data.exists ? 'Yes' : 'No'}`;
            setSessionButtonsVisibility(data);
        } catch (error) {
            holder.textContent = error.message;
        }
    });
}

function wireEvents() {
    document.getElementById('emailForm').addEventListener('submit', saveEmail);
    document.getElementById('sendTestEmailBtn').addEventListener('click', sendTestEmail);
    document.getElementById('filterForm').addEventListener('submit', createFilter);
    document.getElementById('filterBody').addEventListener('click', onFilterTableClick);
    document.getElementById('refreshFiltersBtn').addEventListener('click', loadFilters);
    document.getElementById('refreshListingsBtn').addEventListener('click', loadListings);
    document.getElementById('refreshSessionBtn').addEventListener('click', loadSessionStatus);
    document.getElementById('startSessionBtn').addEventListener('click', startFacebookLogin);
    document.getElementById('saveSessionBtn').addEventListener('click', saveFacebookSession);
    document.getElementById('logoutSessionBtn').addEventListener('click', logoutFacebookSession);
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('swoop_token');
        location.href = '/';
    });
}
document.addEventListener('DOMContentLoaded', () => {
    setInterval(() => {
        loadListings();
    }, 10000)
}
);
(async function init() {
    await ensureLogin();
    wireEvents();
    setSessionButtonsDisabled(false);
    await Promise.all([loadEmail(), loadSessionStatus(), loadFilters(), loadListings()]);
})();
