<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use illuminate\support\facades\DB;
use illuminate\support\facades\Hash;
use illuminate\support\Str;

class UserSeeder extends Seeder
{

    public function run()
    {
        DB::table('users')->insert([
            'name' => Str::random(10),
            'email'=> Str::random(10).'@gmail.com',
            'password' => Hash::make('password'),
        ]);
    }
}
