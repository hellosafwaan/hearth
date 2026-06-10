import { browser, defineBackground } from '#imports';
import { APP_NAME } from '../lib/constants';
import { setPendingSelection } from '../lib/selection';

const ASK_SELECTION_MENU_ID = 'ask-about-selection';

export default defineBackground(() => {
  const api = browser as any;

  // Chrome: clicking the toolbar icon opens the side panel.
  api.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true }).catch(() => {});

  // Firefox: toggle the sidebar from the toolbar button (sidebarAction.toggle
  // must run inside a user-input handler). MV2 exposes browserAction.
  if (api.sidebarAction?.toggle) {
    const action = api.action ?? api.browserAction;
    action?.onClicked.addListener(() => {
      api.sidebarAction.toggle();
    });
  }

  // Highlight and ask: context menu on selected text.
  browser.runtime.onInstalled.addListener(async () => {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: ASK_SELECTION_MENU_ID,
      title: `Ask ${APP_NAME} about "%s"`,
      contexts: ['selection'],
    });
  });

  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== ASK_SELECTION_MENU_ID || !info.selectionText) return;

    await setPendingSelection({
      id: crypto.randomUUID(),
      text: info.selectionText,
      url: info.pageUrl ?? tab?.url ?? '',
      title: tab?.title ?? '',
    });

    // Opening the panel must happen synchronously enough to count as the
    // user gesture from the menu click.
    if (api.sidePanel?.open && tab?.windowId != null) {
      api.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
    } else if (api.sidebarAction?.open) {
      api.sidebarAction.open().catch(() => {});
    }
  });
});
