/* aside toggle start */
let main_container = document.querySelector('.main_container'),
aside_toggle   = document.querySelector('.aside_toggle'),
    open_aside = document.querySelector('.aside_brand.for_mobile');
    
    if (aside_toggle && main_container && open_aside)
    {
        aside_toggle.addEventListener('click', function(){
        main_container.classList.toggle('close_left_side');
    });
    open_aside.addEventListener('click', function(){
        main_container.classList.toggle('close_left_side');
    });
}
/* aside toggle end */


/* aside dropdown start */
let aside_dropdown_container = document.querySelectorAll('.aside_dropdown_container');
if (aside_dropdown_container)
{
    aside_dropdown_container.forEach(adc=>{
        adc.addEventListener('click', function(e)
        {
            if(e.target.parentElement.classList.contains('aside_dropdown_container'))
            {
                let dropdown = this.querySelector('.dropdown');
                if (dropdown)
                {
                    if (dropdown.offsetHeight>5)
                    {
                        this.classList.remove('active');
                        dropdown.style.height = '0px';
                        dropdown.style.padding = '0 0';
                    }else{
                        this.classList.add('active');
                        dropdown.style.height  = (dropdown.scrollHeight + (16*2)) + 'px';
                        dropdown.style.padding = '16px 0';
                    }
                }
            }
        });
    })
}
/* aside dropdown end */

/* onload aside activation start */
window.addEventListener('load', ()=>{
    let active_aside_dropdown_container = document.querySelectorAll('.aside_dropdown_container.active');
    if (active_aside_dropdown_container)
    {
        active_aside_dropdown_container.forEach(aadc=>{
            aadc.classList.add('active');
            
            let dropdown = aadc.querySelector('.dropdown');
            
            dropdown.style.height = (dropdown.scrollHeight + (16 * 2)) + 'px';
            dropdown.style.padding = '16px 0';
        })
    }
})
/* onload aside activation end */





function _(elem){
    let elements = document.querySelectorAll(elem);
    if(elements.length>1)
    {
        return Array.from(elements);
    }

    return elements[0];
}