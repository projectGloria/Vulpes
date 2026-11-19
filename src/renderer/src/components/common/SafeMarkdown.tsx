import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

export function SafeMarkdown({ content }: { content: string | null | undefined }): React.JSX.Element {
  const html = useMemo(() => {
    if (!content?.trim()) return '';
    const raw = marked.parse(content, { async: false, breaks: true, gfm: true });
    return DOMPurify.sanitize(typeof raw === 'string' ? raw : '', {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick']
    });
  }, [content]);

  if (!html) {
    return <span style={{ color: 'var(--text-muted)' }}>No description provided.</span>;
  }

  return <div className="markdown-body" dangerouslySetInnerHTML={{ __html: html }} />;
}
