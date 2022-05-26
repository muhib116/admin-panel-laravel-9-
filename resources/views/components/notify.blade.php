{{-- available Notification style start:

    <x-notify type="danger" title="Danger !">
        This is a Long Type Hello message For Test
    </x-notify>

    <x-notify type="warning" title="Warning !">
        This is a Long Type Hello message For Test
    </x-notify>

    <x-notify type="success" title="Success !">
        This is a Long Type Hello message For Test
    </x-notify>

    <x-notify type="primary" title="Primary !">
        This is a Long Type Hello message For Test
    </x-notify>

    <x-notify type="secondary" title="Secondary !">
        This is a Long Type Hello message For Test
    </x-notify>
    
 --}}

<script>
    addEventListener('load', ()=>{
        switch('{{ $type }}')
        {
            case 'success':
                msg({title:'{{ $title }}', msg:'{{ $slot }}', design: 'success'});
                break;

            case 'danger':
                msg({title:'{{ $title }}', msg:'{{ $slot }}', design: 'danger'});
                break;

            case 'warning':
                msg({title:'{{ $title }}', msg:'{{ $slot }}', design: 'warning'});
                break;

            case 'primary':
                msg({title:'{{ $title }}', msg:'{{ $slot }}', design: 'primary'});
                break;

            case 'secondary':
                msg({title:'{{ $title }}', msg:'{{ $slot }}', design: 'secondary'});
                break;

            default:
                msg({title:'{{ $title }}', msg:'{{ $slot }}'});

        }
    });
</script>