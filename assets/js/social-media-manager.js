(() => {
  const $ = (id) => document.getElementById(id);
  const text = $("postText");
  const preview = $("previewCard");
  const content = $("previewContent");
  const targetsOut = $("previewTargets");
  const timeOut = $("previewTime");
  const status = $("previewStatus");

  function selectedTargets() {
    return [...document.querySelectorAll('.checks input:checked')]
      .map(x => x.parentElement.textContent.trim());
  }

  function renderPreview(state = "Draft") {
    const value = text.value.trim();
    content.textContent = value || "यहाँ आपकी पोस्ट का preview दिखाई देगा।";
    targetsOut.textContent = selectedTargets().join("  •  ") || "कोई platform selected नहीं";
    timeOut.textContent = new Date().toLocaleString("hi-IN");
    status.textContent = state;
    preview.hidden = false;
  }

  $("previewBtn").addEventListener("click", () => renderPreview("Preview"));
  $("saveDraftBtn").addEventListener("click", () => {
    localStorage.setItem("gs_social_draft", JSON.stringify({
      text: text.value,
      targets: [...document.querySelectorAll('.checks input:checked')].map(x => x.value),
      savedAt: new Date().toISOString()
    }));
    renderPreview("Saved Draft");
    alert("Draft सुरक्षित कर दिया गया है।");
  });
  $("approveBtn").addEventListener("click", () => {
    if (!text.value.trim()) {
      alert("पहले Post text लिखिए।");
      text.focus();
      return;
    }
    renderPreview("Approved");
    alert("Post approved है। Actual Publish/Schedule API connection अगले चरण में जोड़ी जाएगी।");
  });

  try {
    const d = JSON.parse(localStorage.getItem("gs_social_draft") || "null");
    if (d) {
      text.value = d.text || "";
      document.querySelectorAll('.checks input').forEach(x => x.checked = d.targets?.includes(x.value) ?? true);
    }
  } catch (_) {}
})();


/* Content Studio */
(function(){
  const buttons=document.querySelectorAll('.format-card');
  const uploadBox=document.getElementById('mediaUploadBox');
  const bannerTools=document.getElementById('bannerTools');
  const videoTools=document.getElementById('videoTools');
  const fileInput=document.getElementById('mediaFile');
  const preview=document.getElementById('mediaPreview');
  const previewWrap=document.getElementById('mediaPreviewWrap');
  const remove=document.getElementById('removeMedia');
  const canvas=document.getElementById('bannerCanvas');
  const generated=document.getElementById('generatedBanner');
  let bannerData='';

  function setFormat(f){
    buttons.forEach(b=>b.classList.toggle('active',b.dataset.format===f));
    uploadBox.hidden=!['image','banner'].includes(f);
    bannerTools.hidden=f!=='banner';
    videoTools.hidden=f!=='video';
    if(f==='image'){
      document.getElementById('mediaUploadTitle').textContent='Image Post';
      document.getElementById('mediaUploadHint').textContent='JPG, PNG या WebP image चुनें।';
    }else if(f==='banner'){
      document.getElementById('mediaUploadTitle').textContent='Banner Post';
      document.getElementById('mediaUploadHint').textContent='अपना banner upload करें या नीचे branded banner बनाएं।';
    }
  }
  buttons.forEach(b=>b.addEventListener('click',()=>setFormat(b.dataset.format)));

  fileInput?.addEventListener('change',e=>{
    const f=e.target.files?.[0]; if(!f)return;
    if(f.size>6*1024*1024){alert('Image 6 MB से छोटी रखें।');e.target.value='';return;}
    const r=new FileReader();
    r.onload=ev=>{preview.src=ev.target.result;previewWrap.hidden=false;};
    r.readAsDataURL(f);
  });
  remove?.addEventListener('click',()=>{preview.src='';previewWrap.hidden=true;fileInput.value='';});

  document.querySelectorAll('.template-btn').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.template-btn').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    const p={
      question:['आज का गणित प्रश्न','Class 9th & 10th • Practice','यहाँ आज का सवाल लिखें'],
      trick:['Maths Trick of the Day','सीखें • समझें • याद रखें','यहाँ Maths Trick लिखें'],
      test:['Ganit Setu Test Announcement','Class 9th & 10th','आज का Test जरूर दें!'],
      app:['Ganit Setu App Update','Learn • Practice • Progress','नई सुविधा / महत्वपूर्ण जानकारी']
    }[btn.dataset.template];
    document.getElementById('bannerTitle').value=p[0];
    document.getElementById('bannerSubtitle').value=p[1];
    document.getElementById('bannerBody').value=p[2];
  }));

  document.getElementById('buildBanner')?.addEventListener('click',()=>{
    const ctx=canvas.getContext('2d');
    const title=document.getElementById('bannerTitle').value.trim()||'आज का गणित प्रश्न';
    const sub=document.getElementById('bannerSubtitle').value.trim()||'Class 9th & 10th • Ganit Setu';
    const body=document.getElementById('bannerBody').value.trim()||'गणित सीखें, अभ्यास करें और आगे बढ़ें।';
    const g=ctx.createLinearGradient(0,0,1200,630);
    g.addColorStop(0,'#0b3d91');g.addColorStop(.55,'#087f5b');g.addColorStop(1,'#f59f00');
    ctx.fillStyle=g;ctx.fillRect(0,0,1200,630);
    ctx.fillStyle='rgba(255,255,255,.10)';
    for(let x=-80;x<1400;x+=180){ctx.beginPath();ctx.arc(x,90,85,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#fff';ctx.font='bold 52px Arial';ctx.fillText('GANIT SETU',70,82);
    ctx.font='bold 52px Arial';wrap(ctx,title,70,190,1060,64);
    ctx.font='28px Arial';ctx.fillStyle='#fff7d6';wrap(ctx,sub,70,350,1060,40);
    ctx.font='34px Arial';ctx.fillStyle='#fff';wrap(ctx,body,70,445,1060,46);
    ctx.font='bold 22px Arial';ctx.fillStyle='#fff7d6';ctx.fillText('Practice • Learn • Progress • Succeed',70,575);
    bannerData=canvas.toDataURL('image/png');generated.hidden=false;
  });

  function wrap(ctx,text,x,y,max,line){
    let row='';
    for(const word of text.split(/\s+/)){
      const test=row?row+' '+word:word;
      if(ctx.measureText(test).width>max&&row){ctx.fillText(row,x,y);row=word;y+=line;}else row=test;
    }
    if(row)ctx.fillText(row,x,y);
  }
  document.getElementById('useBanner')?.addEventListener('click',()=>{
    if(!bannerData)return;
    preview.src=bannerData;previewWrap.hidden=false;
    document.getElementById('mediaUploadHint').textContent='Banner Preview तैयार है।';
  });
})();
