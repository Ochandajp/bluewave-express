// Replace the adminLogin function with this:
async function adminLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const errorEl = document.getElementById('loginError');

    errorEl.classList.remove('active');
    
    if (!username || !password) {
        errorEl.textContent = 'Please enter both username and password';
        errorEl.classList.add('active');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            checkAuth();
        } else {
            errorEl.textContent = data.message || 'Login failed';
            errorEl.classList.add('active');
        }
    } catch (error) {
        console.error('Login error:', error);
        errorEl.innerHTML = `
            <div style="text-align: left;">
                <p>❌ Cannot connect to server</p>
                <p>🔍 Check: <a href="${API_URL}/api/test" target="_blank">Test API</a></p>
                <p>Error: ${error.message}</p>
            </div>
        `;
        errorEl.classList.add('active');
    }
}