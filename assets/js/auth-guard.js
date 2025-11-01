// assets/js/auth-guard.js
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export function guard({ requireAuth=false, requireManager=false, onReady }){
  onAuthStateChanged(auth, async (user)=>{
    if(requireAuth && !user){ location.href = './index.html'; return; }

    let isManager = false;
    if(user){
      const roleSnap = await getDoc(doc(db,'roles', user.uid));
      isManager = roleSnap.exists() && roleSnap.data().role === 'manager';
      const footerRole = document.getElementById('footerRole');
      if(footerRole) footerRole.textContent = roleSnap.exists()
        ? `Role: ${roleSnap.data().role}`
        : 'Role zatím nepřiřazena';
    }
    if(requireManager && !isManager){ location.href = './dashboard.html'; return; }

    onReady?.(user, { isManager });
  });
}
