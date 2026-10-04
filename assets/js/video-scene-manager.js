
114218.jpg
मेरी इस गिटहब की फाइल को देखकर मुझे बताइए कि नीचे दो JS फाइल दिख रही हैं वीडियो सीन मैनेजर वाली तो क्या ये दोनों एक ही हैं डुप्लिकेट हो गई हैं या फिर दोनों का अलग-अलग काम है।


Pasted text(20261004-163516).txt
Document

Pasted text (2)(1).txt
Document

ठीक है हाँ। ठीक है। हाँ। ठीक है। समझ गया। चारों scenes में एक साथ यही बदलाव


क्या समझे बताओ

Pasted text(20261004-164413).txt
Document
Bass file

हाँ। अब यही 1160-line वाली file मेरी BASE file है।

और आपने जो बदलाव बताया है, मैं उसे ऐसे समझा हूँ:

Scene 1

आज का प्रश्न = Title → इसमें बदलाव नहीं।

उसके नीचे जो Question/प्रश्न का text है → उसी में नया design।

Scene 2

विकल्प ध्यान से देखिए = Title → इसमें बदलाव नहीं।

उसके नीचे A, B, C, D वाले Options → उसी में नया design।

Scene 3

Hint = Title → इसमें बदलाव नहीं।

उसके नीचे जो Hint text है → उसी में नया design।

Scene 4

सही उत्तर = Title → इसमें बदलाव नहीं।

उसके नीचे जो Answer/Explanation है → उसी में नया design।

चारों में नया design एक जैसा रहेगा:
❌ बड़ा Oval/ellipse background हटेगा।

✅ Text Title और नीचे लड़की के बीच के बिल्कुल center area में रहेगा।

✅ Text के अक्षर colorful होंगे।

✅ अक्षरों पर अच्छा स्पष्ट yellow/golden shadow effect होगा—बहुत हल्का नहीं।

✅ Text अपनी जगह से ऊपर नहीं जाएगा।

✅ Question/Options/Hint/Answer का actual database text बिल्कुल नहीं बदलेगा।

✅ Class, Chapter, Chapter Name, Title और लड़की की position को नहीं छेड़ेंगे।

✅ सिर्फ 1160-line BASE file में बदलाव होगा।

अभी आपकी BASE file में oval ctx.ellipse() से बनाया जा रहा है और text उसके ऊपर draw हो रहा है। उसी हिस्से को बदलना है।


Kijiye

हो गया। आपकी 1160-line BASE file से ही बदलाव किया है।

सिर्फ वही हिस्सा बदला है जो आपने कहा था:

❌ बड़ा Oval/ellipse हटाया।

✅ चारों Scene के नीचे वाले मुख्य text पर strong yellow/golden shadow लगाया।

✅ Text को center में रखा।

✅ Text को colorful रखा।

✅ Scene 4 के answer/explanation में भी यही effect लगाया।

❌ Titles (आज का प्रश्न, विकल्प ध्यान से देखिए, Hint, सही उत्तर) को नहीं बदला।

❌ Class/Chapter/Chapter Name और बाकी functionality को नहीं छुआ।

Original और modified file का diff भी verify किया है—बदलाव इसी rendering block तक सीमित है।

Modified file:
डाउनलोड करें — 1160 Line BASE Modified


GANIT_SETU_video-scene-manager_1160_BASE_modified.txt
Document


No file chosen
GANIT_SETU_video-scene-manager_1160_BASE_modified.txt
GANIT_SETU_video-…ASE_modified.txt


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
