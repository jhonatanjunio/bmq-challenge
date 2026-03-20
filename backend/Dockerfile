# Build stage
FROM node:20-alpine AS build

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./
COPY --from=build /app/prisma ./prisma
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 3000

# Script para rodar migrations antes de iniciar
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
