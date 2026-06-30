/* ============================================================
   CONFIGURATION
   ============================================================
   1. Get a free key at https://aistudio.google.com/apikey
   For Vercel deployment, keep API_KEY empty and add GEMINI_API_KEY
   in Vercel's Environment Variables. The app will call /api/gemini.
   ============================================================ */

const CONFIG = {
  API_KEY: typeof env !== 'undefined' ? env.API_KEY : "",
  MODEL: typeof env !== 'undefined' ? env.MODEL : "gemini-2.5-flash-lite"
};

if(!CONFIG.API_KEY && location.protocol === 'file:'){
  document.getElementById('setup-banner').classList.add('show');
}

function geminiUrl(){
  return 'https://generativelanguage.googleapis.com/v1beta/models/'+CONFIG.MODEL+':generateContent?key='+CONFIG.API_KEY;
}

function toGeminiParts(content){
  if(typeof content === 'string') return [{text: content}];
  var parts = [];
  content.forEach(function(part){
    if(part.type === 'text') parts.push({text: part.text});
    if(part.type === 'image') parts.push({inline_data: {mime_type: part.source.media_type, data: part.source.data}});
  });
  return parts;
}

function toGeminiContents(messages){
  return messages.map(function(m){
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: toGeminiParts(m.content)
    };
  });
}

async function callGemini(opts){
  var body = {
    contents: opts.contents,
    generationConfig: {maxOutputTokens: opts.maxTokens || 1000}
  };
  if(opts.system) body.systemInstruction = {parts: [{text: opts.system}]};
  var r;
  if(CONFIG.API_KEY){
    r = await fetch(geminiUrl(), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body)
    });
  }else{
    r = await fetch('/api/gemini', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({model: CONFIG.MODEL, payload: body})
    });
  }
  var d = await r.json();
  if(d.error) return {error: d.error.message || 'Gemini API error'};
  var text = d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts;
  text = text && text.map(function(p){ return p.text || ''; }).join('').trim();
  if(!text) return {error: 'No response from Gemini'};
  return {text: text};
}

function checkKey(){
  if(!CONFIG.API_KEY && location.protocol === 'file:'){
    document.getElementById('setup-banner').classList.add('show');
    return true; // still allow attempt via /api/gemini if deployed; local file just warns
  }
  return true;
}

/* ============================================================
   DATA MODEL & LOCAL STORAGE
   ============================================================ */

const STORAGE_KEY = 'fintrix_data_v1';

const CATEGORIES = [
  'Food','Groceries','Outside Food','Transportation','Fuel','Education','Books','Stationery',
  'College Fees','Gym','Protein','Healthcare','Medicine','Shopping','Clothing','Electronics',
  'Entertainment','Subscriptions','AI Tools','Utilities','Rent','Travel','Investment','Savings',
  'Family','Pets','Miscellaneous','Other'
];

const CATEGORY_ICONS = {
  'Food':'🍔','Groceries':'🛒','Outside Food':'🍽️','Transportation':'🚕','Fuel':'⛽',
  'Education':'📚','Books':'📖','Stationery':'✏️','College Fees':'🎓','Gym':'🏋️','Protein':'💪',
  'Healthcare':'🏥','Medicine':'💊','Shopping':'🛍️','Clothing':'👕','Electronics':'💻',
  'Entertainment':'🎬','Subscriptions':'📱','AI Tools':'🤖','Utilities':'💡','Rent':'🏠',
  'Travel':'✈️','Investment':'📈','Savings':'💰','Family':'👨‍👩‍👧','Pets':'🐾',
  'Miscellaneous':'📦','Other':'❔'
};

const NEEDS_CATEGORIES = new Set(['Groceries','Books','Stationery','College Fees','Gym','Protein',
  'Healthcare','Medicine','Rent','Transportation','Fuel','Utilities','Savings','Education','Family']);

function defaultState(){
  return {
    profile:{name:'',age:20,occupation:'Student',monthlyIncome:15000,currency:'₹',financialGoal:'Save aggressively',monthlyBudget:10000},
    income:[],
    expenses:[],
    budgets:[
      {id:'b_food', name:'Food', amount:6000, period:'monthly'},
      {id:'b_ent', name:'Entertainment', amount:2500, period:'monthly'},
      {id:'b_shop', name:'Shopping', amount:3000, period:'monthly'}
    ],
    goals:[],
    chatHistory:[{role:'assistant',content:"Hey! I'm your Fintrix AI — your personal finance manager powered by Gemini. I know your income, expenses, budgets, and goals. Ask me anything about your money."}]
  };
}

var state = loadState();

function loadState(){
  try{
    var raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return defaultState();
    var parsed = JSON.parse(raw);
    var d = defaultState();
    return Object.assign(d, parsed, {
      profile: Object.assign(d.profile, parsed.profile||{}),
      income: parsed.income||[],
      expenses: parsed.expenses||[],
      budgets: parsed.budgets||d.budgets,
      goals: parsed.goals||[],
      chatHistory: parsed.chatHistory||d.chatHistory
    });
  }catch(e){
    return defaultState();
  }
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }catch(e){ /* storage full or unavailable — fail silently, app still works in-memory */ }
}

function currency(){ return state.profile.currency || '₹'; }
function fmt(n){
  n = Math.round(n||0);
  return currency()+n.toLocaleString('en-IN');
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function isToday(dateStr){ return (dateStr||'').slice(0,10) === todayISO(); }
function isThisMonth(dateStr){
  var d = new Date(dateStr), now = new Date();
  return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
}

/* ============================================================
   NAVIGATION
   ============================================================ */

function showPage(id, btn){
  document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});
  document.querySelectorAll('.nav-btn').forEach(function(b){b.classList.remove('active');});
  document.getElementById('page-'+id).classList.add('active');
  if(btn){btn.classList.add('active');}
  if(id==='insights'){setTimeout(initCharts,80);}
  if(id==='today'){setTimeout(renderToday,60);}
  if(id==='profile'){renderProfile();}
}

/* ============================================================
   TODAY PAGE RENDERING
   ============================================================ */

function computeStats(){
  var monthIncome = state.income.filter(function(i){return isThisMonth(i.date);}).reduce(function(s,i){return s+i.amount;},0);
  var monthExpense = state.expenses.filter(function(e){return isThisMonth(e.date);}).reduce(function(s,e){return s+e.amount;},0);
  var totalIncome = state.income.reduce(function(s,i){return s+i.amount;},0);
  var totalExpense = state.expenses.reduce(function(s,e){return s+e.amount;},0);
  var needs = state.expenses.filter(function(e){return isThisMonth(e.date)&&e.needWant==='need';}).reduce(function(s,e){return s+e.amount;},0);
  var wants = state.expenses.filter(function(e){return isThisMonth(e.date)&&e.needWant==='want';}).reduce(function(s,e){return s+e.amount;},0);
  var balance = totalIncome - totalExpense;
  var budget = state.profile.monthlyBudget || 0;
  var spentPct = budget>0 ? Math.min(monthExpense/budget*100,100) : 0;
  return {monthIncome,monthExpense,totalIncome,totalExpense,needs,wants,balance,budget,spentPct};
}

function renderToday(){
  var s = computeStats();
  document.getElementById('disp-balance').textContent = fmt(s.balance);
  document.getElementById('disp-balance-sub').textContent = s.balance>=0
    ? 'You\'re in the green this month' : 'You\'ve spent more than you earned';
  document.getElementById('balance-fill').style.width = s.spentPct+'%';
  document.getElementById('disp-spent-pct').textContent = Math.round(s.spentPct)+'% of budget spent';

  document.getElementById('disp-income').textContent = fmt(s.monthIncome);
  document.getElementById('disp-income-count').textContent = state.income.filter(function(i){return isThisMonth(i.date);}).length+' sources this month';
  document.getElementById('disp-expense').textContent = fmt(s.monthExpense);
  document.getElementById('disp-expense-count').textContent = state.expenses.filter(function(e){return isThisMonth(e.date);}).length+' transactions this month';
  document.getElementById('disp-needs').textContent = fmt(s.needs);
  document.getElementById('disp-wants').textContent = fmt(s.wants);

  renderTxList();
  renderBudgets();
  renderGoals();
}

function renderTxList(){
  var list = document.getElementById('tx-list');
  var todays = state.expenses.filter(function(e){return isToday(e.date);})
    .concat(state.income.filter(function(i){return isToday(i.date);}).map(function(i){return Object.assign({},i,{__income:true});}))
    .sort(function(a,b){return new Date(b.date)-new Date(a.date);});

  if(todays.length===0){
    list.innerHTML = '<div style="color:var(--gray5);font-size:14px;text-align:center;padding:24px 0">No transactions yet today — log an expense above</div>';
    return;
  }

  list.innerHTML = todays.map(function(t){
    if(t.__income){
      return '<div class="tx-item">'
        +'<div class="tx-left"><div class="tx-icon tx-icon-income">💰</div>'
        +'<div class="tx-info"><div class="tx-name">'+escapeHtml(t.source)+'</div>'
        +'<div class="tx-meta">Income'+(t.notes?' · '+escapeHtml(t.notes):'')+'</div></div></div>'
        +'<div class="tx-amount income">+'+fmt(t.amount)+'</div>'
        +'<button class="tx-delete" onclick="deleteIncome(\''+t.id+'\')">✕</button>'
        +'</div>';
    }
    var tagClass = t.needWant==='need' ? 'tx-tag-need' : 'tx-tag-want';
    var icon = CATEGORY_ICONS[t.category] || '💸';
    return '<div class="tx-item">'
      +'<div class="tx-left"><div class="tx-icon tx-icon-expense">'+icon+'</div>'
      +'<div class="tx-info"><div class="tx-name">'+escapeHtml(t.name)+'</div>'
      +'<div class="tx-meta">'+escapeHtml(t.category)+' <span class="tx-tag '+tagClass+'">'+(t.needWant||'want')+'</span></div></div></div>'
      +'<div class="tx-amount expense">-'+fmt(t.amount)+'</div>'
      +'<button class="tx-delete" onclick="deleteExpense(\''+t.id+'\')">✕</button>'
      +'</div>';
  }).join('');
}

function renderBudgets(){
  var list = document.getElementById('budget-list');
  if(state.budgets.length===0){
    list.innerHTML = '<div style="color:var(--gray5);font-size:13px;text-align:center;padding:12px 0">No budgets yet</div>';
    return;
  }
  list.innerHTML = state.budgets.map(function(b){
    var spent = state.expenses.filter(function(e){return isThisMonth(e.date)&&e.category===b.name;}).reduce(function(s,e){return s+e.amount;},0);
    var pct = b.amount>0 ? Math.min(spent/b.amount*100,100) : 0;
    var cls = pct<70?'safe':pct<100?'warn':'over';
    return '<div class="budget-item">'
      +'<div class="budget-header"><div class="budget-name">'+escapeHtml(b.name)+'</div>'
      +'<div class="budget-amounts">'+fmt(spent)+' / '+fmt(b.amount)+'</div></div>'
      +'<div class="budget-bar"><div class="budget-fill '+cls+'" style="width:'+pct+'%"></div></div>'
      +'</div>';
  }).join('');
}

function renderGoals(){
  var list = document.getElementById('goal-list');
  if(state.goals.length===0){
    list.innerHTML = '<div style="color:var(--gray5);font-size:13px;text-align:center;padding:12px 0">No savings goals yet</div>';
    return;
  }
  list.innerHTML = state.goals.map(function(g){
    var pct = g.target>0 ? Math.min(g.current/g.target*100,100) : 0;
    return '<div class="goal-item">'
      +'<div class="goal-header"><div class="goal-title">'+escapeHtml(g.name)+'</div><div class="goal-pct">'+Math.round(pct)+'%</div></div>'
      +'<div class="goal-bar"><div class="goal-fill" style="width:'+pct+'%"></div></div>'
      +'<div class="goal-amounts">'+fmt(g.current)+' of '+fmt(g.target)+'</div>'
      +'</div>';
  }).join('');
}

function escapeHtml(s){
  return String(s||'').replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

function deleteExpense(id){
  state.expenses = state.expenses.filter(function(e){return e.id!==id;});
  saveState();
  renderToday();
}
function deleteIncome(id){
  state.income = state.income.filter(function(i){return i.id!==id;});
  saveState();
  renderToday();
}

/* ============================================================
   GEMINI CLASSIFICATION
   ============================================================ */

function uid(){ return 'id_'+Date.now()+'_'+Math.random().toString(36).slice(2,8); }

async function logExpenseAI(){
  var inp = document.getElementById('expense-input');
  var txt = inp.value.trim();
  if(!txt) return;
  checkKey();
  var res = document.getElementById('expense-ai-result');
  res.classList.add('visible');
  res.innerHTML = '<span class="ai-muted">Classifying…</span>';

  var recentNames = state.expenses.slice(-15).map(function(e){return e.name+' ('+e.category+')';}).join(', ');
  var existingSubs = state.expenses.filter(function(e){return e.isSubscription;}).map(function(e){return e.name;}).join(', ');

  var prompt = 'Classify this expense entry for a personal finance app. Entry: "'+txt+'"\n\n'
    +'Categories to choose from (pick exactly one): '+CATEGORIES.join(', ')+'.\n\n'
    +'Determine if this is a NEED (essential: groceries, transport, education, healthcare, rent, utilities, bills) '
    +'or a WANT (discretionary: entertainment, eating out, subscriptions, shopping, impulse buys) using judgment, not keyword matching.\n\n'
    +'Determine if this looks like a recurring subscription (e.g. Netflix, Spotify, Claude Pro, ChatGPT Plus, Cursor, GitHub Copilot, gym membership, etc).\n\n'
    +'Recent expenses for duplicate context: '+(recentNames||'none')+'.\n'
    +'Known subscriptions: '+(existingSubs||'none')+'.\n\n'
    +'Respond ONLY with strict JSON, no markdown, no commentary, in this exact shape:\n'
    +'{"name":"short clean item name","amount":number,"category":"one of the listed categories","needWant":"need" or "want","isSubscription":true or false,"tags":["tag1","tag2"],"confidence":0.0to1.0,"possibleDuplicate":true or false}\n\n'
    +'If you cannot find a numeric amount in the text, estimate a reasonable amount for that item and note low confidence.';

  try{
    var d = await callGemini({contents: toGeminiContents([{role:'user',content:prompt}]), maxTokens: 300});
    if(d.error){ res.innerHTML = '<span class="ai-error">API error: '+escapeHtml(d.error)+'</span>'; return; }
    var parsed = safeParseJSON(d.text);
    if(!parsed || typeof parsed.amount !== 'number'){
      res.innerHTML = '<span class="ai-error">Could not parse that expense. Try including a clearer amount.</span>';
      return;
    }
    var category = CATEGORIES.indexOf(parsed.category) !== -1 ? parsed.category : 'Other';
    var entry = {
      id: uid(),
      name: parsed.name || txt,
      amount: Math.abs(parsed.amount),
      category: category,
      needWant: parsed.needWant === 'need' ? 'need' : 'want',
      isSubscription: !!parsed.isSubscription,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      date: new Date().toISOString(),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.7
    };
    state.expenses.push(entry);
    saveState();
    inp.value = '';
    var dupNote = parsed.possibleDuplicate ? ' <span class="result-note">⚠ This looks similar to a recent expense — check for duplicates.</span>' : '';
    res.innerHTML = '<strong>'+escapeHtml(entry.name)+'</strong> — '+fmt(entry.amount)
      +' · '+escapeHtml(entry.category)+' · <span class="tx-tag '+(entry.needWant==='need'?'tx-tag-need':'tx-tag-want')+'">'+entry.needWant+'</span>'
      +(entry.isSubscription?' · 🔁 subscription detected':'')
      +dupNote;
    renderToday();
  }catch(e){
    res.innerHTML = '<span class="ai-error">Error: '+escapeHtml(e.message)+'</span>';
  }
}

function safeParseJSON(text){
  if(!text) return null;
  var cleaned = text.replace(/```json|```/g,'').trim();
  try{ return JSON.parse(cleaned); }
  catch(e){
    var match = cleaned.match(/\{[\s\S]*\}/);
    if(match){ try{ return JSON.parse(match[0]); }catch(e2){ return null; } }
    return null;
  }
}

function addIncome(){
  var amtInp = document.getElementById('income-amount');
  var amt = parseFloat(amtInp.value);
  if(!amt || amt<=0) return;
  var source = document.getElementById('income-source').value;
  state.income.push({id:uid(), amount:amt, source:source, date:new Date().toISOString(), notes:''});
  saveState();
  amtInp.value='';
  document.getElementById('income-form').style.display='none';
  renderToday();
}

/* ============================================================
   INSIGHTS / CHARTS
   ============================================================ */

var trendChart=null, catChart=null, donutNW=null, donutFlow=null, trendMode='weekly';

function buildTrendData(mode){
  var labels=[], incomeArr=[], expenseArr=[];
  var now = new Date();
  if(mode==='weekly'){
    for(var i=6;i>=0;i--){
      var d = new Date(now); d.setDate(now.getDate()-i);
      labels.push(d.toLocaleDateString('en-US',{weekday:'short'}));
      var key = d.toISOString().slice(0,10);
      incomeArr.push(sumByDay(state.income, key));
      expenseArr.push(sumByDay(state.expenses, key));
    }
  }else if(mode==='monthly'){
    for(var w=3;w>=0;w--){
      labels.push('Week '+(4-w));
      var end = new Date(now); end.setDate(now.getDate()-w*7);
      var start = new Date(end); start.setDate(end.getDate()-6);
      incomeArr.push(sumByRange(state.income, start, end));
      expenseArr.push(sumByRange(state.expenses, start, end));
    }
  }else{
    var monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for(var m=11;m>=0;m--){
      var md = new Date(now.getFullYear(), now.getMonth()-m, 1);
      labels.push(monthNames[md.getMonth()]);
      incomeArr.push(sumByMonth(state.income, md));
      expenseArr.push(sumByMonth(state.expenses, md));
    }
  }
  return {labels, income:incomeArr, expense:expenseArr};
}

function sumByDay(arr,key){ return arr.filter(function(x){return (x.date||'').slice(0,10)===key;}).reduce(function(s,x){return s+x.amount;},0); }
function sumByRange(arr,start,end){ return arr.filter(function(x){var d=new Date(x.date);return d>=start&&d<=end;}).reduce(function(s,x){return s+x.amount;},0); }
function sumByMonth(arr,md){ return arr.filter(function(x){var d=new Date(x.date);return d.getFullYear()===md.getFullYear()&&d.getMonth()===md.getMonth();}).reduce(function(s,x){return s+x.amount;},0); }

function switchTrend(mode,btn){
  trendMode=mode;
  document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active');});
  btn.classList.add('active');
  var titles={weekly:'This week',monthly:'This month',yearly:'This year'};
  var subs={weekly:'Daily income vs expenses',monthly:'Weekly income vs expenses',yearly:'Monthly income vs expenses'};
  document.getElementById('trend-title').textContent=titles[mode];
  document.getElementById('trend-sub').textContent=subs[mode];
  initCharts();
}

function initCharts(){
  var td = buildTrendData(trendMode);
  var gc='rgba(255,255,255,0.06)', tc='#636366';
  var baseOpts={responsive:true,maintainAspectRatio:false,animation:{duration:700,easing:'easeInOutQuart'},plugins:{legend:{display:false},tooltip:{backgroundColor:'#1c1c1e',titleColor:'#fff',bodyColor:'#aeaeb2',borderColor:'rgba(255,255,255,0.1)',borderWidth:0.5,padding:10,cornerRadius:10}},scales:{x:{grid:{color:gc},ticks:{color:tc,font:{family:'Inter',size:11}}},y:{grid:{color:gc},ticks:{color:tc,font:{family:'Inter',size:11}}}}};

  if(trendChart){trendChart.destroy();}
  trendChart=new Chart(document.getElementById('trend-chart').getContext('2d'),{
    type:'line',
    data:{labels:td.labels,datasets:[
      {label:'Income',data:td.income,borderColor:'#30d158',borderWidth:2,pointBackgroundColor:'#30d158',pointRadius:4,pointHoverRadius:6,tension:0.4,fill:true,backgroundColor:'rgba(48,209,88,0.08)'},
      {label:'Expenses',data:td.expense,borderColor:'#ff453a',borderWidth:2,pointBackgroundColor:'#ff453a',pointRadius:4,pointHoverRadius:6,tension:0.4,fill:true,backgroundColor:'rgba(255,69,58,0.08)'}
    ]},
    options:baseOpts
  });

  var catTotals = {};
  state.expenses.filter(function(e){return isThisMonth(e.date);}).forEach(function(e){
    catTotals[e.category] = (catTotals[e.category]||0)+e.amount;
  });
  var catLabels = Object.keys(catTotals).sort(function(a,b){return catTotals[b]-catTotals[a];}).slice(0,6);
  var catValues = catLabels.map(function(c){return catTotals[c];});
  if(catChart){catChart.destroy();}
  catChart=new Chart(document.getElementById('cat-bar-chart').getContext('2d'),{
    type:'bar',
    data:{labels:catLabels.length?catLabels:['No data'],datasets:[{label:'Spend',data:catValues.length?catValues:[0],backgroundColor:'rgba(10,132,255,0.75)',borderRadius:6,borderSkipped:false}]},
    options:Object.assign({},baseOpts,{indexAxis:'y',plugins:Object.assign({},baseOpts.plugins,{legend:{display:false}})})
  });

  var s = computeStats();
  var nwTotal = s.needs+s.wants;
  var nwSplit = nwTotal>0 ? [Math.round(s.needs/nwTotal*100), Math.round(s.wants/nwTotal*100)] : [50,50];
  if(donutNW){donutNW.destroy();}
  donutNW=new Chart(document.getElementById('donut-nw').getContext('2d'),{
    type:'doughnut',
    data:{labels:['Needs','Wants'],datasets:[{data:nwSplit,backgroundColor:['#0a84ff','#ff9f0a'],borderWidth:0,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'72%',animation:{animateRotate:true,duration:900,easing:'easeInOutQuart'},plugins:{legend:{display:false},tooltip:{backgroundColor:'#1c1c1e',bodyColor:'#aeaeb2',padding:8,cornerRadius:8}}}
  });

  var flowTotal = s.monthIncome+s.monthExpense;
  var flowSplit = flowTotal>0 ? [Math.round(s.monthIncome/flowTotal*100), Math.round(s.monthExpense/flowTotal*100)] : [50,50];
  if(donutFlow){donutFlow.destroy();}
  donutFlow=new Chart(document.getElementById('donut-flow').getContext('2d'),{
    type:'doughnut',
    data:{labels:['Income','Expense'],datasets:[{data:flowSplit,backgroundColor:['#30d158','#ff453a'],borderWidth:0,hoverOffset:4}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'72%',animation:{animateRotate:true,duration:900,easing:'easeInOutQuart'},plugins:{legend:{display:false},tooltip:{backgroundColor:'#1c1c1e',bodyColor:'#aeaeb2',padding:8,cornerRadius:8}}}
  });

  renderSubscriptions();
}

function renderSubscriptions(){
  var subs = state.expenses.filter(function(e){return e.isSubscription;});
  var seen = {}, unique = [];
  subs.forEach(function(s){ if(!seen[s.name]){seen[s.name]=true; unique.push(s);} });
  var list = document.getElementById('sub-list');
  if(unique.length===0){
    list.innerHTML = '<div style="color:var(--gray5);font-size:14px;text-align:center;padding:16px 0">Log expenses to detect subscriptions</div>';
    return;
  }
  list.innerHTML = unique.map(function(s){
    return '<div class="sub-item"><div class="sub-left"><div class="sub-icon">🔁</div>'
      +'<div><div class="sub-name">'+escapeHtml(s.name)+'</div><div class="sub-cycle">Monthly subscription</div></div></div>'
      +'<div class="sub-cost">'+fmt(s.amount)+'/mo</div></div>';
  }).join('');
}

/* ============================================================
   AI SPENDING ANALYSIS
   ============================================================ */

function buildFinancialSnapshot(){
  var s = computeStats();
  var catTotals = {};
  state.expenses.filter(function(e){return isThisMonth(e.date);}).forEach(function(e){
    catTotals[e.category] = (catTotals[e.category]||0)+e.amount;
  });
  var subs = state.expenses.filter(function(e){return e.isSubscription;});
  return {
    profile: state.profile,
    monthIncome: s.monthIncome,
    monthExpense: s.monthExpense,
    balance: s.balance,
    needs: s.needs,
    wants: s.wants,
    categoryTotals: catTotals,
    budgets: state.budgets.map(function(b){
      var spent = state.expenses.filter(function(e){return isThisMonth(e.date)&&e.category===b.name;}).reduce(function(s,e){return s+e.amount;},0);
      return {name:b.name, budget:b.amount, spent:spent};
    }),
    goals: state.goals,
    subscriptions: subs.map(function(s){return {name:s.name, amount:s.amount};}),
    recentExpenses: state.expenses.slice(-20).map(function(e){return {name:e.name,amount:e.amount,category:e.category,needWant:e.needWant,date:e.date};}),
    recentIncome: state.income.slice(-10).map(function(i){return {source:i.source,amount:i.amount,date:i.date};})
  };
}

async function analyzeFinances(targetElId){
  var box = document.getElementById(targetElId);
  box.classList.add('visible');
  box.innerHTML = '<span class="ai-muted">Analyzing your finances…</span>';
  checkKey();
  var snapshot = buildFinancialSnapshot();
  var prompt = 'You are a sharp, encouraging personal finance analyst. Here is the user\'s real financial data as JSON:\n\n'
    +JSON.stringify(snapshot)+'\n\n'
    +'Give 3-5 short, specific, data-grounded insights about their spending and saving. Reference real numbers and categories from the data. '
    +'Cover things like: overspending patterns, budget status, subscription costs, needs vs wants balance, and progress toward goals if any exist. '
    +'Avoid generic advice — every point should be traceable to the numbers given. Format as short punchy lines, each on its own line, no markdown bullets, no headers.';
  try{
    var d = await callGemini({contents: toGeminiContents([{role:'user',content:prompt}]), maxTokens: 500});
    if(d.error){ box.innerHTML = '<span class="ai-error">API error: '+escapeHtml(d.error)+'</span>'; return; }
    var lines = d.text.split('\n').filter(function(l){return l.trim();});
    box.innerHTML = lines.map(function(l){
      return '<div class="insight-card"><div class="insight-icon insight-icon-tip">💡</div><div class="insight-text">'+escapeHtml(l.replace(/^[-•*]\s*/,''))+'</div></div>';
    }).join('');
  }catch(e){
    box.innerHTML = '<span class="ai-error">Error: '+escapeHtml(e.message)+'</span>';
  }
}

/* ============================================================
   AI ADVISOR CHAT
   ============================================================ */

async function sendChat(){
  var inp = document.getElementById('chat-input');
  var msg = inp.value.trim();
  if(!msg) return;
  checkKey();
  inp.value='';
  addChatMsg(msg,'user');
  state.chatHistory.push({role:'user',content:msg});

  var typing = document.getElementById('typing-indicator');
  typing.style.display='flex';

  var snapshot = buildFinancialSnapshot();
  var sys = 'You are the Fintrix AI — a knowledgeable, encouraging personal finance manager for students and young professionals. '
    +'You always have full access to the user\'s real financial data below — never ask them to repeat context you already have.\n\n'
    +'FINANCIAL DATA:\n'+JSON.stringify(snapshot)+'\n\n'
    +'Give evidence-based, practical, specific answers grounded in these real numbers. Be warm but concise (3-5 sentences max unless the question needs a structured plan).';

  try{
    var d = await callGemini({
      system: sys,
      contents: toGeminiContents(state.chatHistory.slice(-10)),
      maxTokens: 600
    });
    typing.style.display='none';
    if(d.error){ addChatMsg('API error: '+d.error,'ai'); return; }
    addChatMsg(d.text,'ai');
    state.chatHistory.push({role:'assistant',content:d.text});
    saveState();
  }catch(e){
    typing.style.display='none';
    addChatMsg('Connection error: '+e.message,'ai');
  }
}

function addChatMsg(text,role){
  var area = document.getElementById('chat-area');
  var div = document.createElement('div');
  div.className='chat-msg '+role;
  div.textContent=text;
  area.appendChild(div);
  area.scrollTop = area.scrollHeight;
}

function quickAsk(q){
  document.getElementById('chat-input').value=q;
  sendChat();
}

/* ============================================================
   PROFILE PAGE
   ============================================================ */

function renderProfile(){
  document.getElementById('p-name').value = state.profile.name||'';
  document.getElementById('p-age').value = state.profile.age||20;
  document.getElementById('p-occupation').value = state.profile.occupation||'Student';
  document.getElementById('p-income').value = state.profile.monthlyIncome||0;
  document.getElementById('p-currency').value = state.profile.currency||'₹';
  document.getElementById('p-goal').value = state.profile.financialGoal||'Save aggressively';
  document.getElementById('p-budget').value = state.profile.monthlyBudget||0;

  var budget = state.profile.monthlyBudget||0;
  var income = state.profile.monthlyIncome||0;
  var savingsTarget = Math.max(income-budget,0);
  document.getElementById('t-budget').innerHTML = fmt(budget);
  document.getElementById('t-savings').innerHTML = fmt(savingsTarget);
  document.getElementById('t-needs').innerHTML = fmt(budget*0.6);
  document.getElementById('t-wants').innerHTML = fmt(budget*0.4);
}

function saveProfile(){
  state.profile.name = document.getElementById('p-name').value.trim();
  state.profile.age = parseInt(document.getElementById('p-age').value)||20;
  state.profile.occupation = document.getElementById('p-occupation').value;
  state.profile.monthlyIncome = parseFloat(document.getElementById('p-income').value)||0;
  state.profile.currency = document.getElementById('p-currency').value;
  state.profile.financialGoal = document.getElementById('p-goal').value;
  state.profile.monthlyBudget = parseFloat(document.getElementById('p-budget').value)||0;
  saveState();
  renderProfile();
  renderToday();
}

/* ============================================================
   BUDGETS & GOALS — quick prompts
   ============================================================ */

function addBudget(){
  var name = prompt('Budget category name (e.g. Food, Entertainment):');
  if(!name) return;
  var amount = parseFloat(prompt('Monthly budget amount ('+currency()+'):'));
  if(!amount || amount<=0) return;
  state.budgets.push({id:uid(), name:name.trim(), amount:amount, period:'monthly'});
  saveState();
  renderToday();
}

function addGoal(){
  var name = prompt('Savings goal name (e.g. Buy Laptop, Emergency Fund):');
  if(!name) return;
  var target = parseFloat(prompt('Target amount ('+currency()+'):'));
  if(!target || target<=0) return;
  var current = parseFloat(prompt('Current progress ('+currency()+'), or 0:'))||0;
  state.goals.push({id:uid(), name:name.trim(), target:target, current:current});
  saveState();
  renderToday();
}

/* ============================================================
   EXPORT / IMPORT / RESET
   ============================================================ */

function exportData(){
  var blob = new Blob([JSON.stringify(state,null,2)], {type:'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'fintrix-data-'+todayISO()+'.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importData(file){
  var reader = new FileReader();
  reader.onload = function(e){
    try{
      var parsed = JSON.parse(e.target.result);
      state = Object.assign(defaultState(), parsed);
      saveState();
      renderToday(); renderProfile();
      alert('Data imported successfully.');
    }catch(err){
      alert('Could not import — invalid file.');
    }
  };
  reader.readAsText(file);
}

function resetAllData(){
  if(!confirm('This will permanently delete all your Fintrix data. Continue?')) return;
  state = defaultState();
  saveState();
  renderToday(); renderProfile();
  document.getElementById('chat-area').innerHTML = '<div class="chat-msg ai">Hey! I\'m your Fintrix AI — your personal finance manager powered by Gemini. I know your income, expenses, budgets, and goals. Ask me anything about your money.</div>';
}

/* ============================================================
   EVENT BINDING
   ============================================================ */

function bindEvents(){
  document.querySelectorAll('.nav-btn[data-page]').forEach(function(btn){
    btn.addEventListener('click',function(){showPage(btn.dataset.page,btn);});
  });
  document.querySelectorAll('.tab[data-trend]').forEach(function(btn){
    btn.addEventListener('click',function(){switchTrend(btn.dataset.trend,btn);});
  });

  document.getElementById('log-expense-btn').addEventListener('click',logExpenseAI);
  document.getElementById('expense-input').addEventListener('keydown',function(e){
    if(e.key==='Enter') logExpenseAI();
  });

  document.getElementById('income-toggle-btn').addEventListener('click',function(){
    var form = document.getElementById('income-form');
    form.style.display = form.style.display==='none' ? 'block' : 'none';
  });
  document.getElementById('add-income-btn').addEventListener('click',addIncome);

  document.getElementById('add-budget-btn').addEventListener('click',addBudget);
  document.getElementById('add-goal-btn').addEventListener('click',addGoal);

  document.getElementById('analyze-btn').addEventListener('click',function(){analyzeFinances('analyze-result');});
  document.getElementById('analyze-quick-btn').addEventListener('click',function(){
    showPage('insights', document.querySelector('.nav-btn[data-page="insights"]'));
    setTimeout(function(){analyzeFinances('analyze-result');},200);
  });

  document.getElementById('export-btn').addEventListener('click',exportData);
  document.getElementById('export-profile-btn').addEventListener('click',exportData);
  document.getElementById('import-btn-trigger').addEventListener('click',function(){
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change',function(){
    if(this.files[0]) importData(this.files[0]);
  });
  document.getElementById('reset-btn').addEventListener('click',resetAllData);

  document.getElementById('chat-input').addEventListener('keydown',function(e){
    if(e.key==='Enter') sendChat();
  });
  document.getElementById('send-chat-btn').addEventListener('click',sendChat);
  document.querySelectorAll('[data-question]').forEach(function(btn){
    btn.addEventListener('click',function(){quickAsk(btn.dataset.question);});
  });

  document.getElementById('save-profile-btn').addEventListener('click',saveProfile);
}

bindEvents();
setTimeout(function(){ renderToday(); renderProfile(); },200);
