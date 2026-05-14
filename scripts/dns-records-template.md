# DNS records template — Hawkeye Sterling (audit L-01)

The domain `hawkeye-sterling.netlify.app` currently has **no SPF / DKIM / DMARC**, leaving it spoofable. The audit flagged this as LOW severity but worth closing.

Netlify subdomains (`*.netlify.app`) are owned by Netlify, so you cannot set TXT records directly. The standard remedies are:

## Option A — Move to a custom domain you control (recommended)

1. Buy/own a custom domain (e.g. `hawkeye-sterling.com`).
2. In Netlify → Site settings → Domain management → add the custom domain.
3. At your DNS provider, add these records (replace `selector1`/values with your mail provider's actual selector + DKIM key):

```
; SPF — restrict who can send mail "from" this domain
hawkeye-sterling.com.            IN  TXT  "v=spf1 include:_spf.google.com -all"

; DKIM — your mail provider's published selector/key
selector1._domainkey.hawkeye-sterling.com.  IN  TXT  "v=DKIM1; k=rsa; p=<base64-public-key-from-your-mail-provider>"

; DMARC — start at p=none to monitor, then upgrade to p=quarantine then p=reject
_dmarc.hawkeye-sterling.com.     IN  TXT  "v=DMARC1; p=none; rua=mailto:dmarc-reports@hawkeye-sterling.com; ruf=mailto:dmarc-forensic@hawkeye-sterling.com; fo=1; pct=100"
```

After 30 days of `p=none` reports, upgrade DMARC:
```
_dmarc.hawkeye-sterling.com.     IN  TXT  "v=DMARC1; p=quarantine; rua=...; pct=25"
```
Then to `p=reject; pct=100` once you're confident.

## Option B — Stay on `*.netlify.app` and accept the spoofing risk

Netlify subdomains can't host TXT records you control. The risk is real: anyone can `MAIL FROM: anything@hawkeye-sterling.netlify.app` because there's no SPF policy to reject. Receivers may still apply heuristics, but no policy is enforced.

If you don't send transactional mail from this hostname, real-world impact is small. If you do (alerts, password resets, etc.), Option A is the right move.

## Verify after setting

```bash
dig +short TXT hawkeye-sterling.com
dig +short TXT selector1._domainkey.hawkeye-sterling.com
dig +short TXT _dmarc.hawkeye-sterling.com

# Online checker:
# https://mxtoolbox.com/SuperTool.aspx (domain → DMARC Lookup)
```

The next system_status / domain_intel check should report `spoofingRisk: low`, `hasSPF: true`, `hasDKIM: true`, `hasDMARC: true`.
