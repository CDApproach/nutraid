#!/usr/bin/env python3
"""Lokaler Server ohne Browser-Cache, damit Änderungen sofort sichtbar sind.
Leitet außerdem die Open-Food-Facts-Namenssuche weiter (deren Such-API erlaubt keine Browser-Anfragen)."""
import argparse
import functools
import http.server
import urllib.parse
import urllib.request
from pathlib import Path

OFF_SEARCH = "https://search.openfoodfacts.org/search"
OFF_FIELDS = "code,product_name,brands,nutriments,serving_quantity"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path != "/api/off-search":
            return super().do_GET()
        q = urllib.parse.parse_qs(url.query).get("q", [""])[0][:100]
        params = urllib.parse.urlencode({"q": q, "page_size": 10, "fields": OFF_FIELDS, "langs": "de"})
        req = urllib.request.Request(f"{OFF_SEARCH}?{params}", headers={"User-Agent": "NutrAid/1.0 (https://github.com/CDApproach/nutraid)"})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                body = r.read()
            self.send_response(200)
        except Exception:
            body = b'{"hits": []}'
            self.send_response(502)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8773)
    args = ap.parse_args()
    handler = functools.partial(NoCacheHandler, directory=str(Path(__file__).parent))
    print(f"NutrAid läuft auf http://{args.host}:{args.port}")
    http.server.ThreadingHTTPServer((args.host, args.port), handler).serve_forever()
