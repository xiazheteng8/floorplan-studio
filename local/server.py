#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
3DNest FloorPlan Studio - 自动化本地局域网服务
支持直接通过 本地IP:端口 访问，默认自动映射根路径 / 到 index.html
"""
import os
import socket
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'

class CustomHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_GET(self):
        # 无论是否带有尾部斜杠，访问根路径统一返回 index.html
        if self.path in ('', '/', '/index'):
            self.path = '/index.html'
        return super().do_GET()

def run():
    os.chdir(DIRECTORY)
    server_address = ('0.0.0.0', PORT)
    httpd = ThreadingHTTPServer(server_address, CustomHandler)
    local_ip = get_local_ip()

    print("=" * 60)
    print("  3DNest FloorPlan Studio - 服务已启动")
    print("=" * 60)
    print(f"  • 本机直接访问:   http://localhost:{PORT}")
    print(f"  • 局域网其他设备: http://{local_ip}:{PORT}")
    print("  (提示: 直接访问 IP:端口 即可，无需在末尾拼接 /index.html)")
    print("=" * 60)
    print("  按 Ctrl+C 可停止服务")
    print("=" * 60)

    try:
        webbrowser.open(f"http://localhost:{PORT}")
    except Exception:
        pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已平稳停止。")

if __name__ == '__main__':
    run()
