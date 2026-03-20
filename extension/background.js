// Background script for Stealth Email Tracker
// No blocking rules needed — the server-side 10-second delay handles Google's pre-fetch proxy.

chrome.runtime.onInstalled.addListener(() => {
    console.log("Stealth Email Tracker installed and active.");
});
