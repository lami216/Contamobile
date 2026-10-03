from pathlib import Path
import urllib.request,hashlib
folder=Path('assets/fonts');folder.mkdir(parents=True,exist_ok=True)
files=[
('StitchArabic.ttf','https://raw.githubusercontent.com/google/fonts/9710da1eacb3be272583c3224dcb70f9da6eadbb/ofl/ibmplexsansarabic/IBMPlexSansArabic-Regular.ttf','e779068718b9801b809605b2bf3067121cce524c'),
('StitchArabicBold.ttf','https://raw.githubusercontent.com/google/fonts/9710da1eacb3be272583c3224dcb70f9da6eadbb/ofl/ibmplexsansarabic/IBMPlexSansArabic-Bold.ttf','211ff62d8d1778bff69a1b3a906b2ad1686564bc'),
('StitchIcons.otf','https://raw.githubusercontent.com/google/material-design-icons/737e3324305806514d7909874fa1818ae1808232/font/MaterialIconsOutlined-Regular.otf','9dad12bcf1a538c2ec3b0dc88edddab2f0de2c3d'),
]
for name,url,expected in files:
 data=urllib.request.urlopen(url,timeout=60).read()
 actual=hashlib.sha1(('blob '+str(len(data))+'\0').encode()+data).hexdigest()
 if actual!=expected:raise ValueError('Font integrity mismatch: '+name)
 (folder/name).write_bytes(data)
for name,url in [('OFL-IBM-Plex.txt','https://raw.githubusercontent.com/google/fonts/9710da1eacb3be272583c3224dcb70f9da6eadbb/ofl/ibmplexsansarabic/OFL.txt'),('Apache-Material-Icons.txt','https://raw.githubusercontent.com/google/material-design-icons/737e3324305806514d7909874fa1818ae1808232/LICENSE')]:
 (folder/name).write_bytes(urllib.request.urlopen(url,timeout=60).read())
print('Pinned offline fonts ready')
