import { useState, useRef, useEffect } from "react"
import Papa from "papaparse"
import DataEditor from "./DataEditor.jsx"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js"
import ChartDataLabels from "chartjs-plugin-datalabels"
import { Bar } from "react-chartjs-2"

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ChartDataLabels)

const SEGMENT_COLS  = ["Diagnostic","Model","Control","Pilot combined","Pilot group - no SW","Pilot group - SW","Top agent","Top agent - SW"]
const SEG_COLORS    = ["#77A193","#5D93FF","#CFAE51","#4A7A6B","#3D6FCC","#A88A2E","#B05FD4","#E05C9A"]
const PILOT_SEGS    = ["Pilot combined","Pilot group - no SW","Pilot group - SW"]
const EXCL_CATS     = ["no reason given","other (excl."]
const EXCL_MOVING   = ["moving"]
const DEFAULT_SEGS  = ["Diagnostic","Model","Control","Pilot combined","Top agent"]
const SEG_DISPLAY   = { "Top agent": "Top agents - Overall" }

const pv = v => { if (v==null||v==="") return null; const n=parseFloat(String(v).replace(/%/g,"").trim()); return isNaN(n)?null:n }
const isVol  = m => typeof m==="string"&&m.toLowerCase().includes("volume")
const isSave = m => typeof m==="string"&&m.toLowerCase().includes("save")
const isSA   = m => typeof m==="string"&&(m.toLowerCase().includes("save")||m.toLowerCase().includes("attempt"))
const fmtN   = n => { if (n==null) return "—"; if (Math.abs(n)>=1000) return (n/1000).toFixed(1)+"k"; return Number.isInteger(n)?String(n):n.toFixed(1) }
const fmtP   = v => { if (v==null) return "—"; return (Math.abs(v)<=1?v*100:v).toFixed(1)+"%" }
const dn     = s => SEG_DISPLAY[s]||s

function StackedBar({ reason, data, metric, segs, pct }) {
  const isOverallReason = reason.toLowerCase()==="overall"||(reason.toLowerCase().includes("overall")&&reason.toLowerCase().includes("excl"))
  const volRow = data.find(r=>r["Cancellation Reason"]===reason&&isVol(r["Metric"]||""))
  const metRow = data.find(r=>r["Cancellation Reason"]===reason&&r["Metric"]===metric)
  const gv    = seg => metRow ? pv(metRow[seg]) : null
  const gvol  = seg => {
    if (isVol(metric)&&pct&&!isOverallReason) {
      const ovRow = data.find(r=>r["Cancellation Reason"]==="Overall"&&isVol(r["Metric"]||""))
      return ovRow ? pv(ovRow[seg]) : (volRow ? pv(volRow[seg]) : null)
    }
    return volRow ? pv(volRow[seg]) : null
  }

  if (isVol(metric)) {
    const volData = segs.map(s=>{ const r=gv(s); if(!pct||isOverallReason) return r; const ov=gvol(s); return (r!=null&&ov)?parseFloat(((r/ov)*100).toFixed(2)):r })
    const fmtLbl = v => v==null?"" : (!pct||isOverallReason)?fmtN(v):v.toFixed(1)+"%"
    return (
      <Bar
        data={{ labels:[""], datasets:segs.map((s,i)=>({ label:dn(s), data:[volData[i]], backgroundColor:SEG_COLORS[SEGMENT_COLS.indexOf(s)%SEG_COLORS.length], borderRadius:3 })) }}
        options={{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${fmtLbl(c.parsed.y)}`}}, datalabels:{anchor:"end",align:"end",formatter:fmtLbl,font:{size:10},color:"#666"} }, scales:{ x:{ticks:{font:{size:10}}}, y:{ticks:{font:{size:10},callback:v=>pct&&!isOverallReason?v.toFixed(0)+"%":v},grace:"15%"} } }}
      />
    )
  }

  const bot = segs.map(s=>{ const r=gv(s),v=gvol(s); if(r==null||v==null) return null; return pct?parseFloat(((r/v)*100).toFixed(2)):r })
  const top = segs.map(s=>{ const r=gv(s),v=gvol(s); if(r==null||v==null) return null; return pct?parseFloat((100-(r/v)*100).toFixed(2)):v-r })

  return (
    <Bar
      data={{ labels:segs.map(s=>{ const d=dn(s); return d.length>12?d.slice(0,11)+"…":d }), datasets:[
        { label:metric, data:bot, backgroundColor:segs.map(s=>SEG_COLORS[SEGMENT_COLS.indexOf(s)%SEG_COLORS.length]), stack:"s", borderRadius:0 },
        { label:"Not saved", data:top, backgroundColor:segs.map(s=>SEG_COLORS[SEGMENT_COLS.indexOf(s)%SEG_COLORS.length]+"44"), stack:"s", borderRadius:3 }
      ]}}
      options={{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false},
          tooltip:{callbacks:{label:c=>{ const v=c.parsed.y; if(v==null) return ""; return ` ${c.dataset.label==="Not saved"?"Not saved":metric}: ${pct?v.toFixed(1)+"%":fmtN(v)}` }}},
          datalabels:{ display:c=>c.datasetIndex===1, anchor:"end", align:"end", formatter:(v,c)=>{ const vol=gvol(segs[c.dataIndex]); return vol!=null?fmtN(vol):"" }, font:{size:10,weight:600}, color:"#444", clip:false }
        },
        scales:{ x:{stacked:true,ticks:{font:{size:10},maxRotation:35}}, y:{stacked:true,min:0,max:pct?120:undefined,ticks:{font:{size:10},callback:v=>pct?v.toFixed(0)+"%":v},grace:pct?"0%":"15%"} }
      }}
    />
  )
}

export default function App() {
  const [raw, setRaw]               = useState([])
  const [fileName, setFileName]     = useState("")
  const [activeMet, setActiveMet]   = useState(null)
  const [activeSegs, setActiveSegs] = useState([...DEFAULT_SEGS])
  const [activeCats, setActiveCats] = useState([])
  const [view, setView]             = useState("charts")
  const [mainTab, setMainTab]       = useState("dashboard")
  const [pct, setPct]               = useState(true)
  const [modelWt, setModelWt]       = useState(true)

  function applyData(rows, fn) {
    setRaw(rows); setFileName(fn || "")
    const ms=[...new Set(rows.map(x=>x["Metric"]).filter(Boolean))]
    if (ms.length) setActiveMet(ms[0])
    const cats=[...new Set(rows.map(x=>x["Cancellation Reason"]).filter(Boolean))].filter(c=>c.toLowerCase()!=="overall")
    setActiveCats(cats.filter(c=>!EXCL_CATS.some(e=>c.toLowerCase().includes(e))&&!(c.toLowerCase().includes("overall")&&c.toLowerCase().includes("excl"))))
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem("dmp_data")
      if (saved) { const { rows, fileName: fn } = JSON.parse(saved); if (rows?.length) applyData(rows, fn) }
    } catch(e) {}
  }, [])

  useEffect(() => {
    if (raw.length) { try { localStorage.setItem("dmp_data", JSON.stringify({ rows: raw, fileName })) } catch(e) {} }
  }, [raw, fileName])

  function handleFile(file) {
    if (!file) return
    Papa.parse(file,{ header:true, dynamicTyping:false, skipEmptyLines:true, complete: r=>{
      const rows=r.data
      const csvCols=Object.keys(rows[0]||{})
      const colMap={}
      SEGMENT_COLS.forEach(expected=>{
        const el=expected.toLowerCase().trim()
        const match=csvCols.find(c=>c.toLowerCase().trim()===el)||csvCols.find(c=>c.toLowerCase().trim()===el.slice(0,c.length)&&c.length>=el.length-2)
        if (match) colMap[expected]=match
      })
      const normalized=rows.map(row=>{
        const nr={"Cancellation Reason":(row["Cancellation Reason"]||"").trim(),"Metric":(row["Metric"]||"").trim()}
        SEGMENT_COLS.forEach(seg=>{ nr[seg]=colMap[seg]?row[colMap[seg]]:null })
        return nr
      }).filter(r=>r["Cancellation Reason"]&&r["Metric"])
      applyData(normalized, file.name)
    }})
  }

  const csvMetrics=[...new Set(raw.map(r=>r["Metric"]).filter(Boolean))]
  const rawCats=[...new Set(raw.map(r=>r["Cancellation Reason"]).filter(Boolean))].filter(c=>c.toLowerCase()!=="overall")

  const sortedRawCats=(()=>{
    const exclMoving=rawCats.filter(c=>c.toLowerCase().includes("overall")&&c.toLowerCase().includes("excl"))
    const rest=rawCats.filter(c=>!exclMoving.includes(c))
    const movingIdx=rest.findIndex(c=>c.toLowerCase().includes("moving"))
    if (movingIdx===-1) return [...rest,...exclMoving]
    return [...rest.slice(0,movingIdx+1),...exclMoving,...rest.slice(movingIdx+1)]
  })()

  const activeCatsForOverall=activeCats.filter(c=>c!=="Overall"&&!(c.toLowerCase().includes("overall")&&c.toLowerCase().includes("excl")))
  function sumCat(metric,seg){ return activeCatsForOverall.reduce((s,cr)=>{ const row=raw.find(r=>r["Cancellation Reason"]===cr&&r["Metric"]===metric); return s+(pv(row?.[seg])||0) },0) }
  const overallRows=csvMetrics.map(m=>{ const o={"Cancellation Reason":"Overall","Metric":m}; SEGMENT_COLS.forEach(s=>{ o[s]=sumCat(m,s) }); return o })
  const data=[...raw,...overallRows]
  const allCats=[...sortedRawCats,"Overall"]
  const ordSegs=SEGMENT_COLS.filter(s=>activeSegs.includes(s))
  const isComp=activeMet==="Comparison"
  const allTabs=[...csvMetrics,"Comparison"]

  function getVal(cr,metric,seg){ const r=data.find(x=>x["Cancellation Reason"]===cr&&x["Metric"]===metric); return r?pv(r[seg]):null }
  function getVol(cr,seg){ return getVal(cr,csvMetrics.find(isVol)||"Volume",seg) }
  function getSR(cr,seg){ const saves=getVal(cr,csvMetrics.find(isSave)||"Saves",seg); const vol=getVol(cr,seg); if(saves==null||!vol) return null; return saves/vol }
  function getModelVol(cr){ return getVol(cr,"Model") }
  function getSegVol(cr,seg){ return getVol(cr,seg) }
  function mWeight(cr,list,seg){ if(modelWt){ const v=getModelVol(cr),t=list.reduce((s,r)=>s+(getModelVol(r)||0),0); return v!=null&&t>0?v/t:null } else { const v=getSegVol(cr,seg),t=list.reduce((s,r)=>s+(getSegVol(r,seg)||0),0); return v!=null&&t>0?v/t:null } }
  function wtdOverall(list,seg){ let tot=0; list.forEach(cr=>{ const sr=getSR(cr,seg),w=mWeight(cr,list,seg); if(sr!=null&&w!=null) tot+=sr*w }); return tot }

  const compAll=activeCatsForOverall.filter(c=>!EXCL_CATS.some(e=>c.toLowerCase().includes(e)))
  const compExcl=compAll.filter(c=>!EXCL_MOVING.some(e=>c.toLowerCase().includes(e)))

  function CmpTable({ title, list }) {
    const cb={ padding:"7px 10px", textAlign:"right", whiteSpace:"nowrap", fontVariantNumeric:"tabular-nums", fontSize:12, borderBottom:"0.5px solid #e8e8e8", color:"#1a1a1a" }
    const lb={ padding:"7px 10px", textAlign:"left", whiteSpace:"nowrap", fontSize:12, borderBottom:"0.5px solid #e8e8e8", color:"#1a1a1a" }
    return (
      <div style={{marginBottom:"1.5rem"}}>
        <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>{title}</div>
        <div style={{border:"0.5px solid #e8e8e8",borderRadius:8,overflow:"hidden"}}>
          <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
            <thead>
              <tr style={{background:"#f5f5f5"}}>
                <th style={{...lb,fontSize:11,color:"#666",textTransform:"uppercase",letterSpacing:"0.04em"}}></th>
                {modelWt && <th style={{...cb,fontSize:11,color:"#5D93FF",textTransform:"uppercase",letterSpacing:"0.04em"}}>Model wt.</th>}
                {ordSegs.map(s=>(
                  modelWt
                    ? <th key={s} style={{...cb,fontSize:11,color:SEG_COLORS[SEGMENT_COLS.indexOf(s)],textTransform:"uppercase",letterSpacing:"0.04em"}}><span style={{display:"inline-flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}><span style={{width:7,height:7,borderRadius:2,background:SEG_COLORS[SEGMENT_COLS.indexOf(s)]}}></span>{dn(s)}</span></th>
                    : <th key={s} colSpan={2} style={{...cb,fontSize:11,color:SEG_COLORS[SEGMENT_COLS.indexOf(s)],textTransform:"uppercase",letterSpacing:"0.04em",borderLeft:"1px solid #e8e8e8"}}><span style={{display:"inline-flex",alignItems:"center",gap:4,justifyContent:"flex-end"}}><span style={{width:7,height:7,borderRadius:2,background:SEG_COLORS[SEGMENT_COLS.indexOf(s)]}}></span>{dn(s)}</span></th>
                ))}
              </tr>
              {!modelWt && (
                <tr style={{background:"#f5f5f5"}}>
                  <th style={{...lb,fontSize:10,color:"#999"}}></th>
                  {ordSegs.map(s=>[
                    <th key={s+"-wt"} style={{...cb,fontSize:10,color:"#999",borderLeft:"1px solid #e8e8e8"}}>Weight</th>,
                    <th key={s+"-sr"} style={{...cb,fontSize:10,color:"#999"}}>Save rate</th>
                  ])}
                </tr>
              )}
            </thead>
            <tbody>
              {list.map((cr,i)=>(
                <tr key={cr} style={{background:i%2===0?"#fff":"#fafafa"}}>
                  <td style={lb}>{cr}</td>
                  {modelWt && <td style={{...cb,color:"#5D93FF"}}>{fmtP(mWeight(cr,list,"Model"))}</td>}
                  {ordSegs.map(s=>{
                    const v=getSR(cr,s),mv=getSR(cr,"Model"),bad=PILOT_SEGS.includes(s)&&v!=null&&mv!=null&&v<mv
                    if (modelWt) return <td key={s} style={{...cb,color:bad?"#C0392B":"#1a1a1a",fontWeight:bad?500:400}}>{fmtP(v)}</td>
                    return [
                      <td key={s+"-wt"} style={{...cb,color:"#5D93FF",borderLeft:"1px solid #e8e8e8"}}>{fmtP(mWeight(cr,list,s))}</td>,
                      <td key={s+"-sr"} style={{...cb,color:bad?"#C0392B":"#1a1a1a",fontWeight:bad?500:400}}>{fmtP(v)}</td>
                    ]
                  })}
                </tr>
              ))}
              <tr><td colSpan={modelWt?2+ordSegs.length:1+ordSegs.length*2} style={{padding:"2px 0",background:"#e8e8e8"}}></td></tr>
              <tr style={{background:"#f5f5f5"}}>
                <td style={{...lb,fontWeight:600}}>Overall save rate</td>
                {modelWt && <td style={{...cb,fontWeight:600,color:"#5D93FF"}}>—</td>}
                {ordSegs.map(s=>{
                  const v=wtdOverall(list,s),mv=wtdOverall(list,"Model"),bad=PILOT_SEGS.includes(s)&&v!=null&&mv!=null&&v<mv
                  if (modelWt) return <td key={s} style={{...cb,fontWeight:600,color:bad?"#C0392B":"#1a1a1a"}}>{fmtP(v)}</td>
                  return [
                    <td key={s+"-wt"} style={{...cb,fontWeight:600,color:"#5D93FF",borderLeft:"1px solid #e8e8e8"}}>—</td>,
                    <td key={s+"-sr"} style={{...cb,fontWeight:600,color:bad?"#C0392B":"#1a1a1a"}}>{fmtP(v)}</td>
                  ]
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div style={{padding:"1rem",maxWidth:1400,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:"1.25rem",flexWrap:"wrap",gap:8}}>
        <div>
          <h1 style={{fontSize:18,fontWeight:500}}>Diagnostic Model Pilot</h1>
          <div style={{fontSize:12,color:"#999",marginTop:2}}>{fileName||"No data loaded"}{raw.length?` · ${rawCats.length} cancellation reasons`:""}</div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",border:"0.5px solid #e8e8e8",borderRadius:6,overflow:"hidden"}}>
            {[["dashboard","Dashboard"],["editor","Edit Data"]].map(([k,l])=>(
              <button key={k} onClick={()=>setMainTab(k)} style={{padding:"5px 12px",fontSize:12,border:"none",cursor:"pointer",background:mainTab===k?"#f5f5f5":"#fff",color:"#1a1a1a",fontWeight:mainTab===k?500:400}}>{l}</button>
            ))}
          </div>
          {mainTab==="dashboard" && (
            <div style={{display:"flex",border:"0.5px solid #e8e8e8",borderRadius:6,overflow:"hidden"}}>
              {["charts","table"].map(v=>(
                <button key={v} onClick={()=>setView(v)} style={{padding:"5px 12px",fontSize:12,border:"none",cursor:"pointer",background:view===v?"#f5f5f5":"#fff",color:"#1a1a1a",fontWeight:view===v?500:400}}>
                  {v==="charts"?"Charts":"Table"}
                </button>
              ))}
            </div>
          )}
          <label htmlFor="reup" style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 10px",border:"0.5px solid #d0d0d0",borderRadius:6,fontSize:12,cursor:"pointer",background:"#fff",color:"#1a1a1a"}}>
            ↑ Upload CSV
            <input id="reup" type="file" accept=".csv" style={{display:"none"}} onChange={e=>{ if(e.target.files[0]) handleFile(e.target.files[0]) }}/>
          </label>
        </div>
      </div>

      {mainTab==="editor" ? (
        <DataEditor rows={raw} onChange={rows=>setRaw(rows)} />
      ) : (
        <>
          {!raw.length ? (
            <div style={{border:"1.5px dashed #d0d0d0",borderRadius:8,padding:"3rem",textAlign:"center",color:"#666"}}>
              <div style={{fontSize:28,marginBottom:8}}>↑</div>
              <strong style={{fontSize:14}}>No data yet</strong>
              <p style={{fontSize:13,marginTop:6}}>Upload a CSV above, or switch to <button onClick={()=>setMainTab("editor")} style={{background:"none",border:"none",cursor:"pointer",color:"#5D93FF",fontSize:13,textDecoration:"underline"}}>Edit Data</button> to enter values manually.</p>
            </div>
          ) : (
            <>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:"1rem",flexWrap:"wrap"}}>
                {allTabs.map(m=>(
                  <button key={m} onClick={()=>setActiveMet(m)} style={{padding:"5px 14px",fontSize:13,borderRadius:6,border:"0.5px solid #d0d0d0",cursor:"pointer",background:activeMet===m?"#1a1a1a":"#fff",color:activeMet===m?"#fff":"#1a1a1a",fontWeight:activeMet===m?500:400}}>{m}</button>
                ))}
                {!isComp && (
                  <div style={{display:"flex",border:"0.5px solid #e8e8e8",borderRadius:6,overflow:"hidden",marginLeft:8}}>
                    <button onClick={()=>setPct(true)}  style={{padding:"5px 12px",fontSize:12,border:"none",cursor:"pointer",background:pct?"#f5f5f5":"#fff",color:"#1a1a1a",fontWeight:pct?500:400}}>% of volume</button>
                    <button onClick={()=>setPct(false)} style={{padding:"5px 12px",fontSize:12,border:"none",cursor:"pointer",background:!pct?"#f5f5f5":"#fff",color:"#1a1a1a",fontWeight:!pct?500:400}}># count</button>
                  </div>
                )}
                {isComp && (
                  <div style={{display:"flex",border:"0.5px solid #e8e8e8",borderRadius:6,overflow:"hidden",marginLeft:8}}>
                    <button onClick={()=>setModelWt(true)}  style={{padding:"5px 12px",fontSize:12,border:"none",cursor:"pointer",background:modelWt?"#f5f5f5":"#fff",color:"#1a1a1a",fontWeight:modelWt?500:400}}>Model weights</button>
                    <button onClick={()=>setModelWt(false)} style={{padding:"5px 12px",fontSize:12,border:"none",cursor:"pointer",background:!modelWt?"#f5f5f5":"#fff",color:"#1a1a1a",fontWeight:!modelWt?500:400}}>Actual weights</button>
                  </div>
                )}
              </div>

              {!isComp && (
                <div style={{display:"flex",gap:6,marginBottom:"0.75rem",flexWrap:"wrap",alignItems:"center"}}>
                  <span style={{fontSize:12,color:"#666",marginRight:2}}>Categories:</span>
                  {allCats.map(c=>{ const on=activeCats.includes(c); return (
                    <button key={c} onClick={()=>setActiveCats(p=>on?p.filter(x=>x!==c):[...p,c])}
                      style={{padding:"4px 10px",fontSize:12,borderRadius:6,border:`0.5px solid ${on?"#d0d0d0":"#e8e8e8"}`,cursor:"pointer",background:on?"#fff":"#f5f5f5",color:on?"#1a1a1a":"#999",fontWeight:on?500:400}}>
                      {c}
                    </button>
                  )})}
                </div>
              )}

              <div style={{display:"flex",gap:6,marginBottom:"1.25rem",flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontSize:12,color:"#666",marginRight:2}}>Segments:</span>
                {SEGMENT_COLS.map((col,i)=>{ const on=activeSegs.includes(col); return (
                  <button key={col} onClick={()=>setActiveSegs(p=>on?p.filter(c=>c!==col):[...p,col])}
                    style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",fontSize:12,borderRadius:6,border:`0.5px solid ${on?SEG_COLORS[i]:"#e8e8e8"}`,cursor:"pointer",background:on?"#fff":"#f5f5f5",color:on?SEG_COLORS[i]:"#999"}}>
                    <span style={{width:8,height:8,borderRadius:2,background:on?SEG_COLORS[i]:"#d0d0d0"}}></span>{dn(col)}
                  </button>
                )})}
              </div>

              {isComp ? (
                <div>
                  <CmpTable title="Incl. Moving" list={compAll}/>
                  <CmpTable title="Excl. Moving" list={compExcl}/>
                </div>
              ) : view==="charts" ? (
                activeMet && (
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:12}}>
                    {allCats.filter(c=>activeCats.includes(c)).map(cr=>(
                      <div key={cr} style={{background:"#fff",border:"0.5px solid #e8e8e8",borderRadius:8,padding:"1rem"}}>
                        <div style={{fontSize:13,fontWeight:500,marginBottom:2}}>{cr}</div>
                        <div style={{fontSize:11,color:"#999",marginBottom:10}}>{activeMet}{!isVol(activeMet)?" stacked on volume":""}</div>
                        <div style={{position:"relative",height:240}}>
                          <StackedBar reason={cr} data={data} metric={activeMet} segs={ordSegs} pct={pct}/>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div style={{border:"0.5px solid #e8e8e8",borderRadius:8,overflow:"hidden"}}>
                  <div style={{overflowX:"auto"}}>
                    <table style={{width:"100%",fontSize:12,borderCollapse:"collapse"}}>
                      <thead>
                        <tr>
                          {["Cancellation Reason","Metric",...ordSegs].map(h=>(
                            <th key={h} style={{background:"#f5f5f5",fontWeight:500,padding:"10px 16px",textAlign:["Cancellation Reason","Metric"].includes(h)?"left":"right",whiteSpace:"nowrap",borderBottom:"0.5px solid #e8e8e8",color:SEGMENT_COLS.includes(h)?SEG_COLORS[SEGMENT_COLS.indexOf(h)]:"#666",fontSize:11,textTransform:"uppercase",letterSpacing:"0.04em"}}>
                              {SEGMENT_COLS.includes(h)?<span style={{display:"inline-flex",alignItems:"center",gap:5,justifyContent:"flex-end"}}><span style={{width:7,height:7,borderRadius:2,background:SEG_COLORS[SEGMENT_COLS.indexOf(h)]}}></span>{dn(h)}</span>:h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(()=>{
                          const filtered=data.filter(r=>(!activeMet||r["Metric"]===activeMet)&&activeCats.includes(r["Cancellation Reason"]))
                          return filtered.map((row,i)=>{
                            const cr=row["Cancellation Reason"]||""
                            const isOv=cr.toLowerCase()==="overall"
                            const isLast=i===filtered.length-1||filtered[i+1]["Cancellation Reason"]!==cr
                            const rm=row["Metric"]||""
                            const rmSA=isSA(rm)
                            const modelVal=pv(row["Model"])
                            return (
                              <tr key={i} style={{background:i%2===0?"#fff":"#fafafa"}}>
                                <td style={{padding:"9px 16px",borderBottom:isLast?"1px solid #d0d0d0":"0.5px solid #e8e8e8",fontWeight:500,whiteSpace:"nowrap"}}>{cr||"—"}</td>
                                <td style={{padding:"9px 16px",borderBottom:isLast?"1px solid #d0d0d0":"0.5px solid #e8e8e8",whiteSpace:"nowrap",color:"#666"}}>{rm||"—"}</td>
                                {ordSegs.map(seg=>{
                                  const raw2=pv(row[seg]),vol=getVol(cr,seg)
                                  let disp
                                  if (isVol(activeMet)&&!isOv&&pct&&raw2!=null){ const tot=getVol("Overall",seg); disp=tot?((raw2/tot)*100).toFixed(1)+"%":fmtN(raw2) }
                                  else if (isSA(activeMet)&&pct&&raw2!=null&&vol){ disp=(raw2/vol*100).toFixed(1)+"%" }
                                  else { disp=fmtN(raw2) }
                                  const bad=PILOT_SEGS.includes(seg)&&rmSA&&raw2!=null&&modelVal!=null&&raw2<modelVal
                                  return <td key={seg} style={{padding:"9px 16px",borderBottom:isLast?"1px solid #d0d0d0":"0.5px solid #e8e8e8",textAlign:"right",whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums",color:bad?"#C0392B":"#1a1a1a",fontWeight:bad?500:400}}>{disp}</td>
                                })}
                              </tr>
                            )
                          })
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
