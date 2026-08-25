export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return <main className="page placeholder-page"><header className="page-header"><div><span className="eyebrow">Forge workspace</span><h1>{title}</h1><p>{description}</p></div></header><div className="empty-panel"><strong>{title} migration is queued</strong><span>This route is live and will receive the next product slice.</span></div></main>;
}
