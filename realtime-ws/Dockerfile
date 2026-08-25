FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./
COPY auth.js ./
COPY profanity.js ./

EXPOSE 8080

CMD ["node", "server.js"]
