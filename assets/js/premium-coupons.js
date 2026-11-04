const SUPABASE_URL="https://cbgojvnbkosdehvwerth.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_";
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmtDate=v=>v?new Date(v).toLocaleString('hi-IN'):'—';

async function loadTeachers(){
 const {data,error}=await supabaseClient.from('teachers').select('id,teacher_id,full_name').order('teacher_number');
 if(error) throw error;
 $('premiumTeacher').innerHTML='<option value="">-- Teacher चुनें --</option>'+(data||[]).map(t=>`<option value="${t.id}">${esc(t.full_name)} (${esc(t.teacher_id)})</option>`).join('');
}

async function loadPremium(){
 const box=$('premiumList');
 box.innerHTML='<tr><td colspan="6">⏳ Premium Access लोड हो रहा है...</td></tr>';

 // पहले Premium records लें
 const {data: premiumData,error: premiumError}=await supabaseClient
   .from('teacher_premium_access')
   .select('id,teacher_id,exam_type,test_set,access_status,payment_status,expires_at,created_at')
   .order('created_at',{ascending:false});

 if(premiumError){
   box.innerHTML=`<tr><td colspan="6">❌ ${esc(premiumError.message)}</td></tr>`;
   return;
 }

 // फिर Teachers अलग से लें और UUID से match करें
 const {data: teacherData,error: teacherError}=await supabaseClient
   .from('teachers')
   .select('id,teacher_id,full_name');

 if(teacherError){
   box.innerHTML=`<tr><td colspan="6">❌ Teachers load error: ${esc(teacherError.message)}</td></tr>`;
   return;
 }

 const teacherMap={};
 (teacherData||[]).forEach(t=>{ teacherMap[t.id]=t; });

 $('premiumCount').textContent=(premiumData||[]).length+' Records';

 box.innerHTML=(premiumData||[]).length
   ? (premiumData||[]).map(p=>{
       const t=teacherMap[p.teacher_id]||{};
       return `<tr>
         <td>${esc(t.full_name||'Unknown Teacher')}<br><small>${esc(t.teacher_id||p.teacher_id||'')}</small></td>
         <td>${esc(p.exam_type)}</td>
         <td>Set ${esc(p.test_set)}</td>
         <td><span class="status">${esc(p.access_status)}</span></td>
         <td>${fmtDate(p.expires_at)}</td>
         <td><button class="danger" onclick="disablePremium('${p.id}')">🔒 Disable</button></td>
       </tr>`;
     }).join('')
   : '<tr><td colspan="6">कोई Premium Access नहीं है।</td></tr>';
}

async function disablePremium(id){
 if(!confirm('क्या इस Premium Access को बंद करना है?'))return;
 const {error}=await supabaseClient.from('teacher_premium_access').update({access_status:'inactive'}).eq('id',id);
 if(error)alert('❌ '+error.message); else {alert('✅ Access बंद कर दिया गया।');loadPremium();}
}

$('premiumForm').addEventListener('submit',async e=>{
 e.preventDefault(); $('premiumStatus').innerHTML='<div class="notice">⏳ Access activate हो रहा है...</div>';
 const row={teacher_id:$('premiumTeacher').value,exam_type:$('premiumExam').value,test_set:$('premiumSet').value,access_status:'active',payment_status:'paid',activated_at:new Date().toISOString()};
 const exp=$('premiumExpiry').value;if(exp)row.expires_at=new Date(exp).toISOString();
 const {error}=await supabaseClient.from('teacher_premium_access').insert(row);
 $('premiumStatus').innerHTML=error?`<div class="error-box">❌ ${esc(error.message)}</div>`:'<div class="success-box">✅ Premium Access सफलतापूर्वक Activate हो गया।</div>';
 if(!error){e.target.reset();loadPremium();}
});

async function loadCoupons(){
 const box=$('couponList'); box.innerHTML='<tr><td colspan="8">⏳ लोड हो रहा है...</td></tr>';
 const {data,error}=await supabaseClient.from('premium_coupons').select('*').order('created_at',{ascending:false});
 if(error){box.innerHTML=`<tr><td colspan="8">❌ ${esc(error.message)}<br><small>पहले नीचे दिए गए SQL से Coupon table बनाएं।</small></td></tr>`;return;}
 $('couponCount').textContent=(data||[]).length+' Coupons';
 box.innerHTML=(data||[]).length?(data||[]).map(c=>`<tr><td><b>${esc(c.code)}</b></td><td>${esc(c.discount_type==='percent'?c.discount_value+'%':'₹'+c.discount_value)}</td><td>${esc(c.exam_type)}</td><td>${esc(c.test_set)}</td><td>${c.used_count||0}/${c.max_uses||'∞'}</td><td>${fmtDate(c.expires_at)}</td><td><span class="status">${c.is_active?'Active':'Inactive'}</span></td><td><button class="danger" onclick="toggleCoupon('${c.id}',${!c.is_active})">${c.is_active?'Disable':'Enable'}</button></td></tr>`).join(''):'<tr><td colspan="8">अभी कोई Coupon नहीं है।</td></tr>';
}

async function toggleCoupon(id,state){
 const {error}=await supabaseClient.from('premium_coupons').update({is_active:state}).eq('id',id);
 if(error)alert('❌ '+error.message);else loadCoupons();
}

$('couponForm').addEventListener('submit',async e=>{
 e.preventDefault();$('couponStatus').innerHTML='<div class="notice">⏳ Coupon बनाया जा रहा है...</div>';
 const code=$('couponCode').value.trim().toUpperCase();
 const row={code,discount_type:$('discountType').value,discount_value:Number($('discountValue').value),exam_type:$('couponExam').value,test_set:$('couponSet').value,is_active:true};
 if($('couponMaxUses').value)row.max_uses=Number($('couponMaxUses').value);
 if($('couponExpiry').value)row.expires_at=new Date($('couponExpiry').value).toISOString();
 const {error}=await supabaseClient.from('premium_coupons').insert(row);
 $('couponStatus').innerHTML=error?`<div class="error-box">❌ ${esc(error.message)}</div>`:`<div class="success-box">✅ Coupon ${esc(code)} सफलतापूर्वक बन गया।</div>`;
 if(!error){e.target.reset();loadCoupons();}
});

document.addEventListener('DOMContentLoaded',async()=>{
 try{await loadTeachers();}catch(e){$('premiumTeacher').innerHTML='<option>❌ Teachers load नहीं हुए</option>';console.error(e);}
 loadPremium();loadCoupons();
 $('refreshPremium').onclick=loadPremium;$('refreshCoupons').onclick=loadCoupons();
});
