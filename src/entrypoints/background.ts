import { browser, defineBackground } from '#imports';

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
});
