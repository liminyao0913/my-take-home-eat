import { CreateRoom } from "@/components/create-room";
import { Header } from "@/components/header";
import Link from "next/link";

export default function Home() {
  return <><Header /><main className="landing">
    <section className="intro">
      <span className="pill"><span className="live-dot" />TEN MINUTES. ONE DECISION.</span>
      <h1>Less debating.<br /><em>More eating.</em></h1>
      <p className="intro-copy">The group chat is hungry. Give your next lunch or dinner a little direction, with one shared link.</p>
      <div className="demo-entry"><Link className="button secondary" href="/demo">Try a demo →</Link><span className="small muted">See a result in under a minute.</span></div>
      <ol className="steps">
        <li><span>01</span><div><h2>Put a few ideas on the table</h2><p>A place and a time. Or share the link and add ideas together.</p></div></li>
        <li><span>02</span><div><h2>Find your common ground</h2><p>Friends add ideas, vote, or share what they like.</p></div></li>
        <li><span>03</span><div><h2>Make a plan. Go eat.</h2><p>Most approvals wins. Preferences settle a tie, or pick when nobody votes.</p></div></li>
      </ol>
      <div className="table-note"><span className="note-mark" aria-hidden="true">✳</span><p>Made for the everyday<br /><strong>“Where should we eat?”</strong></p></div>
    </section>
    <CreateRoom />
  </main><footer className="site-footer">A little less planning. A little more time together.</footer></>;
}
