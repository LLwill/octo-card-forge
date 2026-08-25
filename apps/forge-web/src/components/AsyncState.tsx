import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";

export function LoadingState({ label }: { label: string }) {
  return <div className="async-state"><LoaderCircle className="spin" size={24} /><strong>{label}</strong></div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="async-state error-state"><AlertCircle size={26} /><strong>Unable to load this view</strong><p>{message}</p>{retry ? <button className="button secondary" type="button" onClick={retry}><RefreshCw size={16} />Retry</button> : null}</div>;
}
