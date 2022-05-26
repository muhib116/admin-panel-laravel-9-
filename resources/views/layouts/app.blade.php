<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">

    <x-g.adminHead />
    
    <body class="font-sans antialiased">
        
        <x-g.nav />
        
        <x-g.aside />

        <x-g.content>{{ $slot }}</x-g.content>




        {{-- <div class="min-h-screen bg-gray-100"> --}}
            {{-- @include('layouts.navigation') --}}

            {{-- <!-- Page Heading -->
            <header class="bg-white shadow">
                <div class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
                    {{ $header }}
                </div>
            </header> --}}

            <!-- Page Content -->
            {{-- <main>
                {{ $slot }}
            </main> --}}
        {{-- </div> --}}



        <x-g.adminFooterScript />
    </body>
</html>
