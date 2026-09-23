FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 8080
CMD ["sh","-c","node server/migrate.js && node server/seed.js && node server/index.js"]
