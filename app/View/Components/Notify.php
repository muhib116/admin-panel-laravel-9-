<?php

namespace App\View\Components;

use Illuminate\View\Component;

class Notify extends Component
{
    public $type;
    public $title;

    public function __construct($type=null, $title='')
    {
        $this->type  = $type;
        $this->title = $title;
    }

    /**
     * Get the view / contents that represent the component.
     *
     * @return \Illuminate\Contracts\View\View|\Closure|string
     */
    public function render()
    {
        return view('components.notify');
    }
}
