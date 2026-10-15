import { defineConfig } from 'wxt';
import { chromium } from '@playwright/test';

const aiEnabled = process.env.WDIM_AI_MODE === 'groq';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  imports: false,
  vite: () => ({
    define: {
      'import.meta.env.WDIM_AI_MODE': JSON.stringify(
        aiEnabled ? 'groq' : 'mock',
      ),
    },
  }),
  manifest: ({ browser }) => ({
    name: 'WDIM · What did I miss?',
    description: aiEnabled
      ? 'Evidence-bounded video companion. Optional Groq AI through your local gateway.'
      : 'Ask about what you have watched so far. Local mock preview; no AI backend.',
    permissions: ['storage'],
    ...(aiEnabled ? { host_permissions: ['http://127.0.0.1/*'] } : {}),
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'wdim-local@example.invalid',
              data_collection_permissions: {
                required: aiEnabled
                  ? ['personalCommunications', 'websiteContent']
                  : ['none'],
              },
            },
          },
        }
      : {}),
  }),
  webExt: {
    disabled: process.env.WDIM_MANUAL === '1',
    binaries: { chrome: chromium.executablePath() },
    startUrls: ['http://localhost:3000'],
  },
});
