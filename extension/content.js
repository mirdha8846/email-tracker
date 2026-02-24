console.log("Stealth Email Tracker content script injected.");

const SERVER_URL = 'https://email-tracker-cy15.onrender.com';

function injectTracker(composeView) {
    if (composeView.dataset.stealthTracked) return;
    
    // Find the Send button
    const sendBtn = composeView.querySelector('.dC') || composeView.querySelector('[aria-label^="Send"]');
    if (!sendBtn) return;
    
    // Mark compose window as initialized to prevent duplicate listeners
    composeView.dataset.stealthTracked = 'true';
    console.log("Found compose window, attaching tracker...");

    const onSend = () => {
        // Prevent double tracking if user clicks send twice rapidly
        if (composeView.dataset.stealthSent) return;
        composeView.dataset.stealthSent = 'true';

        const contentArea = composeView.querySelector('div[aria-label="Message Body"], div[g_editable="true"]');
        if (!contentArea) return;

        const trackingId = crypto.randomUUID();
        
        const subjectInput = composeView.querySelector('input[name="subjectbox"]') || composeView.querySelector('input[placeholder="Subject"]');
        const toField = composeView.querySelector('[name="to"], .vO');
        
        const subject = subjectInput ? subjectInput.value : 'No Subject';
        const recipient = toField ? (toField.value || toField.innerText.replace(/\n/g, ', ')) : 'Unknown';

        // Inject the invisible pixel directly into the email body
        const pixelUrl = SERVER_URL + '/track/' + trackingId;
        const imgHtml = `<img src="${pixelUrl}" alt="stealth-tracker" width="1" height="1" style="opacity:0.01;position:absolute;z-index:-1;" />`;
        contentArea.insertAdjacentHTML('beforeend', imgHtml);
        
        console.log("Stealth tracking pixel injected! ID:", trackingId);

        // Notify server immediately
        fetch(SERVER_URL + '/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: trackingId, subject: subject, recipient: recipient })
        }).catch(err => console.error("Failed to register tracking ID", err));
    };

    // Listen on the Send button click (capture phase so it runs before Gmail sends it)
    sendBtn.addEventListener('click', onSend, true);
    
    // Listen for Ctrl+Enter within the compose view
    composeView.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            onSend();
        }
    }, true);
}

// Periodically check for new compose windows (more reliable than MutationObserver on Gmail's dynamic DOM)
setInterval(() => {
    const dialogs = document.querySelectorAll('table.M9, [role="dialog"]');
    dialogs.forEach(dialog => injectTracker(dialog));
}, 1000);
