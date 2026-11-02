'use client';

import { useEffect, useRef, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { Section } from '@/components/section';

/**
 * The bookmarklet opens Jobsmith's "Save a job" page with the current page's link and any text the user
 * selected. It runs only in the user's own browser; on LinkedIn and Indeed the server never fetches the
 * page, the selected text is used instead.
 */
function bookmarkletCode(origin: string) {
  return `javascript:(()=>{const s=String(getSelection()).slice(0,6000);window.open('${origin}/app/applications/new?bm=1&url='+encodeURIComponent(location.href)+(s?'&text='+encodeURIComponent(s):''),'_blank','noopener')})()`;
}

export default function ToolsPage() {
  const link = useRef<HTMLAnchorElement>(null);
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  useEffect(() => {
    // React refuses javascript: links in JSX, so the bookmarklet's href is set directly.
    if (link.current && origin) link.current.setAttribute('href', bookmarkletCode(origin));
  }, [origin]);

  return (
    <div className="space-y-6">
      <Section title="Bookmarklet" description="Save a job from any job page in one click.">
        <div className="space-y-4 text-sm">
          <p>Drag this button to your browser’s bookmarks bar:</p>
          <a
            ref={link}
            onClick={(e) => e.preventDefault()}
            className="inline-flex items-center gap-2 rounded-md border-2 border-dashed border-brand/40 bg-brand-tint px-4 py-2.5 font-semibold text-brand"
            title="Drag me to your bookmarks bar"
          >
            <Bookmark className="size-4" aria-hidden /> Save to Jobsmith
          </a>
          <ol className="list-decimal space-y-1 pl-5 text-ink-soft">
            <li>On a job page, click <span className="font-semibold text-ink">Save to Jobsmith</span> in your bookmarks bar.</li>
            <li>Jobsmith opens in a new tab and reads the page, or uses the text you selected.</li>
            <li>On LinkedIn or Indeed, select the job text first: Jobsmith never fetches those sites.</li>
          </ol>
        </div>
      </Section>
    </div>
  );
}
