import type { CardArtifactV1 } from "@mlt-org/octo-card-catalog-snapshot";
import { deriveProfileResourceUrls } from "../data.js";

type ArtifactSample = CardArtifactV1["views"][string]["samples"][number];

function escapeAttribute(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("</script", "<\\/script");
}

export function createPreviewDocument(
  artifact: CardArtifactV1,
  sample: ArtifactSample,
  profileBaseUrl?: string,
): string {
  const resources = deriveProfileResourceUrls(artifact, profileBaseUrl);
  return createRawCardDocument(sample.card, {
    hostConfigUrl: resources.hostConfig,
    stylesheetUrls: [resources.theme, resources.stylesheet].filter((value): value is string => Boolean(value)),
    adaptiveCardsSdkUrl: resources.adaptiveCardsSdk,
  });
}

export interface PreviewResources {
  hostConfig?: unknown;
  hostConfigUrl?: string;
  stylesheetUrls: string[];
  adaptiveCardsSdkUrl: string;
}

export function createRawCardDocument(card: unknown, resources: PreviewResources): string {
  const styles = resources.stylesheetUrls
    .map((url) => `<link rel="stylesheet" href="${escapeAttribute(url)}">`)
    .join("");
  const hostConfigSource = resources.hostConfigUrl
    ? `const response=await fetch(${jsonForScript(resources.hostConfigUrl)});if(!response.ok)throw new Error('HostConfig '+response.status);return response.json()`
    : `return ${jsonForScript(resources.hostConfig ?? {})}`;
  return `<!doctype html><html><head><meta charset="utf-8">${styles}<style>
html,body{margin:0;overflow:hidden;background:#f5f7f8;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{padding:24px 18px;box-sizing:border-box}.preview-root{max-width:560px;margin:0 auto}.preview-error{padding:18px;color:#9b2c2c;background:#fff;border:1px solid #e8b4b4;border-radius:6px;white-space:pre-wrap}
</style></head><body><div id="card" class="preview-root octo-card-profile"></div><script src="${escapeAttribute(resources.adaptiveCardsSdkUrl)}"></script><script>
const notifySize=()=>requestAnimationFrame(()=>parent.postMessage({type:'octo-card-preview:resize',height:Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)},'*'));new ResizeObserver(notifySize).observe(document.body);window.addEventListener('load',notifySize);const payload=${jsonForScript(card)};Promise.resolve().then(async()=>{const config=await(async()=>{${hostConfigSource}})();const adaptiveCard=new AdaptiveCards.AdaptiveCard();adaptiveCard.hostConfig=new AdaptiveCards.HostConfig(config);adaptiveCard.onExecuteAction=(action)=>console.info('Action blocked in Forge preview',action?.getJsonTypeName?.());adaptiveCard.parse(payload);const rendered=adaptiveCard.render();if(!rendered)throw new Error('Adaptive Card SDK did not return a rendered element');document.getElementById('card').append(rendered);notifySize()}).catch((error)=>{const root=document.getElementById('card');root.className='preview-error';root.textContent=String(error?.message||error);notifySize()});
</script></body></html>`;
}
