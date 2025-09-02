/**
 * WatchmanClient
 * This client connects to a WebSocket server to listen for file changes.
 * It is designed to work only on localhost or specific domains.
 * It dispatches events when files change, which can be used to trigger UI updates or other actions.
 * Author: Van
 */

window.WatchmanClient = window.WatchmanClient || (() => {

  const onFileChange = "WatchmanClient:onFileChange";

  const isLocalhost = () => {
    const patterns = [
      /^localhost$/,
      /^127\.0\.0\.1$/,
      /^192\.168\.2\.\d+$/, // Matches 192.168.2.*
      /^172\.\d+\.\d+\.\d+$/, // Matches 172.*.*.*
    ];

    return patterns.some(pattern => pattern.test(window.location.hostname));
  };

  try {
    if (!isLocalhost()) {
      console.log("[WatchmanClient] Watchman Server inactive. It is only available on localhost or specific domains.");
      return;
    }
  } catch (error) {
    console.warn("[WatchmanClient] Error checking hostname:", error);
  }

  try {
    // Connect to the WebSocket server
    const ws = new WebSocket(`ws://${window.location.hostname}:9996`);

    ws.onopen = () => {
      console.log('WebSocket connection established');
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
    };

    ws.onerror = (event) => {
        console.warn(`[WatchmanClient] Watchman Server inactive. Usage:

1. Open shell / CMD
2. run 'npm install'
3. run 'npm run dev:watch'  (see 'package.json' for more details)

Once it runs, it automatically copies all files from WATCHMAN_SRC_FOLDER to WATCHMAN_DEST_FOLDER.
Upon running the watch command, the server will start listening for file changes.
Whenever you edit a file, the server will copy it to the destination folder and notify the WebSocket clients.
`);
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'fileChange') {
          window.dispatchEvent(new Event(onFileChange, { 
            type: data.type,
            filePath: data.filePath,
          }));

          document.dispatchEvent(new Event(onFileChange, { 
            type: data.type,
            filePath: data.filePath,
          }));

          const isJS = (data.filePath.split('.js').length > 1
          && data.filePath.split('.js')[1].length <= 0);

          const isCSS = (data.filePath.split('.css').length > 1
          && data.filePath.split('.css')[1].length <= 0);

          const isHTML = (data.filePath.split('.html').length > 1
          && data.filePath.split('.html')[1].length <= 0);

          if (isJS) {
            console.log("[WatchmanClient] JS File changed:", data.filePath);

            await (async () => {
              // Load the script
              async function loadJavaScript(url) {
                try {
                  const res = await fetch(url);
                  const code = await res.text();
                  const scriptFunction = new Function(code);
                  scriptFunction.call(window);
                  console.log('[WatchmanClient] Loaded new script:', url);
                } catch (error) {
                  throw error;
                }
              }

              // Run the script
              async function runJavaScript(url) {
                try {
                  await loadJavaScript(url);
                } catch (error) {
                  throw error;
                }
              }

              try {
                await runJavaScript(`./${data.filePath}`);
                console.log('[WatchmanClient] Script loaded and executed:', data.filePath);
              } catch (error) {
                console.error('[WatchmanClient] Error running script:', error);
                throw error;
              }
            })();
          }

          else if (isCSS) {
            console.log("[WatchmanClient] CSS File changed:", data.filePath);

            await (async () => {
              // Refresh a CSS file
              function refreshCSS(url) {
                const links = document.querySelectorAll('link[rel="stylesheet"][href*="' + url + '"]');
                
                links.forEach(link => {
                  link.href = url + '?v=' + new Date().getTime();
                  console.log('[WatchmanClient] Refreshed CSS link:', link);
                });

                if (links.length === 0) {
                  const newLink = document.createElement('link');
                  newLink.rel = 'stylesheet';
                  newLink.href = url + '?v=' + new Date().getTime();
                  document.head.appendChild(newLink);
                  console.log('[WatchmanClient] Added new CSS link:', newLink);
                }
              }

              try {
                refreshCSS(`./${data.filePath}`);
                console.log('[WatchmanClient] CSS file refreshed:', data.filePath);
              } catch (error) {
                console.error('[WatchmanClient] Error refreshing CSS file:', error);
                throw error;
              }
            })();

          }

          else if (isHTML) {
            window.location.reload();
            return;
          }

          if (data.strategy === "always-trigger-hashchange") {
            _PageState.instance = null;
            window.dispatchEvent(new Event("hashchange"));
          }
        }
      } catch (error) {
        console.error('[WatchmanClient] Error parsing WebSocket message:', error);
      }
    };

  } catch (error) {
    console.log("[WatchmanClient] invalid error", error);
    return;
  }

  return {
    onFileChange,
  }

})();
