const express = require('express');
const path = require('node:path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const routes = require('./routes');
const logger = require('./utils/logger');

const app = express();

const isDev = process.env.NODE_ENV !== "production";

app.use(
    helmet({
        contentSecurityPolicy: false,
            // ? false
            // : {
            //     directives: {
            //         defaultSrc: ["'self'"],
            //         scriptSrc: ["'self'", "https://deal-traking-system.onrender.com"],
            //         connectSrc: ["'self'", "https://deal-traking-system.onrender.com"],
            //         imgSrc: ["'self'", "data:", "https:"],
            //     },
            // },
    })
);
// app.use(cors({ origin: isDev ? 'http://localhost:4000' : "https://deal-traking-system.onrender.com", credentials: true }));
// app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());
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

    const status = err.status || 500;
    res.status(status).json({
        message: status === 500 ? 'Internal server error' : err.message,
    });
});

module.exports = app;
