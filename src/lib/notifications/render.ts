import { business, hasBasrat } from "@config/business";
import { token } from "@/lib/theme-tokens";

/** {{var}} substitution. Unknown variables render as empty strings; blank lines left behind are collapsed. */
export function renderTemplate(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => (vars[k] === null || vars[k] === undefined ? "" : String(vars[k])))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain text → branded HTML email. Brand colours come from config/theme.css. */
export function textToEmailHtml(text: string, opts: { preheader?: string } = {}): string {
  const ink = token("ink");
  const bone = token("bone");
  const primary = token("primary-strong");
  const mist = token("mist");
  const white = token("white");

  const body = text
    .split(/\n{2,}/)
    .map((para) => {
      const html = esc(para)
        .replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}" style="color:${primary};word-break:break-all">${url}</a>`)
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px;line-height:1.6">${html}</p>`;
    })
    .join("");

  const regulator = hasBasrat() ? ` · BASRaT ${esc(business.practitioner.basratNumber)}` : "";
  return `<!doctype html><html><body style="margin:0;background:${bone};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:${ink}">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader ?? "")}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bone};padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${white};border-radius:16px;overflow:hidden">
<tr><td style="background:${ink};padding:22px 28px;color:${white};font-weight:700;letter-spacing:.04em;font-size:15px">${esc(business.name)}</td></tr>
<tr><td style="padding:28px;font-size:15px">${body}</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid ${bone};color:${mist};font-size:12px;line-height:1.5">
${esc(business.practitioner.name)}, ${esc(business.practitioner.title)}${regulator}<br>
${esc(business.address.venue)}, ${esc(business.address.line1)}, ${esc(business.address.city)} ${esc(business.address.postcode)}<br>
${esc(business.contact.phone)} · ${esc(business.contact.email)}
</td></tr></table></td></tr></table></body></html>`;
}
