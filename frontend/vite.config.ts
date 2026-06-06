import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { profileApiPlugin } from './profile-api.mjs'

export default defineConfig({
  plugins: [profileApiPlugin(), react(), tailwindcss()],
})
