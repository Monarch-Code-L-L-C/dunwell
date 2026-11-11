import Link from 'next/link';

export default function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-x-7 gap-y-3 px-6 py-[18px]">
        <Link href="/" className="flex items-center gap-2.5 font-serif text-[26px] font-semibold">
          <span aria-hidden="true" className="inline-flex h-7 w-7 -rotate-6 items-center justify-center rounded-[5px] border-2 border-red text-[17px] text-red">D</span>
          Dunwell
        </Link>
        <nav aria-label="Main" className="ml-auto flex flex-wrap gap-6 text-[15px] text-nav">
          <Link href="/#tools" className="hover:text-green">Tools</Link>
          <Link href="/pricing" className="hover:text-green">Pricing</Link>
        </nav>
        <Link href="/app" className="rounded-lg bg-ink px-[18px] py-[11px] text-[15px] font-semibold text-paper">Sign in</Link>
      </div>
    </header>
  );
}
