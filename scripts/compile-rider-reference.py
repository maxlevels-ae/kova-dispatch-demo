"""Port canonical markup to React; never execute prototype mock business logic.
The source ZIP/HTML is immutable. Production substitutions are explicit below.
"""
from html.parser import HTMLParser
from pathlib import Path
import json,re,hashlib
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'design/reference/prototype/Maxride App.dc.html'
class Node:
 def __init__(self,tag='',attrs=None): self.tag=tag;self.attrs=dict(attrs or []);self.children=[]
class Parser(HTMLParser):
 def __init__(self): super().__init__(convert_charrefs=True);self.root=Node();self.stack=[self.root]
 def handle_starttag(self,tag,attrs):
  n=Node(tag,attrs);self.stack[-1].children.append(n)
  if tag not in ['img','input','meta','link','br','hr']:self.stack.append(n)
 def handle_endtag(self,tag):
  for i in range(len(self.stack)-1,0,-1):
   if self.stack[i].tag==tag:self.stack=self.stack[:i];break
 def handle_data(self,text):self.stack[-1].children.append(text)
def walk(n):
 yield n
 for c in n.children:
  if isinstance(c,Node):yield from walk(c)
def words(n):return ''.join(c if isinstance(c,str) else words(c) for c in n.children).strip()
def expr(s,local):
 s=s.strip();return s if s.split('.')[0] in local else 'v.'+s
def val(s,local):
 parts=re.split(r'({{.*?}})',s)
 out=[expr(p[2:-2],local) if p.startswith('{{') else json.dumps(p,ensure_ascii=False) for p in parts if p]
 return ' + '.join(out) if out else '""'
def txt(s,local):
 if not s.strip():return ''
 out=[]
 for p in re.split(r'({{.*?}})',s):
  if not p:continue
  if p.startswith('{{'):out.append('{'+expr(p[2:-2],local)+'}')
  else:out.append('{t('+json.dumps(p,ensure_ascii=False)+')}')
 return ''.join(out)
def style(s,local):
 result={}
 for chunk in s.split(';'):
  if ':' not in chunk:continue
  key,value=chunk.split(':',1);key=key.strip();value=value.strip()
  key={'left':'inset-inline-start','right':'inset-inline-end','margin-left':'margin-inline-start','margin-right':'margin-inline-end','padding-left':'padding-inline-start','padding-right':'padding-inline-end'}.get(key,key)
  if key=='text-align' and value=='left':value='start'
  if key=='text-align' and value=='right':value='end'
  key=re.sub(r'-([a-z])',lambda m:m[1].upper(),key)
  result[key]=val(value,local)
 return '{'+','.join(json.dumps(k)+':'+v for k,v in result.items())+'}'
def render(n,local=(),depth=0):
 if isinstance(n,str):return txt(n,local)
 if n.tag=='slot':return '{v.'+n.attrs['name']+'}'
 if n.tag=='sc-if':return '{'+expr(n.attrs['value'][2:-2],local)+' && <>'+''.join(render(c,local,depth+1) for c in n.children)+'</>}'
 if n.tag=='sc-for':
  name=n.attrs['as'];items=expr(n.attrs['list'][2:-2],local)
  return '{'+items+'.map(('+name+',index)=><Fragment key={'+name+'.id || index}>'+''.join(render(c,(*local,name),depth+1) for c in n.children)+'</Fragment>)}'
 attrs=[]
 for k,value in n.attrs.items():
  if k.startswith('hint-'):continue
  if k=='style':attrs.append('style={'+style(value,local)+'}');continue
  k={'onclick':'onClick','onkeydown':'onKeyDown','tabindex':'tabIndex','class':'className','stroke-linecap':'strokeLinecap','stroke-linejoin':'strokeLinejoin','stroke-width':'strokeWidth'}.get(k,k)
  if k=='src' and value.startswith('assets/'):value='/rider-assets/'+value[7:]
  if value is None:attrs.append(k)
  elif '{{' in value:attrs.append(k+'={'+val(value,local)+'}')
  elif k=='aria-label':attrs.append(k+'={t('+json.dumps(value,ensure_ascii=False)+')}')
  else:attrs.append(k+'='+json.dumps(value,ensure_ascii=False))
 if n.tag=='img' and 'alt' not in n.attrs:attrs.append('alt=""')
 if n.tag=='button':attrs.append('type="button"')
 start='<'+n.tag+(' '+' '.join(attrs) if attrs else '')
 if n.tag in ['img','input','br','hr']:return start+'/>'
 return start+'>'+''.join(render(c,local,depth+1) for c in n.children)+'</'+n.tag+'>\n'
def slot(name):return Node('slot',[('name',name)])
parser=Parser();parser.feed(SOURCE.read_text(encoding='utf-8'))
frame=next(n for n in walk(parser.root) if 'width:390px;height:844px' in n.attrs.get('style',''))
first=next(i for i,n in enumerate(frame.children) if isinstance(n,Node) and n.tag=='sc-if' and 'isHome' in n.attrs.get('value',''))
frame.children=frame.children[first:]
replacements={'Now':'{{ nowLabel }}','Finding your driver…':'{{ findingTitle }}','Matching you with a nearby {{ selName }}':'{{ searchDescription }}','Sara':'{{ firstName }}','Sara Haddad':'{{ fullName }}','Good morning,':'{{ greeting }}','Good morning, Sara':'{{ greetingName }}','Amir K.':'{{ driverName }}','AK':'{{ driverInitials }}','MX 4821':'{{ vehiclePlate }}','4.92':'{{ userRating }}','4.96 · {{ selName }}':'{{ driverRating }} · {{ selName }}','Rate Amir':'{{ rateLabel }}','Explore Jordan':'{{ exploreTitle }}','Explore all':'{{ exploreCta }}','Trip shared with 2 trusted contacts':'{{ sharingLabel }}','Call emergency services':'{{ emergencyLabel }}','Alert my trusted contacts':'Share trip details','Tell us why. A fee may apply after the driver has arrived.':'{{ cancelPolicy }}','{{ pl.km }} from Amman':'{{ pl.distanceLabel }}','{{ pl.time }} drive':'{{ pl.time }}','Best: {{ pl.best }}':'{{ pl.region }}','Photos':'Photos','Simulate: driver arrived, start trip':'{{ pickupLabel }}','Simulate: arrive at destination':'Message','promo image':'','hero photo · {{ pl.name }}':'','photo · {{ pl.name }}':''}
def change(n,state=''):
 if n.tag=='sc-if' and any(x in n.attrs.get('value','') for x in ['isHome','isMap','isSearch','isOptions','isFinding','isDrive','isRate','isPlace','isGrid','isCancelled','showSos','showCancel','showPay']):
  state=n.attrs['value'][2:-2].strip()
  firstNode=next((c for c in n.children if isinstance(c,Node)),None)
  if firstNode:firstNode.attrs['data-prototype-state']=state
 text=words(n)
 if state=='isDrive' and text in ['Amir K.','{{ selModel }}','{{ selColor }}']:n.attrs['style']=n.attrs.get('style','')+';overflow:hidden;text-overflow:ellipsis'

 if text=='photo' and n.tag=='div':n.children=[slot('avatar')]
 if state=='isSearch' and n.tag=='div' and text=='Current location':n.children=[slot('pickupInput')]
 if state=='isSearch' and n.tag=='div' and text.replace(' ','')=='{{dest}}|':n.children=[slot('destinationInput')]
 if n.tag=='div' and n.attrs.get('onclick')=='{{ sl.go }}':n.attrs.update({'role':'button','tabindex':'0','onkeydown':'{{ sl.key }}'})
 if n.tag=='div' and n.attrs.get('onclick')=='{{ openPay }}':n.attrs.update({'role':'button','tabindex':'0','onkeydown':'{{ payKey }}'})
 if n.tag=='button':
  action=n.attrs.get('onclick','')
  if text=='Home' and state=='isHome':n.attrs['onclick']='{{ savedHome }}'
  if text=='Work' and state=='isHome':n.attrs['onclick']='{{ savedWork }}'
  if text=='Saved Places':n.attrs['onclick']='{{ savedPlaces }}'
  if state=='isMap' and '{{ s.name }}' in text:n.attrs['onclick']='{{ s.pick }}'
  if text=='Cancel' and state=='isFinding':n.attrs['onclick']='{{ openCancel }}'
  if 'Simulate: driver arrived' in text:n.attrs['onclick']='{{ copyPin }}'
  if 'Simulate: arrive' in text:n.attrs['onclick']='{{ openChat }}'
  if text=='Message':n.attrs['onclick']='{{ openChat }}'
  if text=='Sign out':n.attrs['onclick']='{{ signOut }}'
  if text=='Done':n.attrs['onclick']='{{ submitRating }}';n.attrs['disabled']='{{ busy }}'
  if action.strip()=='{{ book }}' or action.strip()=='{{ confirmCancel }}':n.attrs['disabled']='{{ busy }}'
  icons=[c.attrs.get('src') for c in walk(n) if c.tag=='img']
  if not text and 'assets/icons/phone.svg' in icons:n.attrs.update({'onclick':'{{ callDriver }}','aria-label':'Call driver','disabled':'{{ noDriverPhone }}'})
  if not text and 'assets/icons/share.svg' in icons:n.attrs.update({'onclick':'{{ shareTrip }}','aria-label':'Share trip details'})
  if not text and 'assets/icons/back.svg' in icons:n.attrs['aria-label']='Back'
  if not text and 'assets/icons/close.svg' in icons:n.attrs['aria-label']='Close'
  if action.strip()=='{{ nextHero }}':n.attrs['aria-label']='Next banner';n.attrs['disabled']='{{ noHeroes }}'
  if action.strip()=='{{ d.go }}':n.attrs['aria-label']='{{ d.label }}'
  if action.strip()=='{{ s.set }}':n.attrs['aria-label']='{{ s.label }}'
  if any(c.attrs.get('src')=='assets/tile_car.png' for c in walk(n) if c.tag=='img'):n.attrs.update({'disabled':'{{ taxiDisabled }}','aria-label':'Book a Ride'})
  if any(c.attrs.get('src')=='assets/tile_delivery.png' for c in walk(n) if c.tag=='img'):n.attrs.update({'onclick':'{{ goDelivery }}','disabled':'{{ deliveryDisabled }}','aria-label':'Send a Package'})
 if n.tag=='span' and text=='Now':n.attrs['data-schedule']='true'
 if n.tag=='span' and text in ['Home','Trips','Wallet','Account'] and 'flex-direction:column' in n.attrs.get('style',''):
  n.tag='button';n.attrs['style']+=';border:0;background:none;padding:0';n.attrs['onclick']='{{ '+{'Home':'goHome','Trips':'history','Wallet':'wallet','Account':'openMenu'}[text]+' }}'
 if state=='isDrive' and n.tag=='div' and 'padding:20px 20px 34px' in n.attrs.get('style',''):n.attrs['aria-label']='Assigned vehicle';n.attrs['role']='region'
 if 'pointer-events:{{ menuPE }}' in n.attrs.get('style',''):n.attrs['inert']='{{ menuHidden }}';n.attrs['data-prototype-menu']='true'
 for i,c in enumerate(n.children):
  if isinstance(c,str):
   stripped=c.strip()
   if stripped in replacements:n.children[i]=c.replace(stripped,replacements[stripped])
  else:change(c,state)
for n in frame.children:
 if isinstance(n,Node):change(n)
output="""'use client';
// Ported directly from the canonical HTML by scripts/compile-rider-reference.py.
// Business data/actions are injected by RiderExperience, never the prototype runtime.
import {Fragment} from 'react';
import {t as defaultTranslate} from '@/lib/i18n';
export default function PrototypeSurface({v,translate=defaultTranslate}) { const t=value=>{const translated=translate(value);return typeof value==='string'&&typeof translated==='string'&&value!==translated?(value.match(/^\\s*/)?.[0]||'')+translated+(value.match(/\\s*$/)?.[0]||''):translated;}; return <>
"""+''.join(render(n) for n in frame.children)+"</>; }\n"
target=ROOT/'src/components/rider/PrototypeSurface.jsx';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(output,encoding='utf-8')
print('Generated',target,'from SHA256',hashlib.sha256(SOURCE.read_bytes()).hexdigest())
