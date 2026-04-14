import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import LinkPreview from './ui/LinkPreview';

const YOUTUBE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([^& \n<]+)(?:[^ \n<]+)?/g;
const IMAGE_REGEX = /(https?:\/\/.*\.(?:png|jpg|jpeg|gif|webp))/ig;
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export default function MessageContent({ content }: { content: string }) {
  if (!content) return null;

  // Check if content is only emojis
  const isOnlyEmojis = () => {
    const noSpaces = content.replace(/\s/g, '');
    if (noSpaces.length === 0) return false;
    // Remove all emojis, variation selectors, ZWJ, and modifiers (skin tones)
    const stripped = noSpaces.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}\uFE0F\u200D]/gu, '');
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
    if (!imageUrls.includes(match[1])) {
      imageUrls.push(match[1]);
    }
  }

  // Extract generic URLs for LinkPreview (excluding youtube and images)
  const genericUrls: string[] = [];
  while ((match = URL_REGEX.exec(content)) !== null) {
    const url = match[1];
    if (!url.match(YOUTUBE_REGEX) && !url.match(IMAGE_REGEX) && !genericUrls.includes(url)) {
      genericUrls.push(url);
    }
  }

  // Pre-process content for mentions
  const processedContent = content.replace(/@(?:"([^"]+)"|([^\s"':;,.!?]+))/g, (match, p1, p2) => {
    const username = p1 || p2;
    // Encode space and special characters for the markdown link URL part
    const encodedUsername = encodeURIComponent(username);
    return `[@${username}](mention:${encodedUsername})`;
  });

  return (
    <div className="flex flex-col gap-2">
      <div className={`text-zinc-100 markdown-body break-words ${emojiOnly ? 'text-[45px] leading-tight' : 'text-[15px] leading-relaxed'}`}>
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({node, href, children, ...props}) => {
              if (href?.startsWith('mention:')) {
                // Decode for display if needed, but children already has the @username
                return <span className="bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded-md font-medium">{children}</span>;
              }
              return <a href={href} {...props} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">{children}</a>;
            }
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>

      {youtubeIds.map(id => (
        <div key={id} className="mt-2 max-w-[400px] rounded-md overflow-hidden border border-zinc-700/50">
          <iframe
            width="100%"
            height="225"
            src={`https://www.youtube.com/embed/${id}`}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        </div>
      ))}

      {imageUrls.map(url => (
        <div key={url} className="mt-2 max-w-md">
          <img 
            src={url} 
            alt="Embedded" 
            className="rounded-md max-h-80 object-contain"
            referrerPolicy="no-referrer"
          />
        </div>
      ))}

      {genericUrls.map(url => (
        <LinkPreview key={url} url={url} />
      ))}
    </div>
  );
}
