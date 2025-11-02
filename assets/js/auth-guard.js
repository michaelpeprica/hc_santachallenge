// assets/js/auth-guard.js
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/**
 * guard({ requireAuth?:boolean, requireManager?:boolean, onReady?:fn, onDenied?:fn })
 */
export function guard(opts = {}){
  const { requireAuth=false, requireManager=false, onReady=()=>{}, onDenied=null } = opts;

  onAuthStateChanged(auth, async (user)=>{
    // přihlášení vyžadováno a není přihlášen
    if(requireAuth && !user){
      // přesměruj na login, nebo co už používáš:
      location.href = './login.html';
      return;
    }

    // pokud se nevyžaduje role, rovnou povol
    if(!requireManager){
      onReady(user);
      return;
    }

    // kontrola role manažera
    let isManager = false;
    if(user){
      try{
        const r = await getDoc(doc(db,'roles', user.uid));
        isManager = r.exists() && r.data().role === 'manager';
      }catch(e){
        console.warn('[guard] Nelze načíst roli:', e);
      }
    }

    if(isManager){
      onReady(user);
    } else {
      if(typeof onDenied === 'function'){
        onDenied(user);
      } else {
        // defaultní chování: pošli na stránku s informací
        location.href = './denied.html';
      }
    }
  });
}
