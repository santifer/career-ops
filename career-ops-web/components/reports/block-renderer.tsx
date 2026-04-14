import ReactMarkdown from "react-markdown";

interface BlockRendererProps {
  label: string;
  blockKey: string;
  data: unknown;
}

export function BlockRenderer({ label, blockKey, data }: BlockRendererProps) {
  if (!data) return null;

  let content: string;

  if (typeof data === "string") {
    content = data;
  } else if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    if (typeof obj.content === "string") {
      content = obj.content;
    } else if (typeof obj.markdown === "string") {
      content = obj.markdown;
    } else {
      content = Object.entries(obj)
        .map(([key, value]) => {
          if (typeof value === "string") return `**${key}:** ${value}`;
          if (Array.isArray(value)) return `**${key}:**\n${value.map((v) => `- ${v}`).join("\n")}`;
          return `**${key}:** ${JSON.stringify(value)}`;
        })
        .join("\n\n");
    }
  } else {
    return null;
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-neutral-800 flex items-center gap-2">
        <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-neutral-100 text-xs font-bold text-neutral-500">
          {blockKey.replace("block", "").toUpperCase()}
        </span>
        {label}
      </h3>
      <div className="prose prose-sm prose-neutral max-w-none text-neutral-600 [&_p]:mb-2 [&_li]:mb-1">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </section>
  );
}
