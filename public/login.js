(function initLoginPage() {
  const token = localStorage.getItem('swoop_token');
  if (token) {
    location.href = '/dashboard';
    return;
  }

  const form = document.getElementById('loginForm');
  const notice = document.getElementById('notice');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    notice.textContent = 'Logging in...';

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) {
        notice.textContent = data.message || 'Login failed';
        return;
      }

      localStorage.setItem('swoop_token', data.token);
      location.href = '/dashboard';
    } catch (_error) {
      notice.textContent = 'Unable to reach server. Please try again.';
    }
  });
})();
