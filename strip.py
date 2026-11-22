"""strip.py — 広告・トラッキング要素の除去"""
import re

RULES = [
    (r"<!--\s*PC Slider\s*-->", ""),
    (r"<!--\s*PC\s+728\*90\s*-->", ""),
    (r"<!--\s*Bance Native [12]\s*-->", ""),
    (r'<div id="bnc_ad_\d+"></div>\s*<script[^>]*bnctag\.js[^>]*></script>\s*<script>[\s\S]*?</script>', ""),
    (r'<div id="bnc_ad_\d+"></div>', ""),
    (r'<div style="margin: 0 auto 50px auto;[^"]*">\s*</div>', ""),
    (r'<div class="pop--excl" style="display: inline;">\s*</div>', ""),
    (r'<script[^>]*src="https://glimmersmugglingsullen\.com[^"]*"[^>]*></script>', ""),
    (r'<script data-cfasync="false">[\s\S]*?</script>', ""),
]

ANALYTICS = [
    (r'<script async="" src="https://www\.googletagmanager\.com[\s\S]*?</script>', ""),
    (r'<script>\s*window\.dataLayer[\s\S]*?</script>', ""),
]

_COMPILED = [(re.compile(p), r) for p, r in RULES]
_ANALYTICS = [(re.compile(p), r) for p, r in ANALYTICS]


def strip_ads(html: str, analytics: bool = False) -> str:
    for rx, rep in _COMPILED:
        html = rx.sub(rep, html)
    if analytics:
        for rx, rep in _ANALYTICS:
            html = rx.sub(rep, html)
    return html