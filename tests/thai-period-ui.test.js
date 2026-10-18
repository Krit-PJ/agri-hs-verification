const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('Thai month and Buddhist year selects produce usable ISO month ranges',()=>{
 const nodes={};for(const part of ['start','end'])for(const suffix of ['MonthThai','YearThai','MonthFilter'])nodes[part+suffix]={value:'',options:[],replaceChildren(...options){this.options=options;this.value='';},dispatchEvent(){this.changed=true}};
 nodes.startMonthFilter.value='2025-10';nodes.endMonthFilter.value='2026-08';
 const c={document:{getElementById:id=>nodes[id]},Date,Option:function(label,value){this.label=label;this.value=value},Event:function(type){this.type=type}};vm.createContext(c);vm.runInContext(fs.readFileSync('thai-period-ui.js','utf8'),c);c.HSThaiPeriod.init();
 assert.equal(nodes.startMonthThai.options[10].label,'ตุลาคม');assert.equal(nodes.startMonthThai.value,'10');assert.equal(nodes.startYearThai.value,'2025');assert.ok(nodes.startYearThai.options.some(o=>o.label==='พ.ศ. 2568'));
 nodes.startMonthThai.value='11';nodes.startYearThai.value='2026';nodes.startMonthThai.onchange();assert.equal(nodes.startMonthFilter.value,'2026-11');assert.equal(nodes.startMonthFilter.changed,true);
 nodes.startYearThai.value='';nodes.startYearThai.onchange();assert.equal(nodes.startMonthFilter.value,'incomplete');c.HSThaiPeriod.sync();assert.equal(nodes.startMonthThai.value,'11');
});
