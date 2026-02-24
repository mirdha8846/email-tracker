// Stealth Email Tracker Content Script for Gmail

console.log("Stealth Email Tracker content script injected.");

const SERVER_URL = 'https://email-tracker-cy15.onrender.com';

// Listen to all clicks on the document
document.body.addEventListener('click', (e) => {
    // If the click is on a "Send" button in Gmail
    let btn = e.target.closest('.dC') || e.target.closest('[data-tooltip^="Send"]') || e.target.closest('[aria-label^="Send"]');
    if (btn) {
        injectTracker(btn.closest('table, form, [role="dialog"], .M9'));
    }
}, true); // Use capture phase to ensure it runs before Gmail sends the DOM

// Wait for Ctrl+Enter (Send shortcut)
document.body.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        injectTracker(e.target.closest('table, form, [role="dialog"], .M9'));
    }
}, true);

// Function to inject tracking pixel
function injectTracker(composeNode) {
    if (!composeNode) return;
    
    // GUARANTEE NO DUPLICATES: Only inject once per compose window!
    if (composeNode.dataset.stealthTracked) return;
    composeNode.dataset.stealthTracked = 'true';
    
    // Find the email body area where you type
    const contentArea = composeNode.querySelector('div[aria-label="Message Body"], div[g_editable="true"]');
    if (!contentArea) return;

    // Generate Tracker ID immediately upon Send
    const trackingId = crypto.randomUUID();
    
    // Find Subject and To fields
    const subjectInput = composeNode.querySelector('input[name="subjectbox"]') || composeNode.querySelector('input[placeholder="Subject"]');
    const toField = composeNode.querySelector('[name="to"], .vO');

    const subject = subjectInput ? subjectInput.value : 'No Subject';
    const recipient = toField ? (toField.value || toField.innerText.replace(/\n/g, ', ')) : 'Unknown';

    // Inject the stealth pixel image HTML directly into the DOM
    // Notice loading="lazy" and display:none!
    const pixelUrl = SERVER_URL + '/track/' + trackingId;
    const imgHtml = `<img src="${pixelUrl}" alt="stealth-tracker" width="0" height="0" style="display:none; visibility:hidden;" loading="lazy" />`;
    
    contentArea.insertAdjacentHTML('beforeend', imgHtml);
    console.log("Stealth tracking pixel injected! ID:", trackingId);

    // Tell the backend to register this new tracking ID
    fetch(SERVER_URL + '/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: trackingId, subject: subject, recipient: recipient })
    }).catch(err => console.error("Failed to register tracking ID with backend.", err));
}
