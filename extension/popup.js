document.addEventListener('DOMContentLoaded', () => {
    // Change this back to http://localhost:3000 if you test locally again
    const SERVER_URL = 'https://email-tracker-cy15.onrender.com';

    const logsContainer = document.getElementById('logsContainer');
    const refreshBtn = document.getElementById('refreshBtn');

    const fetchLogs = async () => {
        logsContainer.innerHTML = '<p>Loading logs...</p>';
        try {
            const response = await fetch(SERVER_URL + '/api/logs');
            if (!response.ok) throw new Error('Failed to fetch');
            const data = await response.json();
            
            if (data.length === 0) {
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
                const statusText = log.opened ? '&#10003; Opened on ' + openedDate : 'Unread';

                item.innerHTML = '<p class="subject">' + log.subject + '</p>' +
                    '<p class="details">To: ' + log.recipient + '</p>' +
                    '<p class="details">Sent: ' + sentDate + '</p>' +
                    '<p class="status ' + statusClass + '">' + statusText + '</p>';
                logsContainer.appendChild(item);
            });
        } catch (error) {
            logsContainer.innerHTML = '<p style="color: red;">Error connecting to tracker backend. Is the server running?</p>';
            console.error(error);
        }
    };

    refreshBtn.addEventListener('click', fetchLogs);
    
    // Fetch on initial load
    fetchLogs();
});
