import subprocess,json,time,pathlib
exe=str(pathlib.Path('src-tauri/binaries/cue-native-aarch64-apple-darwin').resolve())
def script(s):
 r=subprocess.run(['osascript','-e',s],capture_output=True,text=True)
 if r.returncode: raise RuntimeError(r.stderr)
 return r.stdout.strip()
def call(op,**kwargs):
 r=subprocess.run([exe],input=json.dumps({'op':op,**kwargs})+'\n',text=True,capture_output=True)
 data=json.loads(r.stdout)
 print(op,json.dumps(data,ensure_ascii=False))
 return data
ids=[]
try:
 wid=script('tell application "Google Chrome"\nset w to make new window\nset URL of active tab of w to "data:text/html,<title>CUE QA A</title>A"\nmake new tab at end of tabs of w with properties {URL:"data:text/html,<title>CUE QA B</title>B"}\nreturn id of w\nend tell')
 ids.append(wid)
 time.sleep(.3)
 data=json.loads(subprocess.run([exe],input='{"op":"snapshot"}\n',text=True,capture_output=True).stdout)
 target=next(t for t in data['targets'] if t['kind']=='tab' and t['title']=='CUE QA B')
 display=data['displays'][0]['id']
 stale=dict(target,pid=-1,tabId=next(t['tabId'] for t in data['targets'] if t['kind']=='tab' and t['title']=='CUE QA A'))
 r=call('send',target=stale,tabMode='window');assert r['target']['tabId']==target['tabId'],r
 r=call('send',target=target,displayId=display,tabMode='detach'); assert r['ok'],r
 target=r['target'];ids.append(target['windowId']);time.sleep(.3)
 assert target['windowId'] != wid
 assert script(f'tell application "Google Chrome" to count tabs of window id {target["windowId"]}')=='1'
 assert script(f'tell application "Google Chrome" to count tabs of window id {wid}')=='1'
 r=call('toggle',target=target,displayId=display);ids.append(r.get('target',{}).get('windowId','0'));assert r.get('outcome')=='minimized',r
 assert script(f'tell application "Google Chrome" to minimized of window id {target["windowId"]}')=='true'
 r=call('toggle',target=target,displayId=display);assert r.get('outcome')=='shown',r
 time.sleep(.3)
 r=call('capture');assert r['target']['title']=='CUE QA B',r
 script(f'tell application "Google Chrome" to close window id {target["windowId"]}')
 r=call('send',target=target,displayId=display);assert r.get('outcome')=='reopened',r
 ids.append(r['target']['windowId'])
 print('PASS chrome detach, minimize, restore, capture, reopen')
finally:
 for wid in set(ids):
  subprocess.run(['osascript','-e',f'tell application "Google Chrome"\ntry\nclose window id {wid}\nend try\nend tell'],capture_output=True)
