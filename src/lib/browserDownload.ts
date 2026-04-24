const IOS_PATTERN = /iPad|iPhone|iPod/i;
const IN_APP_BROWSER_PATTERN = /(FBAN|FBAV|Instagram|Line|MicroMessenger|wv|WebView|GSA|Snapchat|TikTok)/i;

function isLikelyInAppBrowser() {
  if (typeof navigator === "undefined") return false;
  return IOS_PATTERN.test(navigator.userAgent) || IN_APP_BROWSER_PATTERN.test(navigator.userAgent);
}

export function downloadBlob(blob: Blob, filename: string) {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const url = URL.createObjectURL(blob);
  const cleanup = () => window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

  if (blob.type === "application/pdf" && isLikelyInAppBrowser()) {
    const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
    if (!openedWindow) {
      window.location.href = url;
    }
    cleanup();
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  cleanup();
}
