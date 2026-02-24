// Change this back to http://localhost:3000 if you test locally again
const SERVER_URL = 'https://email-tracker-cy15.onrender.com';

chrome.runtime.onInstalled.addListener(() => {
    console.log("Stealth Email Tracker active. Setting up rule to block sender's own tracking pixel.");
    
    // We block any image requests that match the SERVER_URL + '/track/' to prevent the
    // sender's own browser from inadvertently recording a false open when they hit Send
    // or when they look at their sent mail.
    const rule = {
        id: 1,
        priority: 1,
        action: { type: 'block' },
        condition: {
            urlFilter: '*email-tracker-cy15.onrender.com/track*',
            resourceTypes: ['image']
        }
    };

    chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1],
        addRules: [rule]
    });
});
