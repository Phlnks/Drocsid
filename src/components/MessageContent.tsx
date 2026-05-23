import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import LinkPreview from "./ui/LinkPreview";
import React, { useState, useEffect, useMemo } from "react";
import UserContextMenu from "./ui/UserContextMenu";

const YOUTUBE_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([^& \n<]+)(?:[^ \n<]+)?/g;
const IMAGE_REGEX = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))/gi;
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

const Spoiler = ({ children }: { children: React.ReactNode }) => {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (revealed) {
      const timer = setTimeout(() => {
        setRevealed(false);
      }, 20000); // Dévoiler pendant 20 secondes
      return () => clearTimeout(timer);
    }
  }, [revealed]);

  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center rounded px-2 py-0.5 mx-0.5 cursor-pointer transition-all duration-200 min-h-[1.5em] min-w-[50px] border-none outline-none ${
        revealed
          ? "bg-zinc-700/50"
          : "bg-zinc-800 ring-1 ring-zinc-700 hover:bg-zinc-100 hover:ring-zinc-200 active:scale-95 group/spoiler"
      }`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!revealed) {
          setRevealed(true);
        }
      }}
      title={!revealed ? "Cliquez pour révéler le spoiler" : ""}
    >
      {revealed ? (
        <span className="text-zinc-100">{children}</span>
      ) : (
        <span className="text-[10px] font-bold tracking-widest text-zinc-400 uppercase select-none flex items-center group-hover/spoiler:text-zinc-900 transition-colors whitespace-nowrap">
          Spoiler
        </span>
      )}
    </button>
  );
};

interface MessageContentProps {
  content: string;
  usersMap?: Record<string, any>;
  serverId?: string | null;
}

export default function MessageContent({
  content,
  usersMap = {},
  serverId = null,
}: MessageContentProps) {
  const [contextMenu, setContextMenu] = useState<{
    userId: string;
    username: string;
    x: number;
    y: number;
  } | null>(null);

  if (!content) return null;

  // Check if content is only emojis
  const isOnlyEmojis = () => {
    const noSpaces = content.replace(/\s/g, "");
    if (noSpaces.length === 0) return false;
    // Remove all emojis, variation selectors, ZWJ, and modifiers (skin tones)
    const stripped = noSpaces.replace(
      /[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}\uFE0F\u200D]/gu,
      ""
    );
    return stripped.length === 0;
  };

  const emojiOnly = isOnlyEmojis();

  // Extract YouTube IDs
  const youtubeIds: string[] = [];
  let match;
  while ((match = YOUTUBE_REGEX.exec(content)) !== null) {
    if (!youtubeIds.includes(match[1])) {
      youtubeIds.push(match[1]);
    }
  }

  // Extract Image URLs
  const imageUrls: string[] = [];
  while ((match = IMAGE_REGEX.exec(content)) !== null) {
    const isMarkdownImage =
      match.index > 1 &&
      content.substring(match.index - 2, match.index) === "](";
    if (!isMarkdownImage && !imageUrls.includes(match[1])) {
      imageUrls.push(match[1]);
    }
  }

  // Extract generic URLs for LinkPreview (excluding youtube and images)
  const genericUrls: string[] = [];
  while ((match = URL_REGEX.exec(content)) !== null) {
    const isMarkdownImage =
      match.index > 1 &&
      content.substring(match.index - 2, match.index) === "](";
    const url = match[1];
    if (
      !isMarkdownImage &&
      !url.match(YOUTUBE_REGEX) &&
      !url.match(IMAGE_REGEX) &&
      !genericUrls.includes(url)
    ) {
      genericUrls.push(url);
    }
  }

  // Pre-process content for mentions - handle @username and @"user name"
  // and avoid common false positives like email addresses.
  let processedContent = content.replace(
    /@(?:"([^"]+)"|([a-zA-Z0-9_.\-]+))/g,
    (match, p1, p2) => {
      const username = p1 || p2;
      const encodedUsername = encodeURIComponent(username);
      return `[@${username}](https://mention.local/${encodedUsername})`;
    }
  );

  // Pre-process spoilers: replace ||...|| with <span class="spoiler-tag">...</span>
  processedContent = processedContent.replace(
    /\|\|([\s\S]*?)\|\|/g,
    '<span class="spoiler-tag">$1</span>'
  );

  const handleMentionContextMenu = (e: React.MouseEvent, username: string) => {
    e.preventDefault();
    e.stopPropagation();

    // Try to find the user in our map
    const decodedUsername = decodeURIComponent(username);
    const userProfile = Object.values(usersMap).find(
      (u) =>
        u.username?.toLowerCase() === decodedUsername.toLowerCase() ||
        u.display_name?.toLowerCase() === decodedUsername.toLowerCase()
    );

    if (userProfile) {
      setContextMenu({
        userId: userProfile.id,
        username: userProfile.username,
        x: e.clientX,
        y: e.clientY,
      });
    }
  };

  const components = useMemo(() => ({
    ol: ({ node, children, ...props }: any) => (
      <ol className="list-decimal pl-5 my-1 space-y-1" {...props}>{children}</ol>
    ),
    ul: ({ node, children, ...props }: any) => (
      <ul className="list-disc pl-5 my-1 space-y-1" {...props}>{children}</ul>
    ),
    li: ({ node, children, ...props }: any) => (
      <li className="" {...props}>{children}</li>
    ),
    p: ({ node, children, ...props }: any) => (
      <p className="my-1 whitespace-pre-wrap" {...props}>{children}</p>
    ),
    span: ({ node, className, children, ...props }: any) => {
      if (className === "spoiler-tag") {
        return <Spoiler>{children}</Spoiler>;
      }
      return <span className={className} {...props}>{children}</span>;
    },
    code({ node, inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || "");
      return !inline && match ? (
        <div className="rounded-md overflow-hidden my-2 border border-zinc-700/50">
          <div className="bg-zinc-800/80 px-4 py-1 text-xs text-zinc-400 font-mono flex items-center justify-between border-b border-zinc-700/50">
            <span>{match[1]}</span>
          </div>
          <SyntaxHighlighter
            {...props}
            style={vscDarkPlus as any}
            language={match[1]}
            PreTag="div"
            customStyle={{
              margin: 0,
              padding: "1rem",
              background: "#1e1e1e",
            }}
          >
            {String(children).replace(/\n$/, "")}
          </SyntaxHighlighter>
        </div>
      ) : (
        <code
          {...props}
          className={`${className} bg-zinc-800 text-indigo-300 px-1.5 py-0.5 rounded-md font-mono text-sm`}
        >
          {children}
        </code>
      );
    },
    a: ({ node, href, children, ...props }: any) => {
      if (href?.startsWith("https://mention.local/")) {
        const username = href.replace("https://mention.local/", "");
        return (
          <span
            className="bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded-md font-medium cursor-default hover:bg-indigo-500/40 transition-colors inline-flex items-center"
            onContextMenu={(e) => handleMentionContextMenu(e, username)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            {children}
          </span>
        );
      }
      return (
        <a
          href={href}
          {...props}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 hover:underline"
        >
          {children}
        </a>
      );
    },
    img: ({ node, src, alt, ...props }: any) => {
      if (alt?.startsWith("custom_emoji:")) {
        return (
          <img
            src={src}
            title={alt.replace("custom_emoji:", "")}
            className="w-6 h-6 inline-block align-middle mx-0.5"
            alt={alt.replace("custom_emoji:", "")}
          />
        );
      }
      return (
        <img
          src={src}
          alt={alt}
          className="rounded-md max-w-full max-h-80 object-contain"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      );
    },
  }), [usersMap, serverId]);

  return (
    <div className="flex flex-col gap-2 relative">
      <div
        className={`text-zinc-100 markdown-body break-words ${
          emojiOnly
            ? "text-[45px] leading-tight"
            : "text-[15px] leading-snug"
        }`}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={components as any}
        >
          {processedContent}
        </ReactMarkdown>
      </div>

      {contextMenu && (
        <UserContextMenu
          userId={contextMenu.userId}
          username={contextMenu.username}
          serverId={serverId}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {youtubeIds.map((id) => (
        <div
          key={id}
          className="mt-2 max-w-[400px] rounded-md overflow-hidden border border-zinc-700/50 aspect-video bg-zinc-900/50"
        >
          <iframe
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${id}`}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            loading="lazy"
          ></iframe>
        </div>
      ))}

      {imageUrls.map((url) => (
        <div
          key={url}
          className="mt-2 max-w-md bg-zinc-900/50 rounded-md min-h-[100px] flex items-center justify-center"
        >
          <img
            src={url}
            alt="Embedded"
            className="rounded-md max-h-80 object-contain"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
        </div>
      ))}

      {genericUrls.map((url) => (
        <LinkPreview key={url} url={url} />
      ))}
    </div>
  );
}
