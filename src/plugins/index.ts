// Installed plugins. To install one, add its folder under src/plugins and
// list it here; activate it under Admin → Plugins.
import type { PluginDefinition } from "@/lib/plugins/types";
import commentBlocklist from "./comment-blocklist";
import readingTime from "./reading-time";
import webhooks from "./webhooks";
import wordpressImporter from "./wordpress-importer";

export const installedPlugins: PluginDefinition[] = [
  readingTime,
  commentBlocklist,
  webhooks,
  wordpressImporter,
];
