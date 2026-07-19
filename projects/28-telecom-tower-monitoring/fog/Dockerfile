FROM node:20-slim
WORKDIR /app
COPY package.json .
RUN npm install --omit=dev --no-audit --no-fund
COPY gateway.js windower.js alarms.js dispatcher.js .
EXPOSE 8000
CMD ["node", "gateway.js"]
