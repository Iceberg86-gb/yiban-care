FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY shared ./shared
COPY server ./server
COPY tests ./tests
COPY public ./public
RUN npm run check

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4317 \
    TZ=Asia/Shanghai \
    PDF_PYTHON=/opt/pdf-venv/bin/python \
    PDF_CJK_FONT=/usr/share/fonts/truetype/wqy/wqy-microhei.ttc
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv fonts-wqy-microhei ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements-pdf.txt ./
RUN python3 -m venv /opt/pdf-venv \
    && /opt/pdf-venv/bin/pip install --no-cache-dir -r requirements-pdf.txt
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 4317
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:4317/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
