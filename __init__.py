import os
import subprocess
import importlib.util
import sys
import json
import execution
import uuid
import hashlib
import datetime
import folder_paths
import logging
import base64
import io
import re
import random
from PIL import Image
from comfy.cli_args import args
python = sys.executable

#修复 sys.stdout.isatty()  object has no attribute 'isatty'
try:
    sys.stdout.isatty()
except:
    print('#fix sys.stdout.isatty')
    sys.stdout.isatty = lambda: False

_URL_=None

from server import PromptServer

try:
    import aiohttp
    from aiohttp import web
except ImportError:
    print("Module 'aiohttp' not installed. Please install it via:")
    print("pip install aiohttp")
    print("or")
    print("pip install -r requirements.txt")
    sys.exit()

def is_installed(package, package_overwrite=None,auto_install=True):
    is_has=False
    try:
        spec = importlib.util.find_spec(package)
        is_has=spec is not None
    except ModuleNotFoundError:
        pass

    package = package_overwrite or package

    if spec is None:
        if auto_install==True:
            print(f"Installing {package}...")
            command = f'"{python}" -m pip install {package}'
            result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True, env=os.environ)
            is_has=True
            if result.returncode != 0:
                print(f"Couldn't install\nCommand: {command}\nError code: {result.returncode}")
                is_has=False
    else:
        print(package+'## OK')

    return is_has

try:
    import OpenSSL
except ImportError:
    print("Module 'pyOpenSSL' not installed. Please install it via:")
    print("pip install pyOpenSSL")
    print("or")
    print("pip install -r requirements.txt")
    is_installed('pyOpenSSL')
    sys.exit()

try:
    import watchdog
except ImportError:
    print("Module 'watchdog' not installed. Please install it via:")
    print("pip install watchdog")
    print("or")
    print("pip install -r requirements.txt")
    is_installed('watchdog')
    sys.exit()

current_path = os.path.abspath(os.path.dirname(__file__))

def create_key(key_p,crt_p):
    import OpenSSL
    private_key = OpenSSL.crypto.PKey()
    private_key.generate_key(OpenSSL.crypto.TYPE_RSA, 2048)

    csr = OpenSSL.crypto.X509Req()
    csr.get_subject().CN = "8i.com"
    csr.set_pubkey(private_key)
    csr.sign(private_key, "sha256")
    
    certificate = OpenSSL.crypto.X509()
    certificate.set_serial_number(1)
    certificate.gmtime_adj_notBefore(0)
    certificate.gmtime_adj_notAfter(365 * 24 * 60 * 60)
    certificate.set_issuer(csr.get_subject())
    certificate.set_subject(csr.get_subject())
    certificate.set_pubkey(csr.get_pubkey())
    certificate.sign(private_key, "sha256")
    
    with open(key_p, "wb") as f:
        f.write(OpenSSL.crypto.dump_privatekey(OpenSSL.crypto.FILETYPE_PEM, private_key))

    with open(crt_p, "wb") as f:
        f.write(OpenSSL.crypto.dump_certificate(OpenSSL.crypto.FILETYPE_PEM, certificate))
    return

def create_for_https():
    https_key_path=os.path.join(current_path, "https")
    crt=os.path.join(https_key_path, "certificate.crt")
    key=os.path.join(https_key_path, "private.key")
    if not os.path.exists(https_key_path):
        os.mkdir(https_key_path)
    if not os.path.exists(crt):
        create_key(key,crt)
    return (crt,key)

# 保存原始的 get 方法
_original_request = aiohttp.ClientSession._request

# 定义新的 get 方法
async def new_request(self, method, url, *args, **kwargs):
    proxy = os.environ.get('HTTP_PROXY') or os.environ.get('HTTPS_PROXY') or os.environ.get('http_proxy') or os.environ.get('https_proxy')
    if proxy and 'proxy' not in kwargs:
        kwargs['proxy'] = proxy
        print('Use Proxy:',proxy)
    return await _original_request(self, method, url, *args, **kwargs)

# 应用 Monkey Patch
aiohttp.ClientSession._request = new_request
import socket

async def check_port_available(address, port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((address, port))
            return True
        except socket.error:
            return False

# https
async def new_start(self, address, port, verbose=True, call_on_start=None):
    global _URL_
    try:
        runner = web.AppRunner(self.app, access_log=None)
        await runner.setup()

        http_success = False
        http_port=port
        for i in range(11):
            if await check_port_available(address, port + i):
                http_port = port + i
                site = web.TCPSite(runner, address, http_port)
                await site.start()
                http_success = True
                break

        if not http_success:
            raise RuntimeError(f"Ports {port} to {port + 10} are all in use.")

        ssl_context = None
        scheme = "http"
        try:
            if args.tls_keyfile and args.tls_certfile:
                scheme = "https"
                ssl_context = ssl.SSLContext(protocol=ssl.PROTOCOL_TLS_SERVER, verify_mode=ssl.CERT_NONE)
                ssl_context.load_cert_chain(certfile=args.tls_certfile,
                                    keyfile=args.tls_keyfile)
            else:
                import ssl
                crt, key = create_for_https()
                ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
                ssl_context.load_cert_chain(crt, key)
        except:
            import ssl
            crt, key = create_for_https()
            ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
            ssl_context.load_cert_chain(crt, key)

        success = False
        for i in range(11):
            if await check_port_available(address, http_port + 1 + i):
                https_port = http_port + 1 + i
                site2 = web.TCPSite(runner, address, https_port, ssl_context=ssl_context)
                await site2.start()
                success = True
                break

        if not success:
            raise RuntimeError(f"Ports {http_port + 1} to {http_port + 10} are all in use.")

        if address == '':
            address = '127.0.0.1'
        if address=='0.0.0.0':
            address = '127.0.0.1'

        if verbose:
            logging.info("\n")
            logging.info("\n\nStarting server")

            import socket
            hostname = socket.gethostname()
            try:
                ip_address = socket.gethostbyname(hostname)
            except Exception as e:
                logging.debug("[8i]gethostbyname() downgraded due to exception:", e)
                ip_address = socket.gethostbyname("")

            logging.info("\033[93mTo see the GUI go to: http://{}:{} or http://{}:{}".format(ip_address, http_port,address,http_port))
            logging.info("\033[93mTo see the GUI go to: https://{}:{} or https://{}:{}\033[0m".format(ip_address, https_port,address,https_port))

        if call_on_start is not None:
            try:
                if scheme=='https':
                    call_on_start(scheme,address, https_port)
                else:
                    call_on_start(scheme,address, http_port)
            except:
                call_on_start(address,http_port)

    except Exception as e:
        print(f"Error starting the server: {e}")

PromptServer.start=new_start

# 创建路由表
routes = PromptServer.instance.routes

@routes.get('/8i/app')
async def mixlab_app_handler(request):
    return web.FileResponse(os.path.join(current_path, "webApp", "index.html"))

@routes.get('/8i/app/{filename:.*}')
async def static_file_handler(request):
    filename = request.match_info['filename']
    return web.FileResponse(os.path.join(current_path, "webApp", filename))

@routes.get('/8i/status')
def mix_status(request):
    return web.Response(text="running#"+_URL_)

# 导入节点
from .nodes.ImageNode import Image3D, DepthViewer_

# 要导出的所有节点及其名称的字典
NODE_CLASS_MAPPINGS = {
    # 3D
    "3DImage": Image3D,
    "DepthViewer": DepthViewer_,
}

# 一个包含节点友好/可读的标题的字典
NODE_DISPLAY_NAME_MAPPINGS = {
    # 3D
    "3DImage": "8i - 3Dplayer",
}

# web ui的节点功能
WEB_DIRECTORY = "web"

logging.info('--------------')
logging.info('\033[91m ### 8i Nodes: \033[93mLoaded')
logging.info('\033[93m -------------- \033[0m')
