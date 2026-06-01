FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

# GitHub Copilot CLI powers the optional internet-wide job discovery feature
# (web/web-discovery.mjs). Installed globally so `copilot` is on PATH. Headless
# auth is supplied at runtime via COPILOT_GITHUB_TOKEN (a fine-grained PAT with
# the "Copilot Requests" permission). Kept as an early layer so it stays cached
# across app code changes.
RUN npm install -g @github/copilot

COPY package.json ./
RUN npm install --omit=dev --no-package-lock

COPY . .

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "web"]
