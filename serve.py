"""Serve AstroHub locally at http://localhost:8080 with caching disabled,
so the browser always picks up the latest files after you edit them."""
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
        print(f"AstroHub running at http://localhost:{PORT}  (Ctrl+C to stop)")
        httpd.serve_forever()
