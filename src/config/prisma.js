const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
	connectionString: env.databaseUrl,
	connectionTimeoutMillis: env.database.connectionTimeoutMs,
	idleTimeoutMillis: env.database.idleTimeoutMs,
	query_timeout: env.database.queryTimeoutMs,
	max: env.database.maxPoolSize,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

module.exports = prisma;
