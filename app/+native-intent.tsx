/**
 * Rewrites URLs the OS opens the app with, before Expo Router matches them.
 * A link of a foreign scheme has no route here; land on Home rather than the
 * "not found" screen.
 */
export async function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (/^[a-z][\w+.-]*:/i.test(path) && !path.startsWith('vanitube:')) return '/';
    return path;
  } catch {
    return '/';
  }
}
