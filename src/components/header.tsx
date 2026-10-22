import Link from "next/link";

export function Header() {
  return <header className="site-header"><Link href="/" className="brand" aria-label="Let's Eat home"><svg viewBox="0 0 36 36" width="32" height="32" fill="none" aria-hidden="true"><path d="M5 18h26c-1 9-6 12-13 12S6 27 5 18Z" fill="currentColor"/><path d="M11 5c-4 5 4 5 0 10m7-12c-4 5 4 5 0 10m7-8c-4 5 4 5 0 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>let&apos;s eat<span className="brand-dot">.</span></Link><span className="header-note">Good food. Less back-and-forth.</span></header>;
}
