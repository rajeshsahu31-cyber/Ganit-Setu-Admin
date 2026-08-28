function adminLogin(){
 const id=document.getElementById('adminId').value.trim();
 const pass=document.getElementById('password').value.trim();
 if(!id||!pass){alert('कृपया एडमिन आईडी और पासवर्ड दर्ज करें।');return;}
 location.href='dashboard.html';
}