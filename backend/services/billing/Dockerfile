FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY services/billing/package.json services/billing/package-lock.json ./services/billing/
RUN cd services/billing && npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node services/billing ./services/billing
COPY --chown=node:node shared ./shared
WORKDIR /app/services/billing
USER node
EXPOSE 8004
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8004)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "index.js"]