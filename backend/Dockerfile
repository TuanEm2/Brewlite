FROM node:22-alpine AS builder

WORKDIR /app

# Cài đặt OpenSSL cần thiết cho Prisma engine trên Alpine
RUN apk add --no-cache openssl

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/
COPY backend/prisma ./backend/prisma/

RUN npm ci

COPY backend/ ./backend/

WORKDIR /app/backend
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=4000

COPY package*.json ./
COPY backend/package*.json ./backend/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma

WORKDIR /app/backend

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
