const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
// Change this to your public URL once hosted (e.g., 'https://my-email-tracker.onrender.com')
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());

// Initialize SQLite Database
const db = new sqlite3.Database('./tracker.db', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        db.run(`CREATE TABLE IF NOT EXISTS tracking_logs (
            id TEXT PRIMARY KEY,
            subject TEXT,
            recipient TEXT,
            sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            opened BOOLEAN DEFAULT 0,
            opened_at DATETIME,
            ip_address TEXT,
            user_agent TEXT
        )`);
    }
});

// A 1x1 transparent GIF (base64)
const TRANSPARENT_PIXEL = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
);

// 1. Endpoint to generate a new tracking ID
app.post('/api/track', (req, res) => {
    const { id, subject, recipient } = req.body || {};
    const trackingId = id || uuidv4();

    console.log(`[API] New tracker requested: ${trackingId} for ${recipient}`);

    db.run(
        `INSERT INTO tracking_logs (id, subject, recipient) VALUES (?, ?, ?)`,
        [trackingId, subject || 'No Subject', recipient || 'Unknown'],
        function (err) {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Failed to create tracking log' });
            }
            res.json({
                trackingId,
                pixelUrl: `${BASE_URL}/track/${trackingId}`
            });
        }
    );
});

// 1.5 Endpoint to update existing tracking log (used right before sending)
app.put('/api/track/:id', (req, res) => {
    const trackingId = req.params.id;
    const { subject, recipient } = req.body;

    db.run(
        `UPDATE tracking_logs SET subject = ?, recipient = ? WHERE id = ?`,
        [subject || 'No Subject', recipient || 'Unknown', trackingId],
        function(err) {
            if (err) {
                console.error("Error updating log:", err);
                return res.status(500).json({ error: 'Failed to update' });
            }
            res.json({ success: true });
        }
    );
});

// 2. Endpoint to serve the tracking pixel and record the open
app.get('/track/:id', (req, res) => {
    const trackingId = req.params.id;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    console.log(`[PIXEL] Fetched for ID: ${trackingId}`);
    console.log(`[PIXEL] IP: ${ipAddress}`);
    console.log(`[PIXEL] User-Agent: ${userAgent}`);

    // Prevent Gmail or Yahoo automated pre-fetching (Image Proxies) from registering as a true open
    // Google caches images by fetching them via GoogleImageProxy as soon as an email enters an inbox or sent folder.
    if (userAgent && (userAgent.includes('GoogleImageProxy') || userAgent.includes('yahoo'))) {
        console.log(`[PIXEL] Ignored automated pre-fetch proxy for ID: ${trackingId}`);
        res.writeHead(200, {
            'Content-Type': 'image/gif',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
        });
        return res.end(TRANSPARENT_PIXEL, 'binary');
    }

    // Update the database to mark as opened.
    // We no longer need an artificial delay because the sender's own Chrome extension
    // now blocks the pixel from loading locally.
    db.run(
        `UPDATE tracking_logs 
         SET opened = 1, opened_at = CURRENT_TIMESTAMP, ip_address = ?, user_agent = ? 
         WHERE id = ? AND opened = 0`, 
        [ipAddress, userAgent, trackingId],
        function(err) {
            if (err) console.error("Error updating tracking log:", err);
            if (this.changes > 0) {
                console.log(`[PIXEL] Successfully recorded open for ${trackingId}`);
            }
            // We can also insert into a separate table for multiple opens if we want, but keeping it simple.
        }
    );

    // Send the 1x1 transparent pixel
    res.writeHead(200, {
        'Content-Type': 'image/gif',
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
            return res.status(500).json({ error: 'Failed to retrieve logs' });
        }
        res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`Tracking server running on http://localhost:${PORT}`);
});
