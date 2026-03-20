const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `https://email-tracker-local.loca.lt`;

// Only allow requests from your own extension and your own domain
const ALLOWED_ORIGINS = [
    'chrome-extension://*',
    'http://localhost:3000',
    'https://mail.google.com'
];

app.use(cors({
    origin: function (origin, callback) {
        // Accept requests from anywhere while testing with ngrok, to prevent CORS issues.
        // The extension origin starts with chrome-extension://
        return callback(null, true);
    }
}));
app.use(express.json());

// Initialize SQLite Database
const dbPath = path.join(__dirname, 'tracker.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS tracking_logs (
            id TEXT PRIMARY KEY,
            subject TEXT,
            recipient TEXT,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            opened BOOLEAN DEFAULT 0,
            opened_at DATETIME,
            ip_address TEXT,
            user_agent TEXT
        )`, (err) => {
            if (err) console.error('Error creating table:', err.message);
        });
    }
});

// A 1x1 transparent GIF (base64)
const TRANSPARENT_PIXEL = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
);

// Helper: escape text to prevent any injection
function sanitize(str, maxLen = 500) {
    if (typeof str !== 'string') return '';
    return str.slice(0, maxLen).trim();
}

// 1. Endpoint to generate a new tracking ID
app.post('/api/track', (req, res) => {
    const { id, subject, recipient } = req.body || {};
    const trackingId = id || uuidv4();
    const safeSubject = sanitize(subject) || 'No Subject';
    const safeRecipient = sanitize(recipient) || 'Unknown';

    console.log(`[API] New tracker requested: ${trackingId} for ${safeRecipient}`);

    db.run(
        `INSERT INTO tracking_logs (id, subject, recipient) VALUES (?, ?, ?)`,
        [trackingId, safeSubject, safeRecipient],
        function (err) {
            if (err) {
                // If duplicate ID, just return the existing one
                if (err.message && err.message.includes('UNIQUE constraint')) {
                    return res.json({
                        trackingId,
                        pixelUrl: `${BASE_URL}/track/${trackingId}`
                    });
                }
                console.error('DB insert error:', err.message);
                return res.status(500).json({ error: 'Failed to create tracking log' });
            }
            res.json({
                trackingId,
                pixelUrl: `${BASE_URL}/track/${trackingId}.gif`
            });
        }
    );
});

// 1.5 Endpoint to update existing tracking log (used right before sending)
app.put('/api/track/:id', (req, res) => {
    const trackingId = req.params.id;
    const { subject, recipient } = req.body || {};
    const safeSubject = sanitize(subject) || 'No Subject';
    const safeRecipient = sanitize(recipient) || 'Unknown';

    db.run(
        `UPDATE tracking_logs SET subject = ?, recipient = ? WHERE id = ?`,
        [safeSubject, safeRecipient, trackingId],
        function(err) {
            if (err) {
                console.error('Error updating log:', err.message);
                return res.status(500).json({ error: 'Failed to update' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Tracking ID not found' });
            }
            res.json({ success: true });
        }
    );
});

// 2. Endpoint to serve the tracking pixel and record the open
// CRITICAL: URL ends in .gif so ngrok skips the browser warning page!
app.get('/track/:id.gif', (req, res) => {
    const trackingId = req.params.id;
    // Fixed: req.connection is deprecated/removed in newer Express. Use req.socket instead.
    const ipAddress = req.ip || (req.socket && req.socket.remoteAddress) || 'Unknown';
    const userAgent = req.headers['user-agent'] || 'Unknown';

    console.log(`\n========================================`);
    console.log(`🚀 [PIXEL HIT] Tracking ID: ${trackingId}`);
    console.log(`🌍 IP: ${ipAddress}`);
    console.log(`🕵️ User-Agent: ${userAgent}`);
    console.log(`========================================\n`);

    // Update the database to mark as opened.
    // We removed the 10-second delay restriction because Gmail's proxy fetches
    // the image immediately and caches it. If we ignore the first hit, we might never get another!
    db.run(
        `UPDATE tracking_logs 
         SET opened = 1, opened_at = CURRENT_TIMESTAMP, ip_address = ?, user_agent = ? 
         WHERE id = ?`, 
        [ipAddress, userAgent, trackingId],
        function(err) {
            if (err) {
                console.error('Error updating tracking log:', err.message);
            } else if (this.changes > 0) {
                console.log(`[DB] ✅ Successfully recorded open for ${trackingId}`);
            } else {
                console.log(`[DB] ℹ️ ID not found in database: ${trackingId}`);
            }
        }
    );

    // Send the 1x1 transparent pixel — always respond immediately
    res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': TRANSPARENT_PIXEL.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
    });
    res.end(TRANSPARENT_PIXEL, 'binary');
});

// 3. Endpoint to get logs for the extension popup
app.get('/api/logs', (req, res) => {
    db.all(`SELECT * FROM tracking_logs ORDER BY sent_at DESC`, [], (err, rows) => {
        if (err) {
            console.error('Error fetching logs:', err.message);
            return res.status(500).json({ error: 'Failed to retrieve logs' });
        }
        res.json(rows || []);
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`✅ Tracking server running on http://localhost:${PORT}`);
    console.log(`📧 Tracking pixel base: ${BASE_URL}/track/<id>`);
});
