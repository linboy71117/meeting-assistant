export async function getActiveMeetInfo() {
  return new Promise((resolve) => {
    try {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab || !tab.url) return resolve(null);

        resolve({
          url: tab.url,
          title: tab.title || "",
        });
      });
    } catch (e) {
      console.error(e);
      resolve(null);
    }
  });
}
