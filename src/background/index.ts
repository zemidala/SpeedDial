// Клик по значку расширения открывает новую вкладку, то есть SpeedDial
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({});
});
