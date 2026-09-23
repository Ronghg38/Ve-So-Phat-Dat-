const express = require("express");
const cron = require("node-cron");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;
const DATA_FILE = path.join(__dirname, "data.json");

const SOURCES = {
  mn: "https://sxmn.com.vn/",
  mt: "https://sxmn.com.vn/xsmt-xo-so-mien-trung",
  mb: "https://sxmn.com.vn/xsmb-60-ngay"
};

const STATIONS = {
  mn: ["An Giang","Bạc Liêu","Bến Tre","Bình Dương","Bình Phước","Bình Thuận","Cà Mau","Cần Thơ","Đồng Nai","Đồng Tháp","Hậu Giang","Kiên Giang","Long An","Sóc Trăng","Tây Ninh","Tiền Giang","TP.HCM","Trà Vinh","Vĩnh Long","Vũng Tàu","Đà Lạt"],
  mt: ["Bình Định","Đà Nẵng","Đắk Lắk","Đắk Nông","Gia Lai","Khánh Hòa","Kon Tum","Ninh Thuận","Phú Yên","Quảng Bình","Quảng Nam","Quảng Ngãi","Quảng Trị","Thừa Thiên Huế","Huế"],
  mb: ["Hà Nội","Quảng Ninh","Bắc Ninh","Hải Phòng","Nam Định","Thái Bình","Hải Dương"]
};

const LABELS = ["G8","G7","G6","G5","G4","G3","G2","G1","ĐB"];

function loadData(){
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return {mn:[],mt:[],mb:[],updatedAt:null}; }
}
function saveData(data){ fs.writeFileSync(DATA_FILE, JSON.stringify(data,null,2), "utf8"); }

function cleanText(s){ return String(s||"").replace(/\s+/g," ").trim(); }

function parseDateNear($, el){
  let node = el;
  for(let i=0;i<8 && node;i++,node=node.parent){
    const t = cleanText($(node).text());
    const m = t.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
    if(m) return `${m[1].padStart(2,"0")}/${m[2].padStart(2,"0")}/${m[3]}`;
  }
  return "";
}

function splitValues(text){
  return cleanText(text).split(/\s+/).filter(Boolean);
}

function tableToStationRows($, table, region){
  const $table = $(table);
  const rows = [];
  $table.find("tr").each((_, tr)=>{
    const cells = $(tr).find("th,td").map((__,c)=>cleanText($(c).text())).get();
    if(cells.length) rows.push(cells);
  });
  if(rows.length < 2) return [];
  const header = rows.find(r => r.some(x => STATIONS[region].includes(x)));
  if(!header) return [];
  const stationNames = header.filter(x => STATIONS[region].includes(x));
  if(!stationNames.length) return [];

  const map = {};
  stationNames.forEach(name => map[name] = {});
  for(const r of rows){
    const labelIndex = r.findIndex(x => LABELS.includes(x));
    if(labelIndex < 0) continue;
    const label = r[labelIndex];
    let col = 0;
    for(let i=labelIndex+1;i<r.length && col<stationNames.length;i++,col++){
      map[stationNames[col]][label] = splitValues(r[i]);
    }
  }

  const date = parseDateNear($, table);
  return stationNames.map(station => ({
    station,
    date,
    rows: LABELS.map(label => ({label, values: map[station][label] || []}))
  }));
}

async function fetchHTML(url){
  const res = await fetch(url, {
    headers: {"User-Agent":"Mozilla/5.0 (compatible; VeSoPhatDat/4.1)"}
  });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function updateRegion(region){
  const html = await fetchHTML(SOURCES[region]);
  const $ = cheerio.load(html);
  const found = [];
  $("table").each((_, table)=>{
    const items = tableToStationRows($, table, region);
    for(const item of items){
      if(item.rows.some(r=>r.values.length)) found.push(item);
    }
  });

  // Giữ mỗi đài ở ngày mới nhất mà nguồn trả về.
  const byStation = new Map();
  for(const item of found){
    if(!byStation.has(item.station)) byStation.set(item.station,item);
  }
  return Array.from(byStation.values());
}

async function updateAll(){
  const data = loadData();
  for(const region of ["mn","mt","mb"]){
    try { data[region] = await updateRegion(region); }
    catch(err){ console.error(`Update ${region}:`, err.message); }
  }
  data.updatedAt = new Date().toISOString();
  saveData(data);
  return data;
}

function numbersForStation(station){
  const nums = [];
  for(const row of station.rows || []){
    for(const v of row.values || []){
      if(/^\d+$/.test(v) && v.length>=2) nums.push(v);
    }
  }
  return nums;
}

function stats(station){
  const nums = numbersForStation(station);
  const two = nums.map(n=>n.slice(-2));
  const heads = Array(10).fill(0), tails = Array(10).fill(0);
  for(const n of two){
    heads[Number(n[0])]++; tails[Number(n[1])]++;
  }
  return {
    totalNumbers: nums.length,
    head: heads,
    tail: tails,
    headMax: Math.max(...heads),
    tailMax: Math.max(...tails)
  };
}

app.use(express.static(path.join(__dirname,"public")));

app.get("/api/status",(req,res)=>{
  const d=loadData();
  res.json({ok:true,updatedAt:d.updatedAt,regions:{
    mn:d.mn?.length||0, mt:d.mt?.length||0, mb:d.mb?.length||0
  }});
});

app.get("/api/results",(req,res)=>res.json(loadData()));

app.get("/api/station",(req,res)=>{
  const region = String(req.query.region||"mn").toLowerCase();
  const station = String(req.query.station||"");
  const d=loadData();
  const item=(d[region]||[]).find(x=>x.station===station);
  if(!item) return res.status(404).json({ok:false,message:"Không tìm thấy đài"});
  res.json({...item, stats:stats(item)});
});

app.get("/api/analyze",(req,res)=>{
  const region=String(req.query.region||"mn").toLowerCase();
  const d=loadData();
  res.json((d[region]||[]).map(x=>({...x,stats:stats(x)})));
});

app.post("/api/update",async(req,res)=>{
  try{
    const d=await updateAll();
    res.json({ok:true,updatedAt:d.updatedAt,data:d});
  }catch(err){ res.status(500).json({ok:false,message:err.message}); }
});

app.get("/api/source",(req,res)=>res.json({
  name:"SXMN",
  url:"https://sxmn.com.vn/",
  note:"Nguồn kết quả xổ số được hiển thị rõ trên website Vé Số Phát Đạt."
}));

cron.schedule("*/30 * * * *",()=>updateAll().catch(e=>console.error(e.message)));

app.listen(PORT,"0.0.0.0",async()=>{
  console.log(`Vé Số Phát Đạt chạy tại cổng ${PORT}`);
  const d=loadData();
  if(!d.updatedAt) updateAll().catch(e=>console.error("Initial update:",e.message));
});
