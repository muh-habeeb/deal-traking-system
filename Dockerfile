FROM node:22-bookworm-slim AS base

WORKDIR /app

ENV NODE_ENV=production

ARG ENABLE_REMOTE_LOGIN_TOOLS=false
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates \
	&& if [ "$ENABLE_REMOTE_LOGIN_TOOLS" = "true" ]; then \
		apt-get install -y --no-install-recommends \
			xvfb \
			fluxbox \
			x11vnc \
			novnc \
			websockify; \
	fi \
	&& rm -rf /var/lib/apt/lists/*

# Install Playwright browser and runtime dependencies for Chromium.
ARG PLAYWRIGHT_VERSION=1.58.2
RUN npx --yes playwright@${PLAYWRIGHT_VERSION} install --with-deps chromium

FROM base AS deps

# Install build dependencies needed for sharp compilation on Linux
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		build-essential \
		python3 \
	&& rm -rf /var/lib/apt/lists/*

# Copy Prisma config/schema BEFORE npm ci, because postinstall runs prisma generate.
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Keep dev dependencies in image because entrypoint runs `prisma migrate deploy`.
# Install optional dependencies so sharp gets built for Linux
RUN npm ci --include=dev --include=optional --no-audit --no-fund

FROM base AS runtime

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./
COPY --from=deps /app/prisma ./prisma
COPY --from=deps /app/prisma.config.ts ./

COPY src ./src
COPY public ./public
COPY scripts ./scripts

RUN mkdir -p /app/data /app/playwright /app/playwright/sessions
RUN chmod +x /app/scripts/container-entrypoint.sh

EXPOSE 4000
EXPOSE 5900
EXPOSE 6080

CMD ["/app/scripts/container-entrypoint.sh"]
