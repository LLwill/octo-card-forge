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

export function createPreviewDocument(artifact: CardArtifactV1, sample: ArtifactSample): string {
  const resources = deriveProfileResourceUrls(artifact);
  const styles = [resources.theme, resources.stylesheet]
    .filter((value): value is string => Boolean(value))
    .map((url) => `<link rel="stylesheet" href="${escapeAttribute(url)}">`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8">${styles}<style>
html,body{margin:0;min-height:100%;background:#f5f7f8;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{padding:24px 18px;box-sizing:border-box}.preview-root{max-width:560px;margin:0 auto}.preview-error{padding:18px;color:#9b2c2c;background:#fff;border:1px solid #e8b4b4;border-radius:6px;white-space:pre-wrap}
</style></head><body><div id="card" class="preview-root octo-card-profile"></div><script src="${escapeAttribute(resources.adaptiveCardsSdk)}"></script><script>
const hostConfigUrl=${jsonForScript(resources.hostConfig)};const payload=${jsonForScript(sample.card)};Promise.resolve().then(async()=>{const response=await fetch(hostConfigUrl);if(!response.ok)throw new Error('HostConfig '+response.status);const config=await response.json();const card=new AdaptiveCards.AdaptiveCard();card.hostConfig=new AdaptiveCards.HostConfig(config);card.onExecuteAction=(action)=>console.info('Action blocked in Forge preview',action?.getJsonTypeName?.());card.parse(payload);const rendered=card.render();if(!rendered)throw new Error('Adaptive Card SDK did not return a rendered element');document.getElementById('card').append(rendered)}).catch((error)=>{const root=document.getElementById('card');root.className='preview-error';root.textContent=String(error?.message||error)});
</script></body></html>`;
}
