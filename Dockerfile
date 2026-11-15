FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npm run db:generate
COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
COPY specs ./specs
COPY docs ./docs
RUN npm run build
