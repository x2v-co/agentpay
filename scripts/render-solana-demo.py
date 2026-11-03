"""Local BGM-only evidence review. No network, wallet calls, or staged payments.
Usage: python render-solana-demo.py --assets DIR --output DIR
Assets: approved-intro.mp4 (64s), checkpoint-120.wav (existing original score).
Requires Pillow, ffmpeg, ffprobe. Rendered public data is loaded from committed evidence.
"""
import argparse, json, subprocess, shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser(); ap.add_argument('--assets',type=Path,required=True); ap.add_argument('--output',type=Path,required=True); args=ap.parse_args()
out=args.output.resolve(); out.mkdir(parents=True,exist_ok=True)
e=json.loads((ROOT/'docs/evidence/devnet-delivery-20261103.json').read_text()); o=e['order']
W,H=1920,1080
def font(n,bold=False): return ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf' if bold else '/System/Library/Fonts/Supplemental/Arial.ttf',n)
def zh(n): return ImageFont.truetype('/System/Library/Fonts/STHeiti Medium.ttc',n)
def run(cmd): subprocess.run(cmd,check=True,stdout=subprocess.DEVNULL,stderr=open(out/'render.log','a'))
scenes=[
 ('THE SOLANA BUILD','One paid API. A verified result.',
  ['HTTP 402  →  user signature  →  facilitator settlement', 'Solana confirmation  →  HTTP 200 + budget report', 'Fixed price: 0.001 test USDC / x402 V2 exact', 'Attended Phantom run. No new payment during this video.'],
  '本次已完成：真实 Devnet 付款与报告交付。以下回顾已验证记录，不重演付款。'),
 ('01 / PAYMENT CONTRACT','A specific price. A specific recipient.',
  ['Network: Solana Devnet / 6-decimal test USDC', 'Mint: '+o['requirements']['asset'], 'Payer: '+o['payer'], 'Recipient: '+o['requirements']['payTo'], 'Amount: 1,000 atomic = 0.001 test USDC'],
  '网络、mint、付款方、收款方和固定金额均经过校验；签名与提交分别由用户操作。'),
 ('02 / INDEPENDENT CHAIN CHECK','Finalized. No execution error.',
  ['Finalized slot: '+str(e['slot'])+'  |  err: null', '2026-11-03 04:42:35 UTC / Solana Devnet', 'Payer USDC:       20.000 → 19.999', 'Recipient USDC: 20.000 → 20.001', 'Fee: 10,001 lamports, paid by the facilitator'],
  '公开 RPC 独立验证最终确认，双方余额变化精确对应 0.001 测试 USDC。'),
 ('03 / ORDER-BOUND EVIDENCE','Same request. Same payment. Same result.',
  ['Order: '+o['id'], 'Memo: '+e['memo'], 'Full SHA-256 binds order + canonical request digest', 'Transaction message hash matches the saved payment identity', 'SQLite claim before settlement; unknown results stay pending'],
  '完整哈希绑定订单和请求；结算前持久化认领。结果不明时对账同一订单，避免重复付款。'),
 ('04 / REAL REPORT DELIVERY','The API returned a calculated report.',
  ['Illustrative inputs: budget 5, prior spend 1 USDC', 'Unit price 0.25 × quantity 3 = cost 0.75 USDC', 'Remaining: 5 − 1 − 0.75 = 3.25 USDC', 'affordable: true  |  state: delivered  |  HTTP 200', 'Report price is 0.001 USDC; procurement cost is sample data.'],
  '样例采购数据不代表实际采购；整数计算和 API 付款是真实执行，报告已在页面及接口交付。'),
 ('05 / REPRODUCE & REVIEW','Evidence first. Clear limits.',
  ['79 offline tests passed / mocked facilitator + RPC', 'README: npm ci --ignore-scripts → npm run test:offline', 'Wallet handoff: npm run dev:solana:handoff / localhost:4031', 'Public transaction + machine-readable evidence in docs', 'Local developer preview. No production or unattended claim.'],
  '代码、设置说明、交易与报告证据可复核。此版本为本地开发预览，尚未部署或提交比赛。')]

# Preserve the approved footage; add provenance without altering its source.
banner=Image.new('RGBA',(W,H),(0,0,0,0));d=ImageDraw.Draw(banner);d.rectangle((0,0,W,96),fill=(6,16,26,245));d.text((48,13),'HISTORICAL INTRO / prior Monad + simulation footage',font=font(30,True),fill='#e4eaf2');d.text((48,52),'历史产品介绍 · 本次 Solana 实测证据从 01:04 开始',font=zh(26),fill='#8be8d0');banner.save(out/'intro-label.png')
common=['-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-r','30','-an']
run(['ffmpeg','-y','-i',str(args.assets/'approved-intro.mp4'),'-i',str(out/'intro-label.png'),'-filter_complex','[0:v][1:v]overlay=0:0,setsar=1','-t','64',*common,str(out/'00.mp4')])
for i,(tag,title,lines,caption) in enumerate(scenes,1):
 im=Image.new('RGB',(W,H),'#07111d');d=ImageDraw.Draw(im)
 for r in [240,340,440]: d.ellipse((1510-r,-140-r,1510+r,-140+r),outline='#132d39',width=2)
 d.rectangle((72,72,82,140),fill='#80e7c9');d.text((110,78),'AGENTPAY / SOLANA',font=font(30,True),fill='#80e7c9');d.text((1500,84),f'{i:02d} / 06',font=font(28),fill='#8ea4b5')
 d.text((90,190),tag,font=font(24,True),fill='#97aabc');d.text((90,245),title,font=font(57,True),fill='#f3f7fb')
 y=380
 for line in lines:
  d.rounded_rectangle((90,y,1830,y+74),radius=12,fill='#102333');size=32
  while d.textlength(line,font=font(size))>1670:size-=1
  d.text((116,y+18),line,font=font(size),fill='#e2edf5');y+=94
 d.line((90,925,1830,925),fill='#305164',width=2)
 # Two subtitle lines when needed, measured in pixels.
 parts=[];line=''
 for ch in caption:
  if d.textlength(line+ch,font=zh(30))>1720:parts.append(line);line=''
  line+=ch
 parts.append(line)
 for j,line in enumerate(parts):d.text((90,948+j*42),line,font=zh(30),fill='#bdeedc')
 im.save(out/f'{i:02d}.png')
 vf="zoompan=z='1+0.012*on/599':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=600:s=1920x1080:fps=30,fade=t=in:st=0:d=0.45,fade=t=out:st=19.5:d=0.5,setsar=1"
 run(['ffmpeg','-y','-i',str(out/f'{i:02d}.png'),'-vf',vf,'-t','20',*common,str(out/f'{i:02d}.mp4')])
manifest=out/'concat.txt';manifest.write_text(''.join("file '"+str(out/f'{i:02d}.mp4')+"'\n" for i in range(7)))
run(['ffmpeg','-y','-f','concat','-safe','0','-i',str(manifest),'-c','copy',str(out/'silent.mp4')])
run(['ffmpeg','-y','-i',str(out/'silent.mp4'),'-stream_loop','-1','-i',str(args.assets/'checkpoint-120.wav'),'-map','0:v','-map','1:a','-c:v','copy','-af','afade=t=in:st=0:d=1.5,afade=t=out:st=180:d=4','-c:a','aac','-b:a','192k','-t','184','-movflags','+faststart',str(out/'AgentPay-Solana-Verified-Demo-1080p.mp4')])
print(out/'AgentPay-Solana-Verified-Demo-1080p.mp4')
