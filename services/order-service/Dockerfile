FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3100
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
EXPOSE 3100
USER node
CMD ["node", "src/server.js"]