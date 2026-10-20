/* Engine-independent POWER sprite assembler. Load after assets.json is served. */
class PowerAssetKit {
  static async load(base='.') {
    const response=await fetch(base+'/assets.json'); if(!response.ok)throw Error('Missing POWER assets.json');
    const meta=await response.json();
    const images=await Promise.all(['off','on'].map(state=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=base+'/'+meta.atlases[state];})));
    return new PowerAssetKit(meta,images);
  }
  constructor(meta,images){this.meta=meta;this.images=images;}
  draw(ctx,id,x,y,{ppu=100,scale=1,power=0}={}) {
    const a=this.meta.assets[id];if(!a)throw Error('Unknown POWER asset '+id);
    const k=ppu/this.meta.pixels_per_unit*scale,[sx,sy,w,h]=a.atlas_rect;
    const dx=x-a.pivot_px[0]*k,dy=y-a.pivot_px[1]*k;
    const p=Math.max(0,Math.min(1,power));ctx.save();
    // Blend in an isolated tile so semitransparent edges retain their coverage.
    if(p===0||p===1)ctx.drawImage(this.images[p],sx,sy,w,h,dx,dy,w*k,h*k);
    else {
      if(!this.scratch)this.scratch=document.createElement('canvas');
      const c=this.scratch;c.width=w;c.height=h;const t=c.getContext('2d');
      t.globalAlpha=1-p;t.drawImage(this.images[0],sx,sy,w,h,0,0,w,h);
      t.globalCompositeOperation='lighter';t.globalAlpha=p;t.drawImage(this.images[1],sx,sy,w,h,0,0,w,h);
      ctx.drawImage(c,dx,dy,w*k,h*k);
    }
    ctx.restore();
  }
  drawPanel(ctx,id,x,y,width,height,{ppu=100,power=0}={}) {
    const a=this.meta.assets[id];if(!a)throw Error('Unknown panel '+id);
    if(width!==a.footprint.w&&!a.stretch_axes.includes('x'))throw Error(id+' cannot stretch horizontally');
    if(height!==a.footprint.h&&!a.stretch_axes.includes('z'))throw Error(id+' cannot stretch vertically');
    const nppu=this.meta.pixels_per_unit,[sx,sy,sw,sh]=a.atlas_rect;
    const dw=sw+(width-a.footprint.w)*nppu,dh=sh+(height-a.footprint.h)*nppu*Math.cos(Math.PI/18);
    const edge=Math.min(Math.max(8,a.edge_band*nppu),sw/3,sh/3,dw/3,dh/3);if(edge<=0)throw Error('Panel too small');
    const k=ppu/nppu,dx=x-(a.pivot_px[0]+(dw-sw)/2)*k,dy=y-(a.pivot_px[1]+dh-sh)*k;
    const source=this.panelScratch||(this.panelScratch=document.createElement('canvas'));source.width=sw;source.height=sh;const t=source.getContext('2d');
    const p=Math.max(0,Math.min(1,power));t.globalAlpha=1-p;t.drawImage(this.images[0],sx,sy,sw,sh,0,0,sw,sh);t.globalCompositeOperation='lighter';t.globalAlpha=p;t.drawImage(this.images[1],sx,sy,sw,sh,0,0,sw,sh);
    const xs=[0,edge,sw-edge,sw],ys=[0,edge,sh-edge,sh],xt=[0,edge,dw-edge,dw],yt=[0,edge,dh-edge,dh];
    for(let r=0;r<3;r++)for(let c=0;c<3;c++)ctx.drawImage(source,xs[c],ys[r],xs[c+1]-xs[c],ys[r+1]-ys[r],dx+xt[c]*k,dy+yt[r]*k,(xt[c+1]-xt[c])*k,(yt[r+1]-yt[r])*k);
  }
  release(){for(const im of this.images)im.removeAttribute('src');this.images=[];if(this.scratch){this.scratch.width=1;this.scratch.height=1;}this.scratch=null;if(this.panelScratch){this.panelScratch.width=1;this.panelScratch.height=1;}this.panelScratch=null;}
}
window.PowerAssetKit=PowerAssetKit;
