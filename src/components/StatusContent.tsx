import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import React, { useMemo } from "react";

interface StatusContentProps {
  content: string;
}

export default function StatusContent({ content }: StatusContentProps) {
  if (!content) return null;

  const components = useMemo(() => ({
    p: ({ children }: any) => <span className="inline">{children}</span>,
    img: ({ node, src, alt, ...props }: any) => {
      if (alt?.startsWith("custom_emoji:")) {
        return (
          <img
            src={src}
            title={alt.replace("custom_emoji:", "")}
            className="w-5 h-5 inline-block align-middle mx-0.5"
            alt={alt.replace("custom_emoji:", "")}
          />
        );
      }
      return (
        <img
          src={src}
          alt={alt}
          className="rounded-sm max-w-[20px] max-h-[20px] object-contain inline-block align-middle"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      );
    },
    a: ({ node, href, children, ...props }: any) => {
      return (
        <span className="text-indigo-400">
          {children}
        </span>
      );
    }
  }), []);

  return (
    <div className="inline">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={components as any}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
