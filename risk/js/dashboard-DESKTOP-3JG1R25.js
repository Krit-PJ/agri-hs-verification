const Dashboard = (() => {
  const charts={}, store={};
  let state={district:'',subdistrict:'',crop:'',month:'',day:''};
  const H=()=>MapModule.helpers;

  function init(){
    charts.trend=new Chart(document.getElementById('chart-trend'),{type:'bar',data:{labels:[],datasets:[{label:'Hotspot',data:[],backgroundColor:[]}]},options:opts()});
    charts.top=new Chart(document.getElementById('chart-top-district'),{type:'bar',data:{labels:[],datasets:[{label:'Hotspot',data:[],backgroundColor:'#38bdf8'}]},options:{...opts(),indexAxis:'y'}});
    charts.risk=new Chart(document.getElementById('chart-risk'),{type:'doughnut',data:{labels:CONFIG.RISK_LEVELS.map(x=>x.label),datasets:[{data:[0,0,0,0],backgroundColor:CONFIG.RISK_LEVELS.map(x=>x.color)}]},options:riskOpts(),plugins:[riskPercentPlugin]});
    document.getElementById('last-updated').textContent='อัปเดต: '+new Date().toLocaleDateString('th-TH',{year:'numeric',month:'long',day:'numeric'});
    document.addEventListener('agri-risk:years-changed',refresh);
  }
  function opts(legend=false){return{responsive:true,maintainAspectRatio:true,plugins:{legend:{display:legend,position:'right',labels:{color:'#e5f3ff',font:{size:13,weight:'600'}}},tooltip:{backgroundColor:'#071827',titleFont:{size:14},bodyFont:{size:13}}},scales:legend?{}:{x:{ticks:{color:'#d7e8f6',font:{size:12}},grid:{color:'rgba(96,165,250,.16)'}},y:{ticks:{color:'#d7e8f6',font:{size:12}},grid:{color:'rgba(96,165,250,.16)'}}}};}
  const riskPercentPlugin={id:'riskPercentPlugin',afterDatasetsDraw(chart){const ds=chart.data.datasets?.[0];if(!ds)return;const total=ds.data.reduce((a,b)=>a+(Number(b)||0),0);if(!total)return;const ctx=chart.ctx,meta=chart.getDatasetMeta(0);ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 13px sans-serif';meta.data.forEach((arc,i)=>{const v=Number(ds.data[i])||0;if(!v)return;const pct=v/total*100;if(pct<4)return;const pos=arc.tooltipPosition();ctx.lineWidth=3;ctx.strokeStyle='rgba(0,0,0,.65)';ctx.fillStyle='#fff';const text=pct.toFixed(pct>=10?0:1)+'%';ctx.strokeText(text,pos.x,pos.y);ctx.fillText(text,pos.x,pos.y);});ctx.restore();}};
  function riskOpts(){const o=opts(false);o.plugins.legend.labels.generateLabels=(chart)=>{const ds=chart.data.datasets[0],total=ds.data.reduce((a,b)=>a+(Number(b)||0),0);return chart.data.labels.map((label,i)=>({text:`${label} ${total?((Number(ds.data[i])||0)*100/total).toFixed(1):'0.0'}%`,fillStyle:ds.backgroundColor[i],strokeStyle:'#fff',lineWidth:1,index:i}));};o.plugins.tooltip.callbacks={label:(ctx)=>{const data=ctx.dataset.data,total=data.reduce((a,b)=>a+(Number(b)||0),0),v=Number(ctx.raw)||0,p=total?v*100/total:0;return ` ${ctx.label}: ${v} พื้นที่ (${p.toFixed(1)}%)`;}};return o;}
  function setData(hotspot){Object.assign(store,hotspot);refresh();}
  function setYearData(year,fc){store[String(year)]=fc;refresh();}
  function applyFilter(s){state={...state,...s};refresh();}
  function activeYears(){return MapModule.activeYears().map(String);}
  function selected(){
    const years=activeYears();
    return years.flatMap(y=>(store[y]?.features||[])).filter(matchesState);
  }
  function refresh(){
    const years=activeYears(), fs=selected();
    charts.trend.data.labels=years;
    charts.trend.data.datasets[0].data=years.map(y=>(store[y]?.features||[]).filter(matchesState).length);
    charts.trend.data.datasets[0].backgroundColor=years.map(y=>CONFIG.YEAR_COLORS[y]||'#ef4444');
    charts.trend.update('none');

    const unit=state.district?'__subdistrict':'__district', counts=countBy(fs,unit), ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
    charts.top.data.labels=ranked.slice(0,5).map(x=>x[0]); charts.top.data.datasets[0].data=ranked.slice(0,5).map(x=>x[1]); charts.top.update('none');

    const riskFeatures=selectedRiskFeatures(), risk=[0,0,0,0];
    riskFeatures.forEach(f=>{const score=riskScoreOf(f.properties);const idx=CONFIG.RISK_LEVELS.findIndex(x=>score>=x.min&&score<x.max);risk[Math.max(idx,0)]++;});
    charts.risk.data.datasets[0].data=risk; charts.risk.update('none');
    updateRiskLegend(risk);

    const yearText=formatYears(years);
    updateComparisonTable(years);

    const tbody=document.querySelector('#tbl-top-district tbody'); tbody.innerHTML='';
    ranked.slice(0,10).forEach(([name,n])=>{
      const score=riskScoreFor(name), level=MapModule.getRiskLevel(score), tr=document.createElement('tr');
      tr.innerHTML=`<td>${name||'ไม่ระบุ'}</td><td>${state.district?'อ.'+state.district:'กำแพงเพชร'}</td><td>${n.toLocaleString('th-TH')}</td><td><span class="risk-badge ${level.class}" title="คะแนนความเสี่ยง ${score.toFixed(1)} จากปีที่เลือก">${level.label}</span></td>`;
      tbody.appendChild(tr);
    });
    updateTitles(yearText);
  }

  function pctChange(current,previous){
    if(previous===0)return current===0?{text:'0.0%',cls:'change-flat'}:{text:'ใหม่',cls:'change-new'};
    const pct=(current-previous)*100/previous;
    return {text:`${pct>0?'+':''}${pct.toFixed(1)}%`,cls:pct>0?'change-up':pct<0?'change-down':'change-flat'};
  }
  function yearFeatures(year){return(store[String(year)]?.features||[]).filter(matchesState);}
  function updateComparisonTable(years){
    const selectedYear=Number(years.slice(-1)[0]||CONFIG.CURRENT_YEAR_BE||2569);
    const previousYear=selectedYear-1;
    const currentFs=yearFeatures(selectedYear),previousFs=yearFeatures(previousYear);
    const unit=state.district?'__subdistrict':'__district';
    let names=[];
    if(state.subdistrict)names=[state.subdistrict];
    else if(state.district){
      const boundary=MapModule.getRiskForScope('subdistrict')?.features||[];
      names=[...new Set(boundary.filter(f=>H().districtOf(f.properties)===state.district).map(f=>H().subdistrictOf(f.properties)).filter(Boolean))];
    }else{
      const boundary=MapModule.getRiskForScope('district')?.features||[];
      names=[...new Set(boundary.map(f=>H().districtOf(f.properties)).filter(Boolean))];
    }
    const cur=countBy(currentFs,unit),prev=countBy(previousFs,unit);
    names=[...new Set([...names,...Object.keys(cur),...Object.keys(prev)].filter(n=>n&&n!=='ไม่ระบุ'))]
      .sort((a,b)=>(cur[b]||0)-(cur[a]||0)||a.localeCompare(b,'th'));
    const body=document.querySelector('#tbl-hotspot-comparison tbody');if(!body)return;body.innerHTML='';
    names.forEach(name=>{
      const c=cur[name]||0,p=prev[name]||0,change=pctChange(c,p),tr=document.createElement('tr');
      tr.innerHTML=`<td>${name}</td><td>${c.toLocaleString('th-TH')}</td><td>${p.toLocaleString('th-TH')}</td><td><span class="change-badge ${change.cls}">${change.text}</span></td>`;
      body.appendChild(tr);
    });
    const ct=currentFs.length,pt=previousFs.length,totalChange=pctChange(ct,pt);
    document.getElementById('comparison-current-total').textContent=ct.toLocaleString('th-TH');
    document.getElementById('comparison-previous-total').textContent=pt.toLocaleString('th-TH');
    const totalEl=document.getElementById('comparison-change-total');totalEl.innerHTML=`<span class="change-badge ${totalChange.cls}">${totalChange.text}</span>`;
    const unitLabel=state.district?'ตำบล':'อำเภอ';
    document.getElementById('comparison-area-header').textContent=unitLabel;
    document.getElementById('comparison-current-header').textContent=`พ.ศ. ${selectedYear}`;
    document.getElementById('comparison-previous-header').textContent=`พ.ศ. ${previousYear}`;
    document.getElementById('title-comparison').textContent=`เปรียบเทียบ Hotspot ราย${unitLabel}`;
    document.getElementById('comparison-period').textContent=`${temporalText()} · ${state.crop||'ทุกชนิดพืช'}`;
  }

  function updateRiskLegend(values){
    const host=document.getElementById('risk-legend-list');
    if(!host)return;
    const total=values.reduce((a,b)=>a+(Number(b)||0),0);
    host.innerHTML=CONFIG.RISK_LEVELS.map((level,i)=>{
      const value=Number(values[i])||0;
      const pct=total?(value*100/total):0;
      return `<div class="risk-legend-item"><span class="risk-legend-swatch" style="background:${level.color}"></span><span class="risk-legend-name">${level.label}</span><strong class="risk-legend-pct">${pct.toFixed(1)}%</strong></div>`;
    }).join('');
  }

  function matchesState(f){
    const p=f.properties||{},parts=H().datePartsOf(f),month=Number(state.month||0),day=Number(state.day||0);
    return p.__province==='กำแพงเพชร'&&(!state.district||p.__district===state.district)&&(!state.subdistrict||p.__subdistrict===state.subdistrict)&&(!state.crop||p.__crop===state.crop)&&(!month||parts.month===month)&&(!day||parts.day===day);
  }
  function temporalText(){
    const month=Number(state.month||0),day=Number(state.day||0);
    const names=['','มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    if(month&&day)return`วันที่ ${day} ${names[month]}`;
    if(month)return`เดือน${names[month]}`;
    return'ทุกเดือน';
  }
  function formatYears(years){if(!years.length)return'ไม่เลือกปี';if(years.length===1)return`ปี ${years[0]}`;return`ปี ${years.join(', ')}`;}
  function countBy(fs,key){const o={};fs.forEach(f=>{const k=f.properties?.[key]||'ไม่ระบุ';o[k]=(o[k]||0)+1;});return o;}
  function riskScoreOf(p){return Number(p?.risk_score??p?.RISK_SCORE??p?.risk??p?.score??0)||0;}
  function selectedRiskFeatures(){
    const scope=state.district?'subdistrict':'district';
    const fc=MapModule.getRiskForScope(scope);
    return(fc?.features||[]).filter(f=>{
      const p=f.properties||{},d=H().districtOf(p),t=H().subdistrictOf(p);
      return(!state.district||d===state.district)&&(!state.subdistrict||t===state.subdistrict);
    });
  }
  function riskScoreFor(name){
    const scope=state.district?'subdistrict':'district';
    const rows=selectedRiskFeatures();
    const row=rows.find(f=>scope==='subdistrict'?H().subdistrictOf(f.properties)===name:H().districtOf(f.properties)===name);
    return row?riskScoreOf(row.properties):0;
  }
  function updateTitles(yearText){
    const scope=state.subdistrict?`ตำบล${state.subdistrict} อำเภอ${state.district}`:state.district?`อำเภอ${state.district}`:'จังหวัดกำแพงเพชร';
    const unit=state.district?'ตำบล':'อำเภอ';
    document.getElementById('scope-caption').textContent=`ขอบเขตวิเคราะห์: ${scope} | ${yearText} | ${temporalText()}${state.crop?' | พืช: '+state.crop:''}`;
    document.getElementById('title-trend').textContent=`Hotspot รายปี - ${scope}`;
    document.getElementById('title-top5').textContent=`Top 5 ${unit} - ${yearText} (${temporalText()})`;
    document.getElementById('title-risk').textContent=`${activeYears().length===1?'ระดับสถานการณ์ Hotspot':'ระดับความเสี่ยงสะสม'} - ${yearText} (${temporalText()})`;
    document.getElementById('title-top10').textContent=`Top 10 ${unit} (Hotspot สูงสุด) - ${yearText} (${temporalText()})`;
    document.getElementById('rank-area-header').textContent=unit;
  }

  function setPrintMode(enabled){
    const color=enabled?'#111827':'#d7e8f6';
    const grid=enabled?'rgba(17,24,39,.18)':'rgba(96,165,250,.16)';
    ['trend','top'].forEach(key=>{
      const chart=charts[key]; if(!chart)return;
      ['x','y'].forEach(axis=>{
        if(!chart.options.scales?.[axis])return;
        chart.options.scales[axis].ticks.color=color;
        chart.options.scales[axis].ticks.font={...(chart.options.scales[axis].ticks.font||{}),size:enabled?13:12,weight:enabled?'700':'normal'};
        chart.options.scales[axis].grid.color=grid;
        chart.options.scales[axis].border={...(chart.options.scales[axis].border||{}),color:enabled?'#374151':'rgba(96,165,250,.35)'};
      });
      if(chart.options.plugins?.legend?.labels) chart.options.plugins.legend.labels.color=color;
      chart.update('none');
    });
  }
  return{init,setData,setYearData,applyFilter,refresh,setPrintMode};
})();
