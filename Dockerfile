FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		xvfb \
		fluxbox \
		x11vnc \
		novnc \
		websockify \
	&& rm -rf /var/lib/apt/lists/*

# Install Playwright browser and runtime dependencies for Chromium.
RUN npx --yes playwright@1.58.2 install --with-deps chromium

# Copy Prisma config/schema BEFORE npm ci, because postinstall runs prisma generate
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci

COPY . .

RUN chmod +x /app/scripts/container-entrypoint.sh

RUN npm run prisma:generate

EXPOSE 4000
EXPOSE 5900
EXPOSE 6080

CMD ["/app/scripts/container-entrypoint.sh"]
