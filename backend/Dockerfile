FROM node:20-alpine AS base

WORKDIR /app

# Install native build deps for bcrypt + AWS RDS CA certificates
RUN apk add --no-cache python3 make g++ wget ca-certificates \
    && mkdir -p /usr/local/share/ca-certificates \
    && wget -q -O /usr/local/share/ca-certificates/aws-rds-global-bundle.crt \
       https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
    && update-ca-certificates

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

ENV NODE_OPTIONS="--use-openssl-ca"

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server.js"]
