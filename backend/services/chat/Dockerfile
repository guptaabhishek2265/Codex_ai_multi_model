FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY services/chat/package.json services/chat/package-lock.json ./services/chat/
RUN cd services/chat && npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node services/chat ./services/chat
COPY --chown=node:node shared ./shared
WORKDIR /app/services/chat
USER node
EXPOSE 8002
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8002)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "index.js"]