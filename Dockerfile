FROM node:22-bookworm-slim

WORKDIR /app

# Install Playwright browser and runtime dependencies for Chromium.
RUN npx --yes playwright@1.58.2 install --with-deps chromium

# Copy Prisma config/schema BEFORE npm ci, because postinstall runs prisma generate
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm ci

COPY . .

RUN npm run prisma:generate

EXPOSE 4000

CMD ["sh", "-c", "npm run prisma:deploy && npm run start"]
