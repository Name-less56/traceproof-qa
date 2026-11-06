FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node . .
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4391
EXPOSE 4391
USER node
CMD ["node", "server.js"]
