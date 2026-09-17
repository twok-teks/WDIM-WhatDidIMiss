import { defineConfig } from 'wxt';
import { chromium } from '@playwright/test';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  imports: false,
  manifest: ({ browser }) => ({
    name: 'WDIM · What did I miss?',
    description:
      'Ask about what you have watched so far. Local mock preview; no AI backend.',
    permissions: ['storage'],
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'wdim-local@example.invalid',
              data_collection_permissions: { required: ['none'] },
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
