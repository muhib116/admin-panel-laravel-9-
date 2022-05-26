<x-app-layout>
    welcome to admin panel


    <button onclick="_alert({msg:'Nothing bro!', design:'primary'})">Alert</button>
    <button onclick="_confirm({title:'Confirmation!', msg:'are you sure to delete?', design:'default', callback, event})">Default Confirm</button>
    <button onclick="_confirm({title:'Confirmation!', msg:'are you sure to delete?', design:'secondary', callback, event})">secondary Confirm</button>
    <button onclick="_confirm({title:'Confirmation!', msg:'are you sure to delete?', design:'success', callback, event})">Success Confirm</button>
    
    <a href="https://stackoverflow.com/questions/5552866/how-to-disable-anchor-using-javascript" onclick="_confirm({title:'Confirmation!', msg:'are you sure to delete?', design:'danger', event})">Delete</a>
    <button onclick="_prompt({title:'How older you?', msg:'Please enter your age:', design:'warning', defaultValue:'22', callback:promptCallback})">Prompt</button>


   <script>
        function callback(status){
            if(status){
                console.log('user pressed ok')
            }else{
                console.log('user pressed no')
            }
        }

        function promptCallback(res){
            console.log(res);
        }
    </script>



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

</x-app-layout>