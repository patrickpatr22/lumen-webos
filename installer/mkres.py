# Win32-Ressourcen für den Installer: Manifest (asInvoker, DPI, Common Controls 6) + Symbol.
# Ohne Manifest würde Windows wegen „Installer“ im Namen nach Administratorrechten fragen.
import struct, io, sys
from PIL import Image

MANIFEST = b'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity version="1.0.0.0" name="Lumen.Installer" type="win32"/>
  <description>Lumen Installer</description>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v2">
    <security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security>
  </trustInfo>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
    <application><supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/></application>
  </compatibility>
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings><dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true</dpiAware></windowsSettings>
  </application>
  <dependency><dependentAssembly>
    <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*"/>
  </dependentAssembly></dependency>
</assembly>
'''

def entry(rtype, rid, data, flags=0x1030, lang=0x0409):
    hdr = struct.pack('<II', len(data), 32) + struct.pack('<HH', 0xFFFF, rtype) + struct.pack('<HH', 0xFFFF, rid)
    hdr += struct.pack('<IHHII', 0, flags, lang, 0, 0)
    pad = (-len(data)) % 4
    return hdr + data + b'\0' * pad

def icon_images(png):
    im = Image.open(png).convert('RGBA')
    out = []
    for s in (16, 24, 32, 48, 64, 256):
        b = io.BytesIO()
        im.resize((s, s), Image.LANCZOS).save(b, 'PNG')
        out.append((s, b.getvalue()))
    return out

res = struct.pack('<II', 0, 32) + struct.pack('<HHHH', 0xFFFF, 0, 0xFFFF, 0) + struct.pack('<IHHII', 0, 0, 0, 0, 0)
imgs = icon_images(sys.argv[1])
grp = struct.pack('<HHH', 0, 1, len(imgs))
for i, (s, data) in enumerate(imgs, 1):
    res += entry(3, i, data)
    grp += struct.pack('<BBBBHHIH', s % 256, s % 256, 0, 0, 1, 32, len(data), i)
res += entry(14, 32512, grp)
res += entry(24, 1, MANIFEST, flags=0x0030)
open(sys.argv[2], 'wb').write(res)
print('res', len(res))
