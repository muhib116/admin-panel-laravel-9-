<style>
    *, *::before, *::after{
        box-sizing: border-box;
    }
    .password_toggle_wrapper{
        position: relative;
    }
    .password_toggle_wrapper button {
        position: absolute;
        top: 50%;
        right: 8px;
        transform: translate(0%, -50%);
        border: none;
        background-color: transparent;
        outline: none;
    }
    .toggle_pass_type .hide{
        display: none;
    }
    .toggle_pass_type.active .show{
        display: none;
    }
    .toggle_pass_type.active .hide{
        display: block;
    }
</style>

<button type="button" id="{{ str_replace('#', '', $selector) }}_btn" class="toggle_pass_type">
    <i class="fa fa-eye show"></i>
    <i class="fa fa-eye-slash hide"></i>
</button>
<script>
    (()=>{
        let passInputBtn = document.querySelector("{{ $selector }}_btn");
        let passInput    = document.querySelector('{{ $selector }}');

        if(passInput && passInputBtn)
        {
            passInputBtn.addEventListener('click', ()=>
            {
                passInputBtn.classList.toggle('active');

                if(passInput.type == 'text')
                {
                    return passInput.type = 'password';
                }

                passInput.type = 'text';
            });
        }
    })();
</script>