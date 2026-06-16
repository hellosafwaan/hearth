import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => ({
    name: 'Hearth',
    description:
      'Privacy-first AI sidebar. Bring your own key — nothing leaves your device except your own API calls.',
    permissions: ['tabs', 'storage', 'scripting', 'contextMenus'],
    // Host access is requested at runtime (see lib/permissions.ts) so the
    // install prompt stays clean. Chrome MV3 and Firefox MV2 use different
    // manifest keys for optional origins.
    ...(browser === 'firefox'
      ? { optional_permissions: ['<all_urls>', 'history', 'bookmarks'] }
      : {
          optional_host_permissions: ['<all_urls>'],
          // Deep inspection (debugger), history search, and bookmarks are
          // explicit opt-ins; Firefox has no debugger API for extensions.
          optional_permissions: ['debugger', 'history', 'bookmarks'],
        }),
    action: {
      default_title: 'Hearth',
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
            gecko: { id: 'hearth@placeholder.dev' },
          },
        }
      : {}),
  }),
});
