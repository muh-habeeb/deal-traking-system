const express = require('express');
const path = require('node:path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const logger = require('./utils/logger');

function isDatabaseUnavailableError(err) {
    const code = String(err?.code || '').toUpperCase();
    const causeCode = String(err?.cause?.code || '').toUpperCase();
    const message = String(err?.message || '');

    if (code === 'P1001' || code === 'P1002' || code === 'P1017') {
        return true;
    }

    if (['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH'].includes(causeCode)) {
        return true;
    }

    return (
        /can't reach database server/i.test(message) ||
        /connection timeout/i.test(message) ||
        /connection terminated/i.test(message)
    );
}

const app = express();

const isDev = process.env.NODE_ENV !== 'production';
const corsOrigins = String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

function getNoVncCspSources() {
    const raw = String(process.env.NO_VNC_PUBLIC_URL || '').trim();
    if (!raw) {
        return { frameSources: [], connectSources: [] };
    }

    try {
        const parsed = new URL(raw);
        const httpOrigin = parsed.origin;
        const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsOrigin = `${wsProtocol}//${parsed.host}`;

        return {
            frameSources: [httpOrigin],
            connectSources: [httpOrigin, wsOrigin],
        };
    } catch (_error) {
        return { frameSources: [], connectSources: [] };
    }
}

const { frameSources: noVncFrameSources, connectSources: noVncConnectSources } = getNoVncCspSources();

const cspDirectives = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'", ...noVncConnectSources],
    fontSrc: ["'self'", 'data:'],
    frameSrc: ["'self'", ...noVncFrameSources],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'self'"],
};

app.use(
    helmet({
        contentSecurityPolicy: isDev ? false : { directives: cspDirectives },
    })
);

if (corsOrigins.length > 0) {
    app.use(
        cors({
            origin(origin, callback) {
                if (!origin || corsOrigins.includes(origin)) {
                    return callback(null, true);
                }

                const corsError = new Error('CORS origin not allowed');
                corsError.status = 403;
                return callback(corsError);
            },
            credentials: true,
        })
    );
} else if (isDev) {
    app.use(cors({ origin: true, credentials: true }));
}

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

const publicDir = path.resolve(process.cwd(), 'public');
app.use(express.static(publicDir));

app.get('/', (_req, res) => {
    res.sendFile(path.join(publicDir, 'login.html'));
});

app.get('/dashboard', (_req, res) => {
    res.sendFile(path.join(publicDir, 'dashboard.html'));
});

app.use('/api', routes);

app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

app.use((err, _req, res, _next) => {
    logger.error('Unhandled request error', { error: err.message, stack: err.stack });

    if (isDatabaseUnavailableError(err)) {
        return res.status(503).json({
            message: 'Database is temporarily unavailable. Please try again shortly.',
        });
    }

    const status = err.status || 500;
    res.status(status).json({
        message: status === 500 ? 'Internal server error' : err.message,
    });
});

module.exports = app;
