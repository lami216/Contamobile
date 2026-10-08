from pathlib import Path
import hashlib,json,shutil
repo=Path(__file__).resolve().parent.parent
source=repo/'approved-runtime';target=repo/'approved-android/app/src/main/assets/approved';target.mkdir(parents=True,exist_ok=True)
for name,digest in json.loads((source/'reference-sha256.json').read_text()).items():
    assert hashlib.sha256((source/name).read_bytes()).hexdigest()==digest, 'Reference changed: '+name
    shutil.copyfile(source/name,target/name)
for name in ['native-adapter.js','native.css']:shutil.copyfile(source/name,target/name)
fonts=target/'assets';fonts.mkdir(exist_ok=True)
for name in ['StitchArabic.ttf','StitchArabicBold.ttf','OFL-IBM-Plex.txt']:shutil.copyfile(repo/'assets/fonts'/name,fonts/name)
s=(target/'index.html').read_text(encoding='utf-8').replace('</head>','<link rel="stylesheet" href="native.css"></head>').replace('<script src="engine.js">','<script src="native-adapter.js"></script><script src="engine.js">')
(target/'index.html').write_text(s,encoding='utf-8')
p=target/'app.js';s=p.read_text(encoding='utf-8')
s=s.replace("async function offerExport(name,blob){", "async function offerExport(name,blob){await window.NativeFiles.saveBlob(name,blob);modal=null;render();toast('تم حفظ الملف');return;}async function unusedBrowserOfferExport(name,blob){")
s=s.replace("function download(name,text,type='application/json'){", "function download(name,text,type='application/json'){return window.NativeFiles.saveBlob(name,new Blob([text],{type}));}function unusedBrowserDownload(name,text,type='application/json'){")
s=s.replace("download('alkarna-'+today()+'.json'", "await download('alkarna-'+today()+'.json'")
s=s.replace("if('serviceWorker' in navigator)", "if(false&&'serviceWorker' in navigator)")
p.write_text(s,encoding='utf-8')
p=target/'barcode-camera.js';s=p.read_text(encoding='utf-8').replace("export async function scanProductBarcode(input,{onError=()=>{}}={}){", "export async function scanProductBarcode(input,{onError=()=>{}}={}){if(window.NativeFiles){try{const result=await window.NativeFiles.scan();if(result.value){input.value=result.value;input.dispatchEvent(new Event('input',{bubbles:true}));input.focus()}}catch(e){onError(e.message)}return;}")
p.write_text(s,encoding='utf-8')
icons=repo/'approved-android/app/src/main/res/drawable';icons.mkdir(exist_ok=True);shutil.copyfile(repo/'assets/icon.png',icons/'app_icon.png')
print('Pinned approved site packaged without localhost, recovery pages, personal records or credentials')
