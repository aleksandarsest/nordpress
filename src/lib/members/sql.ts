import { sql } from "drizzle-orm";
import { posts } from "@/db/schema";

/** Excludes members-only posts from a query (search, chat, indexing). */
export const notMembersOnly = sql`coalesce((${posts.meta}->>'membersOnly')::boolean, false) = false`;
