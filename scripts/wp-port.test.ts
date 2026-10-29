import { describe, expect, it } from "vitest";
import {
  FUNCTIONS,
  HOOKS,
  parseHeader,
  scanPhp,
  summarize,
} from "./wp-port.mjs";

const PLUGIN = `<?php
/**
 * Plugin Name: Hello Notes
 * Description: Adds a note to posts.
 * Version: 2.1.0
 * Author: Ada
 */
// add_action('ignored', 'in_a_comment');
add_action( 'save_post', 'hn_saved', 10, 3 );
add_action( "save_post_page", 'hn_saved' );
add_filter('the_content', 'hn_note');
add_action('wp_ajax_hn_ping', 'hn_ping');
add_shortcode( 'note', 'hn_shortcode' );
function hn_note( $content ) {
  $n = get_option( 'hn_text' );
  if ( ! current_user_can( 'edit_posts' ) ) return $content;
  global $wpdb;
  $rows = $wpdb->get_results( "SELECT 1" );
  $q = new WP_Query( array( 'post_type' => 'post' ) );
  wp_schedule_event( time(), 'daily', 'hn_cron' );
  return $content . esc_html( $n ) . hn_helper();
}
`;

describe("port:wp scanner", () => {
  it("reads the plugin header", () => {
    expect(parseHeader(PLUGIN)).toEqual({
      name: "Hello Notes",
      description: "Adds a note to posts.",
      version: "2.1.0",
      author: "Ada",
    });
    expect(parseHeader("<?php echo 1;")).toBeNull();
    expect(parseHeader("/*\nTheme Name: Twenty Ten\n*/")?.name).toBe(
      "Twenty Ten",
    );
  });

  it("finds hooks and WordPress functions, not comments or the plugin's own code", () => {
    const names = scanPhp(PLUGIN).map((f) => `${f.kind}:${f.name}`);
    expect(names).toEqual([
      "function:add_action",
      "hook:save_post",
      "function:add_action",
      "hook:save_post_page",
      "function:add_filter",
      "hook:the_content",
      "function:add_action",
      "hook:wp_ajax_hn_ping",
      "function:add_shortcode",
      "function:get_option",
      "function:current_user_can",
      "function:$wpdb",
      "function:WP_Query",
      "function:wp_schedule_event",
      "function:esc_html",
    ]);
    expect(scanPhp(PLUGIN).find((f) => f.name === "$wpdb")?.line).toBe(18);
  });

  it("groups findings, missing pieces first", () => {
    const groups = summarize(scanPhp(PLUGIN));
    expect(groups[0].entry.status).toBe("missing");
    const actions = groups.find((g) => g.names.has("add_action"));
    expect(actions?.names).toEqual(new Set(["add_action", "add_filter"]));
    expect(actions?.places).toHaveLength(4);
  });

  it("never lists a name twice within hooks or within functions", () => {
    for (const list of [HOOKS, FUNCTIONS]) {
      const names = list.flatMap((e) => e.names.map((n) => n.toLowerCase()));
      expect(names.length).toBe(new Set(names).size);
    }
  });
});
