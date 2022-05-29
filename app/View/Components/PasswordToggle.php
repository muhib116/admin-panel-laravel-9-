<?php

namespace App\View\Components;

use Illuminate\View\Component;

class PasswordToggle extends Component
{
    public $selector;

    public function __construct($selector)
    {
        $this->selector = $selector;
    }

    public function render()
    {
        return view('components.password-toggle');
    }
}
