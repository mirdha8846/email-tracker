document.addEventListener('DOMContentLoaded', () => {
    const SERVER_URL = 'https://email-tracker-1-bfd1.onrender.com';

    const logsContainer = document.getElementById('logsContainer');
    const refreshBtn = document.getElementById('refreshBtn');
    const statSent = document.getElementById('statSent');
    const statOpened = document.getElementById('statOpened');

    // SVGs for UI
    const userIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
    const clockIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    // Format relative time (e.g., "2 hours ago")
    function timeAgo(dateParam) {
        if (!dateParam) return "Unknown";
        const date = typeof dateParam === 'object' ? dateParam : new Date(dateParam);
        const today = new Date();
        const seconds = Math.floor((today - date) / 1000);
        
        // Handle slight server/client clock desyncs (e.g. server is 2 seconds ahead)
        if (seconds < 30) return "Just now";

        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days === 1) return "Yesterday";
        return date.toLocaleDateString();
    }

    const fetchLogs = async () => {
        refreshBtn.style.animation = "spin 1s infinite linear";
        logsContainer.innerHTML = '<div class="loading-spinner"></div>';
        
        try {
            const response = await fetch(SERVER_URL + '/api/logs');
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            const data = await response.json();
            
            if (!Array.isArray(data) || data.length === 0) {
                logsContainer.innerHTML = `
                    <div class="empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5" style="margin-bottom:15px;">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                            <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                        <p>No tracking logs found yet.</p>
                        <p style="font-size:12px; margin-top:5px;">Send an email from Gmail to start tracking.</p>
                    </div>`;
                statSent.textContent = "0";
                statOpened.textContent = "0";
                return;
            }

            // Update stats
            statSent.textContent = data.length;
            const openedCount = data.filter(log => log.opened).length;
            statOpened.textContent = openedCount;

            logsContainer.innerHTML = '';
            
            data.forEach(log => {
                const item = document.createElement('div');
                item.className = `log-item ${log.opened ? 'opened' : ''}`;
                
                // Ensure proper UTC parsing. If the old SQLite DB didn't push 'Z', force it to UTC.
                let sentDateStr = log.sent_at;
                let openedDateStr = log.opened_at;
                if (sentDateStr && !sentDateStr.includes('T')) sentDateStr = sentDateStr.replace(' ', 'T') + 'Z';
                if (openedDateStr && !openedDateStr.includes('T')) openedDateStr = openedDateStr.replace(' ', 'T') + 'Z';

                const sentDate = sentDateStr ? new Date(sentDateStr) : null;
                const openedDate = openedDateStr ? new Date(openedDateStr) : null;

                const statusClass = log.opened ? 'opened' : 'unread';
                const statusText = log.opened ? `Opened ${timeAgo(openedDate)}` : 'Unread / Pending';

                item.innerHTML = `
                    <div class="subject" title="${escapeHtml(log.subject)}">${escapeHtml(log.subject)}</div>
                    <div class="details">${userIcon} ${escapeHtml(log.recipient)}</div>
                    <div class="details">${clockIcon} Sent ${timeAgo(sentDate)}</div>
                    <div class="status ${statusClass}">
                        <div class="status-dot"></div>
                        ${statusText}
                    </div>
                `;
                logsContainer.appendChild(item);
            });
        } catch (error) {
            logsContainer.innerHTML = `
                <div class="empty-state" style="color: #ef4444;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom:10px;">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <p>Connection Error</p>
                    <p style="font-size:12px;">Could not reach <b>${SERVER_URL}</b></p>
                </div>`;
            console.error('[Popup] Fetch error:', error);
        } finally {
            refreshBtn.style.animation = "";
        }
    };

    refreshBtn.addEventListener('click', fetchLogs);
    fetchLogs();
});
