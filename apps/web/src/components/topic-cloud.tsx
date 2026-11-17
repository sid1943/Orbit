import type { TopicCount } from "@orbit/core";
import { TopicChip } from "./topic-chip.js";

/** Topics as chips with their card counts. */
export function TopicCloud({ topics }: { topics: readonly TopicCount[] }) {
  return (
    <div className="cloud">
      {topics.map((t) => (
        <TopicChip key={t.key} name={t.name} count={t.count} />
      ))}
    </div>
  );
}
