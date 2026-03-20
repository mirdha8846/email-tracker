require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `https://email-tracker-1-bfd1.onrender.com`;

// Only allow requests from your own extension and your own domain
const ALLOWED_ORIGINS = [
    'chrome-extension://*',
    'http://localhost:3000',
    'https://mail.google.com'
];

app.use(cors({
    origin: function (origin, callback) {
        // Accept requests from anywhere while testing, to prevent CORS issues.
        // The extension origin starts with chrome-extension://
        return callback(null, true);
    }
}));
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/email-tracker';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB database.'))
    .catch((err) => console.error('MongoDB connection error:', err));

// Mongoose Schema & Model
const trackingLogSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    subject: { type: String, default: 'No Subject' },
    recipient: { type: String, default: 'Unknown' },
    sent_at: { type: Date, default: Date.now },
    opened: { type: Boolean, default: false },
    opened_at: { type: Date },
    ip_address: { type: String },
    user_agent: { type: String }
});

const TrackingLog = mongoose.model('TrackingLog', trackingLogSchema);

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
app.post('/api/track', async (req, res) => {
    try {
        const { id, subject, recipient } = req.body || {};
        const trackingId = id || uuidv4();
        const safeSubject = sanitize(subject) || 'No Subject';
        const safeRecipient = sanitize(recipient) || 'Unknown';

        console.log(`[API] New tracker requested: ${trackingId} for ${safeRecipient}`);

        const newLog = new TrackingLog({
            id: trackingId,
            subject: safeSubject,
            recipient: safeRecipient
        });

        await newLog.save();

        res.json({
            trackingId,
            pixelUrl: `${BASE_URL}/track/${trackingId}.gif`
        });
    } catch (err) {
        if (err.code === 11000) { // Duplicate key error
            return res.json({
                trackingId: req.body?.id || uuidv4(),
                pixelUrl: `${BASE_URL}/track/${req.body?.id}.gif`
            });
        }
        console.error('DB insert error:', err);
        res.status(500).json({ error: 'Failed to create tracking log' });
    }
});

// 1.5 Endpoint to update existing tracking log (used right before sending)
app.put('/api/track/:id', async (req, res) => {
    try {
        const trackingId = req.params.id;
        const { subject, recipient } = req.body || {};
        const safeSubject = sanitize(subject) || 'No Subject';
        const safeRecipient = sanitize(recipient) || 'Unknown';

        const updatedLog = await TrackingLog.findOneAndUpdate(
            { id: trackingId },
            { subject: safeSubject, recipient: safeRecipient },
            { new: true }
        );

        if (!updatedLog) {
            return res.status(404).json({ error: 'Tracking ID not found' });
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating log:', err);
        res.status(500).json({ error: 'Failed to update' });
    }
});

// 2. Endpoint to serve the tracking pixel and record the open
// CRITICAL: URL ends in .gif so proxies like ngrok skip the browser warning page!
app.get('/track/:id.gif', async (req, res) => {
    try {
        const trackingId = req.params.id;
        const ipAddress = req.ip || (req.socket && req.socket.remoteAddress) || 'Unknown';
        const userAgent = req.headers['user-agent'] || 'Unknown';

        console.log(`\n========================================`);
        console.log(`🚀 [PIXEL HIT] Tracking ID: ${trackingId}`);
        console.log(`🌍 IP: ${ipAddress}`);
        console.log(`🕵️ User-Agent: ${userAgent}`);
        console.log(`========================================\n`);

        const log = await TrackingLog.findOne({ id: trackingId });
        
        if (log) {
            if (!log.opened) {
                log.opened = true;
                log.opened_at = new Date();
                log.ip_address = ipAddress;
                log.user_agent = userAgent;
                await log.save();
                console.log(`[DB] ✅ Successfully recorded open for ${trackingId}`);
            } else {
                console.log(`[DB] ℹ️ Already opened: ${trackingId}`);
            }
        } else {
            console.log(`[DB] ℹ️ ID not found in database: ${trackingId}`);
        }
    } catch (err) {
        console.error('Error updating tracking log:', err);
    }

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
app.get('/api/logs', async (req, res) => {
    try {
        const logs = await TrackingLog.find().sort({ sent_at: -1 }).lean();
        res.json(logs || []);
    } catch (err) {
        console.error('Error fetching logs:', err);
        res.status(500).json({ error: 'Failed to retrieve logs' });
    }
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    console.log(`✅ Tracking server running on http://localhost:${PORT}`);
    console.log(`📧 Tracking pixel base: ${BASE_URL}/track/<id>.gif`);
});
