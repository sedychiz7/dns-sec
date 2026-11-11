# Backend: API + filtering DNS resolver (UDP/TCP 53, DoT 853, DoH on the API port)
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared ./shared
COPY server ./server
# The lockfile lists every workspace; only the mobile manifest is needed to satisfy it.
COPY mobile/package.json ./mobile/package.json
RUN npm ci --workspace server --workspace shared --omit=dev --ignore-scripts
ENV NODE_ENV=production DB_FILE=/data/kinshield.db BLOCKLIST_DIR=/data/blocklists DNS_PORT=53
VOLUME /data
EXPOSE 8080 53/udp 53/tcp 853
WORKDIR /app/server
# Fetch fresh blocklists at boot, then serve. Re-run update-blocklists on a schedule + SIGHUP to reload.
CMD ["sh", "-c", "npx tsx src/dns/updateBlocklists.ts; exec npx tsx src/index.ts"]
