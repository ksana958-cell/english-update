# BotHost: one web app; BotHost manages the HTTPS reverse proxy.
FROM node:24-alpine
RUN apk add --no-cache su-exec
WORKDIR /usr/src/english-step
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/data
ENV NODE_ENV=production DATA_DIR=/app/data PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# BotHost can mount /app from Git; keep executable code outside /app.
# Prepare persistent SQLite folder, then run the server unprivileged.
CMD ["sh", "-c", "mkdir -p /app/data && chown -R node:node /app/data && exec su-exec node node /usr/src/english-step/server.mjs"]
