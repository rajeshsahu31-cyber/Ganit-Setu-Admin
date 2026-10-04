
Generated image: गणित सेतु: परिमेय संख्याएँ


Done — design को बदले बिना उसी visual style में चारों main scenes + CTA का reference बना दिया है।


Generated image: Bright Hindi Math Learning Poster





Pasted text(20261004-160900).txt
Document

समझ आया, काफ़ी गड़बड़ हो गई है। अगर संभव हो तो वो वाली file वापस भेज दीजिए जो पहले बिना दिक्कत के चल रही थी। हम उसी को आधार बनाएंगे।


सब तो भेजा हूँ मैंने आपको, आपके पास है, लेकिन आप सुधार के नहीं दे रहे हो, तो मैं क्या करूँ उसके लिए? सब file तो आपको हर बार भेजता हूँ मैं अब मेरे पास से गुम गई न वो file हर बार आपको मैं नई file देता हूँ कि नहीं

चेक करता हूँ।

हाँ, अब बात साफ़ हुई— आपकी files गुम नहीं हुई हैं। मेरे पास जो तीनों versions हैं, उनमें से दो एक जैसे हैं। सबसे जरूरी बात—पहली और दूसरी file बिलकुल identical हैं। तीसरी file में सिर्फ layout की positions बदली हैं। इसका मतलब, हमारे पास पुराना, सही version मौजूद है। मैं उसी सुरक्षित base को मानकर चलूँगा, और जब तक आप न कहें कोई नई design change नहीं जोड़ूँगा। पहले इसी base को वापस stable करते हैं।

हाँ—अब बात साफ हो गई है। आपकी files गुम नहीं हुई हैं। मेरे पास जो तीनों versions हैं, उनमें से दो बिल्कुल एक जैसे हैं। मैंने अभी उन्हें सीधे compare किया है।

और सबसे महत्वपूर्ण बात: पहली और दूसरी file एकदम identical हैं। तीसरी file में सिर्फ 4 जगह बदलाव हुए हैं:

ऊपर के कक्षा / अध्याय / अध्याय नाम वाले boxes: 205 से 225

“आज का प्रश्न / विकल्प…” title: 335 से 360

मुख्य content की position: 500 से 550

shadow: 30 से 36

यानी तीसरी file में ही layout को नीचे/आगे shift किया गया है। 

 


इससे हमें एक बहुत जरूरी बात मिल गई है: अभी हमारे पास आपकी पुरानी, बिगड़ने से पहले वाली coding का एक साफ version मौजूद है—पहली/दूसरी file। इसलिए आपको वह file फिर से ढूँढने की जरूरत नहीं है।

मैं अब पहली/दूसरी वाली identical file को सुरक्षित base मानूँगा, तीसरी वाली changes को base नहीं बनाऊँगा। और अभी कोई नई design change नहीं डालूँगा। पहले इसी base को सही और stable किया जाएगा।


Dijiye

हाँ। मैंने अभी पुराने वाले सही version को सुरक्षित करके अलग file बना दी है—इसमें कोई नया बदलाव नहीं किया है।

Stable Base File:
डाउनलोड करें — GANIT SETU Stable Base

इसी को अब हमारा सुरक्षित BASE मानेंगे। आगे जब तक आप स्पष्ट रूप से न कहें, इसमें कोई design या language वाला बदलाव नहीं करूँगा।


GANIT_SETU_video-scene-manager_STABLE_BASE.txt
Document


No file chosen
GANIT_SETU_video-scene-manager_STABLE_BASE.txt
GANIT_SETU_video…STABLE_BASE.txt


(function(){
'use strict';

const SUPABASE_URL='https://cbgojvnbkosdehvwerth.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_a5XOePzNSNn72WQm_xrIAQ_cj5Z01W_';
const BUCKET='content-media';

const scenes=[
 {n:1,name:'Question Intro',desc:'सवाल को ध्यान से पढ़ने के लिए curiosity'},
 {n:2,name:'Options',desc:'विकल्पों को ध्यान से देखने के लिए prompt'},
 {n:3,name:'Hint',desc:'Hint देखने के लिए guidance'},
 {n:4,name:'Answer Reveal',desc:'उत्तर check करने की curiosity'},
 {n:5,name:'CTA',desc:'गणित सेतु Follow / Subscribe CTA'}
];

let sb=null;
let questions=[];
let selectedQuestion=null;
let finalBlob=null;
let finalObjectUrl=null;
let videoRowsByScene={};
let imageRowsByScene={};
let layerRowsByScene={};

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
