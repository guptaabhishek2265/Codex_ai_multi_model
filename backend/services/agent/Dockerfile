FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY services/agent/package.json services/agent/package-lock.json ./services/agent/
RUN cd services/agent && npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node services/agent ./services/agent
COPY --chown=node:node shared ./shared
WORKDIR /app/services/agent
RUN mkdir -p /app/services/agent/temp && chown node:node /app/services/agent/temp
USER node
EXPOSE 8003
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8003)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "index.js"]
