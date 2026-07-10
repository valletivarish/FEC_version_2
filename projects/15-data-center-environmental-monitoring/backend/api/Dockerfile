FROM node:20-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends zip && rm -rf /var/lib/apt/lists/*
COPY package.json .
RUN npm install --omit=dev --no-audit --no-fund
COPY handler.js router.js readingsStore.js pipelineStatus.js thresholdsProxy.js awsClients.js .
RUN zip -qr function.zip handler.js router.js readingsStore.js pipelineStatus.js thresholdsProxy.js awsClients.js node_modules

FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir awscli
COPY --from=build /app/function.zip .
COPY deploy_api.sh .
RUN chmod +x deploy_api.sh
CMD ["./deploy_api.sh"]
