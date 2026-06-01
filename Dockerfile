FROM mcr.microsoft.com/playwright:v1.58.1-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-package-lock

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "web"]
