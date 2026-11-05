// Tiny Supabase Auth client for /members/ and /guide/ (email + password).
// Uses the public anon key only. Session lives in localStorage on this device.
(function(){
var BASE=window.NFOA_SB||'https://zojsascliwlqgxcrqqlo.supabase.co';
var ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvanNhc2NsaXdscWd4Y3JxcWxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MTY2ODMsImV4cCI6MjEwMjI5MjY4M30.hmKGnHSZQBOzhuPwjtUL2yqfeOI6VqtXRe2I67t532A';
var K='nfoa-session';
function get(){try{return JSON.parse(localStorage.getItem(K)||'null');}catch(e){return null;}}
function save(d){var s={access_token:d.access_token,refresh_token:d.refresh_token,expires_at:Math.floor(Date.now()/1000)+(+d.expires_in||3600),email:(d.user&&d.user.email)||(get()||{}).email||''};localStorage.setItem(K,JSON.stringify(s));return s;}
function call(path,opt){opt=opt||{};var h={'apikey':ANON,'content-type':'application/json'};if(opt.token)h.Authorization='Bearer '+opt.token;
 return fetch(BASE+path,{method:opt.method||'GET',headers:h,body:opt.body?JSON.stringify(opt.body):undefined}).then(function(r){return r.json().catch(function(){return {};}).then(function(d){if(!r.ok){var m=d.msg||d.error_description||d.message||'Something went wrong.';if(/invalid login/i.test(m))m='That email and password do not match.';throw new Error(m);}return d;});});}
var A={
 session:function(){var s=get();if(!s)return Promise.resolve(null);if(s.expires_at-60>Date.now()/1000)return Promise.resolve(s);
  return call('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:s.refresh_token}}).then(save).catch(function(){localStorage.removeItem(K);return null;});},
 signIn:function(email,pw){return call('/auth/v1/token?grant_type=password',{method:'POST',body:{email:email,password:pw}}).then(save);},
 signOut:function(){var s=get();localStorage.removeItem(K);if(s)call('/auth/v1/logout',{method:'POST',token:s.access_token}).catch(function(){});},
 forgot:function(email){return call('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin+'/members/'),{method:'POST',body:{email:email}});},
 // Recovery links land on /members/#access_token=...&type=recovery
 fromHash:function(){var h=new URLSearchParams(location.hash.slice(1));if(!h.get('access_token'))return null;var s=save({access_token:h.get('access_token'),refresh_token:h.get('refresh_token'),expires_in:h.get('expires_in')});history.replaceState(null,'',location.pathname+location.search);return {session:s,type:h.get('type')};},
 setPassword:function(pw){return A.session().then(function(s){if(!s)throw new Error('Your reset link expired. Request a new one.');return call('/auth/v1/user',{method:'PUT',token:s.access_token,body:{password:pw}});});},
 rest:function(path){return A.session().then(function(s){if(!s)throw new Error('signed out');return call('/rest/v1/'+path,{token:s.access_token});});}
};
window.NFOA_AUTH=A;
})();
