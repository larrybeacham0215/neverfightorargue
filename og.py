from PIL import Image, ImageDraw, ImageFont
F="/usr/share/fonts/truetype/sand-box/google/"
PF=F+"Playfair Display/PlayfairDisplay-VariableFont_wght.ttf"; KF=F+"Karla/Karla-VariableFont_wght.ttf"
G=(13,45,29); IV=(250,246,236); GD=(195,154,94)
heads={"home":"Never Fight or Argue Again","book":"Get the Book","churches":"For Churches and Small Groups",
"speaking":"Book Larry and Ro to Speak","about":"Meet Larry and Ro","chapter":"Read Chapter One Free"}
cover=Image.open("assets/book-3d.png").convert("RGBA"); cover.thumbnail((360,548))
def wrap(d,t,f,w):
  out=[];line=""
  for x in t.split():
    tt=(line+" "+x).strip()
    if d.textlength(tt,font=f)>w and line: out.append(line); line=x
    else: line=tt
  return out+[line]
for k,h in heads.items():
  im=Image.new("RGB",(1200,630),G); d=ImageDraw.Draw(im)
  d.rectangle([24,24,1175,605],outline=GD,width=2)
  im.paste(cover,(1200-60-cover.width,(630-cover.height)//2),cover)
  pf=ImageFont.truetype(PF,64); pf.set_variation_by_axes([700])
  kf=ImageFont.truetype(KF,28); kf.set_variation_by_axes([500])
  sf=ImageFont.truetype(KF,22); sf.set_variation_by_axes([700])
  y=110; d.text((80,y),"NEVER FIGHT OR ARGUE AGAIN" if k!="home" else "LARRY & ROLANDA BEACHAM",font=sf,fill=GD); y+=50
  for l in wrap(d,h,pf,640): d.text((80,y),l,font=pf,fill=IV); y+=78
  d.line([80,y+14,200,y+14],fill=GD,width=3); y+=40
  for l in wrap(d,"Biblical Conflict Resolution for Couples Who Have Tried Everything",kf,620): d.text((80,y),l,font=kf,fill=IV); y+=38
  d.text((80,540),"neverfightorargue.com",font=sf,fill=GD)
  im.save(f"assets/og/{k}.jpg",quality=88)
