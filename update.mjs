// 港股打新/次新 数据刷新脚本
// 抓取腾讯财经(gtimg)实时行情，回填 现价/_chgFromIpo/AH溢价，写回 data.json
// 用法: node update.mjs
import fs from 'fs';
import https from 'https';

const FILE = new URL('./data.json', import.meta.url);

// 实时抓取 HKD/CNY 汇率（新浪财经），失败 fallback 到上一次值或 0.92
async function fetchRate(prev){
  try {
    const raw = await new Promise((resolve)=>{
      const req = https.get('https://hq.sinajs.cn/list=fx_shkdcny',
        {timeout:5000, headers:{'User-Agent':'Mozilla/5.0','Referer':'https://finance.sina.com.cn/'}},
        (res)=>{ let b=''; res.on('data',d=>b+=d); res.on('end',()=>resolve(b)); });
      req.on('error',()=>resolve(''));
      req.on('timeout',()=>{req.destroy(); resolve('');});
    });
    const m = raw.match(/="([^"]*)"/);
    if(m){ const f = m[1].split(','); const r = +f[1]; if(r>0 && r<2) return r; }
  } catch(e){ /* ignore */ }
  return prev || 0.92;
}

function get(sym){
  return new Promise((resolve)=>{
    const url = 'https://qt.gtimg.cn/q=' + sym;
    const req = https.get(url, {timeout:5000, headers:{'User-Agent':'Mozilla/5.0'}}, (res)=>{
      let buf=''; res.on('data',d=>buf+=d); res.on('end',()=>resolve(buf));
    });
    req.on('error',()=>resolve(''));
    req.on('timeout',()=>{req.destroy();resolve('');});
  });
}
function parse(raw){
  const m = raw.match(/="([^"]*)"/);
  if(!m) return null;
  const a = m[1].split('~');
  if(!a[3] || isNaN(+a[3])) return null;
  return { price:+a[3], prev:+a[4] };
}

async function main(){
  const txt = fs.readFileSync(FILE,'utf8');
  const data = JSON.parse(txt);
  const stocks = data.stocks;
  let ok=0, fail=0;

  // 0) 抓实时 HKD/CNY 汇率
  const rate = await fetchRate(data.hkdCnyRate);
  data.hkdCnyRate = +rate.toFixed(6);
  console.log(`[update] HKD/CNY 实时汇率: ${data.hkdCnyRate}`);

  // 1) 已上市标的拉港股行情
  for(const s of stocks.filter(s=>s.board==='listed')){
    const raw = await get('hk'+s.code.replace('.HK',''));
    const q = parse(raw);
    if(q){
      s._price = q.price;
      if(s.ipoPrice) s._chgFromIpo = (q.price/s.ipoPrice-1)*100;
      ok++;
    } else fail++;
  }

  // 2) AH股拉A股：listed算真实溢价，ipo(招股中)存潜在溢价(发行价对比A股)
  for(const s of stocks.filter(s=>s.isAH && s.aCode)){
    const codeNum = s.aCode.replace(/[^\d]/g,'');
    const sym = s.aCode.toUpperCase().endsWith('.SH') ? 'sh'+codeNum : 'sz'+codeNum;
    const q = parse(await get(sym));
    if(q){ s._aPrice = q.price;
      if(s._price) s._ahPremium = (q.price*rate/s._price - 1)*100;
      else if(s.ipoPrice) s._ahPotential = (q.price*rate/s.ipoPrice - 1)*100;
    }
  }

  data.updated = new Date().toISOString().slice(0,16).replace('T',' ');
  fs.writeFileSync(FILE, JSON.stringify(data,null,2));
  console.log(`[update] 行情刷新完成 成功${ok}/失败${fail}  AH溢价${stocks.filter(s=>s._ahPremium!=null).length}只  时间${data.updated}`);
}
main();
