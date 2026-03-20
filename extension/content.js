console.log("Stealth Email Tracker content script injected.");

// PASTE YOUR NGROK URL HERE (e.g., 'https://1a2b3c4d.ngrok.app')
const SERVER_URL = 'https://6c4b-14-139-197-66.ngrok-free.app';

/**
 * Find the Send button by walking up from the compose area.
 * We track by Send button to guarantee one tracker per compose window.
 */
function findSendButton(container) {
    const selectors = [
        '[aria-label*="Send"]:not([aria-label*="Sending"])',
        '[data-tooltip*="Send"]',
        '.T-I.J-J5-Ji.aoO.v7.T-I-atl.L3',
        '.dC'
    ];
    for (const sel of selectors) {
        const btn = container.querySelector(sel);
        if (btn) return btn;
    }
    return null;
}

function getSubject(container) {
    const el = container.querySelector('input[name="subjectbox"]')
        || container.querySelector('input[placeholder="Subject"]')
        || container.querySelector('.aoD');
    return el ? (el.value || el.textContent || '').trim() || 'No Subject' : 'No Subject';
}

function getRecipient(container) {
    const el = container.querySelector('[name="to"]')
        || container.querySelector('.vO')
        || container.querySelector('[data-hovercard-id]');
    if (!el) return 'Unknown';
    return (el.value || el.innerText || '').replace(/\n/g, ', ').trim() || 'Unknown';
}

function getMessageBody(container) {
    return container.querySelector('div[aria-label="Message Body"]')
        || container.querySelector('div[g_editable="true"]')
        || container.querySelector('div[contenteditable="true"]');
}

/**
 * Core logic: we scan for Send buttons directly and use THEM as the dedup key.
 * This avoids duplicates from multiple container selectors matching nested elements
 * that all contain the same Send button.
 */
function scanAndAttach() {
    // Find all potential compose containers
    const containers = document.querySelectorAll('[role="dialog"], .M9, .nH .iN, .AD');
    
    containers.forEach(container => {
        const sendBtn = findSendButton(container);
        if (!sendBtn) return;
        
        // DEDUP KEY: mark the Send button itself, not the container
        // Multiple containers may find the same Send button — this prevents duplicates
        if (sendBtn.dataset.stealthTrackerAttached) return;
        sendBtn.dataset.stealthTrackerAttached = 'true';

        const body = getMessageBody(container);
        if (!body) return;

        console.log("[Stealth Tracker] Attached to compose window.");

        let sent = false;

        const onSend = () => {
            if (sent) return;
            sent = true;

            // Double-check: don't inject if pixel already exists in body
            if (body.querySelector('img[data-stealth-tracker]')) {
                console.log("[Stealth Tracker] Pixel already in body, skipping.");
                return;
            }

            const trackingId = crypto.randomUUID();
            const subject = getSubject(container);
            const recipient = getRecipient(container);

            // Inject invisible tracking pixel using industry-standard stealth format
            // CRITICAL: Appending .gif so ngrok automatically bypasses the HTML warning page!
            const pixelUrl = SERVER_URL + '/track/' + trackingId + '.gif';
            const img = document.createElement('img');
            img.src = pixelUrl;
            img.alt = '';
            img.width = 1;
            img.height = 1;
            img.setAttribute('aria-hidden', 'true');
            img.style.cssText = 'display:block; width:1px; height:1px; border:0; outline:none; text-decoration:none;';
            img.dataset.stealthTracker = 'true';
            body.appendChild(img);

            console.log("[Stealth Tracker] Pixel injected. ID:", trackingId, "To:", recipient);

            fetch(SERVER_URL + '/api/track', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true'
                },
                body: JSON.stringify({ id: trackingId, subject, recipient })
            })
            .then(r => { if (!r.ok) console.warn("[Stealth Tracker] Server:", r.status); })
            .catch(err => console.error("[Stealth Tracker] Register failed:", err));
        };

        // Capture phase — runs before Gmail's own send handler
        sendBtn.addEventListener('click', onSend, true);

        // Also capture Ctrl+Enter / Cmd+Enter
        container.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                onSend();
            }
        }, true);
    });
}

// Poll for new compose windows
setInterval(scanAndAttach, 1500);
