document.addEventListener('DOMContentLoaded', () => {
    // PASTE YOUR NGROK URL HERE (e.g., 'https://1a2b3c4d.ngrok.app')
const SERVER_URL = 'https://6c4b-14-139-197-66.ngrok-free.app';

    const logsContainer = document.getElementById('logsContainer');
    const refreshBtn = document.getElementById('refreshBtn');

    /**
     * Safely escape HTML to prevent XSS from malicious email subjects/recipients
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    const fetchLogs = async () => {
        logsContainer.innerHTML = '<p>Loading logs...</p>';
        try {
            const response = await fetch(SERVER_URL + '/api/logs', {
                headers: {
                    'ngrok-skip-browser-warning': 'true'
                }
            });
            if (!response.ok) throw new Error(`Server error: ${response.status}`);
            const data = await response.json();
            
            if (!Array.isArray(data) || data.length === 0) {
                logsContainer.innerHTML = '<p>No tracking logs found yet.</p>';
                return;
            }

            logsContainer.innerHTML = '';
            data.forEach(log => {
                const item = document.createElement('div');
                item.className = `log-item ${log.opened ? 'opened' : ''}`;
                
                const safeSentDate = log.sent_at ? log.sent_at.replace(' ', 'T') + 'Z' : '';
                const safeOpenedDate = log.opened_at ? log.opened_at.replace(' ', 'T') + 'Z' : '';

                const sentDate = safeSentDate ? new Date(safeSentDate).toLocaleString() : 'Unknown Time';
                const openedDate = safeOpenedDate ? new Date(safeOpenedDate).toLocaleString() : 'Not opened yet';
                
                const statusClass = log.opened ? 'opened' : 'unread';
                const statusText = log.opened ? '&#10003; Opened on ' + escapeHtml(openedDate) : 'Unread';

                // Use escapeHtml for all user-sourced data to prevent XSS
                item.innerHTML = '<p class="subject">' + escapeHtml(log.subject) + '</p>' +
                    '<p class="details">To: ' + escapeHtml(log.recipient) + '</p>' +
                    '<p class="details">Sent: ' + escapeHtml(sentDate) + '</p>' +
                    '<p class="status ' + statusClass + '">' + statusText + '</p>';
                logsContainer.appendChild(item);
            });
        } catch (error) {
            logsContainer.innerHTML = '<p style="color: red;">Error connecting to tracker backend. Is the server running?</p>';
            console.error('[Popup] Fetch error:', error);
        }
    };

    refreshBtn.addEventListener('click', fetchLogs);
    
    // Fetch on initial load
    fetchLogs();
});
