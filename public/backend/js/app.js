let toggle_aside = document.getElementById('toggle_aside');
let aside        = document.getElementById('aside');

if(toggle_aside && aside)
{
    toggle_aside.addEventListener('click', ()=>{
        console.log('working');
        aside.closest('body').classList.toggle('aside_close');
    })
}