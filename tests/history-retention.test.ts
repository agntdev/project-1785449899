import { describe, expect, it } from "vitest";
import { retainRecent, type HistoryItem } from "../src/handlers/generation.js";

describe("generation history retention", () => {
  it("keeps only the most recent 100 topic-post pairs", () => {
    const items: HistoryItem[] = Array.from({ length: 101 }, (_, index) => ({
      topic: `topic ${index}`,
      post: `post ${index}`,
      timestamp: "2026-01-01T00:00:00.000Z",
    }));

    const retained = retainRecent(items);
    expect(retained).toHaveLength(100);
    expect(retained[0]?.topic).toBe("topic 0");
    expect(retained[99]?.topic).toBe("topic 99");
  });
});
