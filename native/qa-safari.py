import pathlib
exec((pathlib.Path(__file__).with_name('qa-chrome.py')).read_text().split('ids=[]')[0])
paths=[];ids=[]
try:
 for name in ['A','B']:
  p=pathlib.Path('/tmp/cue-safari-'+name+'.html');p.write_text('<title>CUE Safari '+name+'</title><input value="unchanged">');paths.append(p)
 wid=script('tell application "Safari"\nmake new document with properties {URL:"'+paths[0].as_uri()+'"}\nmake new tab at end of tabs of front window with properties {URL:"'+paths[1].as_uri()+'"}\nreturn id of front window\nend tell');ids.append(wid)
 time.sleep(.5)
 data=json.loads(subprocess.run([exe],input='{"op":"snapshot"}\n',text=True,capture_output=True).stdout)
 print('OWN SAFARI TABS',[t for t in data['targets'] if t.get('url','').startswith('file:///tmp/cue-safari')])
 target=next(t for t in data['targets'] if t['kind']=='tab' and t['title']=='CUE Safari B')
 r=call('send',target=target,displayId=data['displays'][0]['id'],tabMode='window');assert r['ok'],r
 time.sleep(.3)
 r=call('toggle',target=target,tabMode='window');assert r.get('outcome')=='minimized',r
 r=call('send',target=target,displayId=data['displays'][0]['id'],tabMode='detach');assert r['ok'],r
 ids.append(r['target']['windowId'])
 print('PASS SAFARI')
finally:
 for wid in set(ids):
  subprocess.run(['osascript','-e',f'tell application "Safari"\ntry\nclose window id {wid}\nend try\nend tell'],capture_output=True)
