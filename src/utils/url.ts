export function domainFromUrl(u?: string): string | undefined {
    if (!u) return;
    try {
      const url = new URL(u);
      return url.hostname.toLowerCase();
    } catch { return; }
  }
  