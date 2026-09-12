"""Copy the exact approved MP3 library and build its public catalog."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib,html,json,re,shutil,subprocess
import array,math

HERE=Path(__file__).resolve().parent;REPO=HERE.parents[1]
SOURCE=Path.home()/'Music/troofs/mp3s';PUBLIC=REPO/'static/tonyai';PUBLIC.mkdir(parents=True,exist_ok=True)
DEST=HERE/'mp3s';DEST.mkdir(exist_ok=True)
FF=Path('C:/utilz/ffmpeg-custom/bin/ffmpeg.exe');PROBE=FF.with_name('ffprobe.exe')
RELEASE='tonyai-v1';BASE=f'https://github.com/legauntt/gatsby-opus/releases/download/{RELEASE}/'

def sha(path):
    with path.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def prepare(path):
    slug=re.sub(r'[^a-z0-9]+','-',path.stem.lower().replace('+',' plus ').replace('%',' percent ')).strip('-')
    target=DEST/(slug+'.mp3');digest=sha(path)
    if target.exists():assert sha(target)==digest,'Refuse to replace different audio: '+str(target)
    else:shutil.copy2(path,target)
    info=json.loads(subprocess.check_output([str(PROBE),'-v','error','-show_format','-show_streams','-of','json',str(path)],creationflags=subprocess.CREATE_NO_WINDOW))
    stream=next(s for s in info['streams'] if s['codec_type']=='audio');duration=float(info['format']['duration'])
    assert stream['codec_name']=='mp3' and math.isfinite(duration) and duration>0
    pcm=subprocess.check_output([str(FF),'-v','error','-i',str(path),'-ac','1','-ar','8000','-f','f32le','pipe:1'],creationflags=subprocess.CREATE_NO_WINDOW)
    samples=array.array('f');samples.frombytes(pcm);bins=160;peaks=[]
    for i in range(bins):
        chunk=samples[len(samples)*i//bins:len(samples)*(i+1)//bins]
        peaks.append(math.sqrt(sum(x*x for x in chunk)/max(1,len(chunk))))
    maximum=max(peaks) or 1
    waveform=[round(100*(v/maximum)**.65) for v in peaks]
    return {'id':slug,'title':path.stem,'original_filename':path.name,'file':target.relative_to(REPO).as_posix(),
            'url':BASE+target.name,'duration':duration,'bytes':path.stat().st_size,'sha256':digest,
            'bitrate':int(stream.get('bit_rate',0)),'sample_rate':int(stream['sample_rate']),'channels':stream['channels'],
            'modified':int(path.stat().st_mtime),'waveform':waveform}

excluded=set(json.loads((HERE/'excluded-sources.json').read_text('utf-8'))['filenames'])
sources=sorted((p for p in SOURCE.glob('*.mp3') if p.name not in excluded),key=lambda p:p.name.lower());assert sources,'No MP3 files found'
with ThreadPoolExecutor(max_workers=4) as pool:tracks=list(pool.map(prepare,sources))
assert len({t['id'] for t in tracks})==len(tracks)
assert len(list(DEST.glob('*.mp3')))==len(tracks),'The upload directory contains unexpected audio'
tracks.sort(key=lambda t:(-t['modified'],t['title'].lower()))
manifest={'version':1,'route':'/tonyai','release_tag':RELEASE,'track_count':len(tracks),
          'total_bytes':sum(t['bytes'] for t in tracks),'total_duration':sum(t['duration'] for t in tracks),
          'source_folder':'Music/troofs/mp3s','audio_reencoded':False,'tracks':tracks}
(HERE/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
public={k:v for k,v in manifest.items() if k!='source_folder'}
public['tracks']=[{k:v for k,v in t.items() if k not in ['file','original_filename','sha256','sample_rate','channels']} for t in tracks]
(PUBLIC/'catalog.json').write_text(json.dumps(public,separators=(',',':'))+'\n',encoding='utf-8')
template=(HERE/'index.template.html').read_text('utf-8')
def clock(t):
    n=round(t);return f'{n//60}:{n%60:02}'
rows=[]
for i,t in enumerate(tracks):
    label=html.escape(t['title'],quote=True);url=html.escape(t['url'],quote=True)
    rows.append(f'''<li class="track" data-id="{t['id']}">
      <button class="track-play" data-play="{t['id']}" aria-label="Play {label}" aria-pressed="false" disabled><span class="track-number">{i+1:02}</span><span class="track-play-symbol" aria-hidden="true">▶</span></button>
      <div class="track-name"><h3>{label}</h3><span>Tony C <span aria-hidden="true">/</span> AI experiment</span></div>
      <span class="track-duration">{clock(t['duration'])}</span>
      <a class="download" href="{url}" download="{label}.mp3" aria-label="Download {label} MP3"><span>MP3</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 15v5h14v-5"/></svg></a>
    </li>''')
hours=int(manifest['total_duration']//3600);minutes=round(manifest['total_duration']/60)%60
page=template.replace('{{TRACKS}}','\n'.join(rows)).replace('{{COUNT}}',str(len(tracks))).replace('{{TIME}}',f'{hours}h {minutes:02}m')
(PUBLIC/'index.html').write_text(page,encoding='utf-8')
print(json.dumps({'tracks':len(tracks),'bytes':manifest['total_bytes'],'duration_hours':round(manifest['total_duration']/3600,2),'audio_reencoded':False},indent=2))
