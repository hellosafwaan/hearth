import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => ({
    name: 'Sidekick',
    description:
      'Privacy-first AI sidebar. Bring your own key — nothing leaves your device except your own API calls.',
    permissions: ['tabs', 'storage', 'scripting', 'contextMenus'],
    // <all_urls> lets the screenshot tool capture any tab without a per-capture
    // user gesture (activeTab alone breaks agent-initiated captures).
    // TODO(v2): move to optional host permissions requested at first use.
    host_permissions: ['<all_urls>'],
    action: {
      default_title: 'Sidekick',
    },
    commands:
      browser === 'firefox'
        ? {
            _execute_sidebar_action: {
              suggested_key: { default: 'Alt+S' },
              description: 'Toggle the sidebar',
            },
          }
        : {
            // With openPanelOnActionClick set, this opens the side panel.
            _execute_action: {
              suggested_key: { default: 'Alt+S' },
              description: 'Open the sidebar',
            },
          },
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: { id: 'sidekick@placeholder.dev' },
          },
        }
      : {}),
  }),
});
