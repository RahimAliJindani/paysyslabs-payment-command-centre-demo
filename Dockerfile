FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
ENV NODE_ENV=production PORT=4173 DATA_DIR=/app/data
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 4173
CMD ["node", "server/index.js"]
