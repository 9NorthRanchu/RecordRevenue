const screens=document.querySelectorAll('.screen'), nav=document.querySelectorAll('[data-go]'), title=document.getElementById('hero-title');
const titles={bills:'บิล',plan:'แผนเที่ยว',wallet:'วอลเล็ต',settings:'จัดการทริป'};
nav.forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.go;screens.forEach(screen=>screen.classList.toggle('active',screen.dataset.screen===id));nav.forEach(item=>item.classList.toggle('active',item===button));title.textContent=titles[id];window.scrollTo({top:0,behavior:'smooth'});}));
