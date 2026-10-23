import "server-only";
import { version } from "../../package.json";

export function serviceVersion() {
  const commit = process.env.RENDER_GIT_COMMIT;
  return { version, commit: commit && /^[a-f0-9]{40}$/i.test(commit) ? commit : null };
}
