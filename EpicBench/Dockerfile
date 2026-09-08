FROM node:22-bookworm-slim
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /opt/community-runtime
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npx playwright install --with-deps chromium && \
    apt-get update && apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/* && chmod -R a+rX /ms-playwright
ENV COMMUNITY_PLAYWRIGHT_MODULE=/opt/community-runtime/node_modules/playwright \
    COMMUNITY_PREVIEW_UID=1000 COMMUNITY_PREVIEW_GID=1000
WORKDIR /app
CMD ["node", "server.js"]
