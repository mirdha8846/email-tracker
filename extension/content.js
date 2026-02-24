// Stealth Email Tracker Content Script for Gmail

console.log("Stealth Email Tracker content script injected.");

// Change this back to http://localhost:3000 if you test locally again
const SERVER_URL = 'https://email-tracker-cy15.onrender.com';

// Store tracking IDs temporarily for the current compose session
const activeTrackings = new Map();

// Helper to wait for elements
function waitForElement(selector, parent = document) {
    return new Promise(resolve => {
        if (parent.querySelector(selector)) {
            return resolve(parent.querySelector(selector));
        }

        const observer = new MutationObserver(mutations => {
            if (parent.querySelector(selector)) {
                resolve(parent.querySelector(selector));
                observer.disconnect();
            }
        });

        observer.observe(parent, {
            childList: true,
            subtree: true
        });
    });
}

// Intercept new compose windows
async function observeComposeWindows() {
    const observer = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Look for the compose window (usually starts with a role="dialog" or specific class)
                    // The class '.M9' is commonly the outer table of a compose window, but a safer bet is to look for the "Send" button container.
                    const composeView = node.querySelector ? node.querySelector('.M9, .aYF, [role="dialog"]') : null;
                    const isDialog = node.getAttribute && node.getAttribute('role') === 'dialog';
                    
                    if (composeView || isDialog || node.classList?.contains('M9')) {
                        let target = composeView || node;
                        if (!target.classList) continue;
                        requestTrackingForCompose(target);
                    }
                }
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

async function requestTrackingForCompose(composeNode) {
    if (composeNode.dataset.stealthTrackerInitialized) return;
    composeNode.dataset.stealthTrackerInitialized = 'true';

    // Generate a new tracking ID locally so we don't spam the DB with drafts
    try {
        const trackingId = crypto.randomUUID();
        const data = {
            trackingId: trackingId,
            pixelUrl: SERVER_URL + '/track/' + trackingId
        };
        
        console.log("Tracking ID prepared locally:", data.trackingId);
        
        // Wait for the send button
        // Gmail send button usually has class '.dC' and role='button' with inner text "Send", or aria-label "Send \u202a(Ctrl-Enter)\u202c"
        // Safest is to find the compose form
        
        const form = composeNode.closest ? composeNode.closest('form') : null;
        if (!form) {
            // Wait for the content area
            const contentArea = await waitForElement('div[aria-label="Message Body"], div[g_editable="true"]', composeNode);
            const sendBtn = await waitForElement('.dC, [aria-label*="Send"]', composeNode);
            
            if (contentArea && sendBtn) {
                setupSendInterceptor(composeNode, contentArea, sendBtn, data);
            }
        }
    } catch (err) {
        console.error("Failed to initialize tracking for this email:", err);
    }
}

function setupSendInterceptor(composeNode, contentArea, sendBtn, trackingData) {
    // Attach listener to the send button
    
    const onSend = async () => {
        if (composeNode.dataset.stealthTrackerSent) return;
        composeNode.dataset.stealthTrackerSent = 'true';

        // Find subject and recipient
        const subjectInput = composeNode.querySelector('input[name="subjectbox"]') || composeNode.querySelector('input[placeholder="Subject"]');
        const recipientsInput = composeNode.querySelector('[name="to"]') || composeNode.querySelector('.vO'); // Class for "To" field

        const subject = subjectInput ? subjectInput.value : 'No Subject';
        const recipient = recipientsInput ? (recipientsInput.value || recipientsInput.innerText) : 'Unknown';

        // Inject the pixel into the message body right before it sends
        try {
            const img = document.createElement('img');
            img.src = trackingData.pixelUrl;
            img.width = 1;
            img.height = 1;
            img.style.display = 'none'; // Keep it hidden
            img.setAttribute('data-stealth-tracker', 'true');
            
            // Append to body
            contentArea.appendChild(img);
            console.log("Tracking pixel injected!");

            // Register with backend asynchronously
            fetch(SERVER_URL + '/api/track', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: trackingData.trackingId, subject: subject, recipient: recipient })
            }).catch(function(err) {
                console.error("Failed to register track id on backend", err);
            });
            
            
        } catch (err) {
            console.error("Failed to update tracking info before sending", err);
        }
    };

    // Listeners for click and Ctrl+Enter
    sendBtn.addEventListener('click', onSend, true); // true for capture phase to ensure it runs before Gmail's send logic
    
    composeNode.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            onSend();
        }
    }, true);
}

// Start observing
observeComposeWindows();

// Also check if there's already a compose window open (e.g., loaded directly or clicked mailto)
setTimeout(() => {
    const dialogs = document.querySelectorAll('[role="dialog"]');
    dialogs.forEach(dialog => {
        if (dialog.querySelector('div[aria-label="Message Body"]')) {
            requestTrackingForCompose(dialog);
        }
    });
}, 2000);
