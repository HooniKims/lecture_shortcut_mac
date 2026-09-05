import pathlib
exec((pathlib.Path(__file__).with_name('qa-chrome.py')).read_text().split('ids=[]')[0])
p=pathlib.Path('/tmp/CUE Native Window QA.txt');p.write_text('CUE native helper owned test fixture.\n')
try:
 script('tell application "TextEdit" to open POSIX file "'+str(p)+'"')
 time.sleep(.5)
 data=json.loads(subprocess.run([exe],input='{"op":"snapshot"}\n',text=True,capture_output=True).stdout)
 target=next(t for t in data['targets'] if t['kind']=='window' and t['title']=='CUE Native Window QA.txt')
 r=call('send',target=target,displayId=data['displays'][0]['id']);assert r['ok'],r
 time.sleep(.3)
 r=call('toggle',target=target);assert r.get('outcome')=='minimized',r
 r=call('toggle',target=target);assert r.get('outcome')=='shown',r
 time.sleep(.3)
 r=call('capture');assert r['target']['title']==target['title'],r
 r=call('prepare',target=target);assert r.get('outcome')=='minimized',r
 r=call('prepare',target=target);assert r.get('outcome')=='prepared',r
 script('tell application "TextEdit" to close document "CUE Native Window QA.txt" saving no')
 r=call('send',target=target);assert not r['ok'],r
 print('PASS generic send, minimize, restore, capture, prepare, closed-window error')
finally:
 subprocess.run(['osascript','-e','tell application "TextEdit"\ntry\nclose document "CUE Native Window QA.txt" saving no\nend try\nend tell'],capture_output=True)
