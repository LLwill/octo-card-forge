import { AlertCircle, LoaderCircle, RefreshCw } from "lucide-react";

export function LoadingState({ label }: { label: string }) {
  return <div className="async-state"><LoaderCircle className="spin" size={24} /><strong>{label}</strong></div>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="async-state error-state"><AlertCircle size={26} /><strong>页面加载失败</strong><p>{message}</p>{retry ? <button className="button secondary" type="button" onClick={retry}><RefreshCw size={16} />重新加载</button> : null}</div>;
}
