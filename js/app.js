const START = "ENTRY_QR";

const statusEl = document.getElementById("status");
const outputEl = document.getElementById("output");
const destSelect = document.getElementById("destSelect");
const goBtn = document.getElementById("goBtn");

async function fetchJSON(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(`Fetch failed: ${url}`);
  return res.json();
}

async function fetchText(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(`Fetch failed: ${url}`);
  return res.text();
}

// simple CSV parser (no quotes needed as our CSV is simple)
function parseCSV(text){
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",");
  return lines.slice(1).map(line=>{
    const cells = line.split(",");
    const obj = {};
    headers.forEach((h,i)=> obj[h.trim()] = (cells[i]||"").trim());
    return obj;
  });
}

function buildAdjacency(edges){
  const adj = new Map();
  const add = (a,b,w)=>{
    if(!adj.has(a)) adj.set(a, []);
    adj.get(a).push({to:b, w});
  };
  for(const e of edges){
    const a = e.from, b = e.to, w = Number(e.dist)||0;
    add(a,b,w);
    add(b,a,w); // undirected
  }
  return adj;
}

// Dijkstra shortest path
function dijkstra(adj, start, goal){
  const dist = new Map();
  const prev = new Map();
  const pq = new MinHeap(); // [node, distance]

  for(const node of adj.keys()) dist.set(node, Infinity);
  dist.set(start, 0);
  pq.push([start, 0]);

  while(!pq.isEmpty()){
    const [u, du] = pq.pop();
    if(du !== dist.get(u)) continue; // stale
    if(u === goal) break;

    const neighbors = adj.get(u) || [];
    for(const {to:v, w} of neighbors){
      const alt = du + w;
      if(alt < dist.get(v)){
        dist.set(v, alt);
        prev.set(v, u);
        pq.push([v, alt]);
      }
    }
  }

  // rebuild path
  const path = [];
  let at = goal;
  if(!prev.has(at) && start !== goal){
    // maybe goal is directly connected or graph missing? check trivial:
    if(start === goal) return {path:[start], distance:0};
    if(!adj.has(goal)) return {path:[], distance:Infinity};
  }
  while(at !== undefined){
    path.push(at);
    if(at === start) break;
    at = prev.get(at);
    if(at === undefined && path[path.length-1] !== start) {
      // no path
      return {path:[], distance:Infinity};
    }
  }
  path.reverse();

  // compute total distance
  let total = 0;
  for(let i=0;i<path.length-1;i++){
    const u = path[i], v = path[i+1];
    const edge = (adj.get(u)||[]).find(n=>n.to===v);
    total += edge ? edge.w : 0;
  }
  return {path, distance: total};
}

// Tiny binary min-heap
class MinHeap{
  constructor(){ this.a=[]; }
  isEmpty(){ return this.a.length===0; }
  push(x){ this.a.push(x); this._up(this.a.length-1); }
  pop(){
    const a=this.a; if(a.length===0) return null;
    const top=a[0], last=a.pop();
    if(a.length){ a[0]=last; this._down(0); }
    return top;
  }
  _up(i){
    const a=this.a; while(i>0){
      const p=(i-1)>>1;
      if(a[p][1]<=a[i][1]) break;
      [a[p],a[i]]=[a[i],a[p]]; i=p;
    }
  }
  _down(i){
    const a=this.a; const n=a.length;
    while(true){
      let l=i*2+1, r=l+1, s=i;
      if(l<n && a[l][1]<a[s][1]) s=l;
      if(r<n && a[r][1]<a[s][1]) s=r;
      if(s===i) break;
      [a[s],a[i]]=[a[i],a[s]]; i=s;
    }
  }
}

let LOCATIONS = [];      // [{id,name,type,floor,notes}]
let ADJ = new Map();     // adjacency map

async function loadData(){
  try{
    // graph first
    const graph = await fetchJSON("data/graph.json");
    ADJ = buildAdjacency(graph.edges || []);

    // locations: try JSON; fallback to CSV
    try{
      const locJson = await fetchJSON("data/locations.json");
      LOCATIONS = (locJson.locations || []);
    }catch(_){
      const csv = await fetchText("data/locations.csv");
      LOCATIONS = parseCSV(csv);
    }

    // populate dropdown (exclude ENTRY_QR)
    const select = destSelect;
    select.innerHTML = "";
    LOCATIONS.filter(l => l.id !== START).forEach(l=>{
      const opt = document.createElement("option");
      opt.value = l.id;
      opt.textContent = `${l.name} (${l.id})`;
      select.appendChild(opt);
    });

    statusEl.textContent = "Data loaded.";
  }catch(err){
    console.error(err);
    statusEl.textContent = "Failed to load data. Check console.";
  }
}

function showResult(path, distance){
  if(path.length===0){
    outputEl.textContent = "No path found. Check your graph connectivity.";
    return;
  }
  // human-readable line + steps
  const line = path.join(" → ");
  const steps = path
    .map((id,i)=> {
      const loc = LOCATIONS.find(l=>l.id===id);
      const label = loc ? `${loc.name} (${id})` : id;
      return `${i+1}. ${label}`;
    })
    .join("\n");
  outputEl.textContent = `Path: ${line}\nTotal: ${distance} m\n\nSteps:\n${steps}`;
}

goBtn.addEventListener("click", ()=>{
  const dest = destSelect.value;
  if(!dest){ outputEl.textContent = "Pick a destination."; return; }
  const {path, distance} = dijkstra(ADJ, START, dest);
  showResult(path, distance);
});

loadData();
