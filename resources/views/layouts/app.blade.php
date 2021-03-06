<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">

    <x-g.AdminHead />
    
    <body class="main_container close_left_side">
        
        <x-g.aside />
        <section class="right_side">
            <x-g.nav />
            <x-g.content>{{ $slot }}</x-g.content>
        </section>
        




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
